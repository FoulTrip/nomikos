//! [ NomikOS W6 — Faucet Devnet: settlement x402 REAL on-chain ]
//!
//! Cierra el ciclo del diagrama **sin tocar el pipeline**: los tests
//! liquidaban facturas con el settler de ledger porque las wallets dPaaS
//! no tenían SOL. Este faucet gotea desde una wallet «treasury» dedicada
//! (SOLO devnet, `FAUCET_KEYPAIR`) a la wallet de la cuenta que lo pide,
//! y entonces `pay-invoice` firma transfers que CONFIRMAN en la cadena.
//!
//! ```
//! POST /api/dev/faucet  (Bearer de cuenta, chain devnet configurada)
//!   → { ok, wallet_pubkey, lamports, tx_signature }   // transfer REAL
//! GET  /api/dev/faucet  → estado (treasury + balance) — sin secretos
//! ```
//!
//! Seguridad: `FAUCET_ENABLED=0` → 404 (oculto); cooldown por cuenta de
//! 10 s para que un loop no vacíe el treasury a martillazos; el keypair
//! del treasury NUNCA se loguea (solo su pubkey, que es pública).
//!
//! Para fundear el treasury: `scripts/faucet/faucet.sh fund` (retry-loop
//! de airdrop) o el web faucet — ver `scripts/faucet/README.md`.

use crate::error::{AppError, AppResult};
use crate::modules::accounts::AuthedAccount;
use crate::modules::x402::client_for_network;
use crate::state::SharedState;
use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use rusqlite::params;
use std::collections::HashMap;
use std::sync::Mutex;

/// Último goteo por cuenta (cooldown anti-hammering).
static LAST_DRIP: Mutex<Option<HashMap<String, i64>>> = Mutex::new(None);
const COOLDOWN_MS: i64 = 10_000;

fn hidden() -> AppError {
    AppError::not_found("no existe")
}

/// Carga el keypair del treasury (JSON id.json de solana-keygen).
/// Devuelve (pubkey, keypair) — el secreto no sale de esta función.
fn load_treasury(state: &SharedState) -> AppResult<(String, [u8; 64])> {
    let path = state
        .cfg
        .faucet_keypair
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .ok_or_else(|| {
            AppError::unavailable("faucet sin treasury: configura FAUCET_KEYPAIR (ruta al keypair JSON)")
        })?;
    let kp = crate::modules::solana::keypair_bytes_from_json(path)
        .map_err(|e| AppError::bad_request(format!("treasury ilegible ({path}): {e}")))?;
    Ok((crate::b58::encode(&kp[32..]), kp))
}

/// GET /api/dev/faucet — estado (para que los tests fallidos te digan QUÉ
/// hacer: el balance del treasury en claro, sin secretos).
pub async fn faucet_status_handler(
    State(state): State<SharedState>,
    _auth: AuthedAccount,
) -> AppResult<Response> {
    if !state.cfg.faucet_enabled {
        return Err(hidden());
    }
    let (treasury, _) = load_treasury(&state)?;
    let balance = match client_for_network(&state, "devnet").await {
        Ok(c) => c.get_balance(&treasury).await.unwrap_or(-1),
        Err(_) => -1,
    };
    Ok(Json(json!({
        "ok": true,
        "network": "devnet",
        "treasury_pubkey": treasury,
        "treasury_balance_lamports": balance,
        "lamports_per_drip": state.cfg.faucet_lamports,
        "how": "POST /api/dev/faucet — gotea a la wallet de TU cuenta (chain devnet configurada)",
    }))
    .into_response())
}

/// POST /api/dev/faucet — transfiere `FAUCET_LAMPORTS` del treasury a la
/// wallet dPaaS de la cuenta autenticada. La tx es real (devnet).
pub async fn faucet_drip_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    if !state.cfg.faucet_enabled {
        return Err(hidden());
    }

    // Cooldown por cuenta.
    let now = crate::db::now_ms();
    {
        let mut guard = LAST_DRIP.lock().map_err(|_| AppError::internal("faucet lock"))?;
        let map = guard.get_or_insert_with(HashMap::new);
        if let Some(last) = map.get(&auth.account_id) {
            if now - last < COOLDOWN_MS {
                return Err(AppError::too_many_requests(
                    "faucet: espera el cooldown (10 s) entre gotas de la misma cuenta",
                ));
            }
        }
        map.insert(auth.account_id.clone(), now);
    }

    // La cuenta debe tener chain configurada y red devnet.
    let (wallet, network) = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT wallet_pubkey, network FROM account_chain WHERE account_id = ?1",
                params![auth.account_id],
                |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)),
            )
        })
        .map_err(|_| {
            AppError::bad_request("configura tu cadena primero: PUT /api/accounts/me/chain (devnet)")
        })?;
    let wallet = wallet
        .filter(|w| !w.is_empty())
        .ok_or_else(|| AppError::bad_request("importa tu keypair dPaaS primero (chain/keypair/import)"))?;
    if network != "devnet" {
        return Err(AppError::bad_request(format!(
            "el faucet solo opera en devnet (tu red: {network})"
        )));
    }

    // Transfer REAL del treasury → wallet de la cuenta.
    let (treasury, kp) = load_treasury(&state)?;
    let client = client_for_network(&state, "devnet").await?;
    let lamports = state.cfg.faucet_lamports.max(1) as u64;
    let sig = crate::modules::solana::transfer_lamports_with_kp(&client, &kp, &wallet, lamports)
        .await
        .map_err(|e| {
            AppError::bad_request(format!(
                "faucet: transfer falló (¿treasury sin fondos? scripts/faucet/faucet.sh fund): {e}"
            ))
        })?;
    tracing::info!(
        "faucet: {lamports} lamports → {wallet} (cuenta {}) · tx {sig}",
      auth.account_id
    );

    Ok(Json(json!({
        "ok": true,
        "network": "devnet",
        "wallet_pubkey": wallet,
        "lamports": lamports,
        "tx_signature": sig,
        "treasury_pubkey": treasury,
    }))
    .into_response())
}
