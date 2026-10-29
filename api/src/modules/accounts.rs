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
use rand::RngCore;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

const SESSION_TTL_SECS: i64 = 7 * 24 * 3600; // 7 días
const LOGIN_WINDOW_MS: i64 = 60_000; // ventana anti-bruteforce
const LOGIN_MAX_FAILS: i64 = 5;

/// Proveedores LLM por cuenta: identificador ABIERTO (estilo opencode),
/// no una lista cerrada. Cualquier proveedor OpenAI-compatible es válido
/// (baseten, openai, nvidia-nim, meta, custom, …) con `base_url`+`api_key`.
fn valid_provider(provider: &str) -> bool {
    let len = provider.len();
    if len < 1 || len > 64 {
        return false;
    }
    provider
        .chars()
        .all(|c| matches!(c, 'a'..='z' | '0'..='9' | '.' | '_' | '/' | '-' | ':'))
}

const NETWORKS: &[&str] = &["local", "devnet", "testnet", "mainnet"];

fn default_base_url(provider: &str) -> &'static str {
    match provider {
        "nvidia-nim" => "https://integrate.api.nvidia.com/v1",
        "openai" => "https://api.openai.com/v1",
        "baseten" => "https://inference.baseten.co/v1",
        "llama-stack" => "http://localhost:8321/v1",
        _ => "",
    }
}

fn valid_email(email: &str) -> bool {
    let email = email.trim();
    if email.len() < 5 || email.len() > 254 {
        return false;
    }
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
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
        return Err(AppError::unauthorized(
            "Authorization debe ser: Bearer <token>",
        ));
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
    account_id
        .map(Some)
        .ok_or_else(|| AppError::unauthorized("sesión inválida o expirada"))
}

pub fn master_key_of(state: &SharedState) -> AppResult<[u8; 32]> {
    state.cfg.accounts_master_key.ok_or_else(|| {
        AppError::unavailable(
            "ACCOUNTS_MASTER_KEY no configurada (genera con: openssl rand -base64 32)",
        )
    })
}

/// Acuña un par dPaaS: pubkey base58 + keypair JSON sellado (AEAD).
fn mint_dpaas_pair(state: &SharedState) -> AppResult<(String, String)> {
    let mut seed = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut seed);
    let signing = ed25519_dalek::SigningKey::from_bytes(&seed);
    let mut kp = [0u8; 64];
    kp[..32].copy_from_slice(&seed);
    kp[32..].copy_from_slice(signing.verifying_key().as_bytes());
    let pubkey = crate::b58::encode(&kp[32..]);
    let raw_json = serde_json::to_string(&kp.to_vec()).unwrap_or_default();
    let mk = master_key_of(state)?;
    let sealed = crypto::seal(&mk, &raw_json)?;
    Ok((pubkey, sealed))
}

/// Bóveda dPaaS: garantiza wallet para (cuenta, red), creándola sola si
/// falta. Si es la red ACTIVA, la espeja en account_chain — invariante:
/// TODAS las lecturas (payer, summary, faucet, sim) siguen ahí.
/// Devuelve la pubkey de esa red.
pub(crate) fn ensure_dpaas_wallet(
    state: &SharedState,
    account_id: &str,
    network: &str,
) -> AppResult<String> {
    if let Some(pk) = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT wallet_pubkey FROM account_chain_wallets WHERE account_id = ?1 AND network = ?2",
                params![account_id, network],
                |r| r.get::<_, String>(0),
            )
        })
        .ok()
    {
        mirror_active_wallet(state, account_id)?;
        return Ok(pk);
    }
    let (pubkey, sealed) = mint_dpaas_pair(state)?;
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT OR IGNORE INTO account_chain_wallets \
             (account_id, network, wallet_pubkey, payer_keypair_enc, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![account_id, network, pubkey, sealed, now],
        )?;
        Ok(())
    })?;
    mirror_active_wallet(state, account_id)?;
    tracing::info!("account {account_id}: wallet dPaaS auto-generada en {network} → {pubkey}");
    Ok(pubkey)
}

/// Espeja la wallet de la red activa (bóveda → account_chain). Crea la
/// fila de chain si falta (cuentas legacy sin PUT /chain).
fn mirror_active_wallet(state: &SharedState, account_id: &str) -> AppResult<()> {
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO account_chain (account_id, network, updated_at) VALUES (?1, 'devnet', ?2) \
             ON CONFLICT(account_id) DO NOTHING",
            params![account_id, now],
        )?;
        c.execute(
            "UPDATE account_chain SET wallet_pubkey = \
               (SELECT w.wallet_pubkey FROM account_chain_wallets w \
                WHERE w.account_id = account_chain.account_id AND w.network = account_chain.network), \
             payer_keypair_enc = \
               (SELECT w.payer_keypair_enc FROM account_chain_wallets w \
                WHERE w.account_id = account_chain.account_id AND w.network = account_chain.network), \
             updated_at = ?2 WHERE account_id = ?1",
            params![account_id, now],
        )?;
        Ok(())
    })?;
    Ok(())
}

/// Lista dPaaS por red para la UI (para fondear; SIN secretos).
pub(crate) fn dpaas_wallets_list(state: &SharedState, account_id: &str) -> Vec<Value> {
    state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT network, wallet_pubkey FROM account_chain_wallets \
                 WHERE account_id = ?1 ORDER BY CASE network \
                 WHEN 'devnet' THEN 0 WHEN 'mainnet' THEN 1 WHEN 'testnet' THEN 2 ELSE 3 END",
            )?;
            let rows = stmt.query_map(params![account_id], |r| {
                Ok(json!({
                    "network": r.get::<_, String>(0)?,
                    "wallet_pubkey": r.get::<_, String>(1)?,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default()
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

    // dPaaS automático: devnet + mainnet desde el nacimiento (el usuario
    // solo fondea; nada manual). Falla el registro si no hay master key.
    ensure_dpaas_wallet(&state, &id, "devnet")?;
    ensure_dpaas_wallet(&state, &id, "mainnet")?;

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
        c.execute(
            "DELETE FROM login_attempts WHERE at < ?1",
            params![now - 3_600_000],
        )?;
        Ok(())
    });

    let row = state.db.with(|c| {
        c.query_row(
            "SELECT id, password_hash, is_active FROM accounts WHERE email = ?1",
            params![email],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            },
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
    // Backfill best-effort: cuentas legacy sin bóveda la completan solas.
    let _ = ensure_dpaas_wallet(&state, &account_id, "devnet");
    let _ = ensure_dpaas_wallet(&state, &account_id, "mainnet");
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

/// Lista de proveedores LLM de la cuenta para la UI (SIN secretos).
/// El agente usa solo el de `is_active = 1`.
pub(crate) fn llm_providers_list(state: &SharedState, account_id: &str) -> Vec<Value> {
    state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT provider, base_url, models, default_model, \
                 api_key_enc IS NOT NULL, is_active \
                 FROM account_llm_providers WHERE account_id = ?1 ORDER BY provider",
            )?;
            let rows = stmt.query_map(params![account_id], |r| {
                let models: Value =
                    serde_json::from_str(&r.get::<_, String>(2)?).unwrap_or(json!([]));
                Ok(json!({
                    "provider": r.get::<_, String>(0)?,
                    "base_url": r.get::<_, String>(1)?,
                    "models": models,
                    "default_model": r.get::<_, Option<String>>(3)?,
                    "has_key": r.get::<_, i64>(4)? != 0,
                    "is_active": r.get::<_, i64>(5)? != 0,
                }))
            })?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        })
        .unwrap_or_default()
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
    let providers = llm_providers_list(&state, &auth.account_id);
    let llm: Option<Value> = providers
        .iter()
        .find(|p| p["is_active"].as_bool().unwrap_or(false))
        .map(|p| {
            json!({
                "provider": p["provider"],
                "models": p["models"],
                "default_model": p["default_model"],
            })
        });
    let chain: Option<Value> = state
        .db
        .with(|c| {
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
        "llm_providers": providers,
        "chain_configured": chain.is_some(),
        "chain": chain,
        "sub_wallets": wallets,
    }))
    .into_response())
}

// ---------------------------------------------------------------------------
// Handlers: preferencias de cuenta (idioma, país, nombre visible)
// ---------------------------------------------------------------------------

/// GET /api/accounts/me/preferences — perfil, idioma, país y divisa de la cuenta.
/// El dapp hidrata su cookie de idioma (NOMIK_LOCALE) desde aquí al entrar.
pub async fn get_preferences_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let prefs: Value = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT email, display_name, COALESCE(locale, 'es'), country, \
                        COALESCE(currency, CASE WHEN country = 'CO' THEN 'COP' ELSE 'USD' END) \
                 FROM accounts WHERE id = ?1",
                params![auth.account_id],
                |r| {
                    Ok(json!({
                        "email": r.get::<_, String>(0)?,
                        "display_name": r.get::<_, Option<String>>(1)?,
                        "locale": r.get::<_, String>(2)?,
                        "country": r.get::<_, Option<String>>(3)?,
                        "currency": r.get::<_, String>(4)?,
                    }))
                },
            )
        })
        .map_err(|_| AppError::unauthorized("sesión inválida o expirada"))?;
    Ok(Json(json!({ "ok": true, "preferences": prefs })).into_response())
}

#[derive(Deserialize)]
pub struct PutPreferencesBody {
    pub locale: Option<String>,
    pub country: Option<String>,
    pub display_name: Option<String>,
    pub currency: Option<String>,
}

/// PUT /api/accounts/me/preferences — actualización parcial: solo los
/// campos presentes se tocan (ausente = no tocar). `country`/`display_name`
/// vacíos borran el valor (NULL). `locale` solo acepta es|en y `currency`
/// admite USD o COP.
pub async fn put_preferences_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<PutPreferencesBody>,
) -> AppResult<Response> {
    if body.locale.is_none()
        && body.country.is_none()
        && body.display_name.is_none()
        && body.currency.is_none()
    {
        return Err(AppError::bad_request(
            "nada que actualizar: envía locale, country, display_name o currency",
        ));
    }

    let locale = body
        .locale
        .as_deref()
        .map(str::trim)
        .map(str::to_lowercase)
        .filter(|s| !s.is_empty());
    if let Some(ref l) = locale {
        if l != "es" && l != "en" {
            return Err(AppError::bad_request("locale inválido: usa es o en"));
        }
    }

    let country = body
        .country
        .as_deref()
        .map(str::trim)
        .map(str::to_uppercase);
    if let Some(ref c) = country {
        if !c.is_empty() && !(c.len() == 2 && c.bytes().all(|b| b.is_ascii_alphabetic())) {
            return Err(AppError::bad_request(
                "country inválido: código ISO de 2 letras (CO, MX, ES…)",
            ));
        }
    }

    let display_name = body
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(ref d) = display_name {
        if d.chars().count() > 64 {
            return Err(AppError::bad_request(
                "display_name demasiado largo (máx. 64 caracteres)",
            ));
        }
    }

    let currency = body
        .currency
        .as_deref()
        .map(str::trim)
        .map(str::to_uppercase);
    if let Some(ref c) = currency {
        if c != "USD" && c != "COP" {
            return Err(AppError::bad_request("currency inválida: usa USD o COP"));
        }
    }

    state.db.with(|c| {
        // COALESCE por campo: NULL en el parámetro = conservar valor actual.
        c.execute(
            "UPDATE accounts SET \
                 locale = COALESCE(?1, locale), \
                 country = CASE WHEN ?2 IS NULL AND ?5 = 1 THEN NULL \
                               WHEN ?2 IS NULL THEN country ELSE ?2 END, \
                 display_name = CASE WHEN ?3 IS NULL AND ?6 = 1 THEN NULL \
                                    WHEN ?3 IS NULL THEN display_name ELSE ?3 END, \
                 currency = COALESCE(?8, currency), \
                 updated_at = ?4 \
             WHERE id = ?7",
            params![
                locale,
                country.as_deref().filter(|s| !s.is_empty()),
                display_name,
                now_ms(),
                if body.country.is_some() { 1 } else { 0 },
                if body.display_name.is_some() { 1 } else { 0 },
                auth.account_id,
                currency,
            ],
        )?;
        Ok(())
    })?;

    get_preferences_handler(State(state), auth).await
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

/// PUT /api/accounts/me/llm — guarda (upsert) la config de UN proveedor
/// LLM de la cuenta. La cuenta puede tener N proveedores con key, pero el
/// agente usa solo el ACTIVO (POST …/llm/active). El primero que se guarda
/// queda activo automáticamente.
pub async fn put_llm_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<PutLlmBody>,
) -> AppResult<Response> {
    let provider = body.provider.trim().to_lowercase();
    if !valid_provider(&provider) {
        return Err(AppError::bad_request(
            "provider inválido; usa a-z 0-9 . _ / - : (ej. baseten, openai, nvidia-nim, custom)",
        ));
    }
    let base_url = body
        .base_url
        .map(|u| u.trim().trim_end_matches('/').to_string())
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| default_base_url(&provider).to_string());
    if base_url.is_empty() {
        return Err(AppError::bad_request(
            "base_url requerido para este provider",
        ));
    }
    if body.models.is_empty() {
        return Err(AppError::bad_request("models: al menos un modelo"));
    }
    let default_model = body
        .default_model
        .filter(|m| body.models.contains(m))
        .unwrap_or_else(|| body.models[0].clone());

    // api_key: se cifra si viene; si no, se conserva la existente.
    // Solo ASCII imprimible sin espacios: una key con un emoji pegado
    // revienta el header Authorization del SDK (ascii) — 400 claro aquí.
    let api_key_enc = match body
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
    {
        Some(key) => {
            if !key.bytes().all(|b| (0x21..=0x7E).contains(&b)) {
                return Err(AppError::bad_request(
                    "api_key con caracteres inválidos (¿emoji o espacios pegados?) — cópiala de nuevo, solo la key",
                ));
            }
            let mk = master_key_of(&state)?;
            Some(crypto::seal(&mk, key)?)
        }
        None => None,
    };
    let models_json = serde_json::to_string(&body.models)?;
    let now = now_ms();

    state.db.with(|c| {
        c.execute(
            "INSERT INTO account_llm_providers (account_id, provider, base_url, api_key_enc, models, \
             default_model, is_active, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7) \
             ON CONFLICT(account_id, provider) DO UPDATE SET \
               base_url = excluded.base_url, \
               api_key_enc = COALESCE(excluded.api_key_enc, account_llm_providers.api_key_enc), \
               models = excluded.models, default_model = excluded.default_model, \
               updated_at = excluded.updated_at",
            params![auth.account_id, provider, base_url, api_key_enc, models_json, default_model, now],
        )?;
        // primer proveedor de la cuenta → activo automáticamente
        c.execute(
            "UPDATE account_llm_providers SET is_active = 1, updated_at = ?3 \
             WHERE account_id = ?1 AND provider = ?2 \
             AND NOT EXISTS (SELECT 1 FROM account_llm_providers \
                              WHERE account_id = ?1 AND is_active = 1 AND provider != ?2)",
            params![auth.account_id, provider, now],
        )?;
        Ok(())
    })?;

    let active: Option<String> = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT provider FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
                params![auth.account_id],
                |r| r.get(0),
            )
        })
        .ok();
    tracing::info!(
        "account {} llm [{}] → {} (activo: {})",
        auth.account_id,
        provider,
        default_model,
        active.as_deref().unwrap_or("—")
    );
    Ok(Json(json!({
        "ok": true,
        "provider": provider,
        "base_url": base_url,
        "models": body.models,
        "default_model": default_model,
        "api_key_updated": api_key_enc.is_some(),
        "active_provider": active,
    }))
    .into_response())
}

#[derive(Deserialize)]
pub struct ActivateLlmBody {
    provider: Option<String>,
    model: Option<String>,
}

/// Lógica compartida (panel con Bearer de cuenta + dispositivo con Bearer
/// de device): selecciona el ÚNICO proveedor activo y/o su modelo por
/// defecto. Al menos uno de los dos debe venir.
pub(crate) fn set_active_llm(
    state: &SharedState,
    account_id: &str,
    provider: Option<&str>,
    model: Option<&str>,
) -> AppResult<Value> {
    let provider = provider
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty());
    let model = model.map(str::trim).filter(|m| !m.is_empty());
    if provider.is_none() && model.is_none() {
        return Err(AppError::bad_request("manda provider y/o model a activar"));
    }
    if let Some(p) = provider.as_deref() {
        let row: Option<(String, bool)> = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT models, api_key_enc IS NOT NULL FROM account_llm_providers \
                     WHERE account_id = ?1 AND provider = ?2",
                    params![account_id, p],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
            })
            .ok();
        let (models_json, has_key) = row.ok_or_else(|| {
            AppError::not_found(format!("provider «{p}» no configurado en tu cuenta"))
        })?;
        if !has_key {
            return Err(AppError::bad_request(format!(
                "provider «{p}» sin api_key — guárdala primero"
            )));
        }
        if let Some(m) = model {
            let models: Vec<String> = serde_json::from_str(&models_json).unwrap_or_default();
            if !models.contains(&m.to_string()) {
                return Err(AppError::bad_request(format!(
                    "modelo «{m}» no está en la lista de «{p}»"
                )));
            }
        }
        state.db.with(|c| {
            c.execute(
                "UPDATE account_llm_providers SET is_active = 0, updated_at = ?2 WHERE account_id = ?1",
                params![account_id, now_ms()],
            )?;
            c.execute(
                "UPDATE account_llm_providers SET is_active = 1, updated_at = ?3 \
                 WHERE account_id = ?1 AND provider = ?2",
                params![account_id, p, now_ms()],
            )?;
            Ok(())
        })?;
        tracing::info!("account {account_id} llm activo → {p}");
    }
    if let Some(m) = model {
        let target: Option<String> = provider.clone().or_else(|| {
            state
                .db
                .with(|c| {
                    c.query_row(
                        "SELECT provider FROM account_llm_providers \
                         WHERE account_id = ?1 AND is_active = 1",
                        params![account_id],
                        |r| r.get(0),
                    )
                })
                .ok()
        });
        let target = target
            .ok_or_else(|| AppError::bad_request("sin proveedor activo — elige uno primero"))?;
        let models_json: Option<String> = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT models FROM account_llm_providers \
                     WHERE account_id = ?1 AND provider = ?2",
                    params![account_id, target],
                    |r| r.get(0),
                )
            })
            .ok();
        let models: Vec<String> = models_json
            .as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_default();
        if !models.contains(&m.to_string()) {
            return Err(AppError::bad_request(format!(
                "modelo «{m}» no está en la lista de «{target}»"
            )));
        }
        state.db.with(|c| {
            c.execute(
                "UPDATE account_llm_providers SET default_model = ?3, updated_at = ?4 \
                 WHERE account_id = ?1 AND provider = ?2",
                params![account_id, target, m, now_ms()],
            )?;
            Ok(())
        })?;
        tracing::info!("account {account_id} llm [{target}] modelo → {m}");
    }
    let active: Option<String> = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT provider FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
                params![account_id],
                |r| r.get(0),
            )
        })
        .ok();
    Ok(json!({ "active_provider": active }))
}

/// POST /api/accounts/me/llm/active — selecciona el ÚNICO proveedor que
/// usa el agente y/o su modelo: {provider?, model?} (al menos uno).
pub async fn activate_llm_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<ActivateLlmBody>,
) -> AppResult<Response> {
    let v = set_active_llm(
        &state,
        &auth.account_id,
        body.provider.as_deref(),
        body.model.as_deref(),
    )?;
    Ok(Json(json!({ "ok": true, "active_provider": v["active_provider"] })).into_response())
}

/// DELETE /api/accounts/me/llm?provider=X — borra la config de ESE
/// proveedor (botón "Desconectar" del modal Modelos). Sin provider, borra
/// el activo. Si era el activo, la cuenta queda SIN agente hasta elegir
/// otro: no hay fallback global, la cuenta es 100% responsable de sus keys.
pub async fn delete_llm_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    query: axum::extract::Query<std::collections::HashMap<String, String>>,
) -> AppResult<Response> {
    let target = query
        .get("provider")
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty());
    let deleted: i64 = state
        .db
        .with(|c| {
            if let Some(p) = target.as_deref() {
                c.execute(
                    "DELETE FROM account_llm_providers WHERE account_id = ?1 AND provider = ?2",
                    params![auth.account_id, p],
                )
            } else {
                c.execute(
                    "DELETE FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
                    params![auth.account_id],
                )
            }
            .map(|n| n as i64)
        })
        .unwrap_or(0);
    let active: Option<String> = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT provider FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
                params![auth.account_id],
                |r| r.get(0),
            )
        })
        .ok();
    tracing::info!(
        "account {} desconectó LLM {:?} (activo ahora: {})",
        auth.account_id,
        target,
        active.as_deref().unwrap_or("— ninguno —")
    );
    Ok(Json(json!({
        "ok": true,
        "deleted": deleted,
        "active_provider": active,
        "llm": null,
    }))
    .into_response())
}

/// Subcadenas (minúsculas) que delatan modelos NO conversacionales en un
/// listado `/models` OpenAI-compat (embeddings, guardas, TTS, difusión…).
/// Espejo aproximado del filtro del modal (dapp filtra con el catálogo
/// models.dev; aquí no hay catálogo: blocklist conservadora).
const NON_CHAT_HINTS: &[&str] = &[
    "embed",
    "rerank",
    "whisper",
    "tts",
    "flux",
    "diffusion",
    "guard",
    "safety",
    "moderation",
    "moderate",
    "ocr",
    "vocos",
    "melotts",
    "asr",
    "tokenizer",
    "vocoder",
];

#[derive(Deserialize)]
pub struct RefreshLlmBody {
    provider: Option<String>,
}

/// POST /api/accounts/me/llm/refresh-models — re-lista los modelos del
/// proveedor DESDE EL SERVIDOR (la key sellada nunca sale del api) y
/// actualiza la lista guardada. Body opcional `{provider}` (defecto: el
/// activo). Preserva `default_model` si sigue existiendo; si no, el
/// primero de la lista. Best-effort: si el proveedor falla o no trae
/// modelos de chat, error SIN tocar la lista guardada.
pub async fn refresh_llm_models_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<RefreshLlmBody>,
) -> AppResult<Response> {
    let wanted = body
        .provider
        .as_deref()
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty());
    let row: Option<(String, String, Option<String>, String, Option<String>)> = state
        .db
        .with(|c| {
            if let Some(p) = wanted.as_deref() {
                c.query_row(
                    "SELECT provider, base_url, api_key_enc, models, default_model \
                     FROM account_llm_providers WHERE account_id = ?1 AND provider = ?2",
                    params![auth.account_id, p],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                )
            } else {
                c.query_row(
                    "SELECT provider, base_url, api_key_enc, models, default_model \
                     FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
                    params![auth.account_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
                )
            }
        })
        .ok();
    let (provider, base_url, key_enc, _old_models, default_model) = row.ok_or_else(|| {
        AppError::not_found("sin proveedor LLM que refrescar — conecta uno primero")
    })?;
    let sealed = key_enc.filter(|s| !s.is_empty()).ok_or_else(|| {
        AppError::bad_request("ese proveedor no tiene api_key — guárdala primero")
    })?;
    let mk = master_key_of(&state)?;
    let key_bytes = crypto::open(&mk, &sealed)?;
    let api_key =
        String::from_utf8(key_bytes).map_err(|_| AppError::internal("api_key sellada corrupta"))?;

    let url = format!("{}/models", base_url.trim_end_matches('/'));
    let res = state
        .http
        .get(&url)
        .bearer_auth(&api_key)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| AppError::unavailable(format!("el proveedor no responde ({e})")))?;
    if !res.status().is_success() {
        return Err(AppError::unavailable(format!(
            "el proveedor devolvió HTTP {}",
            res.status()
        )));
    }
    let body_json: Value = res
        .json()
        .await
        .map_err(|_| AppError::unavailable("el proveedor devolvió un listado inválido"))?;
    let mut ids: Vec<String> = body_json
        .get("data")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id")?.as_str().map(str::to_string))
                .filter(|id| {
                    let lower = id.to_lowercase();
                    !NON_CHAT_HINTS.iter().any(|h| lower.contains(h))
                })
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids.dedup();
    if ids.is_empty() {
        return Err(AppError::unavailable(
            "el proveedor no devolvió modelos de chat",
        ));
    }
    // Preservar el default que funcionaba; si desapareció, el primero.
    let default_kept = default_model
        .as_deref()
        .is_some_and(|d| ids.contains(&d.to_string()));
    let new_default = if default_kept {
        default_model.unwrap_or_else(|| ids[0].clone())
    } else {
        ids[0].clone()
    };
    let models_json = serde_json::to_string(&ids)?;
    state.db.with(|c| {
        c.execute(
            "UPDATE account_llm_providers SET models = ?1, default_model = ?2, updated_at = ?3 \
             WHERE account_id = ?4 AND provider = ?5",
            params![
                models_json,
                new_default,
                now_ms(),
                auth.account_id,
                provider
            ],
        )?;
        Ok(())
    })?;

    tracing::info!(
        "account {} llm [{provider}] lista refrescada: {} modelos (default {})",
        auth.account_id,
        ids.len(),
        new_default,
    );
    Ok(Json(json!({
        "ok": true,
        "provider": provider,
        "models": ids,
        "default_model": new_default,
        "default_kept": default_kept,
    }))
    .into_response())
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
            return Err(AppError::bad_request(format!(
                "network inválida; válidas: {NETWORKS:?}"
            )));
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
    // wallet_pubkey manual: vestigial, se ignora — la dPaaS es automática.
    let _ = body.wallet_pubkey.as_ref();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO account_chain (account_id, network, payee, \
             daily_limit_lamports, tx_limit_lamports, active_wallet_label, updated_at) \
             VALUES (?1, COALESCE(?2, 'devnet'), ?3, ?4, ?5, NULLIF(?6, ''), ?7) \
             ON CONFLICT(account_id) DO UPDATE SET \
               network = COALESCE(?2, account_chain.network), \
               payee = COALESCE(?3, account_chain.payee), \
               daily_limit_lamports = COALESCE(?4, account_chain.daily_limit_lamports), \
               tx_limit_lamports = COALESCE(?5, account_chain.tx_limit_lamports), \
               active_wallet_label = \
                 CASE WHEN ?6 IS NULL THEN account_chain.active_wallet_label \
                      ELSE NULLIF(?6, '') END, \
               updated_at = ?7",
            params![
                auth.account_id,
                body.network,
                body.payee,
                body.daily_limit_lamports,
                body.tx_limit_lamports,
                active_wallet_param,
                now
            ],
        )?;
        Ok(())
    })?;
    // Cambiar de red auto-crea su wallet (nunca una red sin dPaaS).
    // (wallet_pubkey manual: vestigial, se ignora — la dPaaS es automática.)
    let network: String = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT network FROM account_chain WHERE account_id = ?1",
                params![auth.account_id],
                |r| r.get(0),
            )
        })
        .unwrap_or_else(|_| "devnet".to_string());
    ensure_dpaas_wallet(&state, &auth.account_id, &network)?;

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
    } else if let Some(path) = body
        .keypair_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
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
    // Importar = ROTAR la wallet de la red ACTIVA (bóveda + espejo).
    let network: String = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT network FROM account_chain WHERE account_id = ?1",
                params![auth.account_id],
                |r| r.get(0),
            )
        })
        .unwrap_or_else(|_| "devnet".to_string());
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO account_chain_wallets (account_id, network, wallet_pubkey, payer_keypair_enc, \
             updated_at) VALUES (?1, ?2, ?3, ?4, ?5) \
             ON CONFLICT(account_id, network) DO UPDATE SET \
               wallet_pubkey = excluded.wallet_pubkey, \
               payer_keypair_enc = excluded.payer_keypair_enc, \
               updated_at = excluded.updated_at",
            params![auth.account_id, network, pubkey, sealed, now],
        )?;
        c.execute(
            "INSERT INTO account_chain (account_id, network, payee, updated_at) \
             VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(account_id) DO UPDATE SET \
               payee = COALESCE(account_chain.payee, excluded.payee), \
               updated_at = excluded.updated_at",
            params![auth.account_id, network, pubkey, now],
        )?;
        Ok(())
    })?;
    mirror_active_wallet(&state, &auth.account_id)?;

    tracing::info!(
        "account {}: keypair del orquestador importado → {pubkey}",
        auth.account_id
    );
    Ok(Json(json!({
        "ok": true,
        "wallet_pubkey": pubkey,
        "encrypted_at_rest": true,
    }))
    .into_response())
}

/// POST /api/accounts/me/chain/keypair/generate — crea la wallet dPaaS de
/// la RED ACTIVA si falta (casi siempre existe: el registro la genera
/// sola). 409 si ya existe (importar para rotar).
pub async fn generate_keypair_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let network: String = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT network FROM account_chain WHERE account_id = ?1",
                params![auth.account_id],
                |r| r.get(0),
            )
        })
        .unwrap_or_else(|_| "devnet".to_string());
    let exists: bool = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT 1 FROM account_chain_wallets WHERE account_id = ?1 AND network = ?2",
                params![auth.account_id, network],
                |r| r.get::<_, i64>(0),
            )
        })
        .map(|_| true)
        .unwrap_or(false);
    if exists {
        return Err(AppError::conflict(
            "la cuenta ya tiene wallet dPaaS (importa otra para rotar)",
        ));
    }
    let (pubkey, sealed) = mint_dpaas_pair(&state)?;
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT OR IGNORE INTO account_chain_wallets \
             (account_id, network, wallet_pubkey, payer_keypair_enc, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![auth.account_id, network, pubkey, sealed, now],
        )?;
        Ok(())
    })?;
    mirror_active_wallet(&state, &auth.account_id)?;

    tracing::info!(
        "account {}: wallet dPaaS generada → {pubkey}",
        auth.account_id
    );
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
            return Err(AppError::bad_request(format!(
                "network inválida; válidas: {NETWORKS:?}"
            )));
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
    let inserted =
        state.db.with(|c| {
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

    tracing::info!(
        "account {} sub-wallet «{label}» → {pubkey}",
        auth.account_id
    );
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
    // EVM (0x…): normalizar a minúsculas para que el dedupe no falle por
    // checksum EIP-55 (misma dirección, distinta capitalización).
    let pubkey = if chain == "evm" {
        pubkey.to_lowercase()
    } else {
        pubkey
    };

    // Dedupe: misma (cuenta, provider, pubkey) → reactivar la existente
    // en vez de crear otra fila (UNIQUE lo blinda a nivel DB).
    let existing: Option<(String, String)> = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT id, label FROM account_connected_wallets \
                 WHERE account_id = ?1 AND provider = ?2 AND pubkey = ?3",
                params![auth.account_id, provider, pubkey],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
        })
        .ok();
    if let Some((id, label)) = existing {
        if body.set_active {
            state.db.with(|c| {
                c.execute(
                    "UPDATE account_connected_wallets SET is_active = 0 WHERE account_id = ?1",
                    params![auth.account_id],
                )?;
                c.execute(
                    "UPDATE account_connected_wallets SET is_active = 1 WHERE id = ?1",
                    params![id],
                )?;
                Ok(())
            })?;
        }
        tracing::info!(
            "account {} wallet ya conectada «{label}» ({provider}/{chain}) — reactivada",
            auth.account_id
        );
        return Ok(Json(json!({
            "ok": true,
            "deduped": true,
            "wallet": {
                "id": id, "label": label, "provider": provider,
                "chain": chain, "pubkey": pubkey, "is_active": body.set_active,
            }
        }))
        .into_response());
    }

    // label por defecto: "{provider} · N" según las ya conectadas de ese proveedor
    let label = match body
        .label
        .as_deref()
        .map(str::trim)
        .filter(|l| !l.is_empty())
    {
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
            return Err(AppError::conflict(
                "ya existe una wallet conectada con ese nombre",
            ));
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
/// Las de chain=solana traen `balance_lamports` vivo (RPC de la red de la
/// cuenta; null si falla). Las EVM lo resuelven en el navegador con su
/// propia extensión (ella sabe en qué red está).
pub async fn list_connected_wallets_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let network: String = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT network FROM account_chain WHERE account_id = ?1",
                params![auth.account_id],
                |r| r.get(0),
            )
        })
        .unwrap_or_else(|_| "devnet".to_string());
    let client = crate::modules::x402::client_for_network(&state, &network)
        .await
        .ok();
    let mut wallets: Vec<Value> = state
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
    if let Some(client) = client {
        for w in wallets.iter_mut() {
            if w["chain"] == "solana" {
                if let Some(pk) = w["pubkey"].as_str() {
                    w["balance_lamports"] = json!(client.get_balance(pk).await.ok());
                }
            }
        }
    }
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
            params![
                sid,
                auth.account_id,
                id,
                name,
                resource,
                payer_pubkey,
                network,
                now
            ],
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

    // LLM de la cuenta: SOLO el proveedor ACTIVO (api_key desencriptada).
    // Sin activo → llm null y el agente exige configurar (sin fallback global).
    let llm: Option<Value> = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT provider, base_url, api_key_enc, models, default_model \
                 FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
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
    // Backfill best-effort: si la cuenta aún no tiene bóveda (legacy),
    // se la crea sola al leer el contexto.
    let _ = ensure_dpaas_wallet(&state, &auth.account_id, "devnet");
    let _ = ensure_dpaas_wallet(&state, &auth.account_id, "mainnet");
    let dpaas_list = dpaas_wallets_list(&state, &auth.account_id);
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
                        "wallets": dpaas_list,
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
        "llm": llm,        // null si no hay proveedor ACTIVO (el agente lo exige)
        "llm_providers": llm_providers_list(&state, &auth.account_id),
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
