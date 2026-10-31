//! Métricas de tokens reportadas por el proveedor LLM.
//!
//! Brain envía únicamente los contadores de uso devueltos por cada completion.
//! La API deriva cuenta, red y entorno del Bearer (cuenta o dispositivo); nunca
//! acepta una etiqueta de entorno enviada por el cliente.

use crate::db::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::modules::accounts::AuthedAccount;
use crate::modules::devices;
use crate::modules::x402;
use crate::state::SharedState;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
pub struct CompletionUsage {
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
}

#[derive(Debug, Deserialize)]
pub struct RecordUsageBody {
    provider: String,
    model: String,
    events: Vec<CompletionUsage>,
}

#[derive(Debug, Deserialize)]
pub struct LlmUsageQuery {
    environment: Option<String>,
    days: Option<u32>,
}

/// POST /api/accounts/me/llm-usage — ingestión interna desde Brain.
/// El token de dispositivo liga el consumo al simulador; un token de cuenta
/// se clasifica por la red activa en account_chain.
pub async fn record_llm_usage_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<RecordUsageBody>,
) -> AppResult<Response> {
    let (account_id, device_id) = devices::resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("uso LLM requiere Bearer de cuenta o dispositivo"))?;

    let provider = body.provider.trim();
    let model = body.model.trim();
    if provider.is_empty() || provider.len() > 100 {
        return Err(AppError::bad_request("provider vacío o demasiado largo"));
    }
    if model.is_empty() || model.len() > 200 {
        return Err(AppError::bad_request("model vacío o demasiado largo"));
    }
    if body.events.is_empty() || body.events.len() > 32 {
        return Err(AppError::bad_request(
            "events debe contener entre 1 y 32 completions",
        ));
    }
    for event in &body.events {
        if event.prompt_tokens < 0 || event.completion_tokens < 0 || event.total_tokens <= 0 {
            return Err(AppError::bad_request("contadores de tokens inválidos"));
        }
        if event
            .prompt_tokens
            .checked_add(event.completion_tokens)
            .is_none()
        {
            return Err(AppError::bad_request("contadores de tokens fuera de rango"));
        }
    }

    let (environment, network) = x402::execution_context(&state, &account_id, device_id.as_deref());
    let created_at = now_ms();
    let inserted = state.db.with(|conn| {
        for event in &body.events {
            conn.execute(
                "INSERT INTO llm_usage_events \
                 (id, account_id, provider, model, prompt_tokens, completion_tokens, total_tokens, \
                  execution_environment, network, device_id, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    new_id("llmusage"),
                    account_id,
                    provider,
                    model,
                    event.prompt_tokens,
                    event.completion_tokens,
                    event.total_tokens,
                    environment,
                    network,
                    device_id,
                    created_at
                ],
            )?;
        }
        Ok::<usize, rusqlite::Error>(body.events.len())
    })?;

    Ok(Json(json!({
        "ok": true,
        "recorded": inserted,
        "execution_environment": environment,
        "network": network,
    }))
    .into_response())
}

/// GET /api/accounts/me/llm-usage — agregados para el panel por entorno.
pub async fn me_llm_usage_handler(
    State(state): State<SharedState>,
    auth: AuthedAccount,
    Query(query): Query<LlmUsageQuery>,
) -> AppResult<Response> {
    let environment = match query.environment.as_deref().map(str::trim) {
        None | Some("") => None,
        Some("production" | "prod") => Some("production"),
        Some("sandbox") => Some("sandbox"),
        Some(other) => {
            return Err(AppError::bad_request(format!(
                "environment inválido «{other}»: usa production o sandbox"
            )))
        }
    };
    let days = query.days.unwrap_or(14);
    if !matches!(days, 7 | 14 | 30 | 90) {
        return Err(AppError::bad_request("days debe ser 7, 14, 30 o 90"));
    }
    let usage_since = now_ms() - i64::from(days) * 24 * 60 * 60 * 1_000;
    let scope = match environment {
        Some("production") => " AND execution_environment = 'production' AND network = 'mainnet'",
        Some("sandbox") => " AND execution_environment = 'sandbox' AND network != 'mainnet'",
        _ => "",
    };

    let groups: Vec<Value> = state.db.with(|conn| {
        let mut stmt = conn.prepare(&format!(
            "SELECT provider, model, COUNT(*), SUM(prompt_tokens), SUM(completion_tokens), \
                    SUM(total_tokens), MAX(created_at) \
             FROM llm_usage_events WHERE account_id = ?1 AND created_at >= ?2{scope} \
             GROUP BY provider, model ORDER BY SUM(total_tokens) DESC"
        ))?;
        let rows = stmt.query_map(params![auth.account_id, usage_since], |row| {
            Ok(json!({
                "provider": row.get::<_, String>(0)?,
                "model": row.get::<_, String>(1)?,
                "completion_calls": row.get::<_, i64>(2)?,
                "prompt_tokens": row.get::<_, i64>(3)?,
                "completion_tokens": row.get::<_, i64>(4)?,
                "total_tokens": row.get::<_, i64>(5)?,
                "last_used_at": row.get::<_, i64>(6)?,
            }))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
    })?;

    let daily_usage: Vec<Value> = state.db.with(|conn| {
        let mut stmt = conn.prepare(&format!(
            "SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch'), \
                    SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens) \
             FROM llm_usage_events WHERE account_id = ?1 AND created_at >= ?2{scope} \
             GROUP BY 1 ORDER BY 1"
        ))?;
        let rows = stmt.query_map(params![auth.account_id, usage_since], |row| {
            Ok(json!({
                "date": row.get::<_, String>(0)?,
                "prompt_tokens": row.get::<_, i64>(1)?,
                "completion_tokens": row.get::<_, i64>(2)?,
                "total_tokens": row.get::<_, i64>(3)?,
            }))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
    })?;

    let (prompt_tokens, completion_tokens, total_tokens, completion_calls) =
        groups
            .iter()
            .fold((0_i64, 0_i64, 0_i64, 0_i64), |sum, row| {
                (
                    sum.0 + row["prompt_tokens"].as_i64().unwrap_or(0),
                    sum.1 + row["completion_tokens"].as_i64().unwrap_or(0),
                    sum.2 + row["total_tokens"].as_i64().unwrap_or(0),
                    sum.3 + row["completion_calls"].as_i64().unwrap_or(0),
                )
            });

    Ok(Json(json!({
        "ok": true,
        "environment": environment,
        "period_days": days,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "completion_calls": completion_calls,
        "usage": groups,
        "daily_usage": daily_usage,
    }))
    .into_response())
}
