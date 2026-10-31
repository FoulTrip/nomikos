//! [ Dispositivo + object storage ]
//!
//! Sirve la ficha técnica guardada en la DB y el modelo 3D del dispositivo:
//! `GET /api/device/model` lo descarga del bucket S3 compatible y lo entrega
//! a agent-dapp. `POST /api/device/model/upload` publica el archivo fuente.

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
        "object_key": dev.model_r2_key.clone(),
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
fn glb_response(
    bytes: Vec<u8>,
    source_tag: (&'static str, String),
    backend: &'static str,
) -> Response {
    let mut res = Response::new(axum::body::Body::from(bytes));
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(CONTENT_TYPE_GLTF),
    );
    if let Ok(v) = HeaderValue::from_str(&source_tag.1) {
        res.headers_mut()
            .insert(HeaderName::from_static(source_tag.0), v);
    }
    res.headers_mut().insert(
        HeaderName::from_static("x-object-store-backend"),
        HeaderValue::from_static(backend),
    );
    res
}

/// Descarga siempre el modelo desde el object store. El archivo fuente solo se
/// usa para publicar el objeto mediante `upload_model`; nunca es un fallback.
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

    let object_store = state.object_store.as_ref().ok_or_else(|| {
        AppError::unavailable(
            "object storage no configurado; selecciona OBJECT_STORE_BACKEND=local o r2",
        )
    })?;

    if object_store.backend() == crate::config::ObjectStoreBackend::CloudflareR2 {
        // 1) Cloudflare REST API con Bearer token, si fue configurado.
        match object_store.get_via_cloudflare_api(&key).await {
            Ok(bytes) => {
                return Ok(glb_response(
                    bytes,
                    ("x-source", "cloudflare-api".to_string()),
                    "r2",
                ));
            }
            Err(e) => {
                tracing::debug!("Cloudflare API get no disponible; se intenta S3 SigV4: {e}");
            }
        }
    }

    // GET S3 SigV4 (RustFS local o R2).
    match object_store.get(&key).await {
        Ok(bytes) => {
            let backend = object_store.backend().as_str();
            return Ok(glb_response(
                bytes,
                ("x-r2-key", key),
                if backend == "r2" { "r2" } else { "local-s3" },
            ));
        }
        Err(e) => {
            tracing::error!("object storage GET failed: {e}");
        }
    }

    Err(AppError::not_found(
        "modelo 3D no disponible en el bucket configurado",
    ))
}

/// Sube el archivo local al bucket y registra metadatos en la DB.
pub async fn upload_model(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    let Some(object_store) = state.object_store.as_ref() else {
        return Err(AppError::unavailable(
            "object storage no configurado: revisa OBJECT_STORE_BACKEND y las credenciales del backend",
        ));
    };

    let path = state.cfg.device_model_file.clone();
    if !Path::new(&path).exists() {
        return Err(AppError::not_found(format!(
            "archivo local inexistente: {path} (revisa DEVICE_MODEL_FILE)"
        )));
    }
    let bytes = tokio::fs::read(&path).await?;

    let key = state.cfg.object_model_key.clone();
    let uploaded = object_store
        .put(&key, bytes)
        .await
        .map_err(AppError::internal)?;

    let public_url = if object_store.backend() == crate::config::ObjectStoreBackend::CloudflareR2 {
        state
            .cfg
            .r2_public_base
            .as_deref()
            .map(|base| format!("{base}/{key}"))
    } else {
        None
    };

    state.db.update_model(
        &key,
        uploaded.size,
        uploaded.etag.as_deref(),
        public_url.as_deref(),
    )?;
    tracing::info!(
        "modelo 3D publicado en {}: {key} ({} bytes)",
        object_store.backend().as_str(),
        uploaded.size
    );

    let dev = state.db.get_device()?;
    Ok(Json(json!({
        "ok": true,
        "object_key": key.clone(),
        "r2_key": key,
        "size_bytes": uploaded.size,
        "etag": uploaded.etag,
        "public_url": public_url,
        "db": { "model_r2_key": dev.model_r2_key, "model_size": dev.model_size },
        "serve": "/api/device/model",
    })))
}

/// 200/404 si el objeto ya existe en el backend configurado.
pub async fn model_head(State(state): State<SharedState>) -> StatusCode {
    let dev = match state.db.get_device() {
        Ok(d) => d,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR,
    };
    let key = dev
        .model_r2_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty());
    let (Some(key), Some(store)) = (key, state.object_store.as_ref()) else {
        return StatusCode::NOT_FOUND;
    };
    match store.head(key).await {
        Ok(()) => StatusCode::OK,
        Err(_) => StatusCode::NOT_FOUND,
    }
}
