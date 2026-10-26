//! [ Flota de dispositivos — NomikOS Fase 1 ]
//!
//! Evoluciona el `device` singleton a una **flota multi-device** ligada a
//! cuentas (`docs/nomikos-design.md`):
//!
//!  1. **Enroll**: la placa (firmware/agentd) genera su keypair ed25519 y
//!     hace `POST /api/devices/enroll {board, pubkey}` → recibe
//!     `device_id`, `claim_code` (lo enseña en su pantalla) y un
//!     `enroll_secret` (que guarda; la DB solo su sha256).
//!  2. **Claim**: el usuario, con sesión de cuenta (panel del dapp),
//!     canjea el código → el dispositivo queda ligado a la cuenta.
//!  3. **Token**: el dispositivo sondea `POST /api/devices/token` con su
//!     `enroll_secret`; al estar reclamado recibe un token opaco (sesión
//!     con `device_id`) — TTL 30 días.
//!  4. **Runtime**: heartbeat (online/offline) + telemetría; las facturas
//!     x402 que provoque llevan `device_id` (peaje por dispositivo).
//!
//! Seguridad (regla #7 del workspace): la keypair de Solana NUNCA vive en
//! el dispositivo — los peajes los firma el dPaaS de la cuenta. El
//! dispositivo solo posee su identidad propia (ed25519).

use crate::crypto;
use crate::db::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::modules::accounts::AuthedAccount;
use crate::state::SharedState;
use axum::extract::{FromRequestParts, Path, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rand::RngCore;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

const DEVICE_TOKEN_TTL_SECS: i64 = 30 * 24 * 3600;
const CLAIM_TTL_MS: i64 = 15 * 60 * 1000; // el código vive 15 minutos
const ONLINE_WINDOW_MS: i64 = 60_000; // heartbeat > 60 s → offline

/// Código de emparejado: 8 chars hex mayúsculas (lo enseña la placa).
pub fn new_claim_code() -> String {
    let mut b = [0u8; 4];
    rand::rngs::OsRng.fill_bytes(&mut b);
    hex::encode(b).to_uppercase()
}

/// Identidad de la petición: (account_id, device_id?).
/// Un token de DISPOSITIVO es una sesión con `device_id` — el gateway x402
/// lo usa para ligar la factura al dispositivo que la provocó.
pub fn resolve_identity(
    state: &SharedState,
    headers: &HeaderMap,
) -> AppResult<Option<(String, Option<String>)>> {
    let Some(header) = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    else {
        return Ok(None);
    };
    let Some(token) = header
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|t| !t.is_empty())
    else {
        return Err(AppError::unauthorized("Authorization debe ser: Bearer <token>"));
    };
    let hash = crypto::sha256_hex(token.as_bytes());
    let row: Option<(String, Option<String>)> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT a.id, s.device_id FROM sessions s \
                 JOIN accounts a ON a.id = s.account_id \
                 WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND a.is_active = 1",
            )?;
            let mut rows = stmt.query_map(params![hash, now_ms()], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
            })?;
            Ok(rows.next().transpose()?)
        })
        .map_err(|_| AppError::unauthorized("sesión inválida o expirada"))?;
    row.map(Some).ok_or_else(|| AppError::unauthorized("sesión inválida o expirada"))
}

// ---------------------------------------------------------------------------
// Extractor: token de dispositivo (sesión con device_id)
// ---------------------------------------------------------------------------

pub struct AuthedDevice {
    pub account_id: String,
    pub device_id: String,
}

impl FromRequestParts<SharedState> for AuthedDevice {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| {
                AppError::unauthorized("falta header Authorization: Bearer <device-token>")
            })?;
        let token = header
            .strip_prefix("Bearer ")
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .ok_or_else(|| AppError::unauthorized("Authorization debe ser: Bearer <token>"))?;

        let hash = crypto::sha256_hex(token.as_bytes());
        let row: (String, String) = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT a.id, s.device_id FROM sessions s \
                     JOIN accounts a ON a.id = s.account_id \
                     JOIN devices d ON d.id = s.device_id \
                     WHERE s.token_hash = ?1 AND s.expires_at > ?2 \
                       AND a.is_active = 1 AND s.device_id IS NOT NULL",
                    params![hash, now_ms()],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
            })
            .map_err(|_| {
                AppError::unauthorized("token de dispositivo inválido, expirado o sin claim")
            })?;
        Ok(AuthedDevice { account_id: row.0, device_id: row.1 })
    }
}

// ---------------------------------------------------------------------------
// Fila de dispositivo como JSON
// ---------------------------------------------------------------------------

const DEVICE_COLS: &str =
    "id, account_id, name, board, pubkey, status, last_seen_at, agent_version, \
     daily_limit_lamports, tx_limit_lamports, created_at";

fn row_to_device(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let last_seen: Option<i64> = r.get(6)?;
    let online = last_seen.map(|t| now_ms() - t < ONLINE_WINDOW_MS).unwrap_or(false);
    Ok(json!({
        "id": r.get::<_, String>(0)?,
        "account_id": r.get::<_, Option<String>>(1)?,
        "name": r.get::<_, String>(2)?,
        "board": r.get::<_, String>(3)?,
        "pubkey": r.get::<_, String>(4)?,
        "status": r.get::<_, String>(5)?,
        "online": online,
        "last_seen_at": last_seen,
        "agent_version": r.get::<_, Option<String>>(7)?,
        "daily_limit_lamports": r.get::<_, Option<i64>>(8)?,
        "tx_limit_lamports": r.get::<_, Option<i64>>(9)?,
        "created_at": r.get::<_, i64>(10)?,
    }))
}

fn device_by_id(state: &SharedState, id: &str) -> AppResult<Value> {
    state
        .db
        .with(|c| {
            c.query_row(
                &format!("SELECT {DEVICE_COLS} FROM devices WHERE id = ?1"),
                params![id],
                row_to_device,
            )
        })
        .map_err(|_| AppError::not_found(format!("device «{id}» no encontrado")))
}

// ---------------------------------------------------------------------------
// 1. Enroll — la placa se presenta (sin auth: aún no es de nadie)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct EnrollBody {
    /// Placa/BSP: esp32-s3-amoled-143 | rpi4 | beagleplay | …
    board: String,
    name: Option<String>,
    /// Pubkey ed25519 del dispositivo (generada en primer boot; la clave
    /// privada no sale de la placa).
    pubkey: String,
}

/// POST /api/devices/enroll → {device_id, claim_code, enroll_secret}
pub async fn enroll_handler(
    State(state): State<SharedState>,
    Json(body): Json<EnrollBody>,
) -> AppResult<Response> {
    let board = body.board.trim().to_lowercase();
    if board.is_empty() {
        return Err(AppError::bad_request("board vacío"));
    }
    let pubkey = body.pubkey.trim().to_string();
    if pubkey.len() < 32 {
        return Err(AppError::bad_request("pubkey inválida (ed25519 en base58)"));
    }
    let name = body
        .name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .unwrap_or(&board)
        .to_string();

    let id = new_id("dev");
    let (enroll_secret, enroll_hash) = crypto::new_session_token(); // opaco; DB = sha256
    let claim_code = new_claim_code();
    let claim_expires = now_ms() + CLAIM_TTL_MS;

    state.db.with(|c| {
        c.execute(
            "INSERT INTO devices (id, name, board, pubkey, claim_code, claim_expires_at, \
             enroll_secret_hash, status, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'offline', ?8)",
            params![id, name, board, pubkey, claim_code, claim_expires, enroll_hash, now_ms()],
        )?;
        Ok(())
    })?;

    tracing::info!("device {id} ({board}) en espera de claim «{claim_code}»");
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "device_id": id,
            "name": name,
            "claim_code": claim_code,
            "claim_expires_at": claim_expires,
            "enroll_secret": enroll_secret,
        })),
    )
        .into_response())
}

// ---------------------------------------------------------------------------
// 2. Claim — el usuario (con sesión de cuenta) canjea el código de la placa
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ClaimBody {
    code: String,
}

/// POST /api/devices/claim {code} — liga el dispositivo a la cuenta.
pub async fn claim_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<ClaimBody>,
) -> AppResult<Response> {
    let code = body.code.trim().to_uppercase();
    if code.is_empty() {
        return Err(AppError::bad_request("code vacío"));
    }

    // atómico: solo un claim gana (WHERE account_id IS NULL)
    let device_id: String = state
        .db
        .with(|c| {
            let id: String = c.query_row(
                "SELECT id FROM devices \
                 WHERE claim_code = ?1 AND account_id IS NULL AND claim_expires_at > ?2",
                params![code, now_ms()],
                |r| r.get(0),
            )?;
            c.execute(
                "UPDATE devices SET account_id = ?1, claim_code = NULL, claim_expires_at = NULL \
                 WHERE id = ?2 AND account_id IS NULL",
                params![auth.account_id, id],
            )?;
            Ok(id)
        })
        .map_err(|_| {
            AppError::not_found("código de emparejado inválido, ya usado o expirado")
        })?;

    let dev = device_by_id(&state, &device_id)?;
    tracing::info!("account {} claimed device {device_id}", auth.account_id);
    Ok(Json(json!({ "ok": true, "device": dev })).into_response())
}

// ---------------------------------------------------------------------------
// 3. Token de dispositivo — la placa sondea con su enroll_secret
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct DeviceTokenBody {
    device_id: String,
    enroll_secret: String,
}

/// POST /api/devices/token — 202 mientras nadie lo reclama; tras el claim
/// emite el token opaco del dispositivo (sesión con device_id, TTL 30 días).
pub async fn device_token_handler(
    State(state): State<SharedState>,
    Json(body): Json<DeviceTokenBody>,
) -> AppResult<Response> {
    let hash = crypto::sha256_hex(body.enroll_secret.trim().as_bytes());
    let (device_id, account_id): (String, Option<String>) = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT id, account_id FROM devices WHERE id = ?1 AND enroll_secret_hash = ?2",
                params![body.device_id.trim(), hash],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
        })
        .map_err(|_| AppError::unauthorized("enroll_secret inválido para ese device_id"))?;

    let Some(account_id) = account_id else {
        return Ok((
            StatusCode::ACCEPTED,
            Json(json!({
                "ok": false,
                "error": "aún sin claim: introduce el código en el panel de tu cuenta",
            })),
        )
            .into_response());
    };

    let (token, token_hash) = crypto::new_session_token();
    let expires_at = now_ms() + DEVICE_TOKEN_TTL_SECS * 1000;
    state.db.with(|c| {
        c.execute(
            "INSERT INTO sessions (token_hash, account_id, device_id, created_at, expires_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![token_hash, account_id, device_id, now_ms(), expires_at],
        )?;
        Ok(())
    })?;

    tracing::info!("device {device_id} obtuvo su token (cuenta {account_id})");
    Ok(Json(json!({
        "ok": true,
        "token": token,
        "token_type": "Bearer",
        "expires_at": expires_at,
        "device_id": device_id,
        "account_id": account_id,
    }))
    .into_response())
}

// ---------------------------------------------------------------------------
// 4. Runtime del dispositivo (token de dispositivo)
// ---------------------------------------------------------------------------

/// GET /api/devices/me — identidad y contexto del dispositivo.
pub async fn me_handler(
    State(state): State<SharedState>,
    auth: AuthedDevice,
) -> AppResult<Response> {
    let dev = device_by_id(&state, &auth.device_id)?;
    Ok(Json(json!({ "ok": true, "device": dev })).into_response())
}

#[derive(Deserialize)]
pub struct HeartbeatBody {
    agent_version: Option<String>,
    status: Option<String>,
}

/// POST /api/devices/me/heartbeat — vida + telemetría mínima.
pub async fn heartbeat_handler(
    State(state): State<SharedState>,
    auth: AuthedDevice,
    Json(body): Json<HeartbeatBody>,
) -> AppResult<Response> {
    let status = body
        .status
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && ["online", "offline", "busy"].contains(s))
        .unwrap_or("online");
    state.db.with(|c| {
        c.execute(
            "UPDATE devices SET status = ?1, last_seen_at = ?2, agent_version = COALESCE(?3, agent_version) \
             WHERE id = ?4",
            params![status, now_ms(), body.agent_version, auth.device_id],
        )?;
        Ok(())
    })?;
    let dev = device_by_id(&state, &auth.device_id)?;
    Ok(Json(json!({ "ok": true, "device": dev })).into_response())
}

// ---------------------------------------------------------------------------
// 5. Flota desde la cuenta (Bearer de cuenta)
// ---------------------------------------------------------------------------

/// GET /api/devices — la flota de la cuenta con estado online.
pub async fn list_fleet_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let fleet: Vec<Value> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(&format!(
                "SELECT {DEVICE_COLS} FROM devices WHERE account_id = ?1 ORDER BY created_at"
            ))?;
            let rows = stmt.query_map(params![auth.account_id], row_to_device)?;
            rows.collect()
        })
        .unwrap_or_default();
    Ok(Json(json!({ "ok": true, "devices": fleet, "count": fleet.len() })).into_response())
}

#[derive(Deserialize)]
pub struct DeviceLimitsBody {
    daily_limit_lamports: Option<i64>,
    tx_limit_lamports: Option<i64>,
}

/// PUT /api/devices/{id}/limits — dPaaS por dispositivo.
pub async fn limits_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Path(id): Path<String>,
    Json(body): Json<DeviceLimitsBody>,
) -> AppResult<Response> {
    let updated = state.db.with(|c| {
        Ok(c.execute(
            "UPDATE devices SET \
               daily_limit_lamports = COALESCE(?1, daily_limit_lamports), \
               tx_limit_lamports = COALESCE(?2, tx_limit_lamports) \
             WHERE id = ?3 AND account_id = ?4",
            params![
                body.daily_limit_lamports,
                body.tx_limit_lamports,
                id,
                auth.account_id
            ],
        )?)
    })?;
    if updated == 0 {
        return Err(AppError::not_found("device no encontrado en tu cuenta"));
    }
    let dev = device_by_id(&state, &id)?;
    Ok(Json(json!({ "ok": true, "device": dev })).into_response())
}
