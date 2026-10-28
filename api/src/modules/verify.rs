//! [ Verificador legal S2 — workshop (casos nativos dpaas/call) ]
//!
//! Capa externa que el agente NO puede manipular:
//! - Vive en el proceso `api` (Rust :8080), no en `brain`.
//! - Lee `ground_truth/` (0600) del FS; ningún endpoint lo sirve.
//! - Brain escribe runs/turns/memorándum; api evalúa con reglas
//!   deterministas (sin LLM) y bloquea efectos sin `pass`.
//!
//! Estados: draft → submitted → verified|failed → escalated → signed.
//! `refused` si el agente se niega por falta de evidencia.
//! `signoff` one-shot (segundo intento → 409), solo cuenta humana.

use crate::db::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::modules::devices::resolve_identity;
use crate::state::SharedState;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, HeaderValue};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

fn ensure_enabled(state: &SharedState) -> AppResult<()> {
    if !state.cfg.verifier_enabled {
        return Err(AppError::not_found("verificador deshabilitado"));
    }
    Ok(())
}

fn valid_case_id(case_id: &str) -> bool {
    !case_id.is_empty()
        && case_id.len() <= 64
        && case_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn valid_doc_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 128 || !name.ends_with(".md") {
        return false;
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") || name.contains("://") {
        return false;
    }
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

fn cases_dir(state: &SharedState) -> std::path::PathBuf {
    std::path::PathBuf::from(&state.cfg.verifier_cases_dir)
}

fn case_path(state: &SharedState, case_id: &str) -> AppResult<std::path::PathBuf> {
    if !valid_case_id(case_id) {
        return Err(AppError::bad_request("case_id inválido"));
    }
    Ok(cases_dir(state).join(case_id))
}

fn contained(root: &std::path::Path, p: &std::path::Path) -> bool {
    let Ok(root_c) = root.canonicalize() else {
        return false;
    };
    let Ok(p_c) = p.canonicalize() else {
        return false;
    };
    p_c.starts_with(&root_c)
}

// ---------------------------------------------------------------------------
// Helpers DB
// ---------------------------------------------------------------------------

struct RunRow {
    id: String,
    account_id: String,
    case_id: String,
    status: String,
    memorandum: Option<String>,
    signed_at: Option<i64>,
    signed_by: Option<String>,
}

fn load_run(state: &SharedState, run_id: &str) -> AppResult<RunRow> {
    state
        .db
        .with(|c| {
            c.query_row(
                "SELECT id, account_id, case_id, status, memorandum, signed_at, signed_by \
                 FROM legal_runs WHERE id = ?1",
                params![run_id],
                |r| {
                    Ok(RunRow {
                        id: r.get(0)?,
                        account_id: r.get(1)?,
                        case_id: r.get(2)?,
                        status: r.get(3)?,
                        memorandum: r.get(4)?,
                        signed_at: r.get(5)?,
                        signed_by: r.get(6)?,
                    })
                },
            )
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::not_found(format!("run «{run_id}» no encontrado"))
            }
            other => AppError::internal(format!("db: {other}")),
        })
}

fn set_status(state: &SharedState, run_id: &str, status: &str) -> AppResult<()> {
    state.db.with(|c| {
        c.execute(
            "UPDATE legal_runs SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now_ms(), run_id],
        )?;
        Ok(())
    })?;
    Ok(())
}

fn append_event(state: &SharedState, run_id: &str, kind: &str, payload: &Value) -> AppResult<()> {
    let id = new_id("levent");
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO legal_events (id, run_id, kind, payload_json, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, run_id, kind, payload.to_string(), now],
        )?;
        Ok(())
    })?;
    Ok(())
}

fn append_turn(
    state: &SharedState,
    run_id: &str,
    role: &str,
    content: &str,
    tools_json: Option<&Value>,
) -> AppResult<Value> {
    let next_idx: i64 = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT COALESCE(MAX(idx), -1) + 1 FROM legal_turns WHERE run_id = ?1",
                params![run_id],
                |r| r.get(0),
            )
        })
        .unwrap_or(0);
    let id = new_id("lturn");
    let now = now_ms();
    let tools_s = tools_json.map(|v| v.to_string());
    state.db.with(|c| {
        c.execute(
            "INSERT INTO legal_turns (id, run_id, idx, role, content, tools_json, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, run_id, next_idx, role, content, tools_s, now],
        )?;
        Ok(())
    })?;
    Ok(json!({"id": id, "idx": next_idx}))
}

fn list_turns(state: &SharedState, run_id: &str) -> Vec<Value> {
    state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, idx, role, content, tools_json, created_at \
                 FROM legal_turns WHERE run_id = ?1 ORDER BY idx",
            )?;
            let rows = stmt.query_map(params![run_id], |r| {
                let tools_s: Option<String> = r.get(4)?;
                let tools_v: Value = tools_s
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or(Value::Null);
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "idx": r.get::<_, i64>(1)?,
                    "role": r.get::<_, String>(2)?,
                    "content": r.get::<_, String>(3)?,
                    "tools": tools_v,
                    "created_at": r.get::<_, i64>(5)?,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default()
}

fn list_verdicts(state: &SharedState, run_id: &str) -> Vec<Value> {
    state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, verdict, omissions_json, score, created_at \
                 FROM legal_verdicts WHERE run_id = ?1 ORDER BY created_at",
            )?;
            let rows = stmt.query_map(params![run_id], |r| {
                let om_s: String = r.get(2)?;
                let om: Value = serde_json::from_str(&om_s).unwrap_or(json!([]));
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "verdict": r.get::<_, String>(1)?,
                    "omissions": om,
                    "score": r.get::<_, f64>(3)?,
                    "created_at": r.get::<_, i64>(4)?,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default()
}

fn list_events(state: &SharedState, run_id: &str, since_ms: i64) -> Vec<Value> {
    state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, kind, payload_json, created_at FROM legal_events \
                 WHERE run_id = ?1 AND created_at > ?2 ORDER BY created_at",
            )?;
            let rows = stmt.query_map(params![run_id, since_ms], |r| {
                let p_s: Option<String> = r.get(2)?;
                let p: Value = p_s
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or(Value::Null);
                Ok(json!({
                    "id": r.get::<_, String>(0)?,
                    "kind": r.get::<_, String>(1)?,
                    "payload": p,
                    "created_at": r.get::<_, i64>(3)?,
                }))
            })?;
            rows.collect()
        })
        .unwrap_or_default()
}

fn latest_verdict(state: &SharedState, run_id: &str) -> Option<(String, Value, f64)> {
    state
        .db
        .with(|c| {
            c.query_row(
                "SELECT verdict, omissions_json, score FROM legal_verdicts \
                 WHERE run_id = ?1 ORDER BY created_at DESC LIMIT 1",
                params![run_id],
                |r| {
                    let v: String = r.get(0)?;
                    let om_s: String = r.get(1)?;
                    let s: f64 = r.get(2)?;
                    let om: Value = serde_json::from_str(&om_s).unwrap_or(json!([]));
                    Ok((v, om, s))
                },
            )
        })
        .ok()
}

fn run_detail(state: &SharedState, run: &RunRow) -> Value {
    let verdicts = list_verdicts(state, &run.id);
    let last_pass = verdicts
        .last()
        .and_then(|v| v.get("verdict"))
        .and_then(|v| v.as_str())
        == Some("pass");
    // can_sign: solo con último veredicto pass y sin firma (fail-closed:
    // drafts sin veredicto NO son firmables).
    let can_sign = run.signed_at.is_none() && last_pass;
    json!({
        "ok": true,
        "run": {
            "id": run.id,
            "account_id": run.account_id,
            "case_id": run.case_id,
            "status": run.status,
            "memorandum": run.memorandum,
            "signed_at": run.signed_at,
            "signed_by": run.signed_by,
            "can_sign": can_sign,
        },
        "turns": list_turns(state, &run.id),
        "verdicts": verdicts,
        "events": list_events(state, &run.id, 0),
    })
}

// ---------------------------------------------------------------------------
// Casos visibles (cases/ — el agente SÍ puede leer esto)
// ---------------------------------------------------------------------------

/// GET /api/legal/cases/{id}/docs — lista docs visibles + task del caso.
pub async fn list_case_docs_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(case_id): Path<String>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let dir = case_path(&state, case_id.trim())?;
    let docs_dir = dir.join("docs");
    if !docs_dir.is_dir() {
        return Err(AppError::not_found(format!(
            "caso «{account}» no encontrado"
        )));
    }
    let mut docs: Vec<String> = std::fs::read_dir(&docs_dir)
        .map_err(|e| AppError::internal(format!("io: {e}")))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| valid_doc_name(n))
        .collect();
    docs.sort();
    let task: Value = std::fs::read_to_string(dir.join("case.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(json!({}));
    tracing::info!("legal cases docs {} (cuenta {account})", case_id.trim());
    Ok(Json(json!({"ok": true, "case_id": case_id.trim(), "docs": docs, "case": task})).into_response())
}

/// GET /api/legal/cases/{id}/docs/{name} — contenido de un doc visible.
pub async fn get_case_doc_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path((case_id, name)): Path<(String, String)>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    if !valid_doc_name(name.trim()) {
        return Err(AppError::bad_request("nombre de documento inválido"));
    }
    let dir = case_path(&state, case_id.trim())?;
    let docs_dir = dir.join("docs");
    let target = docs_dir.join(name.trim());
    // Antitraversal: el canónico debe seguir dentro de docs/.
    if !contained(&docs_dir, &target) && target.canonicalize().is_ok() {
        return Err(AppError::bad_request("path fuera del caso"));
    }
    let content = std::fs::read_to_string(&target)
        .map_err(|_| AppError::not_found(format!("doc «{}» no encontrado", name.trim())))?;
    if content.len() > 64_000 {
        return Err(AppError::bad_request("documento demasiado grande"));
    }
    tracing::info!("legal doc {}/{} (cuenta {account})", case_id.trim(), name.trim());
    Ok(Json(json!({"ok": true, "case_id": case_id.trim(), "name": name.trim(), "content": content}))
        .into_response())
}

// ---------------------------------------------------------------------------
// Runs (ledger de verificación)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CreateRunBody {
    pub case_id: String,
}

/// POST /api/legal/runs {case_id} — abre un run de verificación.
pub async fn create_run_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<CreateRunBody>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let case_id = body.case_id.trim().to_string();
    let dir = case_path(&state, &case_id)?;
    if !dir.join("case.json").is_file() {
        return Err(AppError::not_found(format!("caso «{case_id}» no encontrado")));
    }
    let id = new_id("run");
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO legal_runs (id, account_id, case_id, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, 'draft', ?4, ?4)",
            params![id, account, case_id, now],
        )?;
        Ok(())
    })?;
    append_event(&state, &id, "created", &json!({"case_id": case_id}))?;
    tracing::info!("legal run {id} caso {case_id} (cuenta {account})");
    let run = load_run(&state, &id)?;
    Ok(Json(run_detail(&state, &run)).into_response())
}

/// GET /api/legal/runs/{id} — detalle (ownership por cuenta).
pub async fn get_run_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let run = load_run(&state, id.trim())?;
    if run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    Ok(Json(run_detail(&state, &run)).into_response())
}

#[derive(Deserialize)]
pub struct TurnBody {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub tools: Option<Value>,
}

/// POST /api/legal/runs/{id}/turns — append de traza (agente/device/humano).
pub async fn append_turn_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<TurnBody>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let run = load_run(&state, id.trim())?;
    if run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    if run.signed_at.is_some() {
        return Err(AppError::conflict("run ya firmado (inmutable)"));
    }
    let role = body.role.trim().to_lowercase();
    if !["agent", "tool", "world", "human"].contains(&role.as_str()) {
        return Err(AppError::bad_request("role inválido: agent|tool|world|human"));
    }
    // Solo api puede escribir role=world (vía /world); el agente no se auto-inyecta.
    if role == "world" {
        return Err(AppError::forbidden("role=world solo vía POST /world"));
    }
    let content = body.content.trim().to_string();
    if content.is_empty() || content.len() > 32_000 {
        return Err(AppError::bad_request("content vacío o demasiado grande (máx 32k)"));
    }
    let t = append_turn(&state, &run.id, &role, &content, body.tools.as_ref())?;
    tracing::info!("legal turn {} run {} ({role})", t["idx"], run.id);
    Ok(Json(json!({"ok": true, "run_id": run.id, "turn": t})).into_response())
}

#[derive(Deserialize)]
pub struct SubmitBody {
    pub memorandum: String,
}

/// POST /api/legal/runs/{id}/submit — entrega memorándum.
/// Fase 1: marca submitted. Fase 2: además ejecuta verify_now() con reglas.
pub async fn submit_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<SubmitBody>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let run = load_run(&state, id.trim())?;
    if run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    if run.signed_at.is_some() {
        return Err(AppError::conflict("run ya firmado (inmutable)"));
    }
    let memo = body.memorandum.trim().to_string();
    if memo.is_empty() || memo.len() > 64_000 {
        return Err(AppError::bad_request("memorandum vacío o demasiado grande (máx 64k)"));
    }
    state.db.with(|c| {
        c.execute(
            "UPDATE legal_runs SET memorandum = ?1, status = 'submitted', updated_at = ?2 WHERE id = ?3",
            params![memo, now_ms(), run.id],
        )?;
        Ok(())
    })?;
    append_turn(&state, &run.id, "agent", &format!("SUBMIT memorándum ({} chars)", memo.len()), None)?;
    append_event(&state, &run.id, "submitted", &json!({"chars": memo.len()}))?;
    // Fase 2: verify_now() — motor de reglas determinista (sin LLM).
    if let Err(e) = verify_now(&state, &run.id).await {
        tracing::warn!("verify_now {}: {e}", run.id);
    }
    let run = load_run(&state, &run.id)?;
    Ok(Json(run_detail(&state, &run)).into_response())
}

/// Motor de reglas S2 — evaluación determinista (sin LLM).
/// Lee ground_truth/{case}/ (checklist.json, rules.json, docs_expected.json)
/// SOLO en este proceso. Nunca loguea el contenido GT, solo ids/conteos.
///
/// verdict=pass ⟺ cero omisiones + cero alucinaciones + min_citations ok
/// + refusal ok (si hay new_evidence no incorporada). Fail-closed: si el
/// GT falta o es ilegible, escribe verdict=fail con omisión GT_ERROR.
pub async fn verify_now(state: &SharedState, run_id: &str) -> AppResult<()> {
    let run = load_run(state, run_id)?;
    let memo = run.memorandum.clone().unwrap_or_default();
    let memo_lc = memo.to_lowercase();

    // GT dir + case_id validados (el run se creó con case validado).
    if !valid_case_id(&run.case_id) {
        return write_fail(state, &run.id, "failed",
            vec![json!({"id": "GT_ERROR", "missing": [], "description": "case_id inválido"})], 0.0)
            .map(|_| ());
    }
    let gt = std::path::PathBuf::from(&state.cfg.verifier_gt_dir).join(&run.case_id);
    let read_json = |name: &str| -> AppResult<Value> {
        let s = std::fs::read_to_string(gt.join(name))
            .map_err(|_| AppError::internal(format!("GT ilegible ({name})")))?;
        serde_json::from_str(&s).map_err(|_| AppError::internal(format!("GT corrupto ({name})")))
    };
    let checklist_v = match read_json("checklist.json") {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("verify {} GT checklist: {e}", run.id);
            return write_fail(state, &run.id, "failed",
                vec![json!({"id": "GT_ERROR", "missing": ["checklist.json"], "description": "ground truth ilegible"})], 0.0)
                .map(|_| ());
        }
    };
    let rules_v = read_json("rules.json").unwrap_or(json!({}));
    let expected_v = read_json("docs_expected.json").unwrap_or(json!({}));

    let min_citations: usize = rules_v.get("min_citations").and_then(|v| v.as_u64()).unwrap_or(1) as usize;
    let forbid_hallu: bool = rules_v.get("forbid_hallucinated_exhibits").and_then(|v| v.as_bool()).unwrap_or(true);
    let req_refusal: bool = rules_v.get("require_refusal_on_missing_evidence").and_then(|v| v.as_bool()).unwrap_or(false);
    let auto_escalate: bool = rules_v.get("auto_escalate").and_then(|v| v.as_bool()).unwrap_or(false);
    let refusal_phrases: Vec<String> = rules_v.get("refusal_phrases")
        .and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_lowercase())).collect())
        .unwrap_or_default();
    let valid_docs: Vec<String> = expected_v.get("valid_docs")
        .and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let valid_citations: Vec<String> = expected_v.get("valid_citations")
        .and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();

    // Docs permitidos = valid_docs + docs inyectados por world/ (new_evidence).
    let mut allowed_docs = valid_docs.clone();
    let world_docs = world_evidence_docs(state, &run.id);
    for w in &world_docs {
        if !allowed_docs.iter().any(|d| d == w) {
            allowed_docs.push(w.clone());
        }
    }

    // 1) Omisiones de checklist (match literal de cada must_cite).
    let mut omissions: Vec<Value> = Vec::new();
    let mut total_w = 0.0f64;
    let mut missed_w = 0.0f64;
    if let Some(items) = checklist_v.as_array() {
        for it in items {
            let id = it.get("id").and_then(|v| v.as_str()).unwrap_or("?").to_string();
            let desc = it.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let w = it.get("weight").and_then(|v| v.as_f64()).unwrap_or(1.0);
            total_w += w;
            let must: Vec<String> = it.get("must_cite").and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let missing: Vec<String> = must.into_iter().filter(|c| !memo.contains(c)).collect();
            if !missing.is_empty() {
                missed_w += w;
                omissions.push(json!({"id": id, "missing": missing, "description": desc}));
            }
        }
    }

    // 2) Alucinaciones: citas `*.md:…` cuyo doc no está permitido.
    let mut hallucinations: Vec<String> = Vec::new();
    if forbid_hallu {
        for tok in extract_md_citations(&memo) {
            let doc = tok.split(':').next().unwrap_or("").to_string();
            if !allowed_docs.iter().any(|d| d == &doc) && !hallucinations.contains(&tok) {
                hallucinations.push(tok);
            }
        }
        for h in &hallucinations {
            omissions.push(json!({"id": "HALLUCINATION", "missing": [h], "description": "cita un exhibit inexistente"}));
        }
    }

    // 3) min_citations: distintas valid_citations presentes (+ docs world citados).
    let mut cited = 0usize;
    for c in &valid_citations {
        if memo.contains(c) {
            cited += 1;
        }
    }
    for w in &world_docs {
        if memo.contains(w) {
            cited += 1;
        }
    }
    if cited < min_citations {
        omissions.push(json!({"id": "MIN_CITATIONS", "missing": [], "description": format!("citas {cited}/{min_citations}")}));
    }

    // 4) Refusal: world docs no incorporados exigen frase de insuficiencia.
    if req_refusal {
        let unincorporated: Vec<&String> = world_docs.iter().filter(|w| !memo.contains(w.as_str())).collect();
        if !unincorporated.is_empty() {
            let has_refusal = refusal_phrases.iter().any(|p| memo_lc.contains(p));
            if !has_refusal {
                omissions.push(json!({"id": "REFUSAL", "missing": unincorporated, "description": "nueva evidencia no incorporada ni rehusada explícitamente"}));
            }
        }
    }

    let score = if total_w > 0.0 { ((total_w - missed_w) / total_w * 100.0).round() / 100.0 } else { 1.0 };
    if omissions.is_empty() {
        write_pass(state, &run.id, score)?;
        tracing::info!("verify {} PASS score={score}", run.id);
    } else {
        let status = if auto_escalate { "escalated" } else { "failed" };
        write_fail(state, &run.id, status, omissions, score)?;
        tracing::info!("verify {} FAIL status={status} score={score}", run.id);
    }
    Ok(())
}

/// Docs inyectados por world/ (kind=new_evidence → payload.doc).
fn world_evidence_docs(state: &SharedState, run_id: &str) -> Vec<String> {
    state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT payload_json FROM legal_events WHERE run_id = ?1 AND kind = 'new_evidence'",
            )?;
            let rows = stmt.query_map(params![run_id], |r| r.get::<_, Option<String>>(0))?;
            let mut out = Vec::new();
            for row in rows.flatten().flatten() {
                if let Ok(v) = serde_json::from_str::<Value>(&row) {
                    if let Some(doc) = v.get("doc").and_then(|d| d.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                        // Solo nombres seguros (los inseguros se ignoran, no rompen).
                        if valid_doc_name(doc) {
                            out.push(doc.to_string());
                        }
                    }
                }
            }
            Ok(out)
        })
        .unwrap_or_default()
}

/// Extrae citas `*.md:sección` del texto (sin regex: scan manual).
/// Acepta backticks/espacios como delimitadores; tope 64 citas.
fn extract_md_citations(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0usize;
    let b = text.as_bytes();
    while i < b.len() && out.len() < 64 {
        // Busca ".md:" desde i.
        let rest = &text[i..];
        let Some(pos) = rest.find(".md:") else { break };
        let dot = i + pos;
        // Inicio del token: retrocede hasta delimitador.
        let mut s = dot;
        while s > 0 {
            let c = b[s - 1] as char;
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                s -= 1;
            } else {
                break;
            }
        }
        // Fin del token: avanza hasta delimitador (sección sin espacios).
        let mut e = dot + 4;
        while e < b.len() {
            let c = b[e] as char;
            if c.is_whitespace() || matches!(c, '`' | '"' | '\'' | '(' | ')' | ',' | ';') {
                break;
            }
            e += 1;
            if e - s > 160 {
                break;
            }
        }
        let tok = text[s..e.min(text.len())].trim().trim_matches('`').to_string();
        if tok.contains(".md:") && tok.len() <= 160 && !out.contains(&tok) {
            // Solo tokens cuyo doc parece nombre de fichero.
            if let Some(doc) = tok.split(':').next() {
                if valid_doc_name(doc) || doc.ends_with(".md") {
                    out.push(tok);
                }
            }
        }
        i = e.max(dot + 1);
    }
    out
}

fn write_pass(state: &SharedState, run_id: &str, score: f64) -> AppResult<()> {
    let id = new_id("lverdict");
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO legal_verdicts (id, run_id, verdict, omissions_json, score, created_at) \
             VALUES (?1, ?2, 'pass', '[]', ?3, ?4)",
            params![id, run_id, score, now],
        )?;
        c.execute(
            "UPDATE legal_runs SET status = 'verified', updated_at = ?1 WHERE id = ?2",
            params![now, run_id],
        )?;
        Ok(())
    })?;
    append_event(state, run_id, "verdict", &json!({"verdict": "pass", "score": score}))?;
    Ok(())
}

fn write_fail(state: &SharedState, run_id: &str, status: &str, omissions: Vec<Value>, score: f64) -> AppResult<()> {
    let id = new_id("lverdict");
    let now = now_ms();
    let om_s = serde_json::to_string(&omissions).unwrap_or_else(|_| "[]".into());
    state.db.with(|c| {
        c.execute(
            "INSERT INTO legal_verdicts (id, run_id, verdict, omissions_json, score, created_at) \
             VALUES (?1, ?2, 'fail', ?3, ?4, ?5)",
            params![id, run_id, om_s, score, now],
        )?;
        c.execute(
            "UPDATE legal_runs SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, run_id],
        )?;
        Ok(())
    })?;
    append_event(state, run_id, "verdict", &json!({"verdict": "fail", "score": score, "omissions": omissions.len()}))?;
    if status == "escalated" {
        append_event(state, run_id, "escalation", &json!({"reason": "auto: verdict fail"}))?;
    }
    Ok(())
}

/// GET /api/legal/runs/{id}/events?since=ms — polling para brain/UI.
pub async fn list_events_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let run = load_run(&state, id.trim())?;
    if run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    let since: i64 = q.get("since").and_then(|v| v.parse().ok()).unwrap_or(0);
    Ok(Json(json!({"ok": true, "run_id": run.id, "events": list_events(&state, &run.id, since)}))
        .into_response())
}

/// GET /api/legal/runs/{id}/checklist — estado por ítem para la UI humana :8765.
/// Deriva pass/missing del GT + último memorándum (solo lectura).
/// El AGENTE no tiene tool para este endpoint: solo humanos vía UI.
/// (El Bearer de la UI vive solo en memoria del navegador.)
pub async fn checklist_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let run = load_run(&state, id.trim())?;
    if run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    if !valid_case_id(&run.case_id) {
        return Err(AppError::bad_request("case_id inválido"));
    }
    let gt = std::path::PathBuf::from(&state.cfg.verifier_gt_dir).join(&run.case_id);
    let checklist_s = std::fs::read_to_string(gt.join("checklist.json"))
        .map_err(|_| AppError::internal("checklist no disponible"))?;
    let checklist_v: Value =
        serde_json::from_str(&checklist_s).map_err(|_| AppError::internal("checklist no disponible"))?;
    let memo = run.memorandum.clone().unwrap_or_default();
    let mut items = Vec::new();
    if let Some(arr) = checklist_v.as_array() {
        for it in arr {
            let cid = it.get("id").and_then(|v| v.as_str()).unwrap_or("?").to_string();
            let desc = it.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let must: Vec<String> = it.get("must_cite").and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let (status, missing) = if memo.is_empty() {
                ("pending", must.clone())
            } else {
                let miss: Vec<String> = must.iter().filter(|c| !memo.contains(c.as_str())).cloned().collect();
                (if miss.is_empty() { "pass" } else { "missing" }, miss)
            };
            items.push(json!({"id": cid, "description": desc, "must_cite": must, "status": status, "missing": missing}));
        }
    }
    let world_docs = world_evidence_docs(&state, &run.id);
    let world: Vec<Value> = world_docs.iter().map(|w| json!({"doc": w, "cited": memo.contains(w)})).collect();
    let last = latest_verdict(&state, &run.id);
    let (verdict, score) = last.map(|(v, _, s)| (v, s)).unwrap_or(("none".into(), 0.0));
    let can_sign = run.signed_at.is_none() && verdict == "pass";
    Ok(Json(json!({
        "ok": true, "run_id": run.id, "status": run.status,
        "checklist": items, "world": world,
        "verdict": verdict, "score": score, "can_sign": can_sign,
    })).into_response())
}

/// GET /api/legal/runs/{id}/stream — SSE snapshot (Fase 1: one-shot).
/// Fase 6: la UI lo consume con fetch-stream + poll.
pub async fn stream_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let run = load_run(&state, id.trim())?;
    if run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    let detail = run_detail(&state, &run);
    let body = format!(
        "event: run\ndata: {}\n\n event: turns\ndata: {}\n\n event: verdicts\ndata: {}\n\n event: events\ndata: {}\n\n",
        serde_json::to_string(detail.get("run").unwrap_or(&Value::Null)).unwrap_or_default(),
        serde_json::to_string(detail.get("turns").unwrap_or(&Value::Null)).unwrap_or_default(),
        serde_json::to_string(detail.get("verdicts").unwrap_or(&Value::Null)).unwrap_or_default(),
        serde_json::to_string(detail.get("events").unwrap_or(&Value::Null)).unwrap_or_default(),
    );
    let mut res = body.into_response();
    res.headers_mut().insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/event-stream"),
    );
    res.headers_mut()
        .insert("Cache-Control", HeaderValue::from_static("no-cache"));
    Ok(res)
}

#[derive(Deserialize)]
pub struct EscalateBody {
    #[serde(default)]
    pub reason: Option<String>,
}

/// POST /api/legal/runs/{id}/escalate — humano/device escala a revisión.
pub async fn escalate_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<EscalateBody>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, _device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta o de dispositivo"))?;
    let run = load_run(&state, id.trim())?;
    if run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    if run.signed_at.is_some() {
        return Err(AppError::conflict("run ya firmado (inmutable)"));
    }
    let reason = body.reason.unwrap_or_default().trim().to_string();
    set_status(&state, &run.id, "escalated")?;
    append_event(&state, &run.id, "escalation", &json!({"reason": reason}))?;
    let run = load_run(&state, &run.id)?;
    Ok(Json(run_detail(&state, &run)).into_response())
}

#[derive(Deserialize)]
pub struct SignoffBody {
    pub attorney: String,
}

/// POST /api/legal/runs/{id}/signoff — firma humana final (one-shot).
/// Fase 1: ownership + one-shot + solo cuenta humana.
/// Fase 2/7: además exige verdict=pass.
pub async fn signoff_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<SignoffBody>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    let (account, device) = resolve_identity(&state, &headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere sesión de cuenta"))?;
    if device.is_some() {
        return Err(AppError::forbidden("un dispositivo no puede firmar (solo cuenta humana)"));
    }
    let run = load_run(&state, id.trim())?;
    if run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    if run.signed_at.is_some() {
        return Err(AppError::conflict("run ya firmado (replay)"));
    }
    let attorney = body.attorney.trim().to_string();
    if attorney.is_empty() || attorney.len() > 128 {
        return Err(AppError::bad_request("attorney vacío o demasiado largo"));
    }
    // Fase 2/7: exigir pass cuando haya veredictos (tras motor de reglas).
    if let Some((v, _om, _s)) = latest_verdict(&state, &run.id) {
        if v != "pass" {
            return Err(AppError::bad_request(format!(
                "no firmable: último veredicto es «{v}» (corrige omisiones y re-submit)"
            )));
        }
    }
    let now = now_ms();
    let updated: usize = state.db.with(|c| {
        Ok(c.execute(
            "UPDATE legal_runs SET status = 'signed', signed_at = ?1, signed_by = ?2, updated_at = ?1 \
             WHERE id = ?3 AND signed_at IS NULL",
            params![now, attorney, run.id],
        )?)
    })?;
    if updated == 0 {
        return Err(AppError::conflict("run ya firmado (replay)"));
    }
    append_event(&state, &run.id, "signoff", &json!({"attorney": attorney}))?;
    tracing::info!("legal signoff {} por {attorney} (cuenta {account})", run.id);
    let run = load_run(&state, &run.id)?;
    Ok(Json(run_detail(&state, &run)).into_response())
}

#[derive(Deserialize)]
pub struct WorldBody {
    pub kind: String,
    #[serde(default)]
    pub doc: Option<String>,
    #[serde(default)]
    pub excerpt: Option<String>,
    #[serde(default)]
    pub payload: Option<Value>,
}

/// POST /api/legal/runs/{id}/world — inyecta evento externo (Fase 3).
/// Fase 1: implementado con auth de cuenta; Fase 3 añade token + validación doc.
pub async fn world_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<WorldBody>,
) -> AppResult<Response> {
    ensure_enabled(&state)?;
    // Auth: Bearer cuenta humana, o VERIFIER_WORLD_TOKEN (Fase 3).
    let caller: Option<String> = resolve_identity(&state, &headers)?.map(|(a, _)| a);
    let token_ok = state.cfg
        .verifier_world_token
        .as_ref()
        .filter(|t| !t.is_empty())
        .and_then(|t| headers.get("x-world-token").and_then(|v| v.to_str().ok()).map(|h| h == t))
        .unwrap_or(false);
    let account = match (caller, token_ok) {
        (Some(a), _) => a,
        (None, true) => {
            // Token sin sesión: el run objetivo define la cuenta (se valida abajo
            // cargando el run primero con el id; aquí se permite pasar).
            String::new()
        }
        _ => return Err(AppError::unauthorized("world requiere Bearer de cuenta o X-World-Token")),
    };
    let run = load_run(&state, id.trim())?;
    if !account.is_empty() && run.account_id != account {
        return Err(AppError::forbidden("run de otra cuenta"));
    }
    if run.signed_at.is_some() {
        return Err(AppError::conflict("run ya firmado (inmutable)"));
    }
    let kind = body.kind.trim().to_string();
    if kind != "new_evidence" {
        return Err(AppError::bad_request("kind inválido (solo new_evidence)"));
    }
    // Fase 3: doc seguro + excerpt acotado. El doc NO se escribe en cases/
    // (el agente solo ve el excerpt del evento; debe citarlo o rehusar).
    let doc = body.doc.unwrap_or_default().trim().to_string();
    if doc.is_empty() || !valid_doc_name(&doc) {
        return Err(AppError::bad_request("doc inválido (nombre .md seguro requerido)"));
    }
    let excerpt = body.excerpt.unwrap_or_default().trim().to_string();
    if excerpt.len() > 4000 {
        return Err(AppError::bad_request("excerpt demasiado grande (máx 4k)"));
    }
    let payload = json!({
        "doc": doc,
        "excerpt": excerpt,
        "extra": body.payload.unwrap_or(Value::Null),
    });
    append_turn(&state, &run.id, "world", &format!("WORLD new_evidence: {}", payload), Some(&payload))?;
    append_event(&state, &run.id, "new_evidence", &payload)?;
    tracing::info!("legal world {} run {}", kind, run.id);
    let run = load_run(&state, &run.id)?;
    Ok(Json(run_detail(&state, &run)).into_response())
}
