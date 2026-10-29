//! Módulos del Agente OS expuestos por la API Rust.

pub mod accounts;
pub mod app;
pub mod apps;
pub mod calls;
pub mod device;
pub mod devices;
pub mod erp;
pub mod faucet;
pub mod mcp;
pub mod simulation;
pub mod solana;
pub mod usage;
pub mod verify;
pub mod voice;
pub mod x402;

use crate::state::SharedState;
use std::time::Duration;

/// [ Sync ] Ciclo que mantiene la DB sincronizada con el estado real:
/// health de Payload CMS + RPC de Solana → `service_status`.
pub async fn sync_loop(state: SharedState) {
    let secs = state.cfg.sync_interval_secs.max(1);
    loop {
        let _ = erp::sync(&state).await;
        let _ = solana::sync(&state).await;
        tokio::time::sleep(Duration::from_secs(secs)).await;
    }
}
