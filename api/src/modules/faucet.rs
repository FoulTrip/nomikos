//! Faucet Devnet para la wallet dPaaS de cada cuenta.
//!
//! El registro ya crea una wallet por cuenta y red, con la clave privada
//! cifrada en SQLite. El faucet solicita SOL de prueba directamente al RPC
//! Devnet para la wallet Devnet de esa cuenta; no depende de una treasury.
//! Mainnet nunca usa este endpoint: se fondea enviando SOL reales a la
//! dirección mainnet que muestra Wallet · Red.

use crate::error::{AppError, AppResult};
use crate::modules::accounts::{ensure_dpaas_wallet, AuthedAccount};
use crate::modules::x402::client_for_network;
use crate::state::SharedState;
use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;

const COOLDOWN_MS: i64 = 60_000;
const DEVNET_DRIP_LAMPORTS: i64 = 5_000_000; // 0.005 SOL por solicitud.

fn hidden() -> AppError {
    AppError::not_found("faucet Devnet no disponible")
}

fn reserve_account_cooldown(state: &SharedState, account_id: &str) -> AppResult<()> {
    let now = crate::db::now_ms();
    let changed = state.db.with(|c| {
        c.execute(
            "INSERT INTO devnet_faucet_claims (account_id, last_request_at) VALUES (?1, ?2) \
             ON CONFLICT(account_id) DO UPDATE SET last_request_at = excluded.last_request_at \
             WHERE devnet_faucet_claims.last_request_at <= ?3",
            params![account_id, now, now.saturating_sub(COOLDOWN_MS)],
        )
    })?;
    if changed == 0 {
        return Err(AppError::too_many_requests(
            "faucet Devnet: espera 60 segundos antes de solicitar otra recarga para esta cuenta",
        ));
    }
    Ok(())
}

async fn wait_confirmation(
    client: &crate::modules::solana::SolanaClient,
    signature: &str,
    timeout_secs: u64,
) -> AppResult<()> {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
    loop {
        match client.get_signature_status(signature).await {
            Ok(Some((true, _))) => return Ok(()),
            Ok(Some((false, err))) => {
                return Err(AppError::unavailable(format!(
                    "faucet Devnet rechazó la solicitud on-chain: {}",
                    err.unwrap_or_else(|| "motivo desconocido".to_string())
                )));
            }
            Ok(None) => {}
            Err(error) if std::time::Instant::now() >= deadline => {
                return Err(AppError::unavailable(format!(
                    "faucet Devnet no pudo consultar la confirmación: {error}"
                )));
            }
            Err(_) => {}
        }
        if std::time::Instant::now() >= deadline {
            return Err(AppError::unavailable(format!(
                "faucet Devnet aceptó la solicitud pero sigue sin confirmación; firma {signature}. Comprueba el balance antes de volver a solicitar"
            )));
        }
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }
}

/// GET /api/dev/faucet: dirección y balance de la wallet Devnet de la cuenta.
pub async fn faucet_status_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    if !state.cfg.faucet_enabled {
        return Err(hidden());
    }
    let wallet = ensure_dpaas_wallet(&state, &auth.account_id, "devnet")?;
    let client = client_for_network(&state, "devnet").await?;
    let balance = client.get_balance(&wallet).await.ok();
    Ok(Json(serde_json::json!({
        "ok": true,
        "network": "devnet",
        "wallet_pubkey": wallet,
        "balance_lamports": balance,
        "lamports_per_drip": DEVNET_DRIP_LAMPORTS,
        "cooldown_seconds": COOLDOWN_MS / 1000,
        "funding_method": "requestAirdrop",
    }))
    .into_response())
}

/// POST /api/dev/faucet: solicita 0.005 Devnet SOL directamente para la
/// wallet Devnet automática de la cuenta, sin importar cuál red esté activa.
pub async fn faucet_drip_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    if !state.cfg.faucet_enabled {
        return Err(hidden());
    }

    reserve_account_cooldown(&state, &auth.account_id)?;
    let wallet = ensure_dpaas_wallet(&state, &auth.account_id, "devnet")?;
    let client = client_for_network(&state, "devnet").await?;
    let signature = client
        .request_airdrop(&wallet, DEVNET_DRIP_LAMPORTS as u64)
        .await
        .map_err(|error| {
            AppError::unavailable(format!(
                "faucet Devnet no aceptó la solicitud (el RPC puede aplicar límites): {error}. Espera o usa el faucet oficial con la dirección de esta cuenta"
            ))
        })?;

    wait_confirmation(&client, &signature, 60).await?;
    let balance = client.get_balance(&wallet).await.ok();
    tracing::info!(
        "faucet Devnet confirmado: {DEVNET_DRIP_LAMPORTS} lamports → wallet de cuenta {} · tx {signature}",
        auth.account_id
    );

    Ok(Json(serde_json::json!({
        "ok": true,
        "network": "devnet",
        "wallet_pubkey": wallet,
        "lamports": DEVNET_DRIP_LAMPORTS,
        "balance_lamports": balance,
        "tx_signature": signature,
    }))
    .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn faucet_amount_is_small_devnet_test_funding() {
        assert_eq!(DEVNET_DRIP_LAMPORTS, 5_000_000);
        assert_eq!(COOLDOWN_MS, 60_000);
    }
}
