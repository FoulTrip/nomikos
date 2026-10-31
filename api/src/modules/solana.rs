//! [ Módulo x402 Solana ]
//!
//! - Sincronización del navbar: red activa, versión del nodo, slot, wallet y
//!   balance en SOL (espejo de `/api/solana/status` del dapp).
//! - Operaciones on-chain: transferencias SOL firmadas con ed25519-dalek y
//!   envío JSON-RPC `sendTransaction` (base64) para liquidar micro-peajes.

use crate::b58;
use crate::config::Config;
use crate::db::{now_ms, ServiceRow};
use crate::state::SharedState;
use base64::Engine as _;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;

#[allow(dead_code)] // documentado: 3 s de probe, igual que el dapp
const TIMEOUT_SECS: u64 = 3;

// ---------------------------------------------------------------------------
// Cliente JSON-RPC
// ---------------------------------------------------------------------------

pub struct SolanaClient {
    http: reqwest::Client,
    url: String,
}

impl SolanaClient {
    pub fn new(http: reqwest::Client, url: impl Into<String>) -> Self {
        Self {
            http,
            url: url.into(),
        }
    }

    pub async fn rpc(&self, method: &str, params: Value) -> Result<Value, String> {
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
        let res = self
            .http
            .post(&self.url)
            .json(&body)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|e| format!("rpc {method}: {e}"))?;
        if !res.status().is_success() {
            return Err(format!("rpc {method}: HTTP {}", res.status()));
        }
        let data: Value = res.json().await.map_err(|e| format!("rpc {method}: {e}"))?;
        if let Some(err) = data.get("error") {
            return Err(format!("rpc {method}: {err}"));
        }
        Ok(data.get("result").cloned().unwrap_or(Value::Null))
    }

    pub async fn get_version(&self) -> Result<String, String> {
        let r = self.rpc("getVersion", json!([])).await?;
        Ok(r.get("solana-core")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string())
    }

    pub async fn get_slot(&self) -> Result<i64, String> {
        let r = self
            .rpc("getSlot", json!([{ "commitment": "confirmed" }]))
            .await?;
        r.as_i64().ok_or_else(|| "getSlot sin slot".to_string())
    }

    pub async fn get_balance(&self, pubkey: &str) -> Result<i64, String> {
        let r = self
            .rpc("getBalance", json!([pubkey, { "commitment": "confirmed" }]))
            .await?;
        r.get("value")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| "getBalance sin value".to_string())
    }

    pub async fn get_latest_blockhash(&self) -> Result<String, String> {
        let r = self.rpc("getLatestBlockhash", json!([{}])).await?;
        r.get("value")
            .and_then(|v| v.get("blockhash"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "getLatestBlockhash sin blockhash".to_string())
    }

    /// None = firma pendiente / desconocida.
    /// Some((true, conf)) = confirmada; Some((false, err)) = rechazada on-chain.
    pub async fn get_signature_status(
        &self,
        sig: &str,
    ) -> Result<Option<(bool, Option<String>)>, String> {
        let r = self
            .rpc(
                "getSignatureStatuses",
                json!([[sig], { "searchTransactionHistory": true }]),
            )
            .await?;
        let entry = r.get("value").and_then(|v| v.get(0));
        match entry {
            None | Some(Value::Null) => Ok(None),
            Some(v) => Ok(signature_status_from_entry(v)),
        }
    }

    /// Transacción con instrucciones interpretadas por el RPC. Se usa para
    /// verificar destinatario, monto y pagador de facturas; el estado de una
    /// firma por sí solo no demuestra que haya pagado el recurso correcto.
    pub async fn get_parsed_transaction(&self, sig: &str) -> Result<Option<Value>, String> {
        let result = self
            .rpc(
                "getTransaction",
                json!([sig, {
                    "encoding": "jsonParsed",
                    "commitment": "confirmed",
                    "maxSupportedTransactionVersion": 0
                }]),
            )
            .await?;
        if result.is_null() {
            Ok(None)
        } else {
            Ok(Some(result))
        }
    }

    pub async fn send_transaction(&self, tx_b64: &str) -> Result<String, String> {
        let r = self
            .rpc(
                "sendTransaction",
                json!([tx_b64, {
                    "encoding": "base64",
                    "skipPreflight": false,
                    "preflightCommitment": "confirmed"
                }]),
            )
            .await?;
        r.as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| "sendTransaction sin firma".to_string())
    }

    pub async fn request_airdrop(&self, pubkey: &str, lamports: u64) -> Result<String, String> {
        let r = self
            .rpc(
                "requestAirdrop",
                json!([pubkey, lamports, { "commitment": "confirmed" }]),
            )
            .await?;
        r.as_str()
            .map(str::to_string)
            .ok_or_else(|| "requestAirdrop sin firma".to_string())
    }

    pub async fn get_fee_for_message(&self, message_b64: &str) -> Result<u64, String> {
        let r = self
            .rpc(
                "getFeeForMessage",
                json!([message_b64, { "commitment": "confirmed" }]),
            )
            .await?;
        r.get("value")
            .and_then(Value::as_u64)
            .ok_or_else(|| "getFeeForMessage devolvió null".to_string())
    }
}

fn signature_status_from_entry(entry: &Value) -> Option<(bool, Option<String>)> {
    if let Some(err) = entry.get("err").filter(|err| !err.is_null()) {
        return Some((false, Some(err.to_string())));
    }

    let confirmation = entry
        .get("confirmationStatus")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if matches!(confirmation, "confirmed" | "finalized") {
        return Some((true, Some(confirmation.to_string())));
    }

    if confirmation == "processed"
        || entry
            .get("confirmations")
            .is_some_and(|confirmations| !confirmations.is_null())
    {
        return None;
    }

    // Older RPC nodes signal finalization with confirmations: null.
    if entry.get("confirmations").is_some_and(Value::is_null) && entry.get("err").is_some() {
        return Some((true, Some("finalized".to_string())));
    }

    None
}

// ---------------------------------------------------------------------------
// Wallet: misma resolución que el dapp (SOLANA_WALLET → CLI config.yml → id.json)
// ---------------------------------------------------------------------------

pub fn home_dir() -> Option<String> {
    std::env::var("HOME").ok().filter(|v| !v.is_empty())
}

fn expand_home(p: &str) -> String {
    if let Some(home) = home_dir() {
        if p == "~" {
            return home;
        }
        if let Some(rest) = p.strip_prefix("~/") {
            return format!("{home}/{rest}");
        }
    }
    p.to_string()
}

/// Lee un keypair JSON de Solana: array de 64 bytes `[seed(32) || pubkey(32)]`.
pub fn keypair_bytes_from_json(path: &str) -> Result<[u8; 64], String> {
    let expanded = expand_home(path);
    let text =
        std::fs::read_to_string(&expanded).map_err(|e| format!("keypair {expanded}: {e}"))?;
    let arr: Vec<u8> = serde_json::from_str(&text)
        .map_err(|e| format!("keypair {expanded}: JSON inválido: {e}"))?;
    if arr.len() < 64 {
        return Err(format!(
            "keypair {expanded}: {} bytes (se esperaban 64)",
            arr.len()
        ));
    }
    let mut kp = [0u8; 64];
    kp.copy_from_slice(&arr[..64]);
    Ok(kp)
}

/// Pubkey base58 (últimos 32 bytes del keypair).
pub fn pubkey_of_keypair_file(path: &str) -> Result<String, String> {
    let kp = keypair_bytes_from_json(path)?;
    Ok(b58::encode(&kp[32..]))
}

/// `keypair_path` del config.yml del CLI (parser YAML plano, sin dependencias).
fn keypair_path_from_cli_config() -> Option<String> {
    let home = home_dir()?;
    let path = format!("{home}/.config/solana/cli/config.yml");
    let text = std::fs::read_to_string(path).ok()?;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("keypair_path:") {
            let v = rest.trim().trim_matches('"').trim_matches('\'').trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

/// Pubkey cuyo balance se sincroniza: `SOLANA_WALLET` (pubkey o ruta) o la
/// del CLI local (`~/.config/solana`).
pub fn resolve_wallet(cfg: &Config) -> Option<String> {
    if let Some(w) = cfg
        .solana_wallet
        .as_deref()
        .map(str::trim)
        .filter(|w| !w.is_empty())
    {
        if w.contains('/') || w.ends_with(".json") || w.starts_with('~') {
            return pubkey_of_keypair_file(w).ok();
        }
        return Some(w.to_string());
    }
    // Si no se configuró una wallet de observación, el cobrador global de
    // x402 sirve como dirección pública para mostrar su balance en el navbar.
    // No se usa para pagar ni se confunde con la wallet dPaaS de una cuenta.
    if let Some(payee) = cfg
        .x402_payee
        .as_deref()
        .map(str::trim)
        .filter(|w| !w.is_empty())
    {
        return Some(payee.to_string());
    }
    let path = keypair_path_from_cli_config()
        .or_else(|| home_dir().map(|h| format!("{h}/.config/solana/id.json")))?;
    if !Path::new(&expand_home(&path)).exists() {
        return None;
    }
    pubkey_of_keypair_file(&path).ok()
}

// ---------------------------------------------------------------------------
// Sincronización a la DB (navbar: "Solana · Devnet / 2.1066 SOL")
// ---------------------------------------------------------------------------

pub async fn sync(state: &SharedState) {
    let network_label = state.cfg.solana_network_label();

    let Some(url) = state.cfg.solana_url().cloned() else {
        tracing::warn!(
            "SOLANA_NETWORK «{}» no reconocida",
            state.cfg.solana_network
        );
        return;
    };
    let client = SolanaClient::new(state.http.clone(), url.clone());
    let wallet = resolve_wallet(&state.cfg);

    // Probe 1: el nodo responde + versión + slot.
    let (version, slot) = match tokio::join!(client.get_version(), client.get_slot()) {
        (Ok(v), Ok(s)) => (Some(v), Some(s)),
        (v, s) => {
            tracing::debug!("Solana probe: version={v:?} slot={s:?}");
            (v.ok(), s.ok())
        }
    };
    let running = version.is_some() || slot.is_some();

    // Probe 2: balance (solo si el nodo responde).
    let mut balance = None;
    if running {
        if let Some(w) = wallet.as_deref() {
            balance = client.get_balance(w).await.ok();
            if balance.is_none() {
                tracing::debug!("getBalance sin resultado para {w}");
            }
        }
    }

    let detail = if running {
        format!(
            "validator {version:?} · slot {:?}",
            slot.unwrap_or_default()
        )
    } else {
        "sin conexión con el RPC".to_string()
    };

    let row = ServiceRow {
        id: "solana".into(),
        label: format!("Solana · {network_label}"),
        running,
        network: Some(network_label.clone()),
        endpoint: Some(url),
        version,
        slot,
        wallet: wallet.clone(),
        balance_lamports: balance,
        detail: Some(detail),
        updated_at: now_ms(),
    };

    match state.db.upsert_service(&row) {
        Ok(()) => {
            if running {
                if let (Some(w), Some(lamports)) = (&wallet, balance) {
                    tracing::info!(
                        "Solana {network_label} → corriendo · {w}: {} SOL",
                        fmt_sol(lamports)
                    );
                } else {
                    tracing::info!("Solana {network_label} → corriendo");
                }
            } else {
                tracing::warn!("Solana {network_label} → sin conexión");
            }
        }
        Err(e) => tracing::warn!("sync solana db: {e}"),
    }
}

/// Lamports → "2.1066" (4 decimales, recorte de ceros finales).
pub fn fmt_sol(lamports: i64) -> String {
    let whole = lamports / 1_000_000_000;
    let frac = (lamports % 1_000_000_000) as u64 / 100_000; // 4 decimales
    if frac == 0 {
        format!("{whole} SOL")
    } else {
        let mut s = format!("{whole}.{frac:04}");
        while s.ends_with('0') {
            s.pop();
        }
        s
    }
}

// ---------------------------------------------------------------------------
// Transferencia SOL (SystemProgram::Transfer, tx legacy)
// ---------------------------------------------------------------------------

const SYSTEM_PROGRAM: [u8; 32] = [0u8; 32]; // 1111…1 = programa System

/// Compact-u16 (shortvec).
fn put_compact(out: &mut Vec<u8>, mut v: usize) {
    loop {
        let mut byte = (v & 0x7f) as u8;
        v >>= 7;
        if v != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if v == 0 {
            break;
        }
    }
}

/// Mensaje legacy: header [1 firmante, 0 writables firmados, 1 readonly],
/// cuentas [from(writ), to(writ), system(readonly)], blockhash y una
/// instrucción SystemProgram::Transfer (tag 2, lamports u64 LE).
pub fn build_transfer_message(
    from_pub: &[u8; 32],
    to: &[u8; 32],
    lamports: u64,
    blockhash: &[u8; 32],
) -> Vec<u8> {
    let mut msg = Vec::with_capacity(160);
    msg.extend_from_slice(&[1u8, 0u8, 1u8]); // header
    put_compact(&mut msg, 3); // cuentas
    msg.extend_from_slice(from_pub);
    msg.extend_from_slice(to);
    msg.extend_from_slice(&SYSTEM_PROGRAM);
    msg.extend_from_slice(blockhash);
    put_compact(&mut msg, 1); // 1 instrucción

    msg.push(2u8); // índice del program id (system)
    put_compact(&mut msg, 2); // cuentas de la instrucción [0, 1]
    msg.push(0);
    msg.push(1);

    let data = [2u32.to_le_bytes().as_ref(), lamports.to_le_bytes().as_ref()].concat();
    put_compact(&mut msg, data.len());
    msg.extend_from_slice(&data);
    msg
}

fn seed_of(kp: &[u8; 64]) -> [u8; 32] {
    let mut s = [0u8; 32];
    s.copy_from_slice(&kp[..32]);
    s
}

fn pub_of(kp: &[u8; 64]) -> [u8; 32] {
    let mut p = [0u8; 32];
    p.copy_from_slice(&kp[32..]);
    p
}

/// Firma ed25519 con la SEED del keypair. Verifica que la pubkey declarada
/// coincida con la derivada (un keypair malformado fallaría on-chain).
fn sign_message(seed: &[u8; 32], pubkey: &[u8; 32], message: &[u8]) -> Result<[u8; 64], String> {
    use ed25519_dalek::{Signer, SigningKey};
    let signing = SigningKey::from_bytes(seed);
    let verifying = signing.verifying_key();
    let derived = verifying.as_bytes();
    if derived != pubkey {
        return Err(format!(
            "keypair inválida: la pubkey no corresponde al seed ({} != {})",
            b58::encode(pubkey),
            b58::encode(derived)
        ));
    }
    let mut sig = [0u8; 64];
    sig.copy_from_slice(signing.sign(message).to_bytes().as_ref());
    Ok(sig)
}

/// Transfiere `lamports` de un keypair local (ruta) a `to` y devuelve la firma.
pub async fn transfer_lamports(
    client: &SolanaClient,
    payer_keypair_path: &str,
    to_pubkey: &str,
    lamports: u64,
) -> Result<String, String> {
    let kp = keypair_bytes_from_json(payer_keypair_path)?;
    transfer_lamports_with_kp(client, &kp, to_pubkey, lamports).await
}

/// dPaaS: firma con un keypair EN MEMORIA (descifrado de la cuenta, nunca
/// tocando disco) y envía la transferencia. Devuelve la firma on-chain.
pub async fn transfer_lamports_with_kp(
    client: &SolanaClient,
    kp: &[u8; 64],
    to_pubkey: &str,
    lamports: u64,
) -> Result<String, String> {
    let from_pub = pub_of(kp);

    let to_bytes = b58::decode(to_pubkey)?;
    if to_bytes.len() != 32 {
        return Err(format!("pubkey destino inválida ({})", to_bytes.len()));
    }
    let mut to = [0u8; 32];
    to.copy_from_slice(&to_bytes);

    let blockhash_b58 = client.get_latest_blockhash().await?;
    let bh_bytes = b58::decode(&blockhash_b58)?;
    if bh_bytes.len() != 32 {
        return Err("blockhash inválido recibido del RPC".to_string());
    }
    let mut bh = [0u8; 32];
    bh.copy_from_slice(&bh_bytes);

    let msg = build_transfer_message(&from_pub, &to, lamports, &bh);
    let message_b64 = base64::engine::general_purpose::STANDARD.encode(&msg);
    let fee = client.get_fee_for_message(&message_b64).await?;
    let balance = client.get_balance(&b58::encode(&from_pub)).await?;
    let required = lamports.saturating_add(fee);
    if balance < 0 || (balance as u64) < required {
        return Err(format!(
            "saldo insuficiente: la wallet tiene {balance} lamports y requiere {required} ({lamports} del pago + {fee} de comisión); fondea la wallet de la misma red y vuelve a intentar"
        ));
    }
    let sig = sign_message(&seed_of(kp), &from_pub, &msg)?;

    // Tx wire: compact(1 firmante) + firma(64) + message.
    let mut tx = Vec::with_capacity(1 + 64 + msg.len());
    tx.push(1u8);
    tx.extend_from_slice(&sig);
    tx.extend_from_slice(&msg);

    let tx_b64 = base64::engine::general_purpose::STANDARD.encode(&tx);
    client.send_transaction(&tx_b64).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fmt_sol_values() {
        assert_eq!(fmt_sol(2_106_558_960), "2.1065");
        assert_eq!(fmt_sol(2_100_000_000), "2.1");
        assert_eq!(fmt_sol(0), "0 SOL");
        assert_eq!(fmt_sol(1_000_000_000), "1 SOL");
    }

    #[test]
    fn processed_signature_is_pending_until_confirmed() {
        let processed = json!({
            "err": null,
            "confirmations": 0,
            "confirmationStatus": "processed"
        });
        assert_eq!(signature_status_from_entry(&processed), None);

        let confirmed = json!({
            "err": null,
            "confirmations": 1,
            "confirmationStatus": "confirmed"
        });
        assert_eq!(
            signature_status_from_entry(&confirmed),
            Some((true, Some("confirmed".to_string())))
        );
    }

    #[test]
    fn on_chain_error_is_reported_as_rejected() {
        let failed = json!({
            "err": { "InstructionError": [0, "InsufficientFunds"] },
            "confirmations": 0,
            "confirmationStatus": "processed"
        });
        assert_eq!(
            signature_status_from_entry(&failed),
            Some((
                false,
                Some("{\"InstructionError\":[0,\"InsufficientFunds\"]}".to_string())
            ))
        );
    }

    #[test]
    fn system_program_b58() {
        assert_eq!(b58::encode(&SYSTEM_PROGRAM), "1".repeat(32));
    }

    #[test]
    fn transfer_message_shape() {
        let bh = [7u8; 32];
        let msg = build_transfer_message(&[1; 32], &[2; 32], 1000, &bh);
        assert_eq!(&msg[..3], &[1, 0, 1]);
        assert_eq!(msg[3], 3); // 3 cuentas
        assert_eq!(&msg[4..36], &[1u8; 32]); // from
        assert_eq!(&msg[36..68], &[2u8; 32]); // to
        assert_eq!(&msg[68..100], &[0u8; 32]); // system
        assert_eq!(&msg[100..132], &bh);
    }
}
