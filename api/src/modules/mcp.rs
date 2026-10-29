//! [ Módulo Medusa MCP ] — cliente MCP hacia el servidor de Medusa Cloud.
//!
//! Habla con un servidor MCP remoto (por defecto el de Medusa:
//! `https://cloud.medusajs.com/mcp`) usando el transporte «Streamable HTTP»:
//! JSON-RPC 2.0 sobre POST, respuesta JSON o SSE, sesión vía header
//! `Mcp-Session-Id`.
//!
//! OAuth: el servidor de Medusa Cloud autentica con OAuth interactivo. Un
//! proceso headless no puede completar ese flujo, así que el token/opciones
//! son manuales:
//!   - `MEDUSA_MCP_TOKEN`: Authorization: Bearer <token> si lo obtienes tras
//!     autorizar el cliente en tu navegador (o el token que tu herramienta
//!     MCP use internamente).
//!   - Alternativa para el agente de desarrollo: `opencode mcp auth medusa-commerce`
//!     (paso interactivo), como describe la guía de Medusa.

use crate::error::{AppError, AppResult};
use crate::state::SharedState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

const PROTOCOL_VERSION: &str = "2025-06-18"; // Streamable HTTP oficial

pub struct McpClient {
    url: String,
    token: Option<String>,
    session: Mutex<Option<String>>,
    server_info: Mutex<Option<Value>>,
    next_id: AtomicI64,
}

impl McpClient {
    pub fn new(url: String, token: Option<String>) -> Self {
        Self {
            url: url.trim_end_matches('/').to_string(),
            token,
            session: Mutex::new(None),
            server_info: Mutex::new(None),
            next_id: AtomicI64::new(1),
        }
    }

    pub fn url(&self) -> &str {
        &self.url
    }

    pub fn has_token(&self) -> bool {
        self.token.is_some()
    }

    pub fn cached_info(&self) -> Option<Value> {
        self.server_info.lock().ok().and_then(|g| g.clone())
    }

    fn truncate(s: &str, max: usize) -> String {
        if s.len() <= max {
            s.to_string()
        } else {
            format!("{}…", &s[..max])
        }
    }

    async fn parse_body(res: reqwest::Response, method: &str) -> Result<Value, String> {
        let ctype = res
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        let text = res
            .text()
            .await
            .map_err(|e| format!("mcp {method}: cuerpo: {e}"))?;

        if ctype.contains("text/event-stream") {
            // Streamable HTTP puede responder SSE: cada evento trae líneas "data: …"
            let mut messages: Vec<Value> = Vec::new();
            for line in text.lines() {
                if let Some(rest) = line.trim().strip_prefix("data:") {
                    let rest = rest.trim();
                    if rest.is_empty() {
                        continue;
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(rest) {
                        messages.push(v);
                    }
                }
            }
            messages
                .into_iter()
                .find(|m| m.get("result").is_some() || m.get("error").is_some())
                .ok_or_else(|| format!("mcp {method}: SSE sin mensaje JSON-RPC"))
        } else {
            serde_json::from_str::<Value>(&text).map_err(|e| {
                format!(
                    "mcp {method}: cuerpo no JSON: {e} — «{}»",
                    Self::truncate(&text, 160)
                )
            })
        }
    }

    /// POST JSON-RPC. `with_session=false` para initialize (no lleva sesión).
    async fn rpc_inner(
        &self,
        http: &reqwest::Client,
        method: &str,
        params: Value,
        with_session: bool,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let body = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });

        let mut req = http
            .post(&self.url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .header("MCP-Protocol-Version", PROTOCOL_VERSION)
            .timeout(Duration::from_secs(20))
            .json(&body);
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        if with_session {
            if let Some(sid) = self.session.lock().ok().and_then(|s| s.clone()) {
                req = req.header("Mcp-Session-Id", sid);
            }
        }

        let res = req.send().await.map_err(|e| format!("mcp {method}: {e}"))?;

        let status = res.status();
        if matches!(status, StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN) {
            return Err("auth_required".to_string());
        }
        if !status.is_success() {
            let snippet = res.text().await.unwrap_or_default();
            return Err(format!("HTTP {status} — {}", Self::truncate(&snippet, 200)));
        }
        if let Some(sid) = res
            .headers()
            .get("mcp-session-id")
            .and_then(|v| v.to_str().ok())
        {
            if let Ok(mut guard) = self.session.lock() {
                *guard = Some(sid.to_string());
            }
        }

        let value = Self::parse_body(res, method).await?;
        if let Some(err) = value.get("error") {
            return Err(format!("JSON-RPC error: {err}"));
        }
        Ok(value.get("result").cloned().unwrap_or(Value::Null))
    }

    /// Live-check barato sin red.
    fn is_session_live(&self) -> bool {
        self.session
            .lock()
            .map(|guard| guard.is_some())
            .unwrap_or(false)
    }

    /// Notificación JSON-RPC (sin id): el servidor puede responder 202 vacío.
    async fn notify(&self, http: &reqwest::Client, method: &str) -> Result<(), String> {
        let body = json!({ "jsonrpc": "2.0", "method": method });
        let mut req = http
            .post(&self.url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .timeout(Duration::from_secs(10))
            .json(&body);
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        if let Some(sid) = self.session.lock().ok().and_then(|s| s.clone()) {
            req = req.header("Mcp-Session-Id", sid);
        }
        let res = req
            .send()
            .await
            .map_err(|e| format!("mcp notify {method}: {e}"))?;
        if res.status().is_client_error() || res.status().is_server_error() {
            let code = res.status();
            let _ = res.text().await;
            return Err(format!("notify {method}: HTTP {code}"));
        }
        Ok(())
    }

    /// Initialize + notifications/initialized; guarda serverInfo.
    pub async fn initialize(&self, http: &reqwest::Client) -> Result<Value, String> {
        let result = self
            .rpc_inner(
                http,
                "initialize",
                json!({
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": { "name": "agent-os-api", "version": env!("CARGO_PKG_VERSION") }
                }),
                false,
            )
            .await?;

        if let Ok(mut guard) = self.server_info.lock() {
            *guard = result.get("serverInfo").cloned();
        }
        let _ = self.notify(http, "notifications/initialized").await;
        Ok(result)
    }

    /// Sesión viva (inicializa si falta).
    async fn ensure_ready(&self, http: &reqwest::Client) -> Result<(), String> {
        if self.is_session_live() {
            return Ok(());
        }
        self.initialize(http).await.map(|_| ())
    }

    pub async fn tools_list(&self, http: &reqwest::Client) -> Result<Value, String> {
        self.ensure_ready(http).await?;
        self.rpc_inner(http, "tools/list", json!({}), true).await
    }

    pub async fn tools_call(
        &self,
        http: &reqwest::Client,
        name: &str,
        args: Value,
    ) -> Result<Value, String> {
        self.ensure_ready(http).await?;
        match self
            .rpc_inner(
                http,
                "tools/call",
                json!({ "name": name, "arguments": args }),
                true,
            )
            .await
        {
            Ok(result) => Ok(result),
            // Sesión expirada/reiniciada del servidor → reconectar una vez.
            Err(e) if e.contains("404") || e.to_lowercase().contains("session") => {
                let _ = self.session.lock().ok().take();
                self.initialize(http).await?;
                self.rpc_inner(
                    http,
                    "tools/call",
                    json!({ "name": name, "arguments": args }),
                    true,
                )
                .await
            }
            Err(e) => Err(e),
        }
    }
}

// ---------------------------------------------------------------------------
// Handlers HTTP
// ---------------------------------------------------------------------------

/// Extrae el texto plano del resultado de tools/call.
fn call_text(result: &Value) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
        for block in content {
            let ty = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match ty {
                "text" => {
                    if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                        parts.push(t.to_string());
                    }
                }
                "resource" => {
                    if let Some(t) = block
                        .get("resource")
                        .and_then(|r| r.get("text"))
                        .and_then(|v| v.as_str())
                    {
                        parts.push(t.to_string());
                    }
                }
                other => parts.push(format!("(contenido no textual: {other})")),
            }
        }
    }
    parts.join("\n")
}

/// Estado resumido del módulo (con probe en vivo si `live`).
pub async fn summary_value(state: &SharedState, live: bool) -> Value {
    let client = &state.mcp;
    let mut out = json!({
        "enabled": true,
        "module": "Medusa MCP (cloud.medusajs.com/mcp)",
        "url": client.url(),
        "auth": if client.has_token() { "token" } else { "oauth-manual" },
        "connected": client.is_session_live(),
        "server_info": client.cached_info().unwrap_or(Value::Null),
    });
    if live {
        match client.initialize(&state.http).await {
            Ok(result) => {
                out["connected"] = json!(true);
                out["protocol"] = result
                    .get("protocolVersion")
                    .cloned()
                    .unwrap_or(Value::Null);
                out["server_info"] = result.get("serverInfo").cloned().unwrap_or(Value::Null);
                // intenta contar herramientas (no falla el status si no puede)
                if let Ok(result) = client.tools_list(&state.http).await {
                    out["tools_count"] = json!(result
                        .get("tools")
                        .and_then(|t| t.as_array())
                        .map(|a| a.len())
                        .unwrap_or(0));
                }
            }
            Err(e) if e == "auth_required" => {
                out["connected"] = json!(false);
                out["auth_required"] = json!(true);
                out["hint"] = json!([
                    "El servidor Medusa MCP usa OAuth interactivo. Autoriza desde un cliente MCP:",
                    "· opencode: agrega {\"medusa-commerce\": {\"type\": \"remote\", \"url\": \"https://cloud.medusajs.com/mcp\"}} a la config y corre: opencode mcp auth medusa-commerce",
                    "· Claude Code: claude mcp add --transport http medusa-commerce https://cloud.medusajs.com/mcp && /mcp → Authenticate",
                    "· Cursor: .cursor/mcp.json + Settings > Tools & MCPs > Connect",
                    "Luego (si obtienes un token/opción fast brainstorm) pon MEDUSA_MCP_TOKEN o usa los mismos headers.",
                ]);
            }
            Err(e) => {
                out["connected"] = json!(false);
                out["error"] = json!(e);
            }
        }
    }
    out
}

#[derive(Deserialize)]
pub struct McpCallBody {
    pub tool: String,
    #[serde(default)]
    pub arguments: Value,
}

pub async fn status_handler(State(state): State<SharedState>) -> impl IntoResponse {
    Json(summary_value(&state, true).await)
}

pub async fn tools_handler(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    let result = state
        .mcp
        .tools_list(&state.http)
        .await
        .map_err(|e| map_mcp_error(&e))?;
    let tools = result.get("tools").cloned().unwrap_or(Value::Array(vec![]));
    Ok(Json(
        json!({ "ok": true, "url": state.mcp.url(), "tools": tools }),
    ))
}

pub async fn call_handler(
    State(state): State<SharedState>,
    Json(body): Json<McpCallBody>,
) -> impl IntoResponse {
    if body.tool.trim().is_empty() {
        return AppError::bad_request("tool vacía").into_response();
    }
    let args = if body.arguments.is_null() {
        json!({})
    } else {
        body.arguments
    };

    match state
        .mcp
        .tools_call(&state.http, body.tool.trim(), args)
        .await
    {
        Ok(result) => {
            let is_error = result
                .get("isError")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let payload = json!({
                "ok": !is_error,
                "tool": body.tool,
                "text": call_text(&result),
                "content": result.get("content"),
                "raw": result,
            });
            Json(payload).into_response()
        }
        Err(e) => map_mcp_error(&e).into_response(),
    }
}

pub fn map_mcp_error_pub(e: &str) -> AppError {
    map_mcp_error(e)
}

fn map_mcp_error(e: &str) -> AppError {
    if e == "auth_required" || e.starts_with("auth_required") {
        return AppError::unavailable(
            "Medusa MCP requiere OAuth interactivo. Autoriza desde un cliente MCP (opencode mcp \
             auth medusa-commerce / claude mcp add … / Cursor) o pon MEDUSA_MCP_TOKEN.",
        );
    }
    if e.contains("JSON-RPC error") {
        return AppError::bad_request(e.to_string());
    }
    AppError::unavailable(format!("Medusa MCP: {e}"))
}
