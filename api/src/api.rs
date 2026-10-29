//! Endpoints HTTP (axum). La DB es la fuente de verdad; los loops en
//! background la mantienen sincronizada con Medusa.js y Solana.

use crate::db::now_ms;
use crate::error::{AppError, AppResult};
use crate::modules::{
    accounts, app, apps, calls, device, devices, faucet, mcp, simulation, solana, usage, verify,
    voice, x402,
};
use crate::state::SharedState;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

pub fn router(state: SharedState) -> Router {
    Router::new()
        // Estado general
        .route("/api/health", get(health))
        .route("/api/navbar", get(navbar))
        .route("/api/modules", get(modules))
        // Agente
        .route("/api/agent/state", get(agent_state))
        .route("/api/agent/tools", get(agent_tools))
        .route("/api/agent/call", post(agent_call))
        // [ Dispositivo + R2 ]
        .route("/api/device", get(device::get_device_handler))
        .route("/api/device/model", get(device::get_model))
        .route("/api/device/model/head", get(device::model_head))
        .route("/api/device/model/upload", post(device::upload_model))
        // [ Módulo ERP / Kodetap → Medusa.js ]
        .route("/api/erp/status", get(erp_status))
        // [ Módulo x402 Solana ]
        .route("/api/solana/status", get(solana_status))
        // URLs RPC de Solana por red (fuente única de verdad para agent-dapp).
        .route("/api/config/solana/urls", get(solana_urls))
        // [ Gestión de Cuentas — IdP email+password (OpenID Provider) ]
        .route("/api/auth/register", post(accounts::register_handler))
        .route("/api/auth/login", post(accounts::login_handler))
        .route("/api/auth/logout", post(accounts::logout_handler))
        .route("/api/auth/me", get(accounts::me_handler))
        // [ Config por cuenta — proveedor LLM, red/wallet, sub-wallets ]
        .route(
            "/api/accounts/me/llm",
            put(accounts::put_llm_handler).delete(accounts::delete_llm_handler),
        )
        .route(
            "/api/accounts/me/llm/active",
            post(accounts::activate_llm_handler),
        )
        .route(
            "/api/accounts/me/llm/refresh-models",
            post(accounts::refresh_llm_models_handler),
        )
        .route("/api/accounts/me/chain", put(accounts::put_chain_handler))
        .route(
            "/api/accounts/me/chain/keypair/import",
            post(accounts::import_keypair_handler),
        )
        .route(
            "/api/accounts/me/chain/keypair/generate",
            post(accounts::generate_keypair_handler),
        )
        // [ NomikOS W6 — faucet Devnet: settlement x402 REAL on-chain ]
        .route(
            "/api/dev/faucet",
            get(faucet::faucet_status_handler).post(faucet::faucet_drip_handler),
        )
        // [ Simulador NomikOS — el OS simulado con progreso por cuenta ]
        .route("/api/accounts/me/simulation", get(simulation::get_handler))
        .route(
            "/api/accounts/me/simulation/step",
            post(simulation::step_handler),
        )
        .route("/api/accounts/me/context", get(accounts::context_handler))
        .route(
            "/api/accounts/me/preferences",
            get(accounts::get_preferences_handler).put(accounts::put_preferences_handler),
        )
        .route(
            "/api/accounts/me/wallets",
            get(accounts::list_wallets_handler).post(accounts::create_wallet_handler),
        )
        // [ Wallets conectadas del navegador — Phantom/MetaMask/… (solo pubkeys) ]
        .route(
            "/api/accounts/me/connected-wallets",
            get(accounts::list_connected_wallets_handler).post(accounts::connect_wallet_handler),
        )
        .route(
            "/api/accounts/me/connected-wallets/activate",
            put(accounts::activate_connected_wallet_handler),
        )
        // [ Servicios del agente — dapps con flujo x402 ]
        .route(
            "/api/accounts/me/services",
            get(accounts::list_services_handler).post(accounts::add_service_handler),
        )
        // [ NomikOS Fase 1 — flota de dispositivos ]
        .route("/api/devices/enroll", post(devices::enroll_handler))
        .route("/api/devices/claim", post(devices::claim_handler))
        .route("/api/devices/token", post(devices::device_token_handler))
        .route("/api/devices", get(devices::list_fleet_handler))
        .route("/api/devices/me", get(devices::me_handler))
        .route(
            "/api/devices/me/heartbeat",
            post(devices::heartbeat_handler),
        )
        // [ Dispositivo: elegir proveedor/modelo LLM de SU cuenta (sin secretos) ]
        .route("/api/devices/me/llm", get(devices::me_llm_handler))
        .route(
            "/api/devices/me/llm/active",
            post(devices::me_llm_activate_handler),
        )
        .route("/api/devices/{id}/limits", put(devices::limits_handler))
        // [ NomikOS F5 — llamadas con peaje x402 por minuto ]
        .route("/api/calls", post(calls::create_call_handler))
        .route("/api/calls/{id}", get(calls::get_call_handler))
        .route("/api/calls/{id}/end", post(calls::end_call_handler))
        // [ NomikOS W4 — puente baresip: la Pi consulta SU llamada ]
        .route("/api/calls/for-device", get(calls::for_device_handler))
        // [ NomikOS F5 — voz + MCP Gateway peajizado hacia la app (diagram.d2) ]
        .route("/api/voice", post(voice::voice_turn_handler))
        .route("/api/app/request", post(app::app_request_handler))
        // [ Tienda de dapps — el worker lista e instala apps del registro ]
        .route("/api/apps", get(apps::list_handler))
        .route("/api/apps/{slug}", get(apps::get_handler))
        .route("/api/apps/{slug}/install", post(apps::install_handler))
        // [ Módulo Medusa MCP ] — puente hacia cloud.medusajs.com/mcp
        .route("/api/mcp/status", get(mcp::status_handler))
        .route("/api/mcp/tools", get(mcp::tools_handler))
        .route("/api/mcp/call", post(mcp::call_handler))
        .route(
            "/api/x402/invoices",
            post(x402::create_invoice_handler).get(x402::list_handler),
        )
        .route("/api/x402/invoices/{id}", get(x402::get_handler))
        .route("/api/x402/invoices/{id}/verify", post(x402::verify_handler))
        .route("/api/x402/payouts", get(x402::payouts_handler))
        .route("/api/x402/pay", post(x402::pay_handler))
        .route("/api/x402/protected", get(x402::protected))
        // [ Fase 4 — dPaaS por cuenta (pagos delegados autenticados) ]
        .route(
            "/api/accounts/me/x402/summary",
            get(x402::me_x402_summary_handler),
        )
        .route(
            "/api/accounts/me/x402/invoices",
            get(x402::me_x402_invoices_handler),
        )
        .route(
            "/api/accounts/me/tool-usage",
            get(x402::me_app_tool_usage_handler),
        )
        .route(
            "/api/accounts/me/llm-usage",
            get(usage::me_llm_usage_handler).post(usage::record_llm_usage_handler),
        )
        .route("/api/accounts/me/x402/pay", post(x402::me_x402_pay_handler))
        .route(
            "/api/accounts/me/x402/pay-invoice",
            post(x402::me_x402_pay_invoice_handler),
        )
        // [ Verificador legal S2 — workshop (casos nativos dpaas/call) ]
        .route("/api/legal/runs", post(verify::create_run_handler))
        .route("/api/legal/runs/{id}", get(verify::get_run_handler))
        .route(
            "/api/legal/runs/{id}/turns",
            post(verify::append_turn_handler),
        )
        .route("/api/legal/runs/{id}/submit", post(verify::submit_handler))
        .route("/api/legal/runs/{id}/stream", get(verify::stream_handler))
        .route(
            "/api/legal/runs/{id}/checklist",
            get(verify::checklist_handler),
        )
        .route(
            "/api/legal/runs/{id}/events",
            get(verify::list_events_handler),
        )
        .route(
            "/api/legal/runs/{id}/escalate",
            post(verify::escalate_handler),
        )
        .route(
            "/api/legal/runs/{id}/signoff",
            post(verify::signoff_handler),
        )
        .route("/api/legal/runs/{id}/world", post(verify::world_handler))
        .route(
            "/api/legal/cases/{id}/docs",
            get(verify::list_case_docs_handler),
        )
        .route(
            "/api/legal/cases/{id}/docs/{name}",
            get(verify::get_case_doc_handler),
        )
        // Fase 3 — gateway 402 reactivo sobre X402_PROTECTED_PATHS
        // (matching exacto de path; el resto de la API pasa sin peaje).
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            x402::x402_gate,
        ))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Estado general
// ---------------------------------------------------------------------------

async fn health(State(state): State<SharedState>) -> impl IntoResponse {
    let uptime_ms = now_ms() - state.started_at;
    Json(json!({
        "ok": true,
        "service": "agent-os-api",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_secs": uptime_ms / 1000,
        "device": state.cfg.device_name,
        "modules": {
            "erp_medusa": state.cfg.payload_url,
            "x402_solana": state.cfg.solana_network_label(),
            "multimedia_spotify_mpd": null, // omitido por diseño
            "cloudflare_r2": state.r2.is_some(),
        }
    }))
}

/// Datos del navbar: dispositivo + ERP (rojo/verde) + Solana (red/balance).
pub async fn navbar_value(state: &SharedState) -> AppResult<Value> {
    let dev = state.db.get_device()?;
    let erp = state.db.get_service("erp")?;
    let sol = state.db.get_service("solana")?;

    let erp_json = erp.map(|s| {
        json!({
            "label": s.label,              // "ERP · Medusa.js"
            "running": s.running,
            "state": if s.running { "Corriendo" } else { "Detenido" },
            "endpoint": s.endpoint,
            "detail": s.detail,
            "updated_at": s.updated_at,
        })
    });

    let sol_json = sol.map(|s| {
        json!({
            "label": s.label,              // "Solana · Devnet"
            "running": s.running,
            "state": if s.running { "Corriendo" } else { "Sin conexión" },
            "network": s.network,           // "Devnet"
            "balance_sol": s.balance_lamports.map(solana::fmt_sol),
            "balance_lamports": s.balance_lamports,
            "wallet": s.wallet,
            "slot": s.slot,
            "version": s.version,
            "endpoint": s.endpoint,
            "detail": s.detail,
            "updated_at": s.updated_at,
        })
    });

    Ok(json!({
        "ok": true,
        "device": { "name": dev.name },
        "erp": erp_json,
        "solana": sol_json,
    }))
}

async fn navbar(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    Ok(Json(navbar_value(&state).await?))
}

/// Índice de módulos del Agente OS (el multimedia se omitió por diseño).
async fn modules_value(state: &SharedState) -> AppResult<Value> {
    let erp = state.db.get_service("erp")?;
    let x402_summary = x402::summary_value(state).await?;
    let mcp_summary = mcp::summary_value(state, false).await;

    let list = vec![
        json!({
            "id": "erp-salud-kodetap",
            "title": "Módulo Salud / ERP Avanzado (Kodetap API → Medusa.js)",
            "running": erp.as_ref().map(|s| s.running).unwrap_or(false),
            "endpoint": erp.as_ref().and_then(|s| s.endpoint.clone()),
            "detail": erp.as_ref().and_then(|s| s.detail.clone()),
        }),
        json!({
            "id": "x402-solana",
            "title": "Módulo x402 Solana (liquida micro-peajes en background)",
            "running": state
                .db
                .get_service("solana")?
                .map(|s| s.running)
                .unwrap_or(false),
            "network": state.cfg.solana_network_label(),
            "payer_configured": state.cfg.payer_keypair.is_some(),
            "summary": x402_summary,
        }),
        json!({
            "id": "multimedia-spotify-mpd",
            "title": "Módulo Multimedia (Spotify / MPD API)",
            "running": false,
            "detail": "omitido por diseño",
            "omitted": true,
        }),
        json!({
            "id": "medusa-mcp",
            "title": "Medusa MCP (cloud.medusajs.com/mcp)",
            "running": mcp_summary.get("connected").and_then(|v| v.as_bool()).unwrap_or(false),
            "url": mcp_summary.get("url").cloned().unwrap_or(Value::Null),
            "auth": mcp_summary.get("auth").cloned().unwrap_or(Value::Null),
            "summary": mcp_summary,
        }),
    ];

    Ok(json!({ "ok": true, "modules": list }))
}

async fn modules(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    Ok(Json(modules_value(&state).await?))
}

// ---------------------------------------------------------------------------
// Estatus de ERP y Solana (filas de service_status)
// ---------------------------------------------------------------------------

async fn service_value(state: &SharedState, id: &str) -> AppResult<Value> {
    let row = state.db.get_service(id)?;
    match row {
        Some(row) => Ok(serde_json::to_value(row)?),
        None => Err(AppError::unavailable(format!(
            "módulo «{id}» aún no sincronizado (espera unos segundos)"
        ))),
    }
}

async fn erp_status(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    Ok(Json(service_value(&state, "erp").await?))
}

async fn solana_status(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    Ok(Json(service_value(&state, "solana").await?))
}

/// URLs RPC de Solana por red (local/devnet/testnet/mainnet).
/// Es la fuente única de verdad: agent-dapp las consume desde aquí
/// en lugar de leerlas de su propio .env.
async fn solana_urls(State(state): State<SharedState>) -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "urls": state.cfg.solana_urls,
    }))
}

// ---------------------------------------------------------------------------
// Agente (MCP / Muse): estado agregado + herramientas + llamada
// ---------------------------------------------------------------------------

async fn agent_state(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    let mut value = navbar_value(&state).await?;
    let obj = value
        .as_object_mut()
        .ok_or_else(|| AppError::internal("navbar: objeto"))?;

    obj.insert("device_full".into(), device::device_value(&state).await?);
    obj.insert("ficha_tecnica".into(), device::specs_value(&state).await?);
    obj.insert("x402".into(), x402::summary_value(&state).await?);
    // Medusa MCP sin probe de red (solo config + sesión cacheada).
    obj.insert("medusa_mcp".into(), mcp::summary_value(&state, false).await);
    obj.insert(
        "modules".into(),
        modules_value(&state)
            .await?
            .get("modules")
            .cloned()
            .unwrap_or(json!([])),
    );
    obj.insert(
        "agent".into(),
        json!({
            "runtime": "Muse (MCP)",
            "tools": "GET /api/agent/tools",
            "call": "POST /api/agent/call {\"tool\": …, \"args\": …}"
        }),
    );

    Ok(Json(value))
}

#[derive(Deserialize)]
struct AgentCall {
    tool: String,
    #[serde(default)]
    args: Value,
}

fn arg_str(args: &Value, key: &str) -> AppResult<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| AppError::bad_request(format!("falta la cadena «{key}» en args")))
}

fn arg_i64(args: &Value, key: &str) -> AppResult<i64> {
    args.get(key)
        .and_then(|v| v.as_i64())
        .ok_or_else(|| AppError::bad_request(format!("falta el entero «{key}» en args")))
}

async fn agent_call(
    State(state): State<SharedState>,
    Json(call): Json<AgentCall>,
) -> AppResult<impl IntoResponse> {
    let args = if call.args.is_null() {
        json!({})
    } else {
        call.args.clone()
    };

    let result = match call.tool.as_str() {
        "navbar_status" => navbar_value(&state).await?,
        "device_specs" => device::specs_value(&state).await?,
        "erp_status" => service_value(&state, "erp").await?,
        "solana_status" => service_value(&state, "solana").await?,
        "x402_summary" => x402::summary_value(&state).await?,
        "medusa_mcp_status" => mcp::summary_value(&state, true).await,
        "medusa_mcp_list_tools" => {
            let result = state
                .mcp
                .tools_list(&state.http)
                .await
                .map_err(|e| mcp::map_mcp_error_pub(&e))?;
            result.get("tools").cloned().unwrap_or(json!([]))
        }
        "medusa_mcp_call" => {
            let tool = arg_str(&args, "tool")?;
            let tool_args = args.get("arguments").cloned().unwrap_or(json!({}));
            let result = state
                .mcp
                .tools_call(&state.http, &tool, tool_args)
                .await
                .map_err(|e| mcp::map_mcp_error_pub(&e))?;
            json!({
                "is_error": result.get("isError").and_then(|v| v.as_bool()).unwrap_or(false),
                "content": result.get("content"),
            })
        }
        "create_invoice" => {
            let resource = arg_str(&args, "resource")?;
            let lamports = arg_i64(&args, "amount_lamports")?;
            x402::create_invoice_value(&state, &resource, lamports).await?
        }
        "invoice_status" => {
            let id = arg_str(&args, "id")?;
            x402::invoice_value(&state, &id).await?
        }
        "pay_toll" => {
            let to = arg_str(&args, "to")?;
            let lamports = arg_i64(&args, "lamports")?;
            let memo = args
                .get("memo")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            x402::pay_value(&state, x402::PayBody { to, lamports, memo }, "system").await?
        }
        other => {
            // tools de las dapps INSTALADAS (MCP manager dinámico:
            // POST /api/apps/{slug}/install las registra)
            if let Some(res) = apps::call_dynamic_tool(&state, other, &args).await {
                res?
            } else {
                return Err(AppError::not_found(format!(
                    "tool «{other}» no existe — GET /api/agent/tools"
                )));
            }
        }
    };

    Ok(Json(
        json!({ "ok": true, "tool": call.tool, "result": result }),
    ))
}

async fn agent_tools(State(state): State<SharedState>) -> impl IntoResponse {
    let mut tools = vec![
        json!({
            "name": "navbar_status",
            "description": "Estado del dispositivo + ERP (Medusa.js) + Solana (red, wallet, balance)"
        }),
        json!({
            "name": "device_specs",
            "description": "Ficha técnica del ESP32-S3-Touch-AMOLED-1.43 (desde la DB)"
        }),
        json!({
            "name": "erp_status",
            "description": "Salud del ERP Medusa.js (Kodetap API): ¿corriendo o detenido?"
        }),
        json!({
            "name": "solana_status",
            "description": "Red Solana activa, versión del validador, slot y balance en SOL"
        }),
        json!({
            "name": "x402_summary",
            "description": "Resumen de micro-peajes x402 (facturas y liquidaciones)"
        }),
        json!({
            "name": "create_invoice",
            "description": "Crea una factura de micro-peaje x402",
            "args": { "resource": "string", "amount_lamports": "integer > 0" }
        }),
        json!({
            "name": "invoice_status",
            "description": "Estado on-chain de una factura x402",
            "args": { "id": "string" }
        }),
        json!({
            "name": "pay_toll",
            "description": "Encola una liquidación SOL en background (requiere SOLANA_PAYER_KEYPAIR)",
            "args": { "to": "pubkey base58", "lamports": "integer > 0", "memo": "opcional" }
        }),
    ];
    // + las tools de las dapps INSTALADAS (tienda de apps → MCP manager)
    tools.extend(apps::installed_tools_value(&state));
    Json(tools)
}
