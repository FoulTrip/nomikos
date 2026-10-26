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
        "screen": "home",             // home | apps | x402 | settings
        "apps": [],                    // [{slug, name, status}] instaladas
        "last_x402": null,
        "last_reply": null,            // {text, reply, ts} — última conversación con el agente
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
        .map(|r| json!({ "slug": r.slug, "name": r.name, "status": r.status }))
        .collect();
    sim["apps"] = json!(apps);
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
            sim["last_x402"] = json!({ "resource": resource, "status": "error-factura" });
            return;
        }
    };
    let invoice_id = inv["id"].as_str().unwrap_or_default().to_string();
    // la cuenta paga con dPaaS (real on-chain si la wallet tiene SOL)
    let payment = crate::modules::x402::pay_invoice_value(state, account, &invoice_id).await;
    let (status, tx) = match payment {
        Ok(v) => (
            v["status"].as_str().unwrap_or("verifying").to_string(),
            v["tx_signature"].as_str().map(str::to_string),
        ),
        Err(e) => (format!("sin-fondos ({e})"), None),
    };
    // acceso one-shot si liquidó
    let access = if status == "settled" {
        crate::modules::x402::settle_access(state, &invoice_id, Some(account))
            .map(|_| "ACCESO CONCEDIDO (one-shot)")
            .unwrap_or("error-consume")
    } else {
        "esperando confirmación on-chain"
    };
    sim["last_x402"] = json!({
        "resource": resource,
        "invoice_id": invoice_id,
        "status": status,
        "access": access,
        "tx_signature": tx,
        "lamports": lamports,
    });
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/// GET /api/accounts/me/simulation — estado del OS simulado (retoma el
/// progreso guardado; si no hay, arranca de cero).
pub async fn get_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
) -> AppResult<Response> {
    Ok(Json(json!({ "ok": true, "simulation": load(&state, &auth.account_id) })).into_response())
}

#[derive(Deserialize)]
pub struct StepBody {
    action: String,
    /// Texto del turno de voz (acción `say`).
    #[serde(default)]
    text: Option<String>,
}

/// POST /api/accounts/me/simulation/step {action, text?} — avanza el OS simulado:
///
///   boot      — encender (boot_count++; primer boot → enroll → claim code)
///   claim     — «apretar AGREGAR»: claim + token → ONLINE (flota real)
///   tap       — tocar la pantalla: cicla home ⇄ apps ⇄ x402 ⇄ settings
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
                _ => json!("home"),
            };
            event(&mut sim, "tap");
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
            sim["last_reply"] = json!({ "text": text, "reply": reply, "ts": now_ms() });
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
            sim["stage"] = json!("boot");
            sim_enroll(&state, &mut sim)?;
            sim["boot_count"] = json!(boots);
            sim["taps"] = json!(taps);
            sim["events"] = events;
            event(&mut sim, "rebuild");
        }
        other => {
            return Err(AppError::bad_request(format!(
                "acción «{other}» inválida — boot|claim|tap|heartbeat|apps|x402|rebuild"
            )))
        }
    }

    save(&state, &auth.account_id, &sim);
    Ok(Json(json!({ "ok": true, "simulation": sim })).into_response())
}
