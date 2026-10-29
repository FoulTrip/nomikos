//! [ NomikOS Fase 5 — Llamadas con peaje x402 por minuto ]
//!
//! La llamada es un recurso x402 **reactivo**: cada minuto es una factura
//! que la CUENTA paga por dPaaS (el dispositivo nunca firma). Sin peaje
//! liquidado, no hay minuto. El handshake es el del resto del ecosistema,
//! así que el orquestador (brain, `guarded_call`) lo resuelve solo:
//! 402 → pago delegado → reintento con X-Payment.
//!
//! ```text
//! POST /api/calls {destination}          (sin X-Payment)
//!     → 201-ish: crea la llamada (ringing) + peaje del minuto 0 → 402
//! POST /api/calls                        (con X-Payment del peaje pendiente)
//!     → consume el minuto (one-shot), pasa a active y emite el peaje
//!       del SIGUIENTE minuto en la respuesta → cadencia: un POST/min
//! GET  /api/calls/{id}                   → estado (gratis)
//! POST /api/calls/{id}/end               → cuelga
//! ```
//!
//! El audio real (RTP/SIP con baresip) corre en NomikOS
//! (`os/buildroot-external/board/rpi4/rootfs-overlay/etc/baresip/`);
//! aquí viven la sesión de llamada y la medición x402. `device_id` queda
//! registrado cuando la llamada la origina un token de dispositivo.

use crate::db::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::modules::devices::resolve_identity;
use crate::modules::x402::{create_invoice_value_for, settle_access};
use crate::state::SharedState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

const CALL_COLS: &str =
    "id, account_id, device_id, destination, status, minutes_paid, started_at, ended_at, created_at, updated_at";

fn row_to_call(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "account_id": r.get::<_, String>(1)?,
        "device_id": r.get::<_, Option<String>>(2)?,
        "destination": r.get::<_, String>(3)?,
        "status": r.get::<_, String>(4)?,
        "minutes_paid": r.get::<_, i64>(5)?,
        "started_at": r.get::<_, Option<i64>>(6)?,
        "ended_at": r.get::<_, Option<i64>>(7)?,
        "created_at": r.get::<_, i64>(8)?,
        "updated_at": r.get::<_, i64>(9)?,
    }))
}

fn call_by_id(state: &SharedState, id: &str, account_id: &str) -> AppResult<Value> {
    state
        .db
        .with(|c| {
            c.query_row(
                &format!("SELECT {CALL_COLS} FROM calls WHERE id = ?1 AND account_id = ?2"),
                params![id, account_id],
                row_to_call,
            )
        })
        .map_err(|_| AppError::not_found("llamada no encontrada en tu cuenta"))
}

fn x_payment_of(headers: &HeaderMap) -> Option<String> {
    headers
        .get("x-payment")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

/// `x402:call:{call_id}:minute:{n}` → (call_id, n). Los ids de llamada
/// (`call-1792…-N`) no contienen ':'.
fn parse_call_resource(resource: &str) -> Option<(String, i64)> {
    let rest = resource.strip_prefix("x402:call:")?;
    let (cid, minute) = rest.rsplit_once(":minute:")?;
    let minute = minute.parse().ok()?;
    Some((cid.to_string(), minute))
}

#[derive(Deserialize)]
pub struct CreateCallBody {
    /// Destino: número E.164 o URI SIP.
    destination: String,
}

/// POST /api/calls — dos caras del mismo recurso x402:
///
///  · **Sin `X-Payment`**: crea la llamada (`ringing`) y devuelve el peaje
///    del minuto 0 con **402** — el pago delegado lo hace la cuenta y el
///    cliente reintenta con `X-Payment` (automático en `guarded_call`).
///  · **Con `X-Payment`**: consume el peaje liquidado (one-shot), el
///    minuto queda pagado (`active`) y la respuesta trae el peaje del
///    siguiente minuto — la cadencia de facturación es un POST por minuto.
pub async fn create_call_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<CreateCallBody>,
) -> AppResult<Response> {
    let destination = body.destination.trim().to_string();
    if destination.len() < 3 {
        return Err(AppError::bad_request("destination vacío"));
    }
    // Identidad: cuenta (o token de dispositivo → device_id en la llamada).
    let (account, device) = resolve_identity(&state, &headers)?.ok_or_else(|| {
        AppError::unauthorized("llama con el Bearer de tu cuenta o de tu dispositivo")
    })?;

    // ── Con X-Payment: consumir el minuto pagado y emitir el siguiente ──
    if let Some(invoice_id) = x_payment_of(&headers) {
        // settle_access valida: settled, no consumida (one-shot) y
        // propiedad de la cuenta → consume (consumed_at).
        if let Err(r) = settle_access(&state, &invoice_id, Some(&account)) {
            return Ok(r);
        }
        // la factura dice a qué llamada/minuto pertenece
        let resource: String = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT resource FROM x402_invoices WHERE id = ?1",
                    params![invoice_id],
                    |r| r.get(0),
                )
            })
            .map_err(|_| AppError::not_found("factura del peaje no encontrada"))?;
        let (call_id, minute) = parse_call_resource(&resource).ok_or_else(|| {
            AppError::bad_request("X-Payment no es un peaje de llamada (recurso inválido)")
        })?;

        // avanzar la llamada SOLO si es el peaje del minuto esperado
        let updated = state.db.with(|c| {
            let n = c.execute(
                "UPDATE calls SET \
                   minutes_paid = ?3, status = 'active', \
                   started_at = COALESCE(started_at, ?4), updated_at = ?4 \
                 WHERE id = ?1 AND account_id = ?2 AND status != 'ended' AND minutes_paid = ?3 - 1",
                params![call_id, account, minute + 1, now_ms()],
            )?;
            Ok(n)
        })?;
        if updated == 0 {
            return Err(AppError::conflict(
                "peaje no corresponde al minuto en curso (¿replay o llamada terminada?)",
            ));
        }
        let call = call_by_id(&state, &call_id, &account)?;

        // peaje del SIGUIENTE minuto (la cadencia continúa)
        let next = create_invoice_value_for(
            &state,
            &format!("x402:call:{call_id}:minute:{}", minute + 1),
            state.cfg.x402_call_lamports,
            Some(&account),
            device.as_deref(),
        )
        .await?;
        return Ok(Json(json!({ "ok": true, "call": call, "invoice_next": next })).into_response());
    }

    // ── Sin X-Payment: crear la llamada + peaje del minuto 0 → 402 ──
    let id = new_id("call");
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO calls (id, account_id, device_id, destination, status, minutes_paid, \
             created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'ringing', 0, ?5, ?5)",
            params![id, account, device, destination, now],
        )?;
        Ok(())
    })?;

    let invoice = create_invoice_value_for(
        &state,
        &format!("x402:call:{id}:minute:0"),
        state.cfg.x402_call_lamports,
        Some(&account),
        device.as_deref(),
    )
    .await?;
    tracing::info!(
        "call {id} → {destination} (cuenta {account}{}) peaje minuto 0 emitido",
        device
            .as_deref()
            .map(|d| format!(" · device {d}"))
            .unwrap_or_default()
    );
    let call = call_by_id(&state, &id, &account)?;
    Ok((
        StatusCode::PAYMENT_REQUIRED,
        Json(json!({
            "ok": false,
            "error": "Payment Required (x402): paga el primer minuto para iniciar la llamada",
            "call": call,
            "invoice": invoice,
            "how": [
                "1) La cuenta paga con dPaaS: POST /api/accounts/me/x402/pay-invoice {\"invoice_id\": …}",
                "2) Reintenta POST /api/calls con X-Payment: <id de factura>",
                "3) Cada minuto nuevo llega como peaje en la respuesta del anterior",
            ],
        })),
    )
        .into_response())
}

/// GET /api/calls/{id} — estado de la llamada (sin peaje).
pub async fn get_call_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Response> {
    let (account, _) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("sesión requerida"))?;

    let call = call_by_id(&state, &id, &account)?;
    Ok(Json(json!({ "ok": true, "call": call })).into_response())
}

/// GET /api/calls/for-device — el puente de la Pi con baresip (NomikOS
/// W4): el dispositivo autenticado consulta SU llamada en curso para
/// decidir si marca (`active`) o cuelga (`ended`/ausente). El peaje por
/// minuto vive aquí; el audio RTP es cosa de baresip en la placa.
pub async fn for_device_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<Response> {
    let (account, device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("sesión de dispositivo requerida"))?;
    let device = device.ok_or_else(|| {
        AppError::bad_request("este endpoint consulta la llamada de un DISPOSITIVO (usa su token)")
    })?;
    let call: Option<Value> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(&format!(
                "SELECT {CALL_COLS} FROM calls \
                 WHERE device_id = ?1 AND account_id = ?2 AND status != 'ended' \
                 ORDER BY created_at DESC LIMIT 1"
            ))?;
            let mut rows = stmt.query_map(params![device, account], row_to_call)?;
            Ok(rows.next().transpose()?)
        })
        .unwrap_or(None);
    // Respuesta PLANA con claves únicas: el firmware del dispositivo
    // (agentd-core, sin deps) extrae strings clave a clave.
    let body = match call {
        Some(c) => json!({
            "ok": true,
            "has_call": "true",
            "call_id": c["id"],
            "call_status": c["status"],
            "call_destination": c["destination"],
            "minutes_paid": c["minutes_paid"],
        }),
        None => json!({ "ok": true, "has_call": "false" }),
    };
    Ok(Json(body).into_response())
}

/// POST /api/calls/{id}/end — cuelga.
pub async fn end_call_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Response> {
    let (account, _) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("sesión requerida"))?;

    let updated = state.db.with(|c| {
        Ok(c.execute(
            "UPDATE calls SET status = 'ended', ended_at = ?3, updated_at = ?3 \
             WHERE id = ?1 AND account_id = ?2 AND status != 'ended'",
            params![id, account, now_ms()],
        )?)
    })?;
    if updated == 0 {
        return Err(AppError::not_found(
            "llamada no encontrada (o ya finalizada)",
        ));
    }
    let call = call_by_id(&state, &id, &account)?;
    Ok(Json(json!({ "ok": true, "call": call })).into_response())
}
