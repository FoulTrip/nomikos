//! [ Tienda de dapps del ecosistema ] — el worker lista las apps que el
//! agente puede tener, y las instala LOCALMENTE con un script probado.
//!
//! ```text
//! dapps/registry/<slug>.json   ← el «paquete»: manifiesto (nombre,
//!   │                            descripción, tools[] con specs de llamada)
//!   ▼ (arranque del api → tabla apps)
//! tabla apps: available → installing → installed (+ auth sellada AEAD)
//!   ├─ GET  /api/apps                 ← catálogo (público: placa + panel)
//!   ├─ GET  /api/apps/{slug}          ← manifiesto + estado + log
//!   ├─ POST /api/apps/{slug}/install  ← ejecuta el script testeado
//!   ├─ POST /api/app/request {app}    ← peaje x402:app:{slug}:{…} → proxy
//!   ├─ GET  /api/agent/tools         ← + tools de apps instaladas (MCP)
//!   └─ POST /api/agent/call           ← dispatch dinámico de esas tools
//! ```
//!
//! La instalación corre en background (tokio) y se sondea con
//! `GET /api/apps/{slug}`. Las credenciales de la app (email/password o
//! token del servicio) se sellan con `ACCOUNTS_MASTER_KEY` — el install
//! log NO las contiene (van por un archivo resultado aparte).

use crate::db::now_ms;
use crate::error::{AppError, AppResult};
use crate::modules::accounts::master_key_of;
use crate::modules::devices::resolve_identity;
use crate::state::SharedState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;
use serde_json::{json, Value};

const APP_COLS: &str =
    "slug, name, COALESCE(description,''), COALESCE(version,''), status, base_url, auth_enc, tools";

/// Una fila de la tabla `apps`.
#[derive(Clone)]
pub struct AppRow {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub status: String, // available | installing | installed | failed
    pub base_url: Option<String>,
    pub auth_enc: Option<String>,
    pub tools: String, // JSON: specs de tools (catálogo del MCP manager)
}

fn row_to_app(r: &rusqlite::Row<'_>) -> rusqlite::Result<AppRow> {
    Ok(AppRow {
        slug: r.get(0)?,
        name: r.get(1)?,
        description: r.get(2)?,
        version: r.get(3)?,
        status: r.get(4)?,
        base_url: r.get(5)?,
        auth_enc: r.get(6)?,
        tools: r.get(7)?,
    })
}

pub fn by_slug(state: &SharedState, slug: &str) -> Option<AppRow> {
    state
        .db
        .with(|c| {
            c.query_row(
                &format!("SELECT {APP_COLS} FROM apps WHERE slug = ?1"),
                params![slug],
                row_to_app,
            )
        })
        .ok()
}

/// Primera app instalada (resolución por defecto de /app/request).
pub fn first_installed(state: &SharedState) -> Option<AppRow> {
    state
        .db
        .with(|c| {
            c.query_row(
                &format!(
                    "SELECT {APP_COLS} FROM apps WHERE status = 'installed' \
                     ORDER BY installed_at ASC LIMIT 1"
                ),
                [],
                row_to_app,
            )
        })
        .ok()
}

pub fn all(state: &SharedState) -> Vec<AppRow> {
    state
        .db
        .with(|c| {
            let mut stmt =
                c.prepare(&format!("SELECT {APP_COLS} FROM apps ORDER BY slug"))?;
            let rows = stmt.query_map([], row_to_app)?;
            Ok(rows.collect::<Result<Vec<_>, _>>()?)
        })
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Registro: los manifiestos de dapps/registry entran a la tabla (idempotente)
// ---------------------------------------------------------------------------

/// Carga `dapps/registry/*.json` en la tabla `apps`. Se llama al arranque
/// del api: los manifiestos son la verdad del CATÁLOGO (nombre, tools);
/// la tabla guarda el estado (installed + auth) de cada despliegue.
pub fn load_registry(state: &SharedState) {
    let dir = state.cfg.dapps_registry.trim();
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => {
            tracing::info!("apps: sin registro de dapps ({dir}) — solo la tabla");
            return;
        }
    };
    let mut n = 0usize;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&path) else { continue };
        let Ok(man) = serde_json::from_str::<Value>(&raw) else {
            tracing::warn!("apps: manifiesto inválido {}", path.display());
            continue;
        };
        let Some(slug) = man["slug"].as_str().map(str::to_string) else { continue };
        let name = man["name"].as_str().unwrap_or(&slug).to_string();
        let description = man["description"].as_str().unwrap_or("").to_string();
        let version = man["version"].as_str().unwrap_or("").to_string();
        let tools = man["tools"].to_string();
        state
            .db
            .with(|c| {
                // insertar si no existe; refrescar catálogo si sí (estado y
                // auth quedan — el manifiesto no los toca)
                c.execute(
                    "INSERT INTO apps (slug, name, description, version, status, tools, \
                     created_at, updated_at) \
                     SELECT ?1, ?2, ?3, ?4, 'available', ?5, ?6, ?6 \
                     WHERE NOT EXISTS (SELECT 1 FROM apps WHERE slug = ?1)",
                    params![slug, name, description, version, tools, now_ms()],
                )?;
                c.execute(
                    "UPDATE apps SET name = ?2, description = ?3, version = ?4, tools = ?5, \
                     updated_at = ?6 WHERE slug = ?1",
                    params![slug, name, description, version, tools, now_ms()],
                )?;
                Ok(())
            })
            .ok();
        n += 1;
    }
    tracing::info!("apps: registro cargado ({n} dapps en {dir})");
}

// ---------------------------------------------------------------------------
// Auth de la app (sellada en reposo)
// ---------------------------------------------------------------------------

fn seal_auth(state: &SharedState, auth: &Value) -> AppResult<String> {
    let mk = master_key_of(state)?;
    crate::crypto::seal(&mk, &auth.to_string())
}

pub fn open_auth(state: &SharedState, row: &AppRow) -> Option<Value> {
    let enc = row.auth_enc.as_deref()?;
    let mk = master_key_of(state).ok()?;
    let raw = crate::crypto::open(&mk, enc).ok()?;
    serde_json::from_slice::<Value>(&raw).ok()
}

// ---------------------------------------------------------------------------
// Instalación (POST /api/apps/{slug}/install → script testeado en background)
// ---------------------------------------------------------------------------

/// Ejecuta el instalador y actualiza la tabla. Corre en un task aparte:
/// el estado se sondea con GET /api/apps/{slug}.
async fn run_install(state: SharedState, slug: String) {
    let result_file = format!("/tmp/nomikos-install-{slug}.json");
    let _ = std::fs::remove_file(&result_file);

    let out = tokio::process::Command::new("bash")
        .arg(&state.cfg.app_install_script)
        .arg(&slug)
        .arg(&result_file)
        .output()
        .await;

    let (ok, log) = match out {
        Ok(o) => (
            o.status.success(),
            format!(
                "{}{}",
                String::from_utf8_lossy(&o.stdout),
                String::from_utf8_lossy(&o.stderr)
            ),
        ),
        Err(e) => (false, format!("no pude ejecutar el instalador: {e}")),
    };
    // log sin secretos: las credenciales viajan SOLO en el archivo resultado
    let log: String = log.chars().take(16_000).collect();

    if !ok {
        set_status(&state, &slug, "failed", None, None, Some(&log));
        tracing::warn!("apps: instalación de {slug} FALLÓ (ver /api/apps/{slug})");
        return;
    }

    // el instalador deja {base_url, email?, password?, token?} en result_file
    let parsed: Option<Value> = std::fs::read_to_string(&result_file)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok());
    let Some(res) = parsed else {
        set_status(&state, &slug, "failed", None, None,
            Some(&format!("{log}\n(el instalador no dejó resultado en {result_file})")));
        return;
    };
    let base_url = res["base_url"].as_str().unwrap_or_default().to_string();
    let mut auth = json!({});
    for k in ["token", "email", "password"] {
        if let Some(v) = res[k].as_str() {
            auth[k] = json!(v);
        }
    }
    let sealed = seal_auth(&state, &auth)
        .map_err(|e| {
            tracing::error!("apps: no pude sellar el auth de {slug}: {e}");
            e
        })
        .ok();
    if base_url.is_empty() || sealed.is_none() {
        set_status(&state, &slug, "failed", None, None, Some(&log));
        return;
    }
    set_status(&state, &slug, "installed", Some(&base_url), sealed.as_deref(), Some(&log));
    tracing::info!("apps: {slug} INSTALADA en {base_url} — tools al MCP manager");
}

fn set_status(
    state: &SharedState,
    slug: &str,
    status: &str,
    base_url: Option<&str>,
    auth_enc: Option<&str>,
    log: Option<&str>,
) {
    let _ = state.db.with(|c| {
        // COALESCE: un intento de instalación FALLIDO nunca borra el
        // base_url/auth de una app que ya funcionaba (solo el estado).
        c.execute(
            "UPDATE apps SET status = ?2, base_url = COALESCE(?3, base_url), \
             auth_enc = COALESCE(?4, auth_enc), \
             installed_at = CASE WHEN ?2 = 'installed' THEN ?5 ELSE installed_at END, \
             install_log = ?6, updated_at = ?5 \
             WHERE slug = ?1",
            params![slug, status, base_url, auth_enc, now_ms(), log],
        )?;
        Ok(())
    });
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

fn app_value(state: &SharedState, r: &AppRow, with_log: bool) -> Value {
    let tools: Value = serde_json::from_str(&r.tools).unwrap_or(json!([]));
    let tool_count = tools.as_array().map(|a| a.len()).unwrap_or(0);
    let mut v = json!({
        "slug": r.slug,
        "name": r.name,
        "description": r.description,
        "version": r.version,
        "status": r.status,
        "base_url": r.base_url,
        "tools_count": tool_count,
        // el catálogo de tools solo se expone instalada (la placa/brain
        // consumen exactamente lo que el agente puede llamar)
        "tools": if r.status == "installed" { tools } else { json!([]) },
    });
    if with_log {
        let log_tail: String = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT COALESCE(install_log,'') FROM apps WHERE slug = ?1",
                    params![r.slug],
                    |x| x.get::<_, String>(0),
                )
            })
            .unwrap_or_default();
        v["install_log"] = json!(log_tail);
    }
    v
}

/// GET /api/apps — catálogo público: lo leen la placa (pantalla), el
/// panel y el MCP manager del orquestador.
pub async fn list_handler(State(state): State<SharedState>) -> AppResult<Response> {
    let apps: Vec<Value> = all(&state).iter().map(|r| app_value(&state, r, false)).collect();
    Ok(Json(json!({
        "ok": true,
        "apps": apps,
        "how": "POST /api/apps/{slug}/install (con Bearer de cuenta o dispositivo)",
    }))
    .into_response())
}

/// GET /api/apps/{slug} — manifiesto + estado (+ log si ya instaló algo).
pub async fn get_handler(
    State(state): State<SharedState>,
    Path(slug): Path<String>,
) -> AppResult<Response> {
    let row = by_slug(&state, &slug)
        .ok_or_else(|| AppError::not_found(format!("app «{slug}» no está en el registro del worker")))?;
    Ok(Json(json!({ "ok": true, "app": app_value(&state, &row, true) })).into_response())
}

/// POST /api/apps/{slug}/install — instala la dapp LOCALMENTE con el
/// script probado (idempotente). Requiere sesión (cuenta o dispositivo):
/// es el «apretar AGREGAR» de la placa/panel.
pub async fn install_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> AppResult<Response> {
    // identidad: la cuenta del agente o el propio dispositivo de la flota
    resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("instala con el Bearer de tu cuenta o de tu dispositivo"))?;

    let row = by_slug(&state, &slug)
        .ok_or_else(|| AppError::not_found(format!("app «{slug}» no está en el registro del worker")))?;

    if row.status == "installing" {
        return Err(AppError::conflict("instalación en curso — sondea GET /api/apps/{slug}"));
    }

    set_status(&state, &slug, "installing", None, None, Some("iniciando…"));
    tracing::info!("apps: instalando {slug} (script: {})", state.cfg.app_install_script);
    tokio::spawn(run_install(state.clone(), slug.clone()));

    Ok(Json(json!({
        "ok": true,
        "slug": slug,
        "status": "installing",
        "poll": format!("GET /api/apps/{slug}"),
    }))
    .into_response())
}

// ---------------------------------------------------------------------------
// Tools dinámicas → MCP manager (GET /api/agent/tools + POST /api/agent/call)
// ---------------------------------------------------------------------------

/// Render `{clave}` desde args (string/number → string).
fn render(tpl: &str, args: &Value) -> String {
    let mut out = String::with_capacity(tpl.len() + 16);
    let mut rest = tpl;
    while let Some(i) = rest.find('{') {
        out.push_str(&rest[..i]);
        let Some(j) = rest[i..].find('}') else { break };
        let key = &rest[i + 1..i + j];
        let v = match args.get(key) {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => n.to_string(),
            _ => String::new(),
        };
        out.push_str(&v);
        rest = &rest[i + j + 1..];
    }
    out.push_str(rest);
    out
}

/// Catálogo plano de las tools de las apps INSTALADAS (para el MCP manager:
/// GET /api/agent/tools). Cada tool indica su app y sus argumentos.
pub fn installed_tools_value(state: &SharedState) -> Vec<Value> {
    let mut out = Vec::new();
    for row in all(state).into_iter().filter(|r| r.status == "installed") {
        let Ok(tools) = serde_json::from_str::<Vec<Value>>(&row.tools) else { continue };
        for t in tools {
            let props = t["parameters"]["properties"].clone();
            let required = t["parameters"]["required"].clone();
            out.push(json!({
                "name": t["name"],
                "description": t["description"],
                "app": row.slug,
                "args": props,
                "required": required,
            }));
        }
    }
    out
}

/// Ejecuta una tool de una app instalada (dispatch del MCP manager).
/// Llama a la app SIN peaje — esa es la superficie del sistema; el
/// AGENTE (brain → POST /app/request) es el flujo peajizado.
pub async fn call_dynamic_tool(
    state: &SharedState,
    tool: &str,
    args: &Value,
) -> Option<AppResult<Value>> {
    for row in all(state).into_iter().filter(|r| r.status == "installed") {
        let Ok(tools) = serde_json::from_str::<Vec<Value>>(&row.tools) else { continue };
        for spec in tools {
            if spec["name"].as_str() != Some(tool) {
                continue;
            }
            let call = &spec["call"];
            let method = call["method"].as_str().unwrap_or("GET").to_string();
            let path = render(call["path"].as_str().unwrap_or("/"), args);
            let body: Option<Value> = call["body"].as_object().map(|obj| {
                let mut out = serde_json::Map::new();
                for (k, v) in obj {
                    if let Some(s) = v.as_str() {
                        out.insert(k.clone(), json!(render(s, args)));
                    } else {
                        out.insert(k.clone(), v.clone());
                    }
                }
                Value::Object(out)
            });
            let res = crate::modules::app::fetch_app(state, &row, &method, &path, body).await;
            return Some(res.map(|(status, app_body)| {
                json!({ "app": row.slug, "status": status, "result": app_body })
            }));
        }
    }
    None
}
