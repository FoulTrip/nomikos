//! [ Módulo Salud / ERP Avanzado ]
//!
//! Payload CMS (Kodetap → Payload). La sincronización consulta
//! `{PAYLOAD_URL}/api/users` y persiste el resultado en `service_status`,
//! que es lo que consume el navbar (`/api/navbar`).

use crate::db::{now_ms, ServiceRow};
use crate::state::SharedState;

const ID: &str = "erp";
const LABEL: &str = "ERP · Payload CMS";
const TIMEOUT_SECS: u64 = 3; // igual que el dapp

pub async fn sync(state: &SharedState) {
    let url = format!("{}/api/users", state.cfg.payload_url.trim_end_matches('/'));
    let probe = state
        .http
        .get(&url)
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .send()
        .await;

    let (running, detail) = match &probe {
        Ok(res) if res.status().is_success() => (true, "health OK".to_string()),
        Ok(res) => (false, format!("health HTTP {}", res.status())),
        Err(e) => (false, format!("sin respuesta: {e}")),
    };

    let row = ServiceRow {
        id: ID.to_string(),
        label: LABEL.to_string(),
        running,
        network: None,
        endpoint: Some(state.cfg.payload_url.clone()),
        version: None,
        slot: None,
        wallet: None,
        balance_lamports: None,
        detail: Some(detail),
        updated_at: now_ms(),
    };

    match state.db.upsert_service(&row) {
        Ok(()) => tracing::debug!("{} → {}", LABEL, if running { "corriendo" } else { "detenido" }),
        Err(e) => tracing::warn!("sync {LABEL} db: {e}"),
    }
}
