//! [ Dispositivo + Cloudflare R2 ]
//!
//! Sirve la ficha técnica guardada en la DB y el modelo 3D del dispositivo:
//! `GET /api/device/model` lo descarga del bucket R2 (fallback: archivo local
//! declarado en `DEVICE_MODEL_FILE`) y lo entrega a agent-dapp.
//! `POST /api/device/model/upload` empuja el archivo local al bucket.

use crate::error::{AppError, AppResult};
use crate::state::SharedState;
use axum::extract::State;
use axum::http::{header, HeaderName, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};
use std::path::Path;

const CONTENT_TYPE_GLTF: &str = "model/gltf-binary";

pub async fn get_device_handler(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    Ok(Json(device_value(&state).await?))
}

/// JSON del dispositivo + ficha técnica + metadatos del modelo (desde la DB).
pub async fn device_value(state: &SharedState) -> AppResult<Value> {
    let dev = state.db.get_device()?;
    let specs: Vec<Value> = state
        .db
        .list_specs()?
        .into_iter()
        .map(|s| json!({ "slot": s.slot, "value": s.value }))
        .collect();

    let model = json!({
        "r2_key": dev.model_r2_key,
        "public_url": dev.model_public_url,
        "size_bytes": dev.model_size,
        "etag": dev.model_etag,
        "serve": "/api/device/model",
        "upload": "POST /api/device/model/upload",
    });

    Ok(json!({
        "ok": true,
        "device": { "name": dev.name, "updated_at": dev.updated_at },
        "specs": specs,
        "model": model,
    }))
}

/// Ficha técnica sola (para el agente / dapp).
pub async fn specs_value(state: &SharedState) -> AppResult<Value> {
    let specs: Vec<Value> = state
        .db
        .list_specs()?
        .into_iter()
        .map(|s| json!({ "slot": s.slot, "value": s.value }))
        .collect();
    Ok(json!({ "ok": true, "device": state.db.get_device()?.name, "specs": specs }))
}

/// Etiqueta del header de origen: (&'static str nombre, valor dinámico).
fn glb_response(bytes: Vec<u8>, source_tag: (&'static str, String)) -> Response {
    let mut res = Response::new(axum::body::Body::from(bytes));
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(CONTENT_TYPE_GLTF),
    );
    if let Ok(v) = HeaderValue::from_str(&source_tag.1) {
        res.headers_mut()
            .insert(HeaderName::from_static(source_tag.0), v);
    }
    res
}

/// Sirve el modelo 3D 100% desde Cloudflare R2 (Cloudflare API Bearer → R2 S3 SigV4).
/// No hay fallback al archivo local.
pub async fn get_model(State(state): State<SharedState>) -> AppResult<Response> {
    let dev = state.db.get_device()?;

    let key = dev
        .model_r2_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            AppError::not_found("modelo 3D no configurado en la DB (model_r2_key vacío)")
        })?;

    let r2 = state
        .r2
        .as_ref()
        .ok_or_else(|| AppError::unavailable("R2 no configurado en agent-os-api (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)"))?;

    // 1) Cloudflare REST API con Bearer token
    match r2.get_via_cloudflare_api(&key).await {
        Ok(bytes) => {
            return Ok(glb_response(
                bytes,
                ("x-source", "cloudflare-api".to_string()),
            ));
        }
        Err(e) => {
            tracing::error!("Cloudflare API get error: {e}");
        }
    }

    // 2) R2 S3 (SigV4)
    match r2.get(&key).await {
        Ok(bytes) => {
            return Ok(glb_response(bytes, ("x-r2-key", key)));
        }
        Err(e) => {
            tracing::error!("R2 S3 get error: {e}");
        }
    }

    Err(AppError::not_found(
        "modelo 3D no disponible en Cloudflare R2 (ni Cloudflare API Bearer ni R2 S3 SigV4 pudieron descargarlo)",
    ))
}

/// Sube el archivo local al bucket y registra metadatos en la DB.
pub async fn upload_model(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    let Some(r2) = state.r2.as_ref() else {
        return Err(AppError::unavailable(
            "R2 no configurado: necesitas R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, \
             R2_SECRET_ACCESS_KEY y R2_BUCKET",
        ));
    };

    let path = state.cfg.device_model_file.clone();
    if !Path::new(&path).exists() {
        return Err(AppError::not_found(format!(
            "archivo local inexistente: {path} (revisa DEVICE_MODEL_FILE)"
        )));
    }
    let bytes = tokio::fs::read(&path).await?;

    let key = state.cfg.r2_model_key.clone();
    let uploaded = r2.put(&key, bytes).await.map_err(AppError::internal)?;

    let public_url = state
        .cfg
        .r2_public_base
        .as_deref()
        .map(|base| format!("{base}/{key}"));

    state.db.update_model(
        &key,
        uploaded.size,
        uploaded.etag.as_deref(),
        public_url.as_deref(),
    )?;
    tracing::info!("modelo 3D en R2: {key} ({} bytes)", uploaded.size);

    let dev = state.db.get_device()?;
    Ok(Json(json!({
        "ok": true,
        "r2_key": key,
        "size_bytes": uploaded.size,
        "etag": uploaded.etag,
        "public_url": public_url,
        "db": { "model_r2_key": dev.model_r2_key, "model_size": dev.model_size },
        "serve": "/api/device/model",
    })))
}

/// 200/404 simple para saber si el archivo está disponible por alguna vía.
pub async fn model_head(State(state): State<SharedState>) -> StatusCode {
    let dev = match state.db.get_device() {
        Ok(d) => d,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR,
    };
    let key_ok = dev
        .model_r2_key
        .as_deref()
        .map(str::trim)
        .is_some_and(|k| !k.is_empty());
    if (key_ok && state.r2.is_some()) || Path::new(&state.cfg.device_model_file).exists() {
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}
