//! [ NomikOS F5 — Voz (diagram.d2: User → Worker "Voz / texto") ]
//!
//! El dispositivo (Pi con NomikOS) captura el micrófono, transcribe
//! (whisper.cpp local en la placa) y envía el turno AQUÍ. El worker
//! (api) lo pasa al ORQUESTADOR (brain) con la MISMA identidad — la
//! cuenta y, si es token de dispositivo, el device. La respuesta del
//! agente vuelve a la placa para el TTS (piper local).
//!
//! El turno de voz es gratis: los peajes x402 están en lo que el AGENTE
//! pide a la app (ver `app.rs`) y demás recursos protegidos — tal como
//! manda el diagrama (los peajes salen del orquestador, no del usuario).

use crate::error::{AppError, AppResult};
use crate::modules::devices::resolve_identity;
use crate::state::SharedState;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Deserialize)]
pub struct VoiceTurnBody {
    /// Transcripción del turno de voz (o texto directo del teclado).
    text: String,
    /// ID del dispositivo que habla (opcional: se toma del token si no viene).
    device_id: Option<String>,
}

/// POST /api/voice — un turno de conversación del usuario:
/// Pi (mic + STT) → /api/voice → brain (orquestador) → respuesta del
/// agente (→ TTS en la placa). Los peajes de las peticiones del agente
/// a la app corren por dentro (tools → /api/app/request).
pub async fn voice_turn_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<VoiceTurnBody>,
) -> AppResult<Response> {
    let text = body.text.trim().to_string();
    if text.is_empty() {
        return Err(AppError::bad_request("text vacío"));
    }

    // Identidad: cuenta, o dispositivo de la flota (voz desde la placa).
    let (account, device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("voz con Bearer de cuenta o de dispositivo"))?;
    let device_id = body
        .device_id
        .or(device)
        .unwrap_or_else(|| "nomikos-voice".to_string());

    // Worker → Orquestador: el turno viaja a brain con la MISMA identidad.
    let url = format!("{}/v1/agentic-gateway", state.cfg.brain_url);
    let auth = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let mut call = state
        .http
        .post(&url)
        .timeout(Duration::from_secs(600)) // razonamiento con LLM real (los modelos CPU locales tardan)
        .json(&json!({ "device_id": device_id, "text": text }));
    if let Some(bearer) = auth {
        call = call.header(axum::http::header::AUTHORIZATION, bearer);
    }

    let res = call.send().await.map_err(|e| {
        AppError::unavailable(format!("orquestador (brain :8322) no disponible: {e}"))
    })?;
    let status = res.status();
    let body: Value = res.json().await.unwrap_or(Value::Null);

    tracing::info!(
        "voz [{device_id}] «{text}…» (cuenta {account}) → brain {status}",
        text = &text[..text.len().min(40)]
    );
    Ok((
        StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK),
        Json(body),
    )
        .into_response())
}
