//! [ Simulador NomikOS ] — el panel simula la placa ESP32-S3-Touch-AMOLED
//! 1.43 con el OS REAL dentro; el progreso vive en la DB de la CUENTA
//! (retomable/reconstruible) y el dispositivo simulado es uno REAL de la
//! flota (enroll → claim → token → heartbeat de verdad).
//!
//! ```text
//! GET  /api/accounts/me/simulation        ← estado del OS (retoma donde iba)
//! POST /api/accounts/me/simulation/step  ← avanza la máquina de estados
//!
//! acciones (action): boot · claim · tap · heartbeat · apps · x402 · say · rebuild
//!
//! stage: boot (encendido + enroll) → claim (código en pantalla) →
//!        online (fleet + apps + peajes + voz)
//! screen (online): home (principal) ⇄ apps ⇄ x402 ⇄ settings
//! ```
//!
//! El api es AUTORITATIVO: la pantalla del simulador solo RENDERIZA el
//! estado — que espeja lo que muestra `firmware/agentd-esp32/display.rs`
//! en la placa real (claim code, ONLINE, apps instaladas, peaje x402).

use crate::crypto;
use crate::db::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::modules::accounts::AuthedAccount;
use crate::modules::devices::new_claim_code;
use crate::state::SharedState;
use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

const BOARD: &str = "esp32-s3-amoled-143";
const NAME: &str = "NomikOS Sim (docker)";

// ---------------------------------------------------------------------------
// Estado por cuenta (tabla simulation_states)
// ---------------------------------------------------------------------------

fn default_state() -> Value {
    json!({
        "stage": "boot",
        "board": BOARD,
        "name": NAME,
        "device_id": null,
        "enroll_secret": null,
        "token": null,
        "claim_code": null,
        "claimed": false,
        "boot_count": 0,
        "taps": 0,
        "screen": "home",             // home | apps | appdetail | x402 | settings
        "locked": true,                // pantalla de bloqueo (online arranca bloqueado)
        "detail_app": null,            // slug visible en appdetail
        "apps": [],                    // [{slug, name, status, tools_count}] instaladas
        "last_x402": null,
        "last_reply": null,            // {text, reply, ts} — última conversación con el agente
        "chat": [],                    // historial del chat: [{text, reply, ts}] (últimos 12)
        "events": [],                  // progreso: [{ts, ev}]
    })
}

fn load(state: &SharedState, account: &str) -> Value {
    state
        .db
        .with(|c| {
            c.query_row(
                "SELECT state FROM simulation_states WHERE account_id = ?1",
                params![account],
                |r| r.get::<_, String>(0),
            )
        })
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(default_state)
}

fn save(state: &SharedState, account: &str, sim: &Value) {
    let _ = state.db.with(|c| {
        c.execute(
            "INSERT INTO simulation_states (account_id, state, updated_at) \
             VALUES (?1, ?2, ?3) \
             ON CONFLICT(account_id) DO UPDATE SET state = excluded.state, \
             updated_at = excluded.updated_at",
            params![account, sim.to_string(), now_ms()],
        )?;
        Ok(())
    });
}

fn event(sim: &mut Value, ev: &str) {
    if let Some(list) = sim["events"].as_array_mut() {
        // progreso compacto: últimos 30 eventos
        list.push(json!({ "ts": now_ms(), "ev": ev }));
        while list.len() > 30 {
            list.remove(0);
        }
    }
}

fn s(sim: &Value, k: &str) -> Option<String> {
    sim[k].as_str().map(str::to_string)
}

// ---------------------------------------------------------------------------
// Ciclo de vida del dispositivo simulado (espeja devices.rs — REAL)
// ---------------------------------------------------------------------------

/// Enroll real: la placa simulada se presenta al worker.
fn sim_enroll(state: &SharedState, sim: &mut Value) -> AppResult<()> {
    let id = new_id("dev");
    let (enroll_secret, enroll_hash) = crypto::new_session_token();
    let claim_code = new_claim_code();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO devices (id, name, board, pubkey, claim_code, claim_expires_at, \
             enroll_secret_hash, status, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'offline', ?8)",
            params![
                id,
                sim["name"].as_str().unwrap_or(NAME),
                sim["board"].as_str().unwrap_or(BOARD),
                format!("SIM-{id}"), // identidad opaca del simulador
                claim_code,
                now_ms() + 15 * 60_000,
                enroll_hash,
                now_ms()
            ],
        )?;
        Ok(())
    })?;
    sim["device_id"] = json!(id);
    sim["enroll_secret"] = json!(enroll_secret);
    sim["claim_code"] = json!(claim_code);
    sim["stage"] = json!("claim");
    sim["claimed"] = json!(false);
    sim["token"] = Value::Null;
    tracing::info!("sim: dispositivo {id} en espera de claim «{claim_code}»");
    Ok(())
}

/// Emite un token de dispositivo (sesión con device_id, TTL 30 días —
/// ver devices.rs). Devuelve (token, expires_at).
fn mint_device_token(
    state: &SharedState,
    account: &str,
    device_id: &str,
) -> AppResult<(String, i64)> {
    let (token, token_hash) = crypto::new_session_token();
    let expires_at = now_ms() + 30 * 86_400_000;
    state.db.with(|c| {
        c.execute(
            "INSERT INTO sessions (token_hash, account_id, device_id, created_at, expires_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![token_hash, account, device_id, now_ms(), expires_at],
        )?;
        Ok(())
    })?;
    Ok((token, expires_at))
}

/// Claim real por la propia cuenta + token del dispositivo.
///
/// Self-healing: si la ventana de emparejado venció (el código de la
/// pantalla expiró), el device se vuelve a presentar solo — re-enroll,
/// como hace el agentd real — y devuelve Ok(false): la pantalla muestra
/// el código NUEVO y AGREGAR se pulsa otra vez. Nunca deja al OS en un
/// callejón sin salida.
///
/// Idempotente: un doble AGREGAR (o reintento) sobre un device ya
/// emparejado con esta cuenta completa el estado sin duplicar nada.
/// Devuelve Ok(true) cuando el OS queda ONLINE.
fn sim_claim_and_token(state: &SharedState, account: &str, sim: &mut Value) -> AppResult<bool> {
    // 1. ¿ya emparejado con esta cuenta? (doble AGREGAR / reintento)
    if let Some(dev) = s(sim, "device_id") {
        let owner: Option<Option<String>> = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT account_id FROM devices WHERE id = ?1",
                    params![dev],
                    |r| r.get(0),
                )
            })
            .ok();
        match owner {
            Some(Some(o)) if o == account => {
                if s(sim, "token").is_none() {
                    let (token, _) = mint_device_token(state, account, &dev)?;
                    sim["token"] = json!(token);
                }
                sim["claimed"] = json!(true);
                sim["stage"] = json!("online");
                return Ok(true);
            }
            Some(Some(_)) => {
                return Err(AppError::conflict("ese dispositivo ya pertenece a otra cuenta"));
            }
            _ => {}
        }
        // 2. ¿el claim guardado sigue válido (código + no expirado)?
        let code = s(sim, "claim_code").unwrap_or_default().to_uppercase();
        let valid: bool = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT 1 FROM devices WHERE id = ?1 AND claim_code = ?2 \
                     AND account_id IS NULL AND claim_expires_at > ?3",
                    params![dev, code, now_ms()],
                    |_| Ok(()),
                )
            })
            .is_ok();
        if !valid {
            sim_enroll(state, sim)?;
            return Ok(false);
        }
    }

    // 3. claim normal (código válido) + token del dispositivo.
    let code = s(sim, "claim_code").unwrap_or_default().to_uppercase();
    let device_id = s(sim, "device_id").ok_or_else(|| AppError::bad_request("sim sin enroll"))?;
    state
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
                params![account, id],
            )?;
            Ok(())
        })
        .map_err(|_| AppError::conflict("código de emparejado inválido/expirado"))?;

    let (token, _) = mint_device_token(state, account, &device_id)?;
    sim["claimed"] = json!(true);
    sim["token"] = json!(token);
    sim["stage"] = json!("online");
    Ok(true)
}

/// Heartbeat real: el simulador aparece ONLINE en la flota de la cuenta.
fn sim_heartbeat(state: &SharedState, sim: &mut Value) -> AppResult<()> {
    let device_id = s(sim, "device_id").ok_or_else(|| AppError::bad_request("sim sin enroll"))?;
    state.db.with(|c| {
        c.execute(
            "UPDATE devices SET status = 'online', last_seen_at = ?1, \
             agent_version = 'nomikos-sim-0.1' WHERE id = ?2",
            params![now_ms(), device_id],
        )?;
        Ok(())
    })?;
    Ok(())
}

/// Cache de las dapps INSTALADAS (la pantalla «apps» del OS simulado).
fn refresh_apps(state: &SharedState, sim: &mut Value) {
    let apps: Vec<Value> = crate::modules::apps::all(state)
        .into_iter()
        .filter(|r| r.status == "installed")
        .map(|r| {
            let tools_count = serde_json::from_str::<Vec<Value>>(&r.tools)
                .map(|v| v.len())
                .unwrap_or(0) as i64;
            json!({ "slug": r.slug, "name": r.name, "status": r.status, "tools_count": tools_count })
        })
        .collect();
    sim["apps"] = json!(apps);
}

/// Resumen LLM de la cuenta para los ajustes del dispositivo (SIN
/// secretos): proveedores configurados + cuál está activo. Lectura barata
/// de DB — se recalcula en cada GET, sin guardar.
fn llm_summary(state: &SharedState, account: &str) -> Value {
    let providers = crate::modules::accounts::llm_providers_list(state, account);
    let active = providers
        .iter()
        .find(|p| p["is_active"].as_bool().unwrap_or(false))
        .and_then(|p| p["provider"].as_str())
        .map(str::to_string);
    json!({ "active_provider": active, "providers": providers })
}

/// Wallet dPaaS que USA el agente + balance vivo (Solana RPC).
/// Es la MISMA wallet que hay que recargar desde fuera (faucet 💧 del
/// panel o transferencia desde otra wallet): el agente solo gasta de
/// ella, firmando cada peaje por dPaaS. Se refresca al ENTRAR a la
/// pantalla x402 (no en cada poll, para no martillar el RPC).
async fn refresh_agent_wallet(state: &SharedState, account: &str, sim: &mut Value) {
    let row: Option<(Option<String>, String)> = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT wallet_pubkey, network FROM account_chain WHERE account_id = ?1",
                params![account],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
        })
        .ok();
    let Some((wallet_opt, network)) = row else {
        sim["agent_wallet"] =
            json!({ "wallet_pubkey": null, "network": null, "balance_lamports": null });
        return;
    };
    let balance = match wallet_opt.as_deref() {
        Some(w) if !w.is_empty() => {
            match crate::modules::x402::client_for_network(state, &network).await {
                Ok(client) => client.get_balance(w).await.ok(),
                Err(_) => None,
            }
        }
        _ => None,
    };
    sim["agent_wallet"] = json!({
        "wallet_pubkey": wallet_opt,
        "network": network,
        "balance_lamports": balance,
    });
}

/// Peaje x402 del recurso protegido del dispositivo — igual que hace el
/// agentd real: 402 (factura con device_id) → la CUENTA firma (dPaaS) →
/// el acceso se consume one-shot. Devuelve el resultado para la pantalla.
async fn sim_x402(state: &SharedState, account: &str, sim: &mut Value) {
    let device_id = s(sim, "device_id");
    let lamports = state.cfg.x402_path_lamports.max(1);
    let resource = "x402:device:GET:/api/device";
    let inv = match crate::modules::x402::create_invoice_value_for(
        state, resource, lamports, Some(account), device_id.as_deref(),
    )
    .await
    {
        Ok(v) => v,
        Err(_) => {
            sim["last_x402"] = json!({
                "resource": resource,
                "status": "error",
                "access": "no se pudo crear el peaje",
                "hint": "reintenta más tarde",
            });
            return;
        }
    };
    let invoice_id = inv["id"].as_str().unwrap_or_default().to_string();
    // la cuenta paga con dPaaS (real on-chain si la wallet tiene SOL)
    let payment = crate::modules::x402::pay_invoice_value(state, account, &invoice_id).await;
    // Estado para humanos (nunca texto técnico crudo en pantalla):
    // settled | verifying | error, con access corto y hint accionable.
    let (status, access, hint, tx) = match payment {
        Ok(v) => {
            let st = v["status"].as_str().unwrap_or("verifying").to_string();
            let tx = v["tx_signature"].as_str().map(str::to_string);
            if st == "settled" {
                let access = crate::modules::x402::settle_access(state, &invoice_id, Some(account))
                    .map(|_| "ACCESO CONCEDIDO (one-shot)")
                    .unwrap_or("error al consumir");
                (st, access.to_string(), None, tx)
            } else {
                (st, "esperando confirmación on-chain".to_string(), None, tx)
            }
        }
        Err(e) => {
            let msg = e.to_string();
            let (access, hint) = if msg.contains("keypair") {
                (
                    "sin wallet configurada".to_string(),
                    "créala en Wallet·Red del panel".to_string(),
                )
            } else if msg.contains("fondos")
                || msg.contains("insufficient")
                || msg.contains("balance")
            {
                (
                    "sin fondos".to_string(),
                    "recarga con 💧 Faucet del panel".to_string(),
                )
            } else {
                ("no se pudo pagar".to_string(), "reintenta más tarde".to_string())
            };
            ("error".to_string(), access, Some(hint), None)
        }
    };
    sim["last_x402"] = json!({
        "resource": resource,
        "invoice_id": invoice_id,
        "status": status,
        "access": access,
        "hint": hint,
        "tx_signature": tx,
        "lamports": lamports,
    });
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/// GET /api/accounts/me/simulation — estado del OS simulado (retoma el
/// progreso guardado; si no hay, arranca de cero). Enriquece con datos
/// derivados frescos (resumen LLM + dapps instaladas): lecturas baratas
/// de DB, sin guardar, para que la pantalla nunca muestre cachés viejos.
pub async fn get_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    let mut sim = load(&state, &auth.account_id);
    sim["llm"] = llm_summary(&state, &auth.account_id);
    refresh_apps(&state, &mut sim);
    Ok(Json(json!({ "ok": true, "simulation": sim })).into_response())
}

#[derive(Deserialize)]
pub struct StepBody {
    action: String,
    /// Texto del turno de voz (acción `say`).
    #[serde(default)]
    text: Option<String>,
    /// Destino del toque posicionado (acción `press`): unlock | lock |
    /// home | apps | settings | x402 | providers | models | app:<slug> |
    /// provider:<slug> | model:<id>.
    #[serde(default)]
    target: Option<String>,
}

/// POST /api/accounts/me/simulation/step {action, text?} — avanza el OS simulado:
///
///   boot      — encender (boot_count++; primer boot → enroll → claim code)
///   claim     — «apretar AGREGAR»: claim + token → ONLINE (flota real)
///   tap       — tocar la pantalla: cicla home ⇄ apps ⇄ x402 ⇄ settings
///               (compat: el táctil posicionado usa `press`)
///   press     — toque posicionado {target}: unlock | lock | home | apps |
///               settings | x402 | providers | models | app:<slug> |
///               provider:<slug> | model:<id>. Navegación directa del OS.
///               Solo online; con locked solo vale unlock. app:<slug> debe
///               estar instalada. provider:/model: eligen explícitamente
///               entre lo configurado (las keys se cargan en el panel).
///               No genera eventos (los taps son frecuentes; solo unlock/lock y los
///               cambios de LLM quedan en el progreso).
///   heartbeat — latido del OS (la flota lo ve ONLINE)
///   apps      — refresca las dapps instaladas del agente
///   x402      — demo del peaje (factura → dPaaS → one-shot)
///   say       — hablar con el agente: {text} → turno de voz con el
///               orquestador usando la identidad del DISPOSITIVO
///               (igual que POST /api/voice); la respuesta queda en
///               last_reply y se lee en la pantalla principal
///   rebuild   — reconstruir el dispositivo+OS CONSERVANDO el progreso
pub async fn step_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Json(body): Json<StepBody>,
) -> AppResult<Response> {
    let mut sim = load(&state, &auth.account_id);
    let first_boot = sim["boot_count"].as_i64().unwrap_or(0) == 0;

    match body.action.as_str() {
        "boot" => {
            sim["boot_count"] = json!(sim["boot_count"].as_i64().unwrap_or(0) + 1);
            event(&mut sim, "boot");
            if s(&sim, "device_id").is_none() {
                // el agentd simulado se presenta al worker (como la placa)
                sim_enroll(&state, &mut sim)?;
                event(&mut sim, "enroll");
            }
            if first_boot {
                tracing::info!("sim: primer arranque del OS de {}", auth.account_id);
            }
        }
        "claim" => {
            if sim_claim_and_token(&state, &auth.account_id, &mut sim)? {
                event(&mut sim, "claim");
                event(&mut sim, "online");
                refresh_apps(&state, &mut sim);
                sim["screen"] = json!("home"); // al entrar, la pantalla principal
                sim["locked"] = json!(true); // como la placa real: arranca bloqueado
            } else {
                // el código había expirado: se renovó solo — la pantalla
                // muestra el nuevo y AGREGAR se pulsa otra vez
                event(&mut sim, "code-renewed");
            }
        }
        "tap" => {
            sim["taps"] = json!(sim["taps"].as_i64().unwrap_or(0) + 1);
            // "status" es la pantalla legacy (estados guardados viejos) → home
            sim["screen"] = match sim["screen"].as_str().unwrap_or("home") {
                "home" | "status" => json!("apps"),
                "apps" => json!("x402"),
                "x402" => json!("settings"),
                "appdetail" => json!("apps"),
                _ => json!("home"),
            };
            if sim["screen"] == "x402" {
                refresh_agent_wallet(&state, &auth.account_id, &mut sim).await;
            }
            event(&mut sim, "tap");
        }
        "press" => {
            if sim["stage"].as_str() != Some("online") {
                return Err(AppError::bad_request("el OS debe estar ONLINE"));
            }
            sim["taps"] = json!(sim["taps"].as_i64().unwrap_or(0) + 1);
            let target = body.target.as_deref().map(str::trim).unwrap_or_default();
            let locked = sim["locked"].as_bool().unwrap_or(true);
            match target {
                "unlock" => {
                    sim["locked"] = json!(false);
                    event(&mut sim, "unlock");
                }
                "lock" => {
                    sim["locked"] = json!(true);
                    event(&mut sim, "lock");
                }
                "home" | "apps" | "settings" | "providers" | "models" if !locked => {
                    sim["screen"] = json!(target);
                }
                "x402" if !locked => {
                    sim["screen"] = json!("x402");
                    refresh_agent_wallet(&state, &auth.account_id, &mut sim).await;
                }
                t if t.starts_with("provider:") && !locked => {
                    // selección explícita desde la lista (las keys solo se
                    // cargan en el panel; el device solo elige)
                    let name = t.trim_start_matches("provider:");
                    crate::modules::accounts::set_active_llm(
                        &state, &auth.account_id, Some(name), None,
                    )?;
                    sim["screen"] = json!("settings");
                    event(&mut sim, "set-provider");
                }
                t if t.starts_with("model:") && !locked => {
                    let id = t.trim_start_matches("model:");
                    crate::modules::accounts::set_active_llm(
                        &state, &auth.account_id, None, Some(id),
                    )?;
                    sim["screen"] = json!("settings");
                    event(&mut sim, "set-model");
                }
                t if t.starts_with("app:") && !locked => {
                    let slug = t.trim_start_matches("app:");
                    let known = sim["apps"]
                        .as_array()
                        .map(|a| a.iter().any(|x| x["slug"].as_str() == Some(slug)))
                        .unwrap_or(false);
                    if !known {
                        return Err(AppError::not_found(format!(
                            "dapp «{slug}» no instalada"
                        )));
                    }
                    sim["detail_app"] = json!(slug);
                    sim["screen"] = json!("appdetail");
                }
                _ if locked => {
                    return Err(AppError::forbidden("OS bloqueado — desbloquea primero"));
                }
                _ => {
                    return Err(AppError::bad_request(format!(
                        "target «{target}» inválido"
                    )));
                }
            }
        }
        "heartbeat" => {
            sim_heartbeat(&state, &mut sim)?;
            event(&mut sim, "heartbeat");
        }
        "apps" => {
            refresh_apps(&state, &mut sim);
            event(&mut sim, "apps");
        }
        "x402" => {
            if sim["stage"].as_str() != Some("online") {
                return Err(AppError::bad_request("el OS debe estar ONLINE (claim primero)"));
            }
            sim_x402(&state, &auth.account_id, &mut sim).await;
            refresh_agent_wallet(&state, &auth.account_id, &mut sim).await;
            event(&mut sim, "x402");
        }
        "say" => {
            if sim["stage"].as_str() != Some("online") {
                return Err(AppError::bad_request("el OS debe estar ONLINE (claim primero)"));
            }
            let text: String = body
                .text
                .as_deref()
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .ok_or_else(|| AppError::bad_request("say necesita text (lo que dijo el micrófono)"))?
                .chars()
                .take(500)
                .collect();
            let token = s(&sim, "token")
                .ok_or_else(|| AppError::bad_request("sim sin token de dispositivo"))?;
            let device_id = s(&sim, "device_id").unwrap_or_default();
            // Turno de voz con el orquestador usando la identidad del
            // DISPOSITIVO (misma llamada que hace POST /api/voice: el
            // Bearer del device viaja al gateway; brain resuelve la cuenta).
            let url = format!("{}/v1/agentic-gateway", state.cfg.brain_url);
            let res = state
                .http
                .post(&url)
                .timeout(Duration::from_secs(300))
                .header("Authorization", format!("Bearer {token}"))
                .json(&json!({ "device_id": device_id, "text": text }))
                .send()
                .await;
            let reply = match res {
                Ok(r) => {
                    let v: Value = r.json().await.unwrap_or(Value::Null);
                    v.get("reply")
                        .and_then(|x| x.as_str())
                        .map(str::trim)
                        .filter(|x| !x.is_empty())
                        .map(str::to_string)
                        .unwrap_or_else(|| {
                            v.get("error")
                                .and_then(|x| x.as_str())
                                .unwrap_or("sin respuesta")
                                .to_string()
                        })
                }
                Err(e) => format!("orquestador no disponible ({e})"),
            };
            let turn = json!({ "text": text, "reply": reply, "ts": now_ms() });
            sim["last_reply"] = turn.clone();
            // historial del chat (para leer la conversación completa en el
            // panel): se conserva en rebuild y viaja con el progreso.
            if !sim["chat"].is_array() {
                sim["chat"] = json!([]);
            }
            if let Some(chat) = sim["chat"].as_array_mut() {
                chat.push(turn);
                while chat.len() > 50 {
                    chat.remove(0);
                }
            }
            sim["screen"] = json!("home"); // la respuesta se lee en la principal
            event(&mut sim, "say");
        }
        "rebuild" => {
            // reconstruir dispositivo+OS CON el progreso (boots/taps/eventos)
            let (boots, taps, events) = (
                sim["boot_count"].as_i64().unwrap_or(0),
                sim["taps"].as_i64().unwrap_or(0),
                sim["events"].clone(),
            );
            for k in ["device_id", "enroll_secret", "token", "claim_code"] {
                sim[k] = Value::Null;
            }
            sim["claimed"] = json!(false);
            sim["locked"] = json!(true);
            sim["detail_app"] = Value::Null;
            sim["stage"] = json!("boot");
            sim_enroll(&state, &mut sim)?;
            sim["boot_count"] = json!(boots);
            sim["taps"] = json!(taps);
            sim["events"] = events;
            event(&mut sim, "rebuild");
        }
        other => {
            return Err(AppError::bad_request(format!(
                "acción «{other}» inválida — boot|claim|tap|press|heartbeat|apps|x402|say|rebuild"
            )))
        }
    }

    save(&state, &auth.account_id, &sim);
    sim["llm"] = llm_summary(&state, &auth.account_id);
    Ok(Json(json!({ "ok": true, "simulation": sim })).into_response())
}
