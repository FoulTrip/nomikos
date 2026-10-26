//! [ Gestión de Cuentas — IdP + dPaaS ]
//!
//! Cada cuenta (email + password) encapsula el contexto de su orquestador:
//!  - `account_llm`:   proveedor y modelos a usar (api_key cifrada en reposo)
//!  - `account_chain`: red y wallet del orquestador (keypair cifrado → dPaaS)
//!  - `account_wallets`: sub-wallets por propósito (App 00..N del diagrama)
//!
//! Flujo del diagrama: el orquestador (brain) consulta identidad
//! (`GET /api/accounts/me/context`) con su Bearer y resuelve TODO su
//! contexto sin secretos globales.
//!
//! Seguridad:
//!  - passwords: argon2id (PHC); tokens opacos de 32 bytes (solo sha256 en DB)
//!  - api_keys / keypairs: XChaCha20-Poly1305 con ACCOUNTS_MASTER_KEY
//!  - anti-bruteforce: 5 intentos fallidos por email → 429 (60s)

use crate::crypto;
use crate::db::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::state::SharedState;
use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

const SESSION_TTL_SECS: i64 = 7 * 24 * 3600; // 7 días
const LOGIN_WINDOW_MS: i64 = 60_000; // ventana anti-bruteforce
const LOGIN_MAX_FAILS: i64 = 5;

/// Proveedores LLM soportados por cuenta.
const PROVIDERS: &[&str] = &["nvidia-nim", "openai", "muse", "llama-stack", "custom"];
const NETWORKS: &[&str] = &["local", "devnet", "testnet", "mainnet"];

fn default_base_url(provider: &str) -> &'static str {
    match provider {
        "nvidia-nim" => "https://integrate.api.nvidia.com/v1",
        "openai" => "https://api.openai.com/v1",
        "llama-stack" => "http://localhost:8321/v1",
        _ => "",
    }
}

fn valid_email(email: &str) -> bool {
    let email = email.trim();
    if email.len() < 5 || email.len() > 254 {
        return false;
    }
    let Some((local, domain)) = email.split_once('@') else { return false };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

// ---------------------------------------------------------------------------
// Extractor de autenticación: Authorization: Bearer <token>
// ---------------------------------------------------------------------------

pub struct AuthedAccount {
    pub account_id: String,
}

impl FromRequestParts<SharedState> for AuthedAccount {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &SharedState,
    ) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::unauthorized("falta header Authorization: Bearer <token>"))?;
        let token = header
            .strip_prefix("Bearer ")
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .ok_or_else(|| AppError::unauthorized("Authorization debe ser: Bearer <token>"))?;

        let hash = crypto::sha256_hex(token.as_bytes());
        let account_id: String = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT a.id FROM sessions s JOIN accounts a ON a.id = s.account_id \
                     WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND a.is_active = 1",
                    params![hash, now_ms()],
                    |r| r.get(0),
                )
            })
            .map_err(|_| AppError::unauthorized("sesión inválida o expirada"))?;
        Ok(AuthedAccount { account_id })
    }
}

/// Recupera el hash del token desde el header (para logout).
fn token_hash_of(headers: &HeaderMap) -> AppResult<String> {
    let header = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::unauthorized("falta header Authorization"))?;
    let token = header
        .strip_prefix("Bearer ")
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .ok_or_else(|| AppError::unauthorized("Authorization debe ser: Bearer <token>"))?;
    Ok(crypto::sha256_hex(token.as_bytes()))
}

/// Identidad opcional para el gateway 402 y handlers multi-tenant:
/// - `Ok(None)`: no viene Authorization → cuenta implícita "system".
/// - `Ok(Some(id))`: sesión válida → cuenta autenticada.
/// - `Err(401)`: viene un token pero es inválido/expirado (no se ignora).
pub fn resolve_account_id(state: &SharedState, headers: &HeaderMap) -> AppResult<Option<String>> {
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
    let account_id: Option<String> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT a.id FROM sessions s JOIN accounts a ON a.id = s.account_id \
                 WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND a.is_active = 1",
            )?;
            let mut rows = stmt.query_map(params![hash, now_ms()], |r| r.get::<_, String>(0))?;
            Ok(rows.next().transpose()?)
        })
        .map_err(|_| AppError::unauthorized("sesión inválida o expirada"))?;
    account_id.map(Some).ok_or_else(|| AppError::unauthorized("sesión inválida o expirada"))
}

pub fn master_key_of(state: &SharedState) -> AppResult<[u8; 32]> {
    state
        .cfg
        .accounts_master_key
        .ok_or_else(|| {
            AppError::unavailable(
                "ACCOUNTS_MASTER_KEY no configurada (genera con: openssl rand -base64 32)",
            )
        })
}

// ---------------------------------------------------------------------------
// Handlers: Auth
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct RegisterBody {
    email: String,
    password: String,
    display_name: Option<String>,
}

pub async fn register_handler(
    State(state): State<SharedState>,
    Json(body): Json<RegisterBody>,
) -> AppResult<Response> {
    let email = body.email.trim().to_lowercase();
    if !valid_email(&email) {
        return Err(AppError::bad_request("email inválido"));
    }
    if body.password.len() < 8 {
        return Err(AppError::bad_request("password: mínimo 8 caracteres"));
    }

    let phc = crypto::hash_password(&body.password)?;
    let id = new_id("acc");
    let now = now_ms();

    let inserted = state.db.with(|c| {
        c.execute(
            "INSERT INTO accounts (id, email, password_hash, display_name, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![id, email, phc, body.display_name, now],
        )?;
        Ok(())
    });
    if let Err(rusqlite::Error::SqliteFailure(e, _)) = &inserted {
        if e.code == rusqlite::ErrorCode::ConstraintViolation {
            return Err(AppError::conflict("email ya registrado"));
        }
    }
    inserted?;

    tracing::info!("cuenta registrada: {id} ({email})");
    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "account_id": id, "email": email })),
    )
        .into_response())
}

#[derive(Deserialize)]
pub struct LoginBody {
    email: String,
    password: String,
}

pub async fn login_handler(
    State(state): State<SharedState>,
    Json(body): Json<LoginBody>,
) -> AppResult<Response> {
    let email = body.email.trim().to_lowercase();
    let now = now_ms();

    // Anti-bruteforce: ≥5 fallos en el último minuto → 429.
    let fails: i64 = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT COUNT(*) FROM login_attempts WHERE email = ?1 AND ok = 0 AND at > ?2",
                params![email, now - LOGIN_WINDOW_MS],
                |r| r.get(0),
            )
        })
        .unwrap_or(0);
    if fails >= LOGIN_MAX_FAILS {
        return Err(AppError::too_many_requests(
            "demasiados intentos fallidos; espera un minuto",
        ));
    }

    // Limpieza oportunista de intentos viejos (>1h).
    let _ = state.db.with(|c| {
        c.execute("DELETE FROM login_attempts WHERE at < ?1", params![now - 3_600_000])?;
        Ok(())
    });

    let row = state.db.with(|c| {
        c.query_row(
            "SELECT id, password_hash, is_active FROM accounts WHERE email = ?1",
            params![email],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)),
        )
    });

    let (account_id, ok) = match row {
        Ok((id, phc, active)) => {
            let ok = active == 1 && crypto::verify_password(&body.password, &phc);
            (id, ok)
        }
        Err(_) => {
            // Timing igualitario: verificamos igual contra un hash dummy.
            let _ = crypto::verify_password(&body.password, "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
            (String::new(), false)
        }
    };
    let _ = state.db.with(|c| {
        c.execute(
            "INSERT INTO login_attempts (email, at, ok) VALUES (?1, ?2, ?3)",
            params![email, now, ok as i64],
        )?;
        Ok(())
    });
    if !ok {
        return Err(AppError::unauthorized("email o password incorrectos"));
    }

    let (token, token_hash) = crypto::new_session_token();
    let expires_at = now + SESSION_TTL_SECS * 1000;
    state.db.with(|c| {
        c.execute(
            "INSERT INTO sessions (token_hash, account_id, created_at, expires_at) \
             VALUES (?1, ?2, ?3, ?4)",
            params![token_hash, account_id, now, expires_at],
        )?;
        Ok(())
    })?;

    tracing::info!("login OK: {account_id} ({email})");
    Ok(Json(json!({
        "ok": true,
        "account_id": account_id,
        "token": token,
        "token_type": "Bearer",
        "expires_at": expires_at,
    }))
    .into_response())
}

pub async fn logout_handler(
    State(state): State<SharedState>,
    _auth: AuthedAccount,
    headers: HeaderMap,
) -> AppResult<Response> {
    let hash = token_hash_of(&headers)?;
    state.db.with(|c| {
        c.execute("DELETE FROM sessions WHERE token_hash = ?1", params![hash])?;
        Ok(())
    })?;
    Ok(Json(json!({ "ok": true, "revoked": true })).into_response())
}

/// GET /api/auth/me — perfil + qué está configurado (sin secretos).
pub async fn me_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let account = state.db.with(|c| {
        c.query_row(
            "SELECT id, email, display_name, is_active, created_at FROM accounts WHERE id = ?1",
            params![auth.account_id],
            |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "email": r.get::<_, String>(1)?,
                    "display_name": r.get::<_, Option<String>>(2)?,
                    "is_active": r.get::<_, i64>(3)? != 0,
                    "created_at": r.get::<_, i64>(4)?,
                }))
            },
        )
    })?;
    let llm: Option<Value> = state.db.with(|c| {
        c.query_row(
            "SELECT provider, models, default_model FROM account_llm WHERE account_id = ?1",
            params![auth.account_id],
            |r| {
                let models: Value =
                    serde_json::from_str(&r.get::<_, String>(1)?).unwrap_or(json!([]));
                Ok(json!({
                    "provider": r.get::<_, String>(0)?,
                    "models": models,
                    "default_model": r.get::<_, Option<String>>(2)?,
                }))
            },
        )
        .map_err(|e| e.into())
    })
    .ok();
    let chain: Option<Value> = state.db.with(|c| {
        c.query_row(
            "SELECT network, wallet_pubkey, payee, daily_limit_lamports, tx_limit_lamports, \
             payer_keypair_enc IS NOT NULL FROM account_chain WHERE account_id = ?1",
            params![auth.account_id],
            |r| {
                Ok(json!({
                    "network": r.get::<_, String>(0)?,
                    "wallet_pubkey": r.get::<_, Option<String>>(1)?,
                    "payee": r.get::<_, Option<String>>(2)?,
                    "daily_limit_lamports": r.get::<_, Option<i64>>(3)?,
                    "tx_limit_lamports": r.get::<_, Option<i64>>(4)?,
                    "payer_configured": r.get::<_, i64>(5)? != 0,
                }))
            },
        )
    })
    .ok();
    let wallets: i64 = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT COUNT(*) FROM account_wallets WHERE account_id = ?1",
                params![auth.account_id],
                |r| r.get(0),
            )
        })
        .unwrap_or(0);

    Ok(Json(json!({
        "ok": true,
        "account": account,
        "llm_configured": llm.is_some(),
        "llm": llm,
        "chain_configured": chain.is_some(),
        "chain": chain,
        "sub_wallets": wallets,
    }))
    .into_response())
}

// ---------------------------------------------------------------------------
// Handlers: config por cuenta
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PutLlmBody {
    provider: String,
    base_url: Option<String>,
    api_key: Option<String>,
    models: Vec<String>,
    default_model: Option<String>,
}

/// PUT /api/accounts/me/llm — proveedor y modelos de la cuenta.
pub async fn put_llm_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<PutLlmBody>,
) -> AppResult<Response> {
    let provider = body.provider.trim().to_lowercase();
    if !PROVIDERS.contains(&provider.as_str()) {
        return Err(AppError::bad_request(format!(
            "provider inválido; soportados: {PROVIDERS:?}"
        )));
    }
    let base_url = body
        .base_url
        .map(|u| u.trim().trim_end_matches('/').to_string())
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| default_base_url(&provider).to_string());
    if base_url.is_empty() {
        return Err(AppError::bad_request("base_url requerido para este provider"));
    }
    if body.models.is_empty() {
        return Err(AppError::bad_request("models: al menos un modelo"));
    }
    let default_model = body
        .default_model
        .filter(|m| body.models.contains(m))
        .unwrap_or_else(|| body.models[0].clone());

    // api_key: se cifra si viene; si no, se conserva la existente.
    let api_key_enc = match body.api_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        Some(key) => {
            let mk = master_key_of(&state)?;
            Some(crypto::seal(&mk, key)?)
        }
        None => None,
    };
    let models_json = serde_json::to_string(&body.models)?;
    let now = now_ms();

    state.db.with(|c| {
        c.execute(
            "INSERT INTO account_llm (account_id, provider, base_url, api_key_enc, models, \
             default_model, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
             ON CONFLICT(account_id) DO UPDATE SET \
               provider = excluded.provider, base_url = excluded.base_url, \
               api_key_enc = COALESCE(excluded.api_key_enc, account_llm.api_key_enc), \
               models = excluded.models, default_model = excluded.default_model, \
               updated_at = excluded.updated_at",
            params![auth.account_id, provider, base_url, api_key_enc, models_json, default_model, now],
        )?;
        Ok(())
    })?;

    tracing::info!("account {} llm → {provider} ({})", auth.account_id, default_model);
    Ok(Json(json!({
        "ok": true,
        "provider": provider,
        "base_url": base_url,
        "models": body.models,
        "default_model": default_model,
        "api_key_updated": api_key_enc.is_some(),
    }))
    .into_response())
}

/// DELETE /api/accounts/me/llm — desconecta el proveedor LLM de la cuenta
/// (botón "Desconectar" del modal Modelos del dapp). El agente (brain)
/// vuelve al backend global del ecosistema (llama-stack/ollama).
pub async fn delete_llm_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    state.db.with(|c| {
        c.execute(
            "DELETE FROM account_llm WHERE account_id = ?1",
            params![auth.account_id],
        )?;
        Ok(())
    })?;
    tracing::info!("account {} desconectó su proveedor LLM", auth.account_id);
    Ok(Json(json!({ "ok": true, "llm": null })).into_response())
}

#[derive(Deserialize)]
pub struct PutChainBody {
    network: Option<String>,
    wallet_pubkey: Option<String>,
    payee: Option<String>,
    daily_limit_lamports: Option<i64>,
    tx_limit_lamports: Option<i64>,
    /// Sub-wallet operativa del agente (label). Tri-state:
    /// ausente → no tocar · null/"" → wallet principal dPaaS · label → esa wallet.
    #[serde(default, deserialize_with = "deserialize_some")]
    active_wallet_label: Option<Option<String>>,
}

/// Deserializador tri-state: distingue "clave ausente" (None externo) de
/// "clave presente con null" (Some(None)) en los campos Option<Option<T>>.
fn deserialize_some<'de, T, D>(d: D) -> Result<Option<T>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    T::deserialize(d).map(Some)
}

/// Resuelve la wallet operativa del agente: label → pubkey de la sub-wallet;
/// NULL → wallet principal del dPaaS (`wallet_pubkey` del chain).
fn resolve_active_wallet(state: &SharedState, account_id: &str, chain: &mut Value) {
    let label = chain
        .get("active_wallet_label")
        .and_then(|v| v.as_str())
        .map(String::from);
    chain["active_wallet_pubkey"] = match label {
        Some(label) => state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT pubkey FROM account_wallets WHERE account_id = ?1 AND label = ?2",
                    params![account_id, label],
                    |r| r.get::<_, String>(0),
                )
            })
            .ok()
            .map(|p| json!(p))
            .unwrap_or(Value::Null),
        None => chain.get("wallet_pubkey").cloned().unwrap_or(Value::Null),
    };
}

/// PUT /api/accounts/me/chain — red y wallet del orquestador (dPaaS).
pub async fn put_chain_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<PutChainBody>,
) -> AppResult<Response> {
    if let Some(net) = &body.network {
        if !NETWORKS.contains(&net.as_str()) {
            return Err(AppError::bad_request(format!("network inválida; válidas: {NETWORKS:?}")));
        }
    }
    // La sub-wallet operativa debe existir en la cuenta ("" / null = principal).
    if let Some(Some(label)) = body.active_wallet_label.as_ref() {
        let label = label.trim();
        if !label.is_empty() {
            let exists = state
                .db
                .with(|c| {
                    c.query_row(
                        "SELECT COUNT(*) FROM account_wallets WHERE account_id = ?1 AND label = ?2",
                        params![auth.account_id, label],
                        |r| Ok(r.get::<_, i64>(0)? > 0),
                    )
                })
                .unwrap_or(false);
            if !exists {
                return Err(AppError::bad_request(format!(
                    "sub-wallet «{label}» no existe en la cuenta; créala primero (POST /accounts/me/wallets)"
                )));
            }
        }
    }
    // Tri-state → parámetro SQL: NULL (ausente: no tocar) · "" (limpiar) · label.
    let active_wallet_param: Option<String> = match body.active_wallet_label {
        None => None,                      // ausente → no tocar
        Some(None) => Some(String::new()), // null → wallet principal (limpiar)
        Some(Some(label)) => Some(label.trim().to_string()),
    };
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO account_chain (account_id, network, wallet_pubkey, payee, \
             daily_limit_lamports, tx_limit_lamports, active_wallet_label, updated_at) \
             VALUES (?1, COALESCE(?2, 'devnet'), ?3, ?4, ?5, ?6, NULLIF(?7, ''), ?8) \
             ON CONFLICT(account_id) DO UPDATE SET \
               network = COALESCE(?2, account_chain.network), \
               wallet_pubkey = COALESCE(?3, account_chain.wallet_pubkey), \
               payee = COALESCE(?4, account_chain.payee), \
               daily_limit_lamports = COALESCE(?5, account_chain.daily_limit_lamports), \
               tx_limit_lamports = COALESCE(?6, account_chain.tx_limit_lamports), \
               active_wallet_label = \
                 CASE WHEN ?7 IS NULL THEN account_chain.active_wallet_label \
                      ELSE NULLIF(?7, '') END, \
               updated_at = ?8",
            params![auth.account_id, body.network, body.wallet_pubkey, body.payee,
                    body.daily_limit_lamports, body.tx_limit_lamports,
                    active_wallet_param, now],
        )?;
        Ok(())
    })?;

    let mut chain = state.db.with(|c| {
        c.query_row(
            "SELECT network, wallet_pubkey, payee, daily_limit_lamports, tx_limit_lamports, \
             active_wallet_label, payer_keypair_enc IS NOT NULL FROM account_chain WHERE account_id = ?1",
            params![auth.account_id],
            |r| {
                Ok(json!({
                    "network": r.get::<_, String>(0)?,
                    "wallet_pubkey": r.get::<_, Option<String>>(1)?,
                    "payee": r.get::<_, Option<String>>(2)?,
                    "daily_limit_lamports": r.get::<_, Option<i64>>(3)?,
                    "tx_limit_lamports": r.get::<_, Option<i64>>(4)?,
                    "active_wallet_label": r.get::<_, Option<String>>(5)?,
                    "payer_configured": r.get::<_, i64>(6)? != 0,
                }))
            },
        )
    })?;
    resolve_active_wallet(&state, &auth.account_id, &mut chain);
    Ok(Json(json!({ "ok": true, "chain": chain })).into_response())
}

// ---------------------------------------------------------------------------
// Keypair (dPaaS) — import cifrado + derivación de pubkey
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ImportKeypairBody {
    /// Keypair: array de 64 enteros O string con el JSON serializado.
    keypair_json: Option<Value>,
    /// Ruta al archivo keypair JSON del CLI de Solana (~/ permitido).
    keypair_path: Option<String>,
}

/// Parsea un keypair JSON inline: `[seed(32) ‖ pubkey(32)]`.
/// Acepta Value::String (JSON serializado) o Value::Array (array directo).
pub fn parse_keypair_str(raw: &str) -> AppResult<[u8; 64]> {
    let arr: Vec<u8> = serde_json::from_str(raw.trim())
        .map_err(|e| AppError::bad_request(format!("keypair JSON inválido: {e}")))?;
    if arr.len() < 64 {
        return Err(AppError::bad_request(format!(
            "keypair con {} bytes (se esperaban 64)",
            arr.len()
        )));
    }
    let mut kp = [0u8; 64];
    kp.copy_from_slice(&arr[..64]);
    Ok(kp)
}

fn keypair_json_to_string(v: &Value) -> AppResult<String> {
    match v {
        Value::String(s) => Ok(s.clone()),
        Value::Array(_) => Ok(v.to_string()),
        _ => Err(AppError::bad_request(
            "keypair_json debe ser un array de 64 enteros o un string JSON",
        )),
    }
}

fn load_keypair(state: &SharedState, body: &ImportKeypairBody) -> AppResult<(String, String)> {
    let raw_json = if let Some(json) = body.keypair_json.as_ref() {
        keypair_json_to_string(json)?
    } else if let Some(path) = body.keypair_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        crate::modules::solana::keypair_bytes_from_json(path)
            .map(|kp| serde_json::to_string(&kp.to_vec()).unwrap_or_default())
            .map_err(AppError::bad_request)?
    } else {
        return Err(AppError::bad_request("falta keypair_json o keypair_path"));
    };

    let kp = parse_keypair_str(&raw_json)?;
    let pubkey = crate::b58::encode(&kp[32..]);
    let mk = master_key_of(state)?;
    let sealed = crypto::seal(&mk, &raw_json)?;
    Ok((pubkey, sealed))
}

/// POST /api/accounts/me/chain/keypair/import — cifra el keypair del
/// orquestador y deriva la pubkey. El secreto nunca se loguea.
pub async fn import_keypair_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<ImportKeypairBody>,
) -> AppResult<Response> {
    let (pubkey, sealed) = load_keypair(&state, &body)?;
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO account_chain (account_id, network, wallet_pubkey, payer_keypair_enc, \
             payee, updated_at) VALUES (?1, 'devnet', ?2, ?3, ?4, ?5) \
             ON CONFLICT(account_id) DO UPDATE SET \
               wallet_pubkey = excluded.wallet_pubkey, \
               payer_keypair_enc = excluded.payer_keypair_enc, \
               payee = COALESCE(account_chain.payee, excluded.payee), \
               updated_at = excluded.updated_at",
            params![auth.account_id, pubkey, sealed, pubkey, now],
        )?;
        Ok(())
    })?;

    tracing::info!("account {}: keypair del orquestador importado → {pubkey}", auth.account_id);
    Ok(Json(json!({
        "ok": true,
        "wallet_pubkey": pubkey,
        "encrypted_at_rest": true,
    }))
    .into_response())
}

// ---------------------------------------------------------------------------
// Sub-wallets (Gestor de Wallet & Sub-Wallets del diagrama)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateWalletBody {
    label: String,
    network: Option<String>,
    keypair_json: Option<Value>,
    keypair_path: Option<String>,
    daily_limit_lamports: Option<i64>,
}

pub async fn create_wallet_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<CreateWalletBody>,
) -> AppResult<Response> {
    let label = body.label.trim().to_string();
    if label.is_empty() {
        return Err(AppError::bad_request("label vacío"));
    }
    if let Some(net) = &body.network {
        if !NETWORKS.contains(&net.as_str()) {
            return Err(AppError::bad_request(format!("network inválida; válidas: {NETWORKS:?}")));
        }
    }
    let (pubkey, sealed) = load_keypair(
        &state,
        &ImportKeypairBody {
            keypair_json: body.keypair_json.clone(),
            keypair_path: body.keypair_path.clone(),
        },
    )?;

    let id = new_id("wlt");
    let inserted = state.db.with(|c| {
        c.execute(
            "INSERT INTO account_wallets (id, account_id, label, network, pubkey, keypair_enc, \
             daily_limit_lamports, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, auth.account_id, label, body.network.clone().unwrap_or("devnet".into()),
                    pubkey, sealed, body.daily_limit_lamports, now_ms()],
        )?;
        Ok(())
    });
    if let Err(rusqlite::Error::SqliteFailure(e, _)) = &inserted {
        if e.code == rusqlite::ErrorCode::ConstraintViolation {
            return Err(AppError::conflict("ya existe una sub-wallet con ese label"));
        }
    }
    inserted?;

    tracing::info!("account {} sub-wallet «{label}» → {pubkey}", auth.account_id);
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "wallet_id": id,
            "label": label,
            "pubkey": pubkey,
        })),
    )
        .into_response())
}

pub async fn list_wallets_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let wallets: Vec<Value> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, label, network, pubkey, daily_limit_lamports, created_at \
                 FROM account_wallets WHERE account_id = ?1 ORDER BY created_at",
            )?;
            let rows = stmt.query_map(params![auth.account_id], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "label": r.get::<_, String>(1)?,
                    "network": r.get::<_, String>(2)?,
                    "pubkey": r.get::<_, String>(3)?,
                    "daily_limit_lamports": r.get::<_, Option<i64>>(4)?,
                    "created_at": r.get::<_, i64>(5)?,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default();
    Ok(Json(json!({ "ok": true, "wallets": wallets })).into_response())
}

// ---------------------------------------------------------------------------
// Wallets conectadas del navegador (Phantom / MetaMask / …) — solo pubkeys
// ---------------------------------------------------------------------------

/// Cadenas soportadas por las wallets del navegador.
const WALLET_CHAINS: &[&str] = &["solana", "evm"];

#[derive(Deserialize)]
pub struct ConnectWalletBody {
    /// Etiqueta visible; por defecto "{provider} · N".
    label: Option<String>,
    /// Proveedor: phantom | solflare | backpack | metamask | …
    provider: String,
    /// Cadena de la wallet: solana | evm.
    chain: String,
    /// Pubkey pública (base58 Solana · 0x… EVM). La clave privada NUNCA
    /// sale de la wallet del navegador — no se recibe ni se guarda.
    pubkey: String,
    /// Marcarla como la wallet en uso (default true; solo una activa).
    #[serde(default = "default_true")]
    set_active: bool,
}

fn default_true() -> bool {
    true
}

/// POST /api/accounts/me/connected-wallets — conecta una wallet del
/// navegador a la cuenta. Por defecto pasa a ser la wallet en uso
/// (se desactivan las demás: solo UNA activa por cuenta).
pub async fn connect_wallet_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<ConnectWalletBody>,
) -> AppResult<Response> {
    let provider = body.provider.trim().to_lowercase();
    if provider.is_empty() {
        return Err(AppError::bad_request("provider vacío"));
    }
    let chain = body.chain.trim().to_lowercase();
    if !WALLET_CHAINS.contains(&chain.as_str()) {
        return Err(AppError::bad_request(format!(
            "chain inválida; válidas: {WALLET_CHAINS:?}"
        )));
    }
    let pubkey = body.pubkey.trim().to_string();
    if pubkey.len() < 20 {
        return Err(AppError::bad_request("pubkey inválida"));
    }

    // label por defecto: "{provider} · N" según las ya conectadas de ese proveedor
    let label = match body.label.as_deref().map(str::trim).filter(|l| !l.is_empty()) {
        Some(l) => l.to_string(),
        None => {
            let n: i64 = state
                .db
                .with(|c| {
                    Ok(c.query_row(
                        "SELECT COUNT(*) FROM account_connected_wallets \
                         WHERE account_id = ?1 AND provider = ?2",
                        params![auth.account_id, provider],
                        |r| r.get::<_, i64>(0),
                    )? + 1)
                })
                .unwrap_or(1);
            format!("{provider} · {n}")
        }
    };

    let id = new_id("cwt");
    let now = now_ms();
    let inserted = state.db.with(|c| {
        c.execute(
            "INSERT INTO account_connected_wallets \
             (id, account_id, label, provider, chain, pubkey, is_active, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![id, auth.account_id, label, provider, chain, pubkey, now],
        )?;
        if body.set_active {
            c.execute(
                "UPDATE account_connected_wallets SET is_active = 0 WHERE account_id = ?1",
                params![auth.account_id],
            )?;
            c.execute(
                "UPDATE account_connected_wallets SET is_active = 1 WHERE id = ?1",
                params![id],
            )?;
        }
        Ok(())
    });
    if let Err(rusqlite::Error::SqliteFailure(e, _)) = &inserted {
        if e.code == rusqlite::ErrorCode::ConstraintViolation {
            return Err(AppError::conflict("ya existe una wallet conectada con ese nombre"));
        }
    }
    inserted?;

    tracing::info!(
        "account {} + wallet conectada «{label}» ({provider}/{chain})",
        auth.account_id
    );
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "wallet": {
                "id": id, "label": label, "provider": provider,
                "chain": chain, "pubkey": pubkey, "is_active": body.set_active,
            }
        })),
    )
        .into_response())
}

/// GET /api/accounts/me/connected-wallets — lista + la que está en uso.
pub async fn list_connected_wallets_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let wallets: Vec<Value> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, label, provider, chain, pubkey, is_active, created_at \
                 FROM account_connected_wallets WHERE account_id = ?1 ORDER BY created_at",
            )?;
            let rows = stmt.query_map(params![auth.account_id], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "label": r.get::<_, String>(1)?,
                    "provider": r.get::<_, String>(2)?,
                    "chain": r.get::<_, String>(3)?,
                    "pubkey": r.get::<_, String>(4)?,
                    "is_active": r.get::<_, i64>(5)? != 0,
                    "created_at": r.get::<_, i64>(6)?,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default();
    let active = wallets
        .iter()
        .find(|w| w.get("is_active").map_or(false, |v| v == &json!(true)))
        .cloned()
        .unwrap_or(Value::Null);
    Ok(Json(json!({ "ok": true, "wallets": wallets, "active": active })).into_response())
}

#[derive(Deserialize)]
pub struct ActivateWalletBody {
    label: String,
}

/// PUT /api/accounts/me/connected-wallets/activate — marca una wallet como
/// la en uso y desactiva las demás (invariante: exactamente una activa).
pub async fn activate_connected_wallet_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<ActivateWalletBody>,
) -> AppResult<Response> {
    let label = body.label.trim().to_string();
    if label.is_empty() {
        return Err(AppError::bad_request("label vacío"));
    }
    let updated = state.db.with(|c| {
        c.execute(
            "UPDATE account_connected_wallets SET is_active = 0 WHERE account_id = ?1",
            params![auth.account_id],
        )?;
        Ok(c.execute(
            "UPDATE account_connected_wallets SET is_active = 1 \
             WHERE account_id = ?1 AND label = ?2",
            params![auth.account_id, label],
        )?)
    })?;
    if updated == 0 {
        return Err(AppError::bad_request(format!(
            "wallet conectada «{label}» no existe en la cuenta"
        )));
    }
    Ok(Json(json!({ "ok": true, "active": label })).into_response())
}

// ---------------------------------------------------------------------------
// Servicios del ecosistema — dapps que el agente usará con x402
// ---------------------------------------------------------------------------

/// Catálogo de servicios/dapps que el agente puede agregar a su cuenta.
/// TODO el flujo de estas dapps viaja por el gateway x402 (peaje reactivo
/// 402 firmado por la wallet dPaaS de la cuenta), y así queda registrado
/// en `account_services` al agregarlas.
pub const SERVICE_CATALOG: &[(&str, &str, &str)] = &[
    // (id, display_name, resource x402)
    ("medusa", "Medusa.js · ERP", "x402:path:/api/erp/*"),
];

fn catalog_ids() -> Vec<&'static str> {
    SERVICE_CATALOG.iter().map(|(id, _, _)| *id).collect()
}

#[derive(Deserialize)]
pub struct AddServiceBody {
    service: String,
}

/// GET /api/accounts/me/services — catálogo + estado por cuenta.
pub async fn list_services_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    // Filas ya agregadas por la cuenta (id → fila).
    let added: Vec<Value> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT service, display_name, via_x402, resource, payer_pubkey, network, \
                 status, created_at FROM account_services WHERE account_id = ?1 ORDER BY created_at",
            )?;
            let rows = stmt.query_map(params![auth.account_id], |r| {
                Ok(json!({
                    "service": r.get::<_, String>(0)?,
                    "display_name": r.get::<_, String>(1)?,
                    "via_x402": r.get::<_, i64>(2)? != 0,
                    "resource": r.get::<_, String>(3)?,
                    "payer_pubkey": r.get::<_, Option<String>>(4)?,
                    "network": r.get::<_, Option<String>>(5)?,
                    "status": r.get::<_, String>(6)?,
                    "added_at": r.get::<_, i64>(7)?,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default();

    let services: Vec<Value> = SERVICE_CATALOG
        .iter()
        .map(|(id, name, resource)| {
            let row = added
                .iter()
                .find(|v| v.get("service").and_then(|s| s.as_str()) == Some(*id));
            json!({
                "service": id,
                "display_name": name,
                "resource": resource,
                "via_x402": true,   // TODO el flujo de la dapp usa x402 (reactivo 402 + dPaaS)
                "added": row.is_some(),
                "status": row.and_then(|v| v.get("status").cloned()).unwrap_or(Value::Null),
                "added_at": row.and_then(|v| v.get("added_at").cloned()).unwrap_or(Value::Null),
                "payer_pubkey": row.and_then(|v| v.get("payer_pubkey").cloned()).unwrap_or(Value::Null),
                "network": row.and_then(|v| v.get("network").cloned()).unwrap_or(Value::Null),
            })
        })
        .collect();

    Ok(Json(json!({ "ok": true, "services": services })).into_response())
}

/// POST /api/accounts/me/services — agrega una dapp a la cuenta.
///
/// El registro persiste el vínculo cuenta→servicio→x402: `via_x402=1`,
/// el resource del peaje y el snapshot del payer dPaaS/red del agente
/// en el momento del alta (el flujo completo de la dapp usará x402).
pub async fn add_service_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<AddServiceBody>,
) -> AppResult<Response> {
    let service = body.service.trim().to_string();
    let Some((id, name, resource)) = SERVICE_CATALOG
        .iter()
        .find(|(s, _, _)| *s == service)
        .map(|(a, b, c)| (*a, *b, *c))
    else {
        return Err(AppError::bad_request(format!(
            "servicio desconocido «{}»; catálogo: {:?}",
            service,
            catalog_ids()
        )));
    };

    // Snapshot del contexto dPaaS de la cuenta al agregar (documentación
    // del flujo: qué wallet/red firma los peajes x402 de la dapp).
    let (payer_pubkey, network): (Option<String>, String) = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT wallet_pubkey, network FROM account_chain WHERE account_id = ?1",
                params![auth.account_id],
                |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)),
            )
        })
        .unwrap_or((None, "devnet".to_string()));

    let sid = new_id("svc");
    let now = now_ms();
    let inserted = state.db.with(|c| {
        c.execute(
            "INSERT INTO account_services (id, account_id, service, display_name, via_x402, \
             resource, payer_pubkey, network, status, created_at) \
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, 'active', ?8)",
            params![sid, auth.account_id, id, name, resource, payer_pubkey, network, now],
        )?;
        Ok(())
    });
    if let Err(rusqlite::Error::SqliteFailure(e, _)) = &inserted {
        if e.code == rusqlite::ErrorCode::ConstraintViolation {
            return Err(AppError::conflict("servicio ya agregado a la cuenta"));
        }
    }
    inserted?;

    tracing::info!(
        "account {} + servicio «{id}» (flujo x402: {resource}, payer {}, red {network})",
        auth.account_id,
        payer_pubkey.as_deref().unwrap_or("sin wallet")
    );
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "service": {
                "service": id,
                "display_name": name,
                "via_x402": true,
                "resource": resource,
                "status": "active",
                "payer_pubkey": payer_pubkey,
                "network": network,
                "added_at": now,
            }
        })),
    )
        .into_response())
}

// ---------------------------------------------------------------------------
// Contexto resuelto (lo que consume el orquestador/brain)
// ---------------------------------------------------------------------------

/// GET /api/accounts/me/context — resolución única para el orquestador:
/// proveedor+modelos+api_key, red+wallet, dPaaS y sub-wallets.
///
/// ⚠️ Trade-off documentado: devuelve el api_key del proveedor en claro
/// (solo por TLS, componente de confianza). Fase 6: credential-proxy.
pub async fn context_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let account = state.db.with(|c| {
        c.query_row(
            "SELECT id, email, display_name FROM accounts WHERE id = ?1",
            params![auth.account_id],
            |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "email": r.get::<_, String>(1)?,
                    "display_name": r.get::<_, Option<String>>(2)?,
                }))
            },
        )
    })?;

    // LLM de la cuenta (api_key desencriptada).
    let llm: Option<Value> = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT provider, base_url, api_key_enc, models, default_model \
                 FROM account_llm WHERE account_id = ?1",
                params![auth.account_id],
                |r| {
                    let models: Value =
                        serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or(json!([]));
                    Ok(json!({
                        "provider": r.get::<_, String>(0)?,
                        "base_url": r.get::<_, String>(1)?,
                        "api_key_enc": r.get::<_, Option<String>>(2)?,
                        "models": models,
                        "default_model": r.get::<_, Option<String>>(4)?,
                    }))
                },
            )
        })
        .ok();
    let llm = match llm {
        Some(mut v) => {
            let api_key = match v.get("api_key_enc").and_then(|x| x.as_str()) {
                Some(enc) => state
                    .cfg
                    .accounts_master_key
                    .and_then(|k| crypto::open(&k, enc).ok())
                    .and_then(|b| String::from_utf8(b).ok())
                    .unwrap_or_default(),
                None => String::new(),
            };
            v["api_key"] = json!(api_key);
            v.as_object_mut().unwrap().remove("api_key_enc");
            Some(v)
        }
        None => None,
    };

    // Chain (red + wallet del orquestador + dPaaS + wallet operativa).
    let mut chain: Option<Value> = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT network, wallet_pubkey, payee, daily_limit_lamports, tx_limit_lamports, \
                 active_wallet_label, payer_keypair_enc IS NOT NULL FROM account_chain WHERE account_id = ?1",
                params![auth.account_id],
                |r| {
                    Ok(json!({
                        "network": r.get::<_, String>(0)?,
                        "wallet_pubkey": r.get::<_, Option<String>>(1)?,
                        "payee": r.get::<_, Option<String>>(2)?,
                        "daily_limit_lamports": r.get::<_, Option<i64>>(3)?,
                        "tx_limit_lamports": r.get::<_, Option<i64>>(4)?,
                        "active_wallet_label": r.get::<_, Option<String>>(5)?,
                        "payer_configured": r.get::<_, i64>(6)? != 0,
                    }))
                },
            )
        })
        .ok();
    if let Some(ch) = chain.as_mut() {
        resolve_active_wallet(&state, &auth.account_id, ch);
    }

    let wallets: Vec<Value> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, label, network, pubkey, daily_limit_lamports \
                 FROM account_wallets WHERE account_id = ?1 ORDER BY created_at",
            )?;
            let rows = stmt.query_map(params![auth.account_id], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "label": r.get::<_, String>(1)?,
                    "network": r.get::<_, String>(2)?,
                    "pubkey": r.get::<_, String>(3)?,
                    "daily_limit_lamports": r.get::<_, Option<i64>>(4)?,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default();

    // Wallets conectadas del navegador (Phantom/MetaMask/…) — solo pubkeys.
    let connected_wallets: Vec<Value> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, label, provider, chain, pubkey, is_active \
                 FROM account_connected_wallets WHERE account_id = ?1 ORDER BY created_at",
            )?;
            let rows = stmt.query_map(params![auth.account_id], |r| {
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "label": r.get::<_, String>(1)?,
                    "provider": r.get::<_, String>(2)?,
                    "chain": r.get::<_, String>(3)?,
                    "pubkey": r.get::<_, String>(4)?,
                    "is_active": r.get::<_, i64>(5)? != 0,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default();
    let active_connected_wallet = connected_wallets
        .iter()
        .find(|w| w.get("is_active").map_or(false, |v| v == &json!(true)))
        .cloned()
        .unwrap_or(Value::Null);

    Ok(Json(json!({
        "ok": true,
        "account": account,
        "llm": llm,        // null si la cuenta no configuró proveedor
        "chain": chain,    // null si la cuenta no configuró red/wallet
        "wallets": wallets,
        "connected_wallets": connected_wallets,       // Phantom/MetaMask… (solo pubkeys)
        "active_connected_wallet": active_connected_wallet, // la que está en uso
        "x402": {
            "protected_by_default": false,   // Fase 4: peaje reactivo 402
            "mode": "manual",               // manual | delegated (Fase 4)
        },
    }))
    .into_response())
}
