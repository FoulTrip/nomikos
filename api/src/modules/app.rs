//! [ MCP Gateway peajizado (diagram.d2, pasos 1-7) ] — multi-app.
//!
//! Cada petición del ORQUESTADOR a una app del ecosistema es un recurso
//! x402 reactivo: la app no se toca sin peaje liquidado.
//!
//! ```text
//! 1. AgentOrch → POST /api/app/request {app?, path, method, body}
//! 2.                             ← 402 + invoice x402:app:{slug}:{METHOD}:{path}
//! 3/4. La cuenta pide firma al Gestor de Wallet → X-Payment (dPaaS)
//! 5. AgentOrch reintenta con X-Payment (firmado)
//! 6. El gateway PROXEA a la base_url de la app instalada → respuesta
//! 7. El peaje se CONSUME solo si la app respondió.
//! ```
//!
//! La app destino se resuelve del REGISTRO (tabla `apps`: las dapps
//! instaladas con su base_url y auth sellada). Sin `app` en el cuerpo:
//! la primera instalada; si no hay ninguna, el flujo clásico por
//! `PAYLOAD_URL`/`PAYLOAD_EMAIL`/`PAYLOAD_TOKEN` (retro-compatible).
//! La auth de la app es SU política: token fijo o login JWT cacheado
//! por slug. `device_id` queda en la factura cuando el agente opera
//! con token de dispositivo.

use crate::error::{AppError, AppResult};
use crate::modules::apps::{self, AppRow};
use crate::modules::devices::resolve_identity;
use crate::modules::x402::{create_invoice_value_for, settle_access_for_resource};
use crate::state::SharedState;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::Engine as _;
use reqwest::Url;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

/// Cache de JWT de login por app (una entrada por slug).
static APP_JWTS: Mutex<Option<HashMap<String, (String, i64)>>> = Mutex::new(None);

/// Destino de una petición del agente.
pub struct AppTarget {
    pub slug: String,
    pub base_url: String,
    /// `Some(row)` → app instalada del registro (auth sellada propia);
    /// `None` → flujo clásico por config (PAYLOAD_URL…).
    pub row: Option<AppRow>,
}

/// Resuelve la app destino: `Some(slug)` → esa (debe estar instalada);
/// `None` → primera instalada o, sin registro, la de configuración.
pub fn resolve_target(state: &SharedState, app: Option<&str>) -> AppResult<AppTarget> {
    let pick = |row: AppRow| -> AppResult<AppTarget> {
        let base_url = row
            .base_url
            .clone()
            .filter(|u| !u.is_empty())
            .ok_or_else(|| AppError::unavailable(format!("app «{}» sin base_url", row.slug)))?;
        Ok(AppTarget {
            slug: row.slug.clone(),
            base_url,
            row: Some(row),
        })
    };

    if let Some(slug) = app.map(str::trim).filter(|s| !s.is_empty()) {
        let row = apps::by_slug(state, slug).ok_or_else(|| {
            AppError::not_found(format!(
                "app «{slug}» no está en el registro (GET /api/apps)"
            ))
        })?;
        if row.status != "installed" {
            return Err(AppError::bad_request(format!(
                "app «{slug}» está «{}» — POST /api/apps/{slug}/install primero",
                row.status
            )));
        }
        return pick(row);
    }
    if let Some(row) = apps::first_installed(state) {
        return pick(row);
    }
    // retro-compatible: la app clásica por env (prefijo de peaje «payload»)
    Ok(AppTarget {
        slug: "payload".into(),
        base_url: state.cfg.payload_url.clone(),
        row: None,
    })
}

/// Token de autenticación hacia la app: token fijo o login JWT cacheado.
async fn app_auth_token(state: &SharedState, target: &AppTarget) -> Option<String> {
    // 1) token fijo (app instalada → auth sellada; clásica → PAYLOAD_TOKEN)
    let (token, email, password) = if let Some(row) = &target.row {
        let auth = apps::open_auth(state, row)?;
        (
            auth.get("token").and_then(|v| v.as_str()).map(String::from),
            auth.get("email").and_then(|v| v.as_str()).map(String::from),
            auth.get("password")
                .and_then(|v| v.as_str())
                .map(String::from),
        )
    } else {
        (
            state.cfg.payload_token.clone(),
            state.cfg.payload_email.clone(),
            state.cfg.payload_password.clone(),
        )
    };
    if let Some(t) = token {
        return Some(t);
    }

    // 2) login automático (JWT cacheado por slug, exp con margen de 60 s)
    let (email, password) = (email?, password?);
    let now = crate::db::now_ms();
    if let Ok(mut guard) = APP_JWTS.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        if let Some((tok, exp)) = map.get(&target.slug) {
            if *exp > now + 60_000 {
                return Some(tok.clone());
            }
        }
    }
    let login = state
        .http
        .post(format!("{}/api/users/login", host_url(&target.base_url)))
        .timeout(Duration::from_secs(8))
        .json(&json!({ "email": email, "password": password }))
        .send()
        .await
        .ok()?;
    if !login.status().is_success() {
        tracing::warn!("app login falló ({}): HTTP {}", target.slug, login.status());
        return None;
    }
    let body: Value = login.json().await.ok()?;
    let tok = body.get("token")?.as_str()?.to_string();
    let exp = body
        .get("exp")
        .and_then(|v| v.as_i64())
        .unwrap_or(now + 3_600_000);
    if let Ok(mut guard) = APP_JWTS.lock() {
        guard
            .get_or_insert_with(HashMap::new)
            .insert(target.slug.clone(), (tok.clone(), exp));
    }
    Some(tok)
}

/// La app vive en el HOST (:3100): dentro del contenedor, localhost es el
/// propio contenedor → reescribir al host (extra_hosts en compose). En el
/// host, la URL pasa intacta (ambos despliegues funcionan).
fn host_url(base_url: &str) -> String {
    if std::path::Path::new("/.dockerenv").exists() {
        base_url
            .replace("http://localhost:", "http://host.docker.internal:")
            .replace("http://127.0.0.1:", "http://host.docker.internal:")
    } else {
        base_url.to_string()
    }
}

async fn fetch(
    state: &SharedState,
    target: &AppTarget,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> AppResult<(u16, Value)> {
    let base = host_url(&target.base_url);
    let url = format!("{base}{path}");
    let mut call = state
        .http
        .request(
            reqwest::Method::from_bytes(method.as_bytes()).unwrap(),
            &url,
        )
        .timeout(Duration::from_secs(15));
    if let Some(tok) = app_auth_token(state, target).await {
        call = call.bearer_auth(tok);
    }
    if let Some(b) = &body {
        call = call.json(b);
    }
    let res = call
        .send()
        .await
        .map_err(|e| AppError::unavailable(format!("la app «{}» no responde: {e}", target.slug)))?;
    let status = res.status().as_u16();
    let body: Value = res.json().await.unwrap_or(Value::Null);
    Ok((status, body))
}

const ARTIFACT_IMAGE_LIMIT: usize = 4;
const ARTIFACT_IMAGE_BYTES: usize = 48 * 1024;

fn collect_artifact_image_urls(value: &Value, in_media: bool, out: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            let media_record = map.contains_key("filename") || map.contains_key("mimeType");
            for (key, child) in map {
                let media_field = matches!(
                    key.as_str(),
                    "image" | "photo" | "thumbnail" | "featuredImage" | "cover" | "media"
                );
                let direct_url = matches!(
                    key.as_str(),
                    "image_url" | "imageUrl" | "thumbnail_url" | "thumbnailUrl"
                );
                if ((in_media || media_record) && matches!(key.as_str(), "url" | "src"))
                    || direct_url
                {
                    if let Some(url) = child.as_str().filter(|url| !url.is_empty()) {
                        if !out.iter().any(|existing| existing == url) {
                            out.push(url.to_string());
                        }
                    }
                } else {
                    collect_artifact_image_urls(
                        child,
                        in_media || media_field || media_record,
                        out,
                    );
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_artifact_image_urls(item, in_media, out);
            }
        }
        Value::String(url) if in_media && url.starts_with('/') => {
            if !out.iter().any(|existing| existing == url) {
                out.push(url.clone());
            }
        }
        _ => {}
    }
}

fn same_app_origin(base: &Url, candidate: &Url) -> bool {
    base.scheme() == candidate.scheme()
        && base.host_str() == candidate.host_str()
        && base.port_or_known_default() == candidate.port_or_known_default()
}

/// Copia imágenes pequeñas desde el host de la app para que CanvasTexture
/// pueda dibujarlas sin depender de CORS del Payload CMS.
async fn artifact_media(
    state: &SharedState,
    target: &AppTarget,
    app_body: &Value,
) -> serde_json::Map<String, Value> {
    let mut urls = Vec::new();
    collect_artifact_image_urls(app_body, false, &mut urls);
    let Ok(base) = Url::parse(&host_url(&target.base_url)) else {
        return serde_json::Map::new();
    };
    let Ok(client) = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
    else {
        return serde_json::Map::new();
    };
    let token = app_auth_token(state, target).await;
    let mut media = serde_json::Map::new();

    for raw in urls.into_iter().take(ARTIFACT_IMAGE_LIMIT) {
        let Ok(url) = base.join(&raw) else { continue };
        if !same_app_origin(&base, &url) || !url.username().is_empty() || url.password().is_some() {
            continue;
        }
        let mut request = client.get(url.clone()).timeout(Duration::from_secs(8));
        if let Some(token) = token.as_deref() {
            request = request.bearer_auth(token);
        }
        let Ok(mut response) = request.send().await else {
            continue;
        };
        if !response.status().is_success() {
            continue;
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        if !matches!(
            content_type.as_str(),
            "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif"
        ) {
            continue;
        }
        let mut bytes = Vec::with_capacity(ARTIFACT_IMAGE_BYTES);
        let mut oversized = false;
        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    if bytes.len() + chunk.len() > ARTIFACT_IMAGE_BYTES {
                        oversized = true;
                        break;
                    }
                    bytes.extend_from_slice(&chunk);
                }
                Ok(None) => break,
                Err(_) => {
                    oversized = true;
                    break;
                }
            }
        }
        if oversized || bytes.is_empty() {
            continue;
        }
        let data_uri = format!(
            "data:{content_type};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        );
        media.insert(raw, Value::String(data_uri));
    }
    media
}

#[derive(Deserialize)]
pub struct AppRequestBody {
    /// Slug de la app destino (dapps/registry). Opcional: la primera
    /// instalada; sin registro, la de configuración.
    #[serde(default)]
    app: Option<String>,
    /// Path dentro de la app (p.ej. "/api/users?limit=5" o "/api/media").
    path: String,
    /// GET (default) | POST | PUT.
    #[serde(default = "default_method")]
    method: String,
    /// Cuerpo JSON para POST/PUT.
    body: Option<Value>,
    /// Nombre exacto de la tool del catálogo MCP. Las llamadas genéricas
    /// quedan marcadas como `app_request`.
    #[serde(default)]
    tool_name: Option<String>,
}

fn default_method() -> String {
    "GET".into()
}

/// POST /api/app/request — el agente pide algo a una app; el gateway
/// cobra peaje x402 por petición (402 → X-Payment → proxy).
pub async fn app_request_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(req): Json<AppRequestBody>,
) -> AppResult<Response> {
    // path seguro: dentro de la app, sin escapes
    let path = req.path.trim().to_string();
    if !path.starts_with('/') || path.contains("..") || path.contains("://") {
        return Err(AppError::bad_request(
            "path inválido: debe ser una ruta interna de la app (/…)",
        ));
    }
    let method = req.method.trim().to_uppercase();
    if !["GET", "POST", "PUT", "PATCH", "DELETE"].contains(&method.as_str()) {
        return Err(AppError::bad_request(
            "method inválido: GET | POST | PUT | PATCH | DELETE",
        ));
    }

    // identidad: cuenta (o dispositivo → peaje atribuible a la placa)
    let (account, device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;

    // app destino (registro de dapps o config clásica)
    let target = resolve_target(&state, req.app.as_deref())?;
    let amount = state.cfg.x402_app_lamports;
    let fingerprint = serde_json::to_vec(&json!({
        "app": target.slug, "method": method, "path": path,
        "body": req.body, "tool_name": req.tool_name,
    }))
    .unwrap_or_default();
    let args_hash = crate::crypto::sha256_hex(&fingerprint);
    let resource = format!(
        "x402:app:{}:{method}:{path}:{amount}:{args_hash}",
        target.slug
    );

    // ── con X-Payment: verificar (sin consumir) → proxy → consumir ──
    if let Some(invoice_id) = headers
        .get("x-payment")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if let Err(r) = settle_access_for_resource(&state, invoice_id, Some(&account), &resource) {
            return Ok(r);
        }

        // 6. Tool call: la petición REAL a la app
        let (status, app_body) = fetch(&state, &target, &method, &path, req.body.clone()).await?;

        // La factura se reclama atómicamente antes de llamar a la app; una
        // retransmisión concurrente no puede duplicar una acción remota.
        let artifact_media = artifact_media(&state, &target, &app_body).await;
        let invoice = crate::modules::x402::invoice_for_app_usage(&state, invoice_id);
        if let Some((account_id, device_id, execution_environment, network)) = invoice {
            let tool_name = req
                .tool_name
                .as_deref()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .unwrap_or("app_request");
            state.db.with(|c| {
                c.execute(
                    "INSERT INTO app_tool_calls (id, account_id, app_slug, tool_name, method, path, \
                     status_code, invoice_id, execution_environment, network, device_id, created_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    rusqlite::params![
                        crate::db::new_id("toolcall"), account_id, target.slug, tool_name,
                        method, path, status, invoice_id, execution_environment, network,
                        device_id, crate::db::now_ms()
                    ],
                )?;
                Ok(())
            })?;
        }
        tracing::info!(
            "app-request {method} {path} → {status} (peaje {invoice_id} consumido, app {}, cuenta {account})",
            target.slug
        );
        let mut response_body = json!({
            "ok": status < 500,
            "app": target.slug,
            "status": status,
            "result": app_body,
            "invoice_id": invoice_id,
            "resource": resource,
        });
        if !artifact_media.is_empty() {
            response_body["artifact_media"] = Value::Object(artifact_media);
        }
        return Ok(Json(response_body).into_response());
    }

    // ── sin X-Payment: peaje nuevo de esta petición → 402 ──
    let invoice =
        create_invoice_value_for(&state, &resource, amount, Some(&account), device.as_deref())
            .await?;
    tracing::info!(
        "app-request peaje emitido: {resource} (app {}, cuenta {account})",
        target.slug
    );
    Ok((
        StatusCode::PAYMENT_REQUIRED,
        Json(json!({
            "ok": false,
            "error": "Payment Required (x402): paga el peaje de esta petición a la app",
            "app": target.slug,
            "resource": resource,
            "invoice": invoice,
            "how": [
                "1) La cuenta paga con dPaaS: POST /api/accounts/me/x402/pay-invoice {\"invoice_id\": …}",
                "2) Reintenta POST /api/app/request con X-Payment: <id de factura>",
                "(guarded_call de brain lo hace solo en la tool app_request)",
            ],
        })),
    )
        .into_response())
}
