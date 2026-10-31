//! agent-os-api — API Rust del Agente OS.
//!
//! ┌──► [ Módulo Salud / ERP Avanzado (Kodetap API → Medusa.js) ]
//! │
//! [ Agente (MCP / Muse) ] ──► [ Rust API ] ──► DB (SQLite)
//! │
//! └──► [ Módulo x402 Solana ] (liquida micro-peajes en background)
//!
//! El módulo Multimedia (Spotify / MPD) se omitió por diseño.

mod api;
mod b58;
mod config;
mod crypto;
mod db;
mod error;
mod r2;
mod state;

mod modules;

use crate::state::{AppState, SharedState};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

fn main() {
    // Tokio manual para loguear con calma antes de arrancar el servidor.
    run().expect("agent-os-api terminó con error");
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    rt.block_on(async_main())
}

async fn async_main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cfg = config::Config::load();
    tracing::info!(
        "agent-os-api v{} — dispositivo «{}»",
        env!("CARGO_PKG_VERSION"),
        cfg.device_name
    );
    tracing::info!("[ERP] Payload CMS (Kodetap): {}", cfg.payload_url);
    tracing::info!(
        "[x402 Solana] red {} → {}",
        cfg.solana_network_label(),
        cfg.solana_url()
            .cloned()
            .unwrap_or_else(|| "(desconocida)".into())
    );
    match &cfg.object_store {
        Some(storage) => tracing::info!(
            "[Object storage] {} configurado · bucket {}",
            storage.backend.as_str(),
            storage.bucket
        ),
        None => tracing::warn!(
            "[Object storage] sin configuración válida para OBJECT_STORE_BACKEND={}",
            std::env::var("OBJECT_STORE_BACKEND").unwrap_or_else(|_| "local".to_string())
        ),
    }
    match &cfg.payer_keypair {
        Some(_) => tracing::info!("[payer] configurado"),
        None => tracing::info!("[payer] solo liquidaciones entrantes"),
    }
    tracing::info!(
        "[Cuentas] master key {} · registro email+password habilitado",
        if cfg.accounts_master_key.is_some() {
            "presente (secretos se cifran en reposo)"
        } else {
            "AUSENTE (pon ACCOUNTS_MASTER_KEY=openssl-rand-base64-32)"
        }
    );
    tracing::info!(
        "[Medusa MCP] {} (token {})",
        cfg.medusa_mcp_url,
        if cfg.medusa_mcp_token.is_some() {
            "configurado"
        } else {
            "ausente — OAuth interactivo requerido"
        }
    );

    let db = db::Db::open(&cfg.db_path, &cfg.device_name)?;
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    let object_store = cfg
        .object_store
        .as_ref()
        .map(|store_cfg| r2::ObjectStore::new(store_cfg.clone(), http.clone()));
    let mcp =
        modules::mcp::McpClient::new(cfg.medusa_mcp_url.clone(), cfg.medusa_mcp_token.clone());

    // Dirección para el bind (se calcula antes de mover `cfg` al estado).
    let addr = format!("{}:{}", cfg.host, cfg.port);

    let state: SharedState = Arc::new(AppState {
        cfg,
        db,
        http,
        object_store,
        mcp,
        started_at: db::now_ms(),
    });

    // [ Sync ] ERP + Solana → DB, cada SYNC_INTERVAL_SECS.
    tokio::spawn(modules::sync_loop(state.clone()));

    // [ x402 ] liquida micro-peajes en background.
    tokio::spawn(modules::x402::settler_loop(state.clone()));

    // [ Tienda de dapps ] carga el registro (dapps/registry/*.json).
    modules::apps::load_registry(&state);

    let app = api::router(state).layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("escuchando en http://{addr} — GET /api/health");
    axum::serve(listener, app).await?;
    Ok(())
}
