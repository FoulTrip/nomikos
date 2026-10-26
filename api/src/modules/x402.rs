//! [ Módulo x402 Solana ] — liquida micro-peajes en background.
//!
//! Facturas entrantes (`x402_invoices`): el cliente paga transferiendo SOL al
//! `payee` y registra la firma; el settler comprueba la confirmación on-chain
//! en background hasta agotar intentos.
//!
//! Liquidaciones salientes (`x402_payouts`): se encolan vía `POST
//! /api/x402/pay` y el settler las firma + envía + confirma con el keypair de
//! `SOLANA_PAYER_KEYPAIR`. Sin ese keypair el endpoint responde 503.

use crate::crypto;
use crate::db::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::modules::solana::{self, SolanaClient};
use crate::state::SharedState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct Invoice {
    pub id: String,
    pub resource: String,
    pub amount_lamports: i64,
    pub payee: String,
    pub status: String, // pending | verifying | settled | failed
    pub tx_signature: Option<String>,
    pub confirmation_status: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    /// Cuenta que debe pagar (multi-tenant; "system" = global).
    pub account_id: String,
    /// Fase 3 — anti-replay: timestamp de consumo (X-Payment one-shot).
    /// None = factura vigente; Some = ya fue usada → reintento → 409.
    pub consumed_at: Option<i64>,
    /// NomikOS Fase 1 — dispositivo que provocó el peaje (si el Bearer
    /// era un token de dispositivo).
    pub device_id: Option<String>,
    /// Cómo pagar esta factura (texto).
    pub pay_hint: String,
}

const INVOICE_COLS: &str =
    "id, resource, amount_lamports, payee, status, tx_signature, confirmation_status, \
     created_at, updated_at, account_id, consumed_at, device_id";

fn row_to_invoice(r: &rusqlite::Row<'_>) -> rusqlite::Result<Invoice> {
    Ok(Invoice {
        id: r.get(0)?,
        resource: r.get(1)?,
        amount_lamports: r.get(2)?,
        payee: r.get(3)?,
        status: r.get(4)?,
        tx_signature: r.get(5)?,
        confirmation_status: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
        account_id: r.get(9)?,
        consumed_at: r.get(10)?,
        device_id: r.get(11)?,
        pay_hint: String::new(),
    })
}

fn invoice_with_hint(mut inv: Invoice, device_name: &str) -> Invoice {
    inv.pay_hint = format!(
        "Transfiere {} lamports a {} (memo «{device_name}»), luego \
         POST /api/x402/invoices/{}/verify con la firma y repite la petición \
         con header X-Payment: {}",
        inv.amount_lamports, inv.payee, inv.id, inv.id
    );
    inv
}

#[derive(Debug, Clone, Serialize)]
pub struct Payout {
    pub id: String,
    pub to_wallet: String,
    pub amount_lamports: i64,
    pub memo: Option<String>,
    pub status: String, // queued | sent | confirmed | failed
    pub tx_signature: Option<String>,
    pub attempts: i64,
    pub error: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    /// Cuenta que firma el pago (dPaaS); "system" = keypair global.
    pub account_id: String,
}

const PAYOUT_COLS: &str =
    "id, to_wallet, amount_lamports, memo, status, tx_signature, attempts, error, \
     created_at, updated_at, account_id";

fn row_to_payout(r: &rusqlite::Row<'_>) -> rusqlite::Result<Payout> {
    Ok(Payout {
        id: r.get(0)?,
        to_wallet: r.get(1)?,
        amount_lamports: r.get(2)?,
        memo: r.get(3)?,
        status: r.get(4)?,
        tx_signature: r.get(5)?,
        attempts: r.get(6)?,
        error: r.get(7)?,
        created_at: r.get(8)?,
        updated_at: r.get(9)?,
        account_id: r.get(10)?,
    })
}

// ---------------------------------------------------------------------------
// Helpers DB
// ---------------------------------------------------------------------------

fn load_invoice(state: &SharedState, id: &str) -> AppResult<Invoice> {
    let inv = state
        .db
        .with(|c| {
            c.query_row(
                &format!("SELECT {INVOICE_COLS} FROM x402_invoices WHERE id = ?1"),
                params![id],
                row_to_invoice,
            )
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::not_found(format!("invoice «{id}» no encontrada"))
            }
            other => AppError::internal(format!("db: {other}")),
        })?;
    Ok(invoice_with_hint(inv, &state.cfg.device_name))
}

fn invoice_value_of(state: &SharedState, inv: Invoice) -> Value {
    let with_hint = invoice_with_hint(inv, &state.cfg.device_name);
    serde_json::to_value(with_hint).unwrap_or(Value::Null)
}

/// (estado, firma, intentos) de una factura.
fn invoice_state_of(state: &SharedState, id: &str) -> Option<(String, Option<String>, i64)> {
    state
        .db
        .with(|c| {
            c.query_row(
                "SELECT status, tx_signature, verify_attempts FROM x402_invoices WHERE id = ?1",
                params![id],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, i64>(2)?)),
            )
        })
        .ok()
}

fn list_invoices(state: &SharedState, status: Option<&str>) -> Vec<Invoice> {
    state
        .db
        .with(|c| {
            let (sql, filter): (String, Vec<&str>) = match status {
                Some(s) => (
                    format!("SELECT {INVOICE_COLS} FROM x402_invoices WHERE status = ?1 ORDER BY created_at DESC LIMIT 100"),
                    vec![s],
                ),
                None => (
                    format!("SELECT {INVOICE_COLS} FROM x402_invoices ORDER BY created_at DESC LIMIT 100"),
                    vec![],
                ),
            };
            let mut stmt = c.prepare(&sql)?;
            let rows = stmt.query_map(rusqlite::params_from_iter(filter), row_to_invoice)?;
            rows.collect()
        })
        .unwrap_or_default()
}

fn list_payouts(state: &SharedState, status: &str) -> Vec<Payout> {
    state
        .db
        .with(|c| {
            let mut stmt = c.prepare(&format!(
                "SELECT {PAYOUT_COLS} FROM x402_payouts WHERE status = ?1 ORDER BY created_at"
            ))?;
            let rows = stmt.query_map(params![status], row_to_payout)?;
            rows.collect()
        })
        .unwrap_or_default()
}

async fn client_for(state: &SharedState) -> AppResult<SolanaClient> {
    let url = state.cfg.solana_url().cloned().ok_or_else(|| {
        AppError::unavailable(format!("SOLANA_NETWORK «{}» desconocida", state.cfg.solana_network))
    })?;
    Ok(SolanaClient::new(state.http.clone(), url))
}

fn default_payee(state: &SharedState) -> Option<String> {
    if let Some(p) = state.cfg.x402_payee.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        return Some(p.to_string());
    }
    solana::resolve_wallet(&state.cfg)
}

// ---------------------------------------------------------------------------
// Facturas: crear / listar / obtener / verificar
// ---------------------------------------------------------------------------

/// JSON de una factura por id (con hint), para handlers y el agente.
pub async fn invoice_value(state: &SharedState, id: &str) -> AppResult<Value> {
    let inv = load_invoice(state, id)?;
    Ok(invoice_value_of(state, inv))
}

struct NewInvoice {
    resource: String,
    amount_lamports: i64,
    account_id: String,
}

/// Crea la factura y devuelve su JSON (con hint de pago). Compatibilidad:
/// cuenta implícita "system".
pub async fn create_invoice_value(
    state: &SharedState,
    resource: &str,
    amount_lamports: i64,
) -> AppResult<Value> {
    create_invoice_value_for(state, resource, amount_lamports, None, None).await
}

/// Versión multi-tenant: `account_id` = Some(cuenta autenticada) | None
/// ("system"). La factura queda ligada a quien debe pagar; `device_id`
/// (NomikOS Fase 1) registra qué dispositivo de la flota la provocó.
#[allow(clippy::too_many_arguments)]
pub async fn create_invoice_value_for(
    state: &SharedState,
    resource: &str,
    amount_lamports: i64,
    account_id: Option<&str>,
    device_id: Option<&str>,
) -> AppResult<Value> {
    let body = NewInvoice {
        resource: resource.trim().to_string(),
        amount_lamports,
        account_id: account_id.unwrap_or("system").to_string(),
    };
    if body.resource.is_empty() {
        return Err(AppError::bad_request("resource vacío"));
    }
    if body.amount_lamports <= 0 {
        return Err(AppError::bad_request("amount_lamports debe ser > 0"));
    }
    let Some(payee) = default_payee(state) else {
        return Err(AppError::unavailable(
            "Sin wallet para cobrar: configura X402_PAYEE_WALLET o SOLANA_WALLET",
        ));
    };

    let id = new_id("x402");
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO x402_invoices (id, resource, amount_lamports, payee, status, \
             account_id, device_id, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7, ?8)",
            params![id, body.resource, body.amount_lamports, payee, body.account_id, device_id, now, now],
        )?;
        Ok(())
    })?;

    let inv = load_invoice(state, &id)?;
    tracing::info!(
        "x402 invoice {id}: {} lamports por «{}» (cuenta {})",
        body.amount_lamports, body.resource, body.account_id
    );
    Ok(invoice_value_of(state, inv))
}

/// Handlers HTTP ------------------------------------------------------------

pub async fn create_invoice_handler(
    State(state): State<SharedState>,
    Json(body): Json<CreateInvoiceBody>,
) -> AppResult<impl IntoResponse> {
    let v = create_invoice_value(&state, &body.resource, body.amount_lamports).await?;
    Ok(Json(v))
}

#[derive(Deserialize)]
pub struct CreateInvoiceBody {
    pub resource: String,
    pub amount_lamports: i64,
}

pub async fn list_handler(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    let invoices = list_invoices(&state, None);
    Ok(Json(json!({ "ok": true, "invoices": invoices })))
}

pub async fn get_handler(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> AppResult<impl IntoResponse> {
    Ok(Json(load_invoice(&state, &id)?))
}

pub async fn payouts_handler(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    let rows: Vec<Payout> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(&format!(
                "SELECT {PAYOUT_COLS} FROM x402_payouts ORDER BY created_at DESC LIMIT 100"
            ))?;
            let rows = stmt.query_map([], row_to_payout)?;
            rows.collect()
        })
        .unwrap_or_default();
    Ok(Json(json!({ "ok": true, "payouts": rows })))
}

#[derive(Deserialize)]
pub struct VerifyBody {
    pub tx_signature: String,
}

/// Verificación inmediata; el settler mantiene reintentos en background.
pub async fn verify_handler(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(body): Json<VerifyBody>,
) -> AppResult<impl IntoResponse> {
    Ok(Json(verify_invoice(&state, &id, body.tx_signature).await?))
}

pub async fn verify_invoice(
    state: &SharedState,
    id: &str,
    tx_signature: String,
) -> AppResult<Value> {
    let tx_signature = tx_signature.trim().to_string();
    if tx_signature.is_empty() {
        return Err(AppError::bad_request("tx_signature vacío"));
    }
    let inv = load_invoice(state, id)?;
    if inv.status == "settled" {
        return Ok(invoice_value_of(state, inv));
    }

    state.db.with(|c| {
        c.execute(
            "UPDATE x402_invoices SET tx_signature = ?1, status = 'verifying', \
             verify_attempts = 0, updated_at = ?2 WHERE id = ?3",
            params![tx_signature, now_ms(), id],
        )?;
        Ok(())
    })?;

    if let Some(next) = attempt_verify(state, id).await {
        return Ok(next);
    }
    Ok(invoice_value_of(state, load_invoice(state, id)?))
}

/// Un intento de verificación on-chain. Devuelve el JSON si el estado cambió;
/// `None` = seguir pendiente (el settler reintenta).
async fn attempt_verify(state: &SharedState, id: &str) -> Option<Value> {
    let (status, sig, attempts) = invoice_state_of(state, id)?;
    if status != "verifying" {
        return None;
    }
    let sig = sig?;

    let client = match client_for(state).await {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("verify x402 {id}: {e}");
            return None;
        }
    };

    match client.get_signature_status(&sig).await {
        Ok(Some((true, conf))) => {
            mark_invoice(state, id, "settled", conf.as_deref());
            Some(invoice_value_of(state, load_invoice(state, id).ok()?))
        }
        Ok(Some((false, err))) => {
            let err = err.unwrap_or_else(|| "tx rechazada on-chain".to_string());
            tracing::warn!("x402 invoice {id} falló: {err}");
            mark_invoice(state, id, "failed", Some(&err));
            Some(invoice_value_of(state, load_invoice(state, id).ok()?))
        }
        Ok(None) => {
            let n = attempts + 1;
            state.db.with(|c| {
                c.execute(
                    "UPDATE x402_invoices SET verify_attempts = ?1, updated_at = ?2 WHERE id = ?3",
                    params![n, now_ms(), id],
                )?;
                Ok(())
            }).ok()?;
            if n >= state.cfg.x402_max_verify_attempts.max(1) as i64 {
                mark_invoice(state, id, "failed", Some("sin confirmación on-chain"));
                Some(invoice_value_of(state, load_invoice(state, id).ok()?))
            } else {
                None
            }
        }
        Err(e) => {
            tracing::warn!("verify x402 {id}: {e}"); // RPC caído → reintenta el settler
            None
        }
    }
}

fn mark_invoice(state: &SharedState, id: &str, status: &str, conf: Option<&str>) {
    let res = state.db.with(|c| {
        c.execute(
            "UPDATE x402_invoices SET status = ?1, confirmation_status = ?2, updated_at = ?3 \
             WHERE id = ?4",
            params![status, conf, now_ms(), id],
        )?;
        Ok(())
    });
    if let Err(e) = res {
        tracing::warn!("mark_invoice {id}: {e}");
    }
}

// ---------------------------------------------------------------------------
// Liquidaciones salientes
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// dPaaS (Fase 4) — firma delegada por cuenta
// ---------------------------------------------------------------------------

/// Firmante y red de un pago delegado.
enum Payer {
    /// keypair global (SOLANA_PAYER_KEYPAIR, cuenta "system").
    System,
    /// dPaaS: keypair descifrado de la cuenta + red de SU cadena.
    Account { network: String, keypair: [u8; 64] },
}

impl Payer {
    fn account_label(&self) -> &str {
        match self {
            Payer::System => "system",
            Payer::Account { .. } => "cuenta",
        }
    }
}

/// Resuelve quién firma un pago: la cuenta (dPaaS, keypair descifrado en
/// memoria) o el keypair global de "system". Es el paso «3. Pide firma»
/// del Gestor de Wallet del diagrama.
fn resolve_payer(state: &SharedState, account_id: &str) -> AppResult<Payer> {
    if account_id == "system" {
        if state.cfg.payer_keypair.is_none() {
            return Err(AppError::unavailable(
                "x402 system: configura SOLANA_PAYER_KEYPAIR (ruta a keypair JSON con fondos)",
            ));
        }
        return Ok(Payer::System);
    }

    // Cuenta autenticada: keypair cifrado en reposo + red de la cuenta.
    let row = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT payer_keypair_enc, network FROM account_chain WHERE account_id = ?1",
                params![account_id],
                |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)),
            )
        })
        .map_err(|_| {
            AppError::bad_request("la cuenta no configuró su cadena (PUT /api/accounts/me/chain)")
        })?;
    let (Some(enc), network) = row else {
        return Err(AppError::bad_request(
            "la cuenta no importó el keypair del orquestador (POST /api/accounts/me/chain/keypair/import)",
        ));
    };
    let mk = state
        .cfg
        .accounts_master_key
        .ok_or_else(|| AppError::unavailable("ACCOUNTS_MASTER_KEY no configurada"))?;
    let raw = crypto::open(&mk, &enc).map_err(|e| AppError::internal(format!("dPaaS: {e}")))?;
    let json = String::from_utf8(raw)
        .map_err(|_| AppError::internal("dPaaS: keypair no es UTF-8"))?;
    let kp = crate::modules::accounts::parse_keypair_str(&json)?;
    Ok(Payer::Account { network, keypair: kp })
}

/// Cliente RPC para una red concreta (la de la cuenta o la global).
/// Cliente RPC por nombre de red (dPaaS usa la red de la cuenta; el
/// faucet de devnet la usa fija).
pub async fn client_for_network(state: &SharedState, network: &str) -> AppResult<SolanaClient> {
    let url = state
        .cfg
        .solana_urls
        .get(network)
        .cloned()
        .ok_or_else(|| AppError::bad_request(format!("red «{network}» desconocida")))?;
    Ok(SolanaClient::new(state.http.clone(), url))
}

/// Cliente RPC del firmante (dPaaS usa la red de la cuenta).
async fn client_for_payer(state: &SharedState, payer: &Payer) -> AppResult<SolanaClient> {
    match payer {
        Payer::System => client_for(state).await,
        Payer::Account { network, .. } => client_for_network(state, network).await,
    }
}

/// Valida los límites dPaaS de la cuenta (tx_limit y daily de 24h).
/// "system" no tiene límites. Sin límites configurados → permite.
fn check_limits(state: &SharedState, account_id: &str, amount: i64) -> AppResult<()> {
    if account_id == "system" {
        return Ok(());
    }
    let (tx_limit, daily_limit) = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT tx_limit_lamports, daily_limit_lamports FROM account_chain WHERE account_id = ?1",
                params![account_id],
                |r| Ok((r.get::<_, Option<i64>>(0)?, r.get::<_, Option<i64>>(1)?)),
            )
        })
        .unwrap_or((None, None));

    if let Some(tx) = tx_limit {
        if amount > tx {
            return Err(AppError::bad_request(format!(
                "excede tx_limit_lamports de la cuenta (max {tx}, solicitado {amount})"
            )));
        }
    }
    if let Some(daily) = daily_limit {
        let used: i64 = state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT COALESCE(SUM(amount_lamports), 0) FROM x402_payouts \
                     WHERE account_id = ?1 AND status != 'failed' AND created_at > ?2",
                    params![account_id, now_ms() - 86_400_000],
                    |r| r.get(0),
                )
            })
            .unwrap_or(0);
        if used + amount > daily {
            return Err(AppError::bad_request(format!(
                "límite diario excedido: usados {used} + {amount} > daily_limit {daily} (últimas 24h)"
            )));
        }
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct PayBody {
    pub to: String,
    pub lamports: i64,
    #[serde(default)]
    pub memo: Option<String>,
}

/// Encola una liquidación saliente (validación + límites dPaaS incluidos).
/// `account_id`: "system" (keypair global) o una cuenta autenticada (dPaaS).
pub async fn pay_value(state: &SharedState, body: PayBody, account_id: &str) -> AppResult<Value> {
    // El firmante debe existir ANTES de encolar (fallo rápido y claro).
    resolve_payer(state, account_id)?;
    if body.to.trim().is_empty() {
        return Err(AppError::bad_request("to vacío"));
    }
    if body.lamports <= 0 {
        return Err(AppError::bad_request("lamports debe ser > 0"));
    }
    check_limits(state, account_id, body.lamports)?;

    let id = new_id("payout");
    let now = now_ms();
    state.db.with(|c| {
        c.execute(
            "INSERT INTO x402_payouts (id, to_wallet, amount_lamports, memo, status, account_id, \
             created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'queued', ?5, ?6, ?6)",
            params![id, body.to.trim(), body.lamports, body.memo, account_id, now],
        )?;
        Ok(())
    })?;

    let payout: Payout = state
        .db
        .with(|c| {
            c.query_row(
                &format!("SELECT {PAYOUT_COLS} FROM x402_payouts WHERE id = ?1"),
                params![id],
                row_to_payout,
            )
        })
        .map_err(|e| AppError::internal(format!("payout {id} tras insertar: {e}")))?;

    tracing::info!(
        "x402 payout {id} encolado (cuenta {account_id}): {} lamports → {}",
        body.lamports, body.to.trim()
    );
    Ok(serde_json::to_value(payout)?)
}

/// POST /api/x402/pay — identidad opcional: con Bearer encola el pago de ESA
/// cuenta (dPaaS); sin token usa el keypair global de "system".
pub async fn pay_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(body): Json<PayBody>,
) -> AppResult<Response> {
    let account = crate::modules::accounts::resolve_account_id(&state, &headers)?
        .unwrap_or_else(|| "system".to_string());
    Ok(Json(pay_value(&state, body, &account).await?).into_response())
}

fn payout_set(
    state: &SharedState,
    id: &str,
    status: &str,
    tx: Option<&str>,
    error: Option<&str>,
) {
    let res = state.db.with(|c| {
        c.execute(
            "UPDATE x402_payouts SET status = ?1, tx_signature = COALESCE(?2, tx_signature), \
             error = COALESCE(?3, CASE WHEN ?1 IN ('confirmed', 'queued') THEN NULL \
             ELSE error END), updated_at = ?4 WHERE id = ?5",
            params![status, tx, error, now_ms(), id],
        )?;
        Ok(())
    });
    if let Err(e) = res {
        tracing::warn!("payout_set {id}: {e}");
    }
}

/// Suma un intento y marca `failed` si se agotan.
fn payout_attempt(state: &SharedState, id: &str, phase: &str, error: &str, max: i64) {
    let updated = state.db.with(|c| {
        c.execute(
            "UPDATE x402_payouts SET attempts = attempts + 1, error = ?1, updated_at = ?2 \
             WHERE id = ?3",
            params![format!("{phase}: {error}"), now_ms(), id],
        )?;
        let attempts: i64 = c.query_row(
            "SELECT attempts FROM x402_payouts WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )?;
        if attempts >= max {
            c.execute(
                "UPDATE x402_payouts SET status = 'failed', updated_at = ?1 WHERE id = ?2",
                params![now_ms(), id],
            )?;
        }
        Ok(attempts)
    });
    match updated {
        Ok(n) if n >= max => tracing::warn!("x402 payout {id} agotó intentos: {error}"),
        Ok(_) => tracing::debug!("x402 payout {id} reintento pendiente: {error}"),
        Err(e) => tracing::warn!("payout_attempt {id}: {e}"),
    }
}

/// Dos fases: queued → firmar+enviar (dPaaS: keypair de la cuenta, SU red);
/// sent → confirmar on-chain (RPC de la misma red).
async fn advance_payouts(state: &SharedState) {
    for p in list_payouts(state, "queued") {
        // Resuelve el firmante por cuenta (paso «3. Pide firma» del diagrama).
        let payer = match resolve_payer(state, &p.account_id) {
            Ok(p) => p,
            Err(e) => {
                payout_attempt(state, &p.id, "resolve", &e.message, 3);
                continue;
            }
        };
        let client = match client_for_payer(state, &payer).await {
            Ok(c) => c,
            Err(e) => {
                payout_attempt(state, &p.id, "rpc", &e.message, 3);
                continue;
            }
        };

        let sent = match &payer {
            Payer::System => {
                let path = state.cfg.payer_keypair.clone().unwrap_or_default();
                solana::transfer_lamports(&client, &path, &p.to_wallet, p.amount_lamports as u64)
                    .await
            }
            Payer::Account { keypair, .. } => {
                solana::transfer_lamports_with_kp(&client, keypair, &p.to_wallet, p.amount_lamports as u64)
                    .await
            }
        };

        match sent {
            Ok(sig) => {
                payout_set(state, &p.id, "sent", Some(&sig), None);
                tracing::info!(
                    "x402 payout {} enviada por {} → {sig} (esperando confirmación)",
                    p.id, payer.account_label()
                );
            }
            Err(e) => {
                payout_attempt(state, &p.id, "send", &e, 3);
            }
        }
    }

    for p in list_payouts(state, "sent") {
        let Some(sig) = p.tx_signature.clone() else { continue };
        // Confirmar en la red del firmante de esa cuenta.
        let Ok(payer) = resolve_payer(state, &p.account_id) else { continue };
        let Ok(client) = client_for_payer(state, &payer).await else { continue };
        match client.get_signature_status(&sig).await {
            Ok(Some((true, _conf))) => {
                payout_set(state, &p.id, "confirmed", None, None);
                tracing::info!("x402 payout {} confirmado on-chain ({})", p.id, payer.account_label());
            }
            Ok(Some((false, err))) => {
                payout_set(state, &p.id, "failed", None, err.as_deref());
            }
            Ok(None) => {
                payout_attempt(state, &p.id, "confirm", "sin confirmación on-chain aún", 10);
            }
            Err(e) => {
                tracing::warn!("x402 confirm {}: {e}", p.id); // RPC caído → reintenta
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Gateway 402 reactivo (Fase 3) — helpers de respuesta
// ---------------------------------------------------------------------------

/// Respuesta 402 estándar del gateway: invoice + WWW-Authenticate: X402.
pub fn payment_required_response(invoice: Value, message: &str) -> Response {
    let id = invoice.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let mut res = Json(json!({
        "ok": false,
        "error": message,
        "invoice": invoice,
        "how": [
            "1. Transfiere invoice.amount_lamports a invoice.payee.",
            "2. POST /api/x402/invoices/{id}/verify con {\"tx_signature\": …}",
            "3. Repite la petición con header X-Payment: {id} (un solo uso)."
        ]
    }))
    .into_response();
    *res.status_mut() = StatusCode::PAYMENT_REQUIRED;
    let _ = res
        .headers_mut()
        .insert("WWW-Authenticate", HeaderValue::from_static("X402"));
    if let Ok(v) = HeaderValue::from_str(&id) {
        res.headers_mut().insert("X-Payment-Invoice-Id", v);
    }
    res
}

fn error_response(status: StatusCode, message: &str) -> Response {
    let mut res = Json(json!({ "ok": false, "error": message })).into_response();
    *res.status_mut() = status;
    res
}

/// Verifica un `X-Payment` y consume la factura (one-shot anti-replay).
///
/// Reglas (handshake del diagrama, paso 5):
///  - la factura debe existir y pertenecer al pagador (cuenta o "system")
///  - debe estar `settled` on-chain y NO consumida
///  - al aceptarse, marca `consumed_at` → cualquier reintento → 409
///
/// `Ok(())` = acceso concedido (la factura quedó consumida; el llamador decide
/// qué responder: el middleware ejecuta el recurso, el demo responde JSON).
/// `Err(Response)` = 402/403/404/409 con el error correspondiente.
/// Verifica la factura (ownership + settled + anti-replay) **SIN consumirla**.
/// Para gateways que cobran solo si el servicio se prestó (NomikOS
/// app-request: la app responde → recién entonces se consume el peaje).
pub fn verify_access(
    state: &SharedState,
    invoice_id: &str,
    payer_account: Option<&str>,
) -> Result<(), Response> {
    let row = state.db.with(|c| {
        c.query_row(
            "SELECT account_id, status, consumed_at, resource FROM x402_invoices WHERE id = ?1",
            params![invoice_id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                    r.get::<_, String>(3)?,
                ))
            },
        )
    });
    let (inv_account, status, consumed, _resource) = match row {
        Ok(v) => v,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err(error_response(
                StatusCode::NOT_FOUND,
                &format!("factura X-Payment «{invoice_id}» no encontrada"),
            ));
        }
        Err(e) => return Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}"))),
    };

    // Ownership: el pagador solo puede usar facturas de SU cuenta.
    let expected = payer_account.unwrap_or("system");
    if inv_account != expected {
        return Err(error_response(
            StatusCode::FORBIDDEN,
            "factura de otra cuenta (X-Payment no corresponde a esta identidad)",
        ));
    }

    // Anti-replay: factura de un solo uso.
    if consumed.is_some() {
        return Err(error_response(
            StatusCode::CONFLICT,
            "invoice ya consumida (replay detectado) — paga un nuevo micro-peaje",
        ));
    }

    // Debe estar settled on-chain.
    if status != "settled" {
        let inv = match load_invoice(state, invoice_id) {
            Ok(i) => invoice_value_of(state, i),
            Err(e) => return Err(e.into_response()),
        };
        return Err(payment_required_response(inv, "Pago aún no confirmado on-chain"));
    }

    Ok(())
}

/// Consume la factura (one-shot). Llamar SOLO tras `verify_access`.
pub fn consume_access(state: &SharedState, invoice_id: &str) -> Result<(), Response> {
    let updated = state
        .db
        .with(|c| {
            Ok(c.execute(
                "UPDATE x402_invoices SET consumed_at = ?1, updated_at = ?1 \
                 WHERE id = ?2 AND consumed_at IS NULL",
                params![now_ms(), invoice_id],
            )?)
        })
        .map_err(|e| error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")))?;
    if updated == 0 {
        return Err(error_response(
            StatusCode::CONFLICT,
            "invoice ya consumida (replay detectado) — paga un nuevo micro-peaje",
        ));
    }
    tracing::info!("x402 acceso concedido con {invoice_id} (consumida, one-shot)");
    Ok(())
}

pub fn settle_access(
    state: &SharedState,
    invoice_id: &str,
    payer_account: Option<&str>,
) -> Result<(), Response> {
    verify_access(state, invoice_id, payer_account)?;
    consume_access(state, invoice_id)
}

// ---------------------------------------------------------------------------
// Endpoint protegido demo (literal 402 Payment Required)
// ---------------------------------------------------------------------------

/// Handshake reactivo del diagrama: sin X-Payment → 402 + invoice;
/// con X-Payment settled → acceso one-shot; reintento → 409.
/// Con Authorization: Bearer → la factura es de ESA cuenta.
pub async fn protected(State(state): State<SharedState>, headers: HeaderMap) -> Response {
    // Identidad opcional (token inválido → 401, no se ignora).
    let account = match crate::modules::accounts::resolve_account_id(&state, &headers) {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };

    if let Some(v) = headers
        .get("x-payment")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return match settle_access(&state, v, account.as_deref()) {
            Ok(()) => Json(json!({
                "ok": true,
                "message": "Pago verificado on-chain — acceso concedido",
                "invoice_id": v,
                "consumed": true,
            }))
            .into_response(),
            Err(r) => r,
        };
    }

    // Sin pago: factura nueva del recurso demo para esta cuenta.
    match create_invoice_value_for(&state, "x402/protected-demo", 1_000, account.as_deref(), None).await {
        Ok(invoice) => payment_required_response(
            invoice,
            "Payment Required (x402): paga el micro-peaje para acceder",
        ),
        Err(e) => e.into_response(),
    }
}

// ---------------------------------------------------------------------------
// Middleware del gateway — protege X402_PROTECTED_PATHS (matching exacto)
// ---------------------------------------------------------------------------

/// Fase 3 — Gateway 402 reactivo del diagrama:
///  1. HTTP Request (sin X-Payment) → 402 + invoice del recurso
///  2. Orquestador paga (firma delegada) y reintenta con X-Payment
///  3. Factura settled + no consumida → acceso one-shot; reintento → 409
pub async fn x402_gate(
    State(state): State<SharedState>,
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let path = req.uri().path().to_string();
    if !state.cfg.x402_protected_paths.iter().any(|p| p == &path) {
        return next.run(req).await;
    }

    let headers = req.headers().clone();
    // Identidad opcional: token inválido → 401 antes de emitir factura.
    // Un token de DISPOSITIVO (sesión con device_id) liga la factura al
    // dispositivo que la provocó (NomikOS Fase 1).
    let (account, device) = match crate::modules::devices::resolve_identity(&state, &headers) {
        Ok(Some((acc, dev))) => (Some(acc), dev),
        Ok(None) => (None, None),
        Err(e) => return e.into_response(),
    };

    // ¿Viene pago? → verificar y consumir (one-shot); concedido → ejecutar el recurso.
    if let Some(inv) = headers
        .get("x-payment")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return match settle_access(&state, inv, account.as_deref()) {
            Ok(()) => next.run(req).await, // peaje consumido → recurso real
            Err(r) => r,
        };
    }

    // Sin pago → 402 con factura del recurso (para esta cuenta/dispositivo).
    let resource = format!("x402:path:{path}");
    match create_invoice_value_for(
        &state,
        &resource,
        state.cfg.x402_path_lamports,
        account.as_deref(),
        device.as_deref(),
    )
    .await
    {
        Ok(invoice) => {
            tracing::info!("x402 gate: 402 para «{path}» (recurso {resource})");
            payment_required_response(
                invoice,
                "Payment Required (x402): paga el micro-peaje para acceder",
            )
        }
        Err(e) => e.into_response(),
    }
}

// ---------------------------------------------------------------------------
// dPaaS por cuenta (Fase 4) — endpoints autenticados
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PayInvoiceBody {
    pub invoice_id: String,
}

/// Handshake dPaaS completo: factura de la cuenta → firma delegada con el
/// keypair DE LA cuenta → envío a SU red → verificación on-chain (poll corto).
/// Devuelve la factura lista para el reintento con X-Payment.
pub async fn pay_invoice_value(
    state: &SharedState,
    account_id: &str,
    invoice_id: &str,
) -> AppResult<Value> {
    let inv = load_invoice(state, invoice_id)?;
    if inv.account_id != account_id {
        return Err(AppError::forbidden("factura de otra cuenta (no puedes pagarla)"));
    }
    if inv.status == "settled" {
        return Ok(invoice_value_of(state, inv)); // ya pagada
    }
    if inv.status != "pending" && inv.status != "verifying" {
        return Err(AppError::bad_request(format!("factura en estado no pagable: {}", inv.status)));
    }

    // Límites dPaaS antes de firmar.
    check_limits(state, account_id, inv.amount_lamports)?;

    if inv.status == "pending" {
        // «3. Pide firma» — el Gestor de Wallet de la CUENTA firma en background.
        let payer = resolve_payer(state, account_id)?;
        let Payer::Account { keypair, network } = payer else {
            return Err(AppError::internal("dPaaS: firmante inesperado"));
        };
        let client = client_for_network(state, &network).await?;
        let sig = solana::transfer_lamports_with_kp(&client, &keypair, &inv.payee, inv.amount_lamports as u64)
            .await
            .map_err(|e| {
                AppError::bad_request(format!(
                    "firma delegada falló (wallet de la cuenta sin fondos o RPC rechazó): {e}"
                ))
            })?;
        tracing::info!("dPaaS: factura {invoice_id} firmada por la cuenta → {sig}");
        state.db.with(|c| {
            c.execute(
                "UPDATE x402_invoices SET tx_signature = ?1, status = 'verifying', \
                 verify_attempts = 0, updated_at = ?2 WHERE id = ?3",
                params![sig, now_ms(), invoice_id],
            )?;
            Ok(())
        })?;
    }

    // Poll corto de confirmación; el settler sigue en background si no llega.
    for _ in 0..7 {
        if let Some(v) = attempt_verify(state, invoice_id).await {
            return Ok(v);
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    Ok(invoice_value_of(state, load_invoice(state, invoice_id)?))
}

/// POST /api/accounts/me/x402/pay-invoice — pagar una factura propia con la
/// wallet delegada de la cuenta (el usuario nunca firma).
pub async fn me_x402_pay_invoice_handler(
    State(state): State<SharedState>,
    auth: crate::modules::accounts::AuthedAccount,
    Json(body): Json<PayInvoiceBody>,
) -> AppResult<Response> {
    Ok(Json(pay_invoice_value(&state, &auth.account_id, &body.invoice_id).await?).into_response())
}

/// POST /api/accounts/me/x402/pay — encolar liquidación delegada (dPaaS).
pub async fn me_x402_pay_handler(
    State(state): State<SharedState>,
    auth: crate::modules::accounts::AuthedAccount,
    Json(body): Json<PayBody>,
) -> AppResult<Response> {
    Ok(Json(pay_value(&state, body, &auth.account_id).await?).into_response())
}

/// GET /api/accounts/me/x402/invoices — facturas de la cuenta.
pub async fn me_x402_invoices_handler(
    State(state): State<SharedState>,
    auth: crate::modules::accounts::AuthedAccount,
) -> AppResult<Response> {
    let rows: Vec<Invoice> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(&format!(
                "SELECT {INVOICE_COLS} FROM x402_invoices WHERE account_id = ?1 \
                 ORDER BY created_at DESC LIMIT 100"
            ))?;
            let rows = stmt.query_map(params![auth.account_id], row_to_invoice)?;
            rows.collect()
        })
        .unwrap_or_default();
    let invoices: Vec<Value> = rows.into_iter().map(|i| invoice_value_of(&state, i)).collect();
    Ok(Json(json!({ "ok": true, "invoices": invoices })).into_response())
}

/// GET /api/accounts/me/x402/summary — estado dPaaS de la cuenta:
/// facturas/payouts propios, límites y uso de las últimas 24h.
pub async fn me_x402_summary_handler(
    State(state): State<SharedState>,
    auth: crate::modules::accounts::AuthedAccount,
) -> AppResult<Response> {
    let invoices: Vec<Invoice> = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(&format!(
                "SELECT {INVOICE_COLS} FROM x402_invoices WHERE account_id = ?1"
            ))?;
            let rows = stmt.query_map(params![auth.account_id], row_to_invoice)?;
            rows.collect()
        })
        .unwrap_or_default();

    let mut by_status: std::collections::BTreeMap<String, u64> = Default::default();
    let mut settled_lamports = 0i64;
    for inv in &invoices {
        *by_status.entry(inv.status.clone()).or_insert(0) += 1;
        if inv.status == "settled" {
            settled_lamports += inv.amount_lamports;
        }
    }

    let payouts: Value = state
        .db
        .with(|c| {
            let mut stmt = c.prepare(
                "SELECT status, COUNT(*), COALESCE(SUM(amount_lamports), 0) \
                 FROM x402_payouts WHERE account_id = ?1 GROUP BY status",
            )?;
            let mut rows = stmt.query_map(params![auth.account_id], |r| {
                Ok(json!({ "status": r.get::<_, String>(0)?, "count": r.get::<_, i64>(1)?,
                           "lamports": r.get::<_, i64>(2)? }))
            })?;
            let mut out = Vec::new();
            while let Some(row) = rows.next() {
                out.push(row?);
            }
            Ok(Value::Array(out))
        })
        .unwrap_or(json!([]));

    let (tx_limit, daily_limit, wallet, payee, network): (Option<i64>, Option<i64>, Option<String>, Option<String>, String) =
        state
            .db
            .with(|c| {
                c.query_row(
                    "SELECT tx_limit_lamports, daily_limit_lamports, wallet_pubkey, payee, network \
                     FROM account_chain WHERE account_id = ?1",
                    params![auth.account_id],
                    |r| {
                        Ok((
                            r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?,
                            r.get::<_, Option<String>>(4)?.unwrap_or_else(|| "devnet".to_string()),
                        ))
                    },
                )
            })
            .unwrap_or((None, None, None, None, "devnet".to_string()));

    // Balance vivo de la wallet dPaaS (best-effort: null si el RPC falla).
    let balance_lamports: Option<i64> = match wallet.as_deref().filter(|w| !w.is_empty()) {
        Some(w) => match client_for_network(&state, &network).await {
            Ok(client) => client.get_balance(w).await.ok(),
            Err(_) => None,
        },
        None => None,
    };

    let daily_used: i64 = state
        .db
        .with(|c| {
            c.query_row(
                "SELECT COALESCE(SUM(amount_lamports), 0) FROM x402_payouts \
                 WHERE account_id = ?1 AND status != 'failed' AND created_at > ?2",
                params![auth.account_id, now_ms() - 86_400_000],
                |r| r.get(0),
            )
        })
        .unwrap_or(0);

    Ok(Json(json!({
        "ok": true,
        "dpaas": {
            "wallet": wallet,
            "network": network,
            "balance_lamports": balance_lamports,
            "payee": payee,
            "tx_limit_lamports": tx_limit,
            "daily_limit_lamports": daily_limit,
            "daily_used_lamports": daily_used,
        },
        "invoices_total": invoices.len(),
        "invoices_by_status": by_status,
        "settled_lamports": settled_lamports,
        "payouts_by_status": payouts,
    }))
    .into_response())
}

// ---------------------------------------------------------------------------
// Resumen para /api/modules y /api/agent/state
// ---------------------------------------------------------------------------

pub async fn summary_value(state: &SharedState) -> AppResult<Value> {
    let invoices = list_invoices(state, None);
    let mut by_status: std::collections::BTreeMap<String, u64> = Default::default();
    let mut settled_lamports = 0i64;
    for inv in &invoices {
        *by_status.entry(inv.status.clone()).or_insert(0) += 1;
        if inv.status == "settled" {
            settled_lamports += inv.amount_lamports;
        }
    }
    let payout_counts: Value = state
        .db
        .with(|c| {
            let mut stmt =
                c.prepare("SELECT status, COUNT(*) FROM x402_payouts GROUP BY status")?;
            let mut rows = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            })?;
            let mut m = serde_json::Map::new();
            while let Some(row) = rows.next() {
                let (status, n): (String, i64) = row?;
                m.insert(status, json!(n));
            }
            Ok(Value::Object(m))
        })
        .unwrap_or(json!({}));

    Ok(json!({
        "enabled": true,
        "module": "Módulo x402 Solana (liquida micro-peajes en background)",
        "network": state.cfg.solana_network_label(),
        "invoices_total": invoices.len(),
        "invoices_by_status": by_status,
        "settled_lamports": settled_lamports,
        "payouts_by_status": payout_counts,
        "payer_configured": state.cfg.payer_keypair.is_some(),
        "payee": default_payee(state),
    }))
}

// ---------------------------------------------------------------------------
// Settler (loop en background)
// ---------------------------------------------------------------------------

pub async fn settler_loop(state: SharedState) {
    let secs = state.cfg.x402_settle_interval_secs.max(1);
    tracing::info!("x402 settler activo (cada {secs}s)");
    loop {
        tokio::time::sleep(Duration::from_secs(secs)).await;
        let verifying: Vec<String> = state
            .db
            .with(|c| {
                let mut stmt = c.prepare("SELECT id FROM x402_invoices WHERE status = 'verifying'")?;
                let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
                rows.collect()
            })
            .unwrap_or_default();
        for id in verifying {
            let _ = attempt_verify(&state, &id).await;
        }
        advance_payouts(&state).await;
    }
}
