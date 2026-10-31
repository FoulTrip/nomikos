//! Registro abierto de servidores MCP remotos y gateway x402 por herramienta.
//! El manifiesto es una declaración firmada por el publisher; la inspección
//! MCP verifica protocolo y esquemas, pero no certifica el comportamiento.

use crate::crypto;
use crate::db::{new_id, now_ms};
use crate::error::{AppError, AppResult};
use crate::modules::{accounts, devices, x402};
use crate::state::SharedState;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use base64::Engine as _;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use reqwest::{redirect::Policy, Url};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::time::{Duration, Instant};

const MAX_MANIFEST_BYTES: usize = 512 * 1024;
const MAX_MCP_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_LEGAL_DOCUMENT_BYTES: usize = 512 * 1024;
const MAX_TOOLS: usize = 128;
const APPROVAL_TTL_MS: i64 = 120_000;
const REPORT_WINDOW_MS: i64 = 24 * 60 * 60 * 1000;
const HEALTH_WINDOW_MS: i64 = 15 * 60 * 1000;
const LEGAL_AUDIT_INTERVAL_MS: i64 = 15 * 60 * 1000;
const PROTOCOL_VERSION: &str = "2025-11-25";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedManifest {
    pub namespace: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub endpoint: String,
    pub publisher_pubkey: String,
    pub tools: Vec<ManifestTool>,
    pub legal: ManifestLegal,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManifestLegal {
    pub terms_url: String,
    pub terms_sha256: String,
    pub privacy_url: String,
    pub privacy_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManifestTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    #[serde(default)]
    pub output_schema: Option<Value>,
    pub price: ToolPrice,
    pub risk_class: String,
    #[serde(default)]
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolPrice {
    pub scheme: String,
    pub network: String,
    pub asset: String,
    pub amount_atomic: i64,
    pub pay_to: String,
}

#[derive(Deserialize)]
pub struct InstallBody {
    #[serde(default = "default_mode")]
    mode: String,
    #[serde(default)]
    device_ids: Vec<String>,
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    tools: Vec<ToolPolicyInput>,
    #[serde(default)]
    legal_consent: Option<LegalConsent>,
}

#[derive(Deserialize)]
pub struct LegalConsent {
    manifest_hash: String,
    terms_sha256: String,
    privacy_sha256: String,
    accepted: bool,
}

fn default_mode() -> String {
    "all".into()
}

#[derive(Deserialize)]
struct ToolPolicyInput {
    name: String,
    #[serde(default)]
    enabled: bool,
    max_amount_lamports: Option<i64>,
    require_confirmation: Option<bool>,
}

#[derive(Deserialize)]
pub struct ToolCallBody {
    #[serde(default)]
    arguments: Value,
    #[serde(default)]
    device_id: Option<String>,
    #[serde(default)]
    approval_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ApprovalDecision {
    #[serde(default)]
    approved: bool,
}

#[derive(Deserialize)]
pub struct ToolPolicyBody {
    enabled: bool,
    max_amount_lamports: Option<i64>,
    require_confirmation: Option<bool>,
}

#[derive(Deserialize)]
pub struct ReportBody {
    invoice_id: String,
    category: String,
    details: String,
    evidence_sha256: String,
    evidence_uri: Option<String>,
}

#[derive(Clone)]
struct AppRecord {
    current_version: String,
    status: String,
    health_status: String,
    quarantine_reason: Option<String>,
}

fn canonical_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let sorted: BTreeMap<String, Value> = map
                .iter()
                .map(|(key, value)| (key.clone(), canonical_value(value)))
                .collect();
            let mut out = Map::new();
            for (key, value) in sorted {
                out.insert(key, value);
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(canonical_value).collect()),
        _ => value.clone(),
    }
}

fn canonical_json(value: &Value) -> AppResult<String> {
    serde_json::to_string(&canonical_value(value))
        .map_err(|e| AppError::bad_request(format!("JSON canónico inválido: {e}")))
}

fn manifest_bytes(manifest: &SignedManifest) -> AppResult<Vec<u8>> {
    let mut value = serde_json::to_value(manifest)
        .map_err(|e| AppError::bad_request(format!("manifiesto inválido: {e}")))?;
    value
        .as_object_mut()
        .ok_or_else(|| AppError::bad_request("manifiesto debe ser un objeto"))?
        .remove("signature");
    let canonical = canonical_json(&value)?;
    Ok(format!("nomikos-app-manifest-v1\n{canonical}").into_bytes())
}

fn legal_url_ok(state: &SharedState, raw: &str) -> bool {
    if let Some(path) = raw.strip_prefix("ipfs://") {
        let mut parts = path.split('/');
        let cid = parts.next().unwrap_or_default();
        return !cid.is_empty()
            && cid.bytes().all(|byte| byte.is_ascii_alphanumeric())
            && parts.all(|segment| {
                !segment.is_empty()
                    && segment != "."
                    && segment != ".."
                    && segment.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~')
                    })
            });
    }
    Url::parse(raw).ok().is_some_and(|url| {
        let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
        let internal_http = url.scheme() == "http"
            && state
                .cfg
                .marketplace_internal_hosts
                .iter()
                .any(|value| value == &host);
        (url.scheme() == "https" || internal_http)
            && !host.is_empty()
            && url.username().is_empty()
            && url.password().is_none()
            && url.fragment().is_none()
    })
}

fn validate_manifest(
    state: &SharedState,
    manifest: &SignedManifest,
) -> AppResult<(String, String)> {
    if manifest_bytes(manifest)?.len() > MAX_MANIFEST_BYTES {
        return Err(AppError::bad_request(
            "manifiesto supera el máximo de 512 KiB",
        ));
    }
    let valid_namespace = !manifest.namespace.is_empty()
        && manifest.namespace.len() <= 63
        && manifest.namespace.as_bytes()[0].is_ascii_lowercase()
        && manifest
            .namespace
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-');
    if !valid_namespace || manifest.namespace.ends_with('-') {
        return Err(AppError::bad_request(
            "namespace inválido; usa minúsculas, números y guiones",
        ));
    }
    if manifest.name.trim().is_empty()
        || manifest.name.len() > 120
        || manifest.description.len() > 4000
        || !valid_version(&manifest.version)
    {
        return Err(AppError::bad_request(
            "nombre, descripción o versión inválidos",
        ));
    }
    let legal_hash_ok = |hash: &str| {
        hash.len() == 64
            && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            && hash.bytes().all(|byte| !byte.is_ascii_uppercase())
    };
    if !legal_url_ok(state, &manifest.legal.terms_url)
        || !legal_url_ok(state, &manifest.legal.privacy_url)
        || !legal_hash_ok(&manifest.legal.terms_sha256)
        || !legal_hash_ok(&manifest.legal.privacy_sha256)
        || manifest.legal.terms_url.len() > 2048
        || manifest.legal.privacy_url.len() > 2048
    {
        return Err(AppError::bad_request(
            "legal requiere URLs HTTPS/IPFS y SHA-256 válido para términos y privacidad",
        ));
    }
    if manifest.tools.is_empty() || manifest.tools.len() > MAX_TOOLS {
        return Err(AppError::bad_request(format!(
            "el manifiesto debe declarar entre 1 y {MAX_TOOLS} tools"
        )));
    }
    let mut names = HashSet::new();
    for tool in &manifest.tools {
        if !valid_tool_name(&tool.name) || !names.insert(tool.name.clone()) {
            return Err(AppError::bad_request(format!(
                "nombre MCP inválido o duplicado: {}",
                tool.name
            )));
        }
        if tool.description.len() > 4000
            || tool.input_schema.get("type").and_then(Value::as_str) != Some("object")
            || !valid_json_schema(&tool.input_schema, 0)
            || tool
                .output_schema
                .as_ref()
                .is_some_and(|schema| !valid_json_schema(schema, 0))
        {
            return Err(AppError::bad_request(format!(
                "descripción o input_schema inválido para {}",
                tool.name
            )));
        }
        if !matches!(
            tool.risk_class.as_str(),
            "read" | "write" | "financial" | "external_effect" | "local_code"
        ) {
            return Err(AppError::bad_request(format!(
                "risk_class inválido para {}",
                tool.name
            )));
        }
        if tool.price.scheme != "exact"
            || tool.price.asset != "SOL"
            || !matches!(
                tool.price.network.as_str(),
                "local" | "devnet" | "testnet" | "mainnet"
            )
            || tool.price.amount_atomic <= 0
        {
            return Err(AppError::bad_request(format!(
                "precio no soportado para {}: usa exact + SOL en unidades atómicas",
                tool.name
            )));
        }
        if crate::b58::decode(&tool.price.pay_to).map(|v| v.len()) != Ok(32)
            || tool.price.pay_to != manifest.publisher_pubkey
        {
            return Err(AppError::bad_request(format!(
                "pay_to inválido para {}",
                tool.name
            )));
        }
        if tool.permissions.len() > 32 || tool.permissions.iter().any(|p| p.len() > 100) {
            return Err(AppError::bad_request(format!(
                "permissions inválidos para {}",
                tool.name
            )));
        }
    }
    let pubkey = crate::b58::decode(&manifest.publisher_pubkey)
        .map_err(|_| AppError::bad_request("publisher_pubkey debe ser base58"))?;
    let key_bytes: [u8; 32] = pubkey
        .try_into()
        .map_err(|_| AppError::bad_request("publisher_pubkey debe tener 32 bytes"))?;
    let key = VerifyingKey::from_bytes(&key_bytes)
        .map_err(|_| AppError::bad_request("publisher_pubkey Ed25519 inválida"))?;
    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(&manifest.signature)
        .map_err(|_| AppError::bad_request("signature debe ser base64"))?;
    let signature = Signature::from_slice(&sig_bytes)
        .map_err(|_| AppError::bad_request("signature Ed25519 inválida"))?;
    key.verify(&manifest_bytes(manifest)?, &signature)
        .map_err(|_| {
            AppError::unauthorized("firma del manifiesto no coincide con publisher_pubkey")
        })?;
    let canonical = canonical_json(
        &serde_json::to_value(manifest)
            .map_err(|e| AppError::bad_request(format!("manifiesto inválido: {e}")))?,
    )?;
    let hash = hex::encode(Sha256::digest(canonical.as_bytes()));
    Ok((canonical, hash))
}

fn valid_version(version: &str) -> bool {
    let parts: Vec<_> = version.split('.').collect();
    (1..=3).contains(&parts.len())
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.parse::<u64>().is_ok())
}

fn version_tuple(version: &str) -> (u64, u64, u64) {
    let mut it = version.split('.').map(|p| p.parse::<u64>().unwrap_or(0));
    (
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
        it.next().unwrap_or(0),
    )
}

fn valid_tool_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'-' | b'.'))
}

fn valid_json_schema(schema: &Value, depth: usize) -> bool {
    if depth > 16 {
        return false;
    }
    let Some(object) = schema.as_object() else {
        return false;
    };
    if let Some(kind) = object.get("type") {
        let valid_type = match kind {
            Value::String(kind) => matches!(
                kind.as_str(),
                "object" | "array" | "string" | "integer" | "number" | "boolean" | "null"
            ),
            Value::Array(kinds) => {
                !kinds.is_empty()
                    && kinds.iter().all(|v| {
                        v.as_str().is_some_and(|kind| {
                            matches!(
                                kind,
                                "object"
                                    | "array"
                                    | "string"
                                    | "integer"
                                    | "number"
                                    | "boolean"
                                    | "null"
                            )
                        })
                    })
            }
            _ => false,
        };
        if !valid_type {
            return false;
        }
    }
    if object.get("properties").is_some_and(|v| !v.is_object()) {
        return false;
    }
    if let Some(properties) = object.get("properties").and_then(Value::as_object) {
        if properties.len() > 256
            || properties
                .values()
                .any(|v| !valid_json_schema(v, depth + 1))
        {
            return false;
        }
    }
    if object.get("required").is_some_and(|v| {
        !v.as_array()
            .is_some_and(|items| items.len() <= 256 && items.iter().all(Value::is_string))
    }) {
        return false;
    }
    if let Some(required) = object.get("required").and_then(Value::as_array) {
        let properties = object.get("properties").and_then(Value::as_object);
        if required
            .iter()
            .filter_map(Value::as_str)
            .any(|key| !properties.is_some_and(|props| props.contains_key(key)))
        {
            return false;
        }
    }
    if let Some(items) = object.get("items") {
        if !valid_json_schema(items, depth + 1) {
            return false;
        }
    }
    if object
        .get("additionalProperties")
        .is_some_and(|v| !v.is_boolean() && !valid_json_schema(v, depth + 1))
    {
        return false;
    }
    if object.get("enum").is_some_and(|v| {
        !v.as_array()
            .is_some_and(|values| !values.is_empty() && values.len() <= 256)
    }) {
        return false;
    }
    for key in ["minLength", "maxLength", "minItems", "maxItems"] {
        if object
            .get(key)
            .is_some_and(|v| v.as_u64().is_none_or(|n| n > 1_000_000))
        {
            return false;
        }
    }
    for key in ["minimum", "maximum"] {
        if object.get(key).is_some_and(|v| !v.is_number()) {
            return false;
        }
    }
    if object
        .get("description")
        .is_some_and(|v| v.as_str().is_none_or(|s| s.len() > 4000))
    {
        return false;
    }
    true
}

fn is_non_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip.octets()[0] == 0
                || ip.octets()[0] >= 240
                || (a == 100 && (64..=127).contains(&b))
                || (a == 192 && b == 0 && c == 0)
                || (a == 192 && b == 0 && c == 2)
                || (a == 192 && b == 88 && c == 99)
                || (a == 198 && (b == 18 || b == 19))
                || (a == 198 && b == 51 && c == 100)
                || (a == 203 && b == 0 && c == 113)
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip.is_unique_local()
                || ip.is_unicast_link_local()
                || (ip.segments()[0] & 0xe000) != 0x2000
                || (ip.segments()[0] == 0x2001 && ip.segments()[1] == 0x0db8)
                || ip
                    .to_ipv4_mapped()
                    .is_some_and(|v4| is_non_public_ip(IpAddr::V4(v4)))
        }
    }
}

async fn endpoint_client(
    state: &SharedState,
    endpoint: &str,
) -> Result<(reqwest::Client, Url), String> {
    safe_http_client(state, endpoint, false).await
}

async fn legal_http_client(
    state: &SharedState,
    endpoint: &str,
) -> Result<(reqwest::Client, Url), String> {
    safe_http_client(state, endpoint, true).await
}

async fn safe_http_client(
    state: &SharedState,
    endpoint: &str,
    allow_query: bool,
) -> Result<(reqwest::Client, Url), String> {
    let url = Url::parse(endpoint).map_err(|e| format!("endpoint URL inválida: {e}"))?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || (!allow_query && url.query().is_some())
    {
        return Err("endpoint no admite credenciales, query ni fragmento".into());
    }
    let host = url
        .host_str()
        .ok_or("endpoint sin host")?
        .to_ascii_lowercase();
    let internal = state
        .cfg
        .marketplace_internal_hosts
        .iter()
        .any(|h| h == &host);
    if url.scheme() != "https" && !(internal && url.scheme() == "http") {
        return Err(
            "el endpoint debe usar HTTPS; HTTP solo se permite para hosts internos configurados"
                .into(),
        );
    }
    let port = url.port_or_known_default().ok_or("endpoint sin puerto")?;
    let addresses: Vec<SocketAddr> = if let Ok(ip) = host.parse::<IpAddr>() {
        vec![SocketAddr::new(ip, port)]
    } else {
        tokio::time::timeout(
            Duration::from_secs(3),
            tokio::net::lookup_host((host.as_str(), port)),
        )
        .await
        .map_err(|_| "DNS del endpoint agotó el tiempo".to_string())?
        .map_err(|e| format!("DNS del endpoint falló: {e}"))?
        .collect()
    };
    if addresses.is_empty() {
        return Err("endpoint sin direcciones DNS".into());
    }
    if !internal && addresses.iter().any(|addr| is_non_public_ip(addr.ip())) {
        return Err("endpoint resuelve a una dirección privada o reservada".into());
    }
    let mut builder = reqwest::Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(12));
    if !host.parse::<IpAddr>().is_ok() {
        builder = builder.resolve_to_addrs(&host, &addresses);
    }
    let client = builder.build().map_err(|e| format!("cliente MCP: {e}"))?;
    Ok((client, url))
}

async fn read_limited(
    mut response: reqwest::Response,
    max_bytes: usize,
    subject: &str,
) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|size| usize::try_from(size).map_or(true, |size| size > max_bytes))
    {
        return Err(format!("{subject} excede el tamaño permitido"));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("lectura {subject}: {e}"))?
    {
        if body.len() + chunk.len() > max_bytes {
            return Err(format!("{subject} excede el tamaño permitido"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

async fn read_bounded(response: reqwest::Response) -> Result<Vec<u8>, String> {
    read_limited(response, MAX_MCP_RESPONSE_BYTES, "respuesta MCP").await
}

struct LegalDocumentSnapshot {
    kind: &'static str,
    sha256: String,
    content: Vec<u8>,
    verified_at: i64,
}

struct LegalDocumentPair {
    terms: LegalDocumentSnapshot,
    privacy: LegalDocumentSnapshot,
}

fn legal_http_url(state: &SharedState, source: &str) -> Result<String, String> {
    if let Some(path) = source.strip_prefix("ipfs://") {
        let mut parts = path.split('/');
        let cid = parts.next().unwrap_or_default();
        if cid.is_empty()
            || !cid.bytes().all(|byte| byte.is_ascii_alphanumeric())
            || parts.clone().any(|segment| {
                segment.is_empty()
                    || segment == "."
                    || segment == ".."
                    || !segment.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~')
                    })
            })
        {
            return Err("unavailable:invalid_ipfs_path".into());
        }
        return Ok(format!("https://ipfs.io/ipfs/{path}"));
    }
    let url = Url::parse(source).map_err(|_| "unavailable:invalid_url".to_string())?;
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let internal_http = url.scheme() == "http"
        && state
            .cfg
            .marketplace_internal_hosts
            .iter()
            .any(|value| value == &host);
    if (url.scheme() != "https" && !internal_http)
        || url.username().len() > 0
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("unavailable:invalid_url".into());
    }
    Ok(url.to_string())
}

async fn fetch_legal_document(
    state: &SharedState,
    kind: &'static str,
    source: &str,
    expected_hash: &str,
) -> Result<LegalDocumentSnapshot, String> {
    let url = legal_http_url(state, source)?;
    let (client, url) = legal_http_client(state, &url)
        .await
        .map_err(|_| format!("unavailable:{kind}"))?;
    let response = client
        .get(url)
        .header(
            reqwest::header::ACCEPT,
            "text/html, text/plain, text/markdown, application/pdf;q=0.9, */*;q=0.1",
        )
        .send()
        .await
        .map_err(|_| format!("unavailable:{kind}"))?;
    if !response.status().is_success() {
        return Err(format!("unavailable:{kind}"));
    }
    let content = read_limited(response, MAX_LEGAL_DOCUMENT_BYTES, "documento legal")
        .await
        .map_err(|_| format!("unavailable:{kind}"))?;
    if std::str::from_utf8(&content).is_err() {
        return Err(format!("unavailable:{kind}"));
    }
    let actual_hash = hex::encode(Sha256::digest(&content));
    if actual_hash != expected_hash {
        return Err(format!("hash_mismatch:{kind}"));
    }
    Ok(LegalDocumentSnapshot {
        kind,
        sha256: actual_hash,
        content,
        verified_at: now_ms(),
    })
}

async fn fetch_legal_documents(
    state: &SharedState,
    legal: &ManifestLegal,
) -> Result<LegalDocumentPair, String> {
    let (terms, privacy) = tokio::try_join!(
        fetch_legal_document(state, "terms", &legal.terms_url, &legal.terms_sha256),
        fetch_legal_document(state, "privacy", &legal.privacy_url, &legal.privacy_sha256,),
    )?;
    Ok(LegalDocumentPair { terms, privacy })
}

async fn mcp_rpc(
    client: &reqwest::Client,
    endpoint: &Url,
    method: &str,
    params_value: Value,
    request_id: Option<u64>,
    session_id: Option<&str>,
    bearer_token: Option<&str>,
) -> Result<(Value, Option<String>), String> {
    let mut request = client
        .post(endpoint.clone())
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .header("MCP-Protocol-Version", PROTOCOL_VERSION);
    if let Some(session) = session_id {
        request = request.header("Mcp-Session-Id", session);
    }
    if let Some(token) = bearer_token {
        request = request.bearer_auth(token);
    }
    let payload = if let Some(id) = request_id {
        json!({"jsonrpc":"2.0","id":id,"method":method,"params":params_value})
    } else {
        json!({"jsonrpc":"2.0","method":method,"params":params_value})
    };
    let response = request
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("MCP {method}: {e}"))?;
    let status = response.status();
    let session = response
        .headers()
        .get("mcp-session-id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    if !status.is_success() && status != StatusCode::ACCEPTED {
        return Err(format!("MCP {method} devolvió HTTP {status}"));
    }
    if request_id.is_none() {
        return Ok((Value::Null, session));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let bytes = read_bounded(response).await?;
    let text = String::from_utf8(bytes).map_err(|_| format!("MCP {method} no devolvió UTF-8"))?;
    let message = if content_type.contains("text/event-stream") {
        text.lines()
            .filter_map(|line| line.trim().strip_prefix("data:"))
            .filter_map(|data| serde_json::from_str::<Value>(data.trim()).ok())
            .find(|value| value.get("result").is_some() || value.get("error").is_some())
            .ok_or_else(|| format!("MCP {method}: SSE sin respuesta JSON-RPC"))?
    } else {
        serde_json::from_str::<Value>(&text)
            .map_err(|e| format!("MCP {method}: JSON inválido: {e}"))?
    };
    if let Some(error) = message.get("error") {
        return Err(format!("MCP {method}: error JSON-RPC {error}"));
    }
    Ok((
        message.get("result").cloned().unwrap_or(Value::Null),
        session,
    ))
}

async fn list_mcp_tools(
    client: &reqwest::Client,
    endpoint: &Url,
    bearer_token: Option<&str>,
) -> Result<(Vec<Value>, Option<String>), String> {
    let (initialized, session) = mcp_rpc(
        client,
        endpoint,
        "initialize",
        json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name":"nomikos-registry","version":env!("CARGO_PKG_VERSION")}
        }),
        Some(1),
        None,
        bearer_token,
    )
    .await?;
    if initialized
        .get("protocolVersion")
        .and_then(Value::as_str)
        .is_none()
    {
        return Err("initialize no devolvió protocolVersion".into());
    }
    let _ = mcp_rpc(
        client,
        endpoint,
        "notifications/initialized",
        json!({}),
        None,
        session.as_deref(),
        bearer_token,
    )
    .await?;
    let mut cursor: Option<String> = None;
    let mut tools = Vec::new();
    for page in 0..16 {
        let mut params_value = json!({});
        if let Some(value) = &cursor {
            params_value["cursor"] = json!(value);
        }
        let (result, _) = mcp_rpc(
            client,
            endpoint,
            "tools/list",
            params_value,
            Some(2 + page),
            session.as_deref(),
            bearer_token,
        )
        .await?;
        let page_tools = result
            .get("tools")
            .and_then(Value::as_array)
            .ok_or("tools/list no devolvió tools[]")?;
        tools.extend(page_tools.iter().cloned());
        if tools.len() > MAX_TOOLS {
            return Err(format!("tools/list excede {MAX_TOOLS} tools"));
        }
        cursor = result
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_owned);
        if cursor.is_none() {
            return Ok((tools, session));
        }
    }
    Err("tools/list excedió el máximo de páginas".into())
}

async fn probe_manifest(state: &SharedState, manifest: &SignedManifest) -> Result<Value, String> {
    let (client, endpoint) = endpoint_client(state, &manifest.endpoint).await?;
    let (remote, _) = list_mcp_tools(&client, &endpoint, None).await?;
    let expected: BTreeMap<_, _> = manifest
        .tools
        .iter()
        .map(|tool| (tool.name.as_str(), tool))
        .collect();
    let mut seen = HashSet::new();
    for tool in &remote {
        let name = tool
            .get("name")
            .and_then(Value::as_str)
            .ok_or("tools/list incluye tool sin nombre")?;
        if !seen.insert(name.to_string()) {
            return Err(format!("tools/list contiene nombre duplicado: {name}"));
        }
        let declared = expected
            .get(name)
            .ok_or_else(|| format!("tool no declarada en manifiesto: {name}"))?;
        let remote_schema = tool
            .get("inputSchema")
            .ok_or_else(|| format!("tool {name} no tiene inputSchema"))?;
        if canonical_json(remote_schema).map_err(|e| e.to_string())?
            != canonical_json(&declared.input_schema).map_err(|e| e.to_string())?
        {
            return Err(format!("inputSchema MCP no coincide para {name}"));
        }
    }
    if seen.len() != expected.len() {
        return Err("tools/list no coincide con todas las tools del manifiesto".into());
    }
    Ok(json!({
        "signature": "valid",
        "endpoint": "reachable",
        "protocol": PROTOCOL_VERSION,
        "tools_schema": "matched",
        "tools_count": seen.len(),
        "checked_at": now_ms(),
    }))
}

fn load_app(state: &SharedState, namespace: &str) -> AppResult<AppRecord> {
    state
        .db
        .with(|c| {
            c.query_row(
                "SELECT current_version, status, \
             health_status, quarantine_reason FROM marketplace_apps WHERE namespace = ?1",
                params![namespace],
                |r| {
                    Ok(AppRecord {
                        current_version: r.get(0)?,
                        status: r.get(1)?,
                        health_status: r.get(2)?,
                        quarantine_reason: r.get(3)?,
                    })
                },
            )
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::not_found(format!("MCP app «{namespace}» no existe"))
            }
            other => AppError::internal(format!("marketplace db: {other}")),
        })
}

fn load_manifest(state: &SharedState, namespace: &str, version: &str) -> AppResult<SignedManifest> {
    let raw: String = state
        .db
        .with(|c| {
            c.query_row(
        "SELECT manifest_json FROM marketplace_manifests WHERE namespace = ?1 AND version = ?2",
        params![namespace, version], |r| r.get(0),
    )
        })
        .map_err(|e| AppError::not_found(format!("manifiesto {namespace}@{version}: {e}")))?;
    let manifest: SignedManifest = serde_json::from_str(&raw)
        .map_err(|e| AppError::internal(format!("manifiesto almacenado inválido: {e}")))?;
    let (_, hash) = validate_manifest(state, &manifest)?;
    let expected: String = state.db.with(|c| {
        c.query_row(
            "SELECT manifest_hash FROM marketplace_manifests WHERE namespace = ?1 AND version = ?2",
            params![namespace, version],
            |r| r.get(0),
        )
    })?;
    if hash != expected {
        return Err(AppError::conflict(
            "hash del manifiesto cambió en almacenamiento",
        ));
    }
    Ok(manifest)
}

fn account_identity(
    state: &SharedState,
    headers: &HeaderMap,
) -> AppResult<(String, Option<String>)> {
    devices::resolve_identity(state, headers)?
        .ok_or_else(|| AppError::unauthorized("se requiere Bearer de cuenta o dispositivo"))
}

fn human_account(state: &SharedState, headers: &HeaderMap) -> AppResult<String> {
    let (account, device) = account_identity(state, headers)?;
    if device.is_some() {
        return Err(AppError::forbidden(
            "esta operaciÃ³n requiere una sesiÃ³n humana de cuenta",
        ));
    }
    Ok(account)
}

fn version_manifest_value(state: &SharedState, namespace: &str, version: &str) -> AppResult<Value> {
    let manifest = load_manifest(state, namespace, version)?;
    let (manifest_json, manifest_hash, validation_json, legal_status, legal_checked_at, legal_error): (String, String, String, String, Option<i64>, Option<String>) =
        state.db.with(|c| {
            c.query_row(
                "SELECT manifest_json, manifest_hash, validation_json, legal_status, legal_checked_at, legal_error FROM marketplace_manifests \
             WHERE namespace = ?1 AND version = ?2",
                params![namespace, version],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
            )
        })?;
    let _ = manifest_json;
    Ok(
        json!({ "manifest": manifest, "manifest_hash": manifest_hash,
        "validation": serde_json::from_str::<Value>(&validation_json).unwrap_or(Value::Null),
        "legal_status": legal_status, "legal_checked_at": legal_checked_at, "legal_error": legal_error }),
    )
}

pub async fn legal_document_handler(
    State(state): State<SharedState>,
    Path((namespace, kind)): Path<(String, String)>,
) -> AppResult<Response> {
    let (expected_hash, version, manifest_hash): (String, String, String) = {
        let app = load_app(&state, &namespace)?;
        let manifest = load_manifest(&state, &namespace, &app.current_version)?;
        let expected = match kind.as_str() {
            "terms" => manifest.legal.terms_sha256,
            "privacy" => manifest.legal.privacy_sha256,
            _ => return Err(AppError::not_found("tipo de documento legal desconocido")),
        };
        let manifest_hash: String = state.db.with(|c| {
            c.query_row(
                "SELECT manifest_hash FROM marketplace_manifests WHERE namespace = ?1 AND version = ?2",
                params![namespace, app.current_version],
                |row| row.get(0),
            )
        })?;
        (expected, app.current_version, manifest_hash)
    };
    let snapshot: Option<(String, Vec<u8>)> = state.db.with(|c| {
        c.query_row(
            "SELECT content_sha256, content FROM marketplace_legal_documents \
             WHERE namespace = ?1 AND version = ?2 AND manifest_hash = ?3 AND document_kind = ?4",
            params![namespace, version, manifest_hash, kind],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
    })?;
    let Some((stored_hash, content)) = snapshot else {
        return Err(AppError::unavailable(
            "no hay una copia verificada del documento legal",
        ));
    };
    let actual_hash = hex::encode(Sha256::digest(&content));
    if stored_hash != expected_hash || actual_hash != expected_hash {
        record_legal_failure(
            &state,
            &namespace,
            &version,
            &manifest_hash,
            "hash_mismatch:cached_snapshot",
        )?;
        return Err(AppError::conflict(
            "la copia del documento legal no coincide con el manifiesto firmado",
        ));
    }
    let mut response = Response::new(axum::body::Body::from(content));
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    response.headers_mut().insert(
        axum::http::header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        HeaderValue::from_static("no-store"),
    );
    response.headers_mut().insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("inline; filename=\"{kind}.txt\"")).unwrap(),
    );
    Ok(response)
}

fn consent_matches_current(
    state: &SharedState,
    account: &str,
    namespace: &str,
    manifest: &SignedManifest,
) -> AppResult<bool> {
    let exists: bool = state.db.with(|c| c.query_row(
        "SELECT EXISTS(SELECT 1 FROM marketplace_manifests m JOIN marketplace_consents c \
         ON c.namespace = m.namespace AND c.version = m.version AND c.manifest_hash = m.manifest_hash \
         WHERE m.namespace = ?1 AND m.version = ?2 AND c.account_id = ?3 \
         AND c.terms_sha256 = ?4 AND c.privacy_sha256 = ?5)",
        params![namespace, manifest.version, account, manifest.legal.terms_sha256, manifest.legal.privacy_sha256],
        |r| r.get::<_, i64>(0).map(|value| value != 0),
    ))?;
    Ok(exists)
}

fn store_legal_verification(
    state: &SharedState,
    namespace: &str,
    version: &str,
    manifest_hash: &str,
    documents: &LegalDocumentPair,
) -> AppResult<bool> {
    state.db.with(|c| {
        let tx = c.unchecked_transaction()?;
        let changed = tx.execute(
            "UPDATE marketplace_manifests SET legal_status = 'verified', legal_checked_at = ?1, legal_error = NULL \
             WHERE namespace = ?2 AND version = ?3 AND manifest_hash = ?4",
            params![now_ms(), namespace, version, manifest_hash],
        )?;
        if changed == 0 {
            return Ok(false);
        }
        for document in [&documents.terms, &documents.privacy] {
            tx.execute(
                "INSERT INTO marketplace_legal_documents \
                 (namespace, version, manifest_hash, document_kind, content_sha256, content, verified_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
                 ON CONFLICT(namespace, version, manifest_hash, document_kind) DO UPDATE SET \
                 content_sha256 = excluded.content_sha256, content = excluded.content, verified_at = excluded.verified_at",
                params![namespace, version, manifest_hash, document.kind, document.sha256,
                    document.content, document.verified_at],
            )?;
        }
        tx.commit()?;
        Ok(true)
    }).map_err(AppError::from)
}

fn record_legal_failure(
    state: &SharedState,
    namespace: &str,
    version: &str,
    manifest_hash: &str,
    error: &str,
) -> AppResult<()> {
    let status = if error.starts_with("hash_mismatch:") {
        "hash_mismatch"
    } else {
        "unavailable"
    };
    let reason = format!("legal:{error}");
    state.db.with(|c| {
        let tx = c.unchecked_transaction()?;
        tx.execute(
            "UPDATE marketplace_manifests SET legal_status = ?1, legal_checked_at = ?2, legal_error = ?3 \
             WHERE namespace = ?4 AND version = ?5 AND manifest_hash = ?6",
            params![status, now_ms(), error, namespace, version, manifest_hash],
        )?;
        tx.execute(
            "UPDATE marketplace_apps SET status = 'quarantined', health_status = 'quarantined', \
             quarantine_reason = ?1, updated_at = ?2 WHERE namespace = ?3 AND current_version = ?4 \
             AND (status = 'active' OR quarantine_reason LIKE 'legal:%')",
            params![reason, now_ms(), namespace, version],
        )?;
        tx.commit()
    }).map_err(AppError::from)
}

fn ensure_legal_verified(state: &SharedState, namespace: &str, version: &str) -> AppResult<()> {
    let status: String = state.db.with(|c| {
        c.query_row(
            "SELECT legal_status FROM marketplace_manifests WHERE namespace = ?1 AND version = ?2",
            params![namespace, version],
            |row| row.get(0),
        )
    })?;
    if status != "verified" {
        return Err(AppError::unavailable(
            "los documentos legales de esta versión no están verificados",
        ));
    }
    Ok(())
}

pub async fn legal_audit_loop(state: SharedState) {
    loop {
        if let Err(error) = audit_legal_documents(&state).await {
            tracing::warn!("marketplace: auditoría legal: {error}");
        }
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}

async fn audit_legal_documents(state: &SharedState) -> AppResult<()> {
    let due_before = now_ms() - LEGAL_AUDIT_INTERVAL_MS;
    let due: Vec<(String, String, String)> = state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT a.namespace, a.current_version, m.manifest_hash FROM marketplace_apps a \
             JOIN marketplace_manifests m ON m.namespace = a.namespace AND m.version = a.current_version \
             WHERE (a.status = 'active' OR (a.status = 'quarantined' AND a.quarantine_reason LIKE 'legal:%')) \
             AND (m.legal_checked_at IS NULL OR m.legal_checked_at <= ?1) \
             ORDER BY COALESCE(m.legal_checked_at, 0), a.updated_at DESC LIMIT 24",
        )?;
        let rows = stmt.query_map(params![due_before], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })?;
    for (namespace, version, hash) in due {
        let manifest = match load_manifest(state, &namespace, &version) {
            Ok(manifest) => manifest,
            Err(error) => {
                record_legal_failure(
                    state,
                    &namespace,
                    &version,
                    &hash,
                    "unavailable:manifest_integrity",
                )?;
                tracing::warn!(
                    "marketplace: manifiesto inválido durante auditoría legal {}@{}: {}",
                    namespace,
                    version,
                    error
                );
                continue;
            }
        };
        match fetch_legal_documents(state, &manifest.legal).await {
            Ok(documents) => {
                if !store_legal_verification(state, &namespace, &version, &hash, &documents)? {
                    continue;
                }
            }
            Err(error) => {
                record_legal_failure(state, &namespace, &version, &hash, &error)?;
                tracing::warn!(
                    "marketplace: documentos legales {}@{} no verificados ({})",
                    namespace,
                    version,
                    error
                );
            }
        }
    }
    Ok(())
}

pub async fn publish_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(manifest): Json<SignedManifest>,
) -> AppResult<Response> {
    let account_id = human_account(&state, &headers)?;
    let (canonical, hash) = validate_manifest(&state, &manifest)?;
    let tools_json = canonical_json(&json!(manifest.tools))?;
    let now = now_ms();
    let existing: Option<(String, String, String)> = state.db.with(|c| {
        c.query_row(
            "SELECT owner_account_id, publisher_pubkey, current_version FROM marketplace_apps WHERE namespace = ?1",
            params![manifest.namespace],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).optional()
    })?;
    if let Some((owner, pubkey, current)) = existing {
        if owner != account_id || pubkey != manifest.publisher_pubkey {
            return Err(AppError::forbidden(
                "namespace ya pertenece a otro publisher",
            ));
        }
        if manifest.version != current
            && version_tuple(&manifest.version) <= version_tuple(&current)
        {
            return Err(AppError::conflict("la versión publicada debe aumentar"));
        }
        let same_version_hash: Option<String> = state.db.with(|c| {
            c.query_row(
            "SELECT manifest_hash FROM marketplace_manifests WHERE namespace = ?1 AND version = ?2",
            params![manifest.namespace, manifest.version], |r| r.get(0),
        ).optional()
        })?;
        if same_version_hash.as_deref().is_some_and(|old| old != hash) {
            return Err(AppError::conflict(
                "esa versión ya existe con otro manifiesto firmado",
            ));
        }
    }
    let legal_documents = fetch_legal_documents(&state, &manifest.legal)
        .await
        .map_err(|error| {
            if error.starts_with("hash_mismatch:") {
                AppError::conflict(format!("el hash del documento legal no coincide ({error})"))
            } else {
                AppError::unavailable(format!("no se pudo verificar el documento legal ({error})"))
            }
        })?;
    let validation = probe_manifest(&state, &manifest)
        .await
        .map_err(|e| AppError::bad_request(format!("validación automática falló: {e}")))?;
    state.db.with(|c| {
        let tx = c.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO marketplace_apps (namespace, owner_account_id, publisher_pubkey, current_version, \
             status, health_status, quarantine_reason, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 'active', 'healthy', NULL, ?5, ?5) \
             ON CONFLICT(namespace) DO UPDATE SET current_version = excluded.current_version, \
             status = 'active', health_status = 'healthy', quarantine_reason = NULL, updated_at = excluded.updated_at \
             WHERE marketplace_apps.owner_account_id = excluded.owner_account_id \
               AND marketplace_apps.publisher_pubkey = excluded.publisher_pubkey",
            params![manifest.namespace, account_id, manifest.publisher_pubkey, manifest.version, now],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO marketplace_manifests (namespace, version, manifest_hash, manifest_json, \
             endpoint, tools_json, validation_json, legal_status, legal_checked_at, legal_error, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'verified', ?8, NULL, ?9)",
            params![manifest.namespace, manifest.version, hash, canonical, manifest.endpoint, tools_json,
                serde_json::to_string(&validation).unwrap_or_else(|_| "{}".into()), now, now],
        )?;
        tx.execute(
            "UPDATE marketplace_manifests SET validation_json = ?1, legal_status = 'verified', \
             legal_checked_at = ?2, legal_error = NULL WHERE namespace = ?3 AND version = ?4 AND manifest_hash = ?5",
            params![serde_json::to_string(&validation).unwrap_or_else(|_| "{}".into()), now,
                manifest.namespace, manifest.version, hash],
        )?;
        for document in [&legal_documents.terms, &legal_documents.privacy] {
            tx.execute(
                "INSERT INTO marketplace_legal_documents \
                 (namespace, version, manifest_hash, document_kind, content_sha256, content, verified_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
                 ON CONFLICT(namespace, version, manifest_hash, document_kind) DO UPDATE SET \
                 content_sha256 = excluded.content_sha256, content = excluded.content, verified_at = excluded.verified_at",
                params![manifest.namespace, manifest.version, hash, document.kind, document.sha256,
                    document.content, document.verified_at],
            )?;
        }
        tx.commit()?;
        Ok(())
    })?;
    tracing::info!(
        "marketplace: published {}@{} ({})",
        manifest.namespace,
        manifest.version,
        hash
    );
    Ok((StatusCode::CREATED, Json(json!({ "ok": true, "namespace": manifest.namespace,
        "version": manifest.version, "manifest_hash": hash, "status": "active", "legal_status": "verified", "validation": validation }))).into_response())
}

pub async fn list_handler(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
    let apps = state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT a.namespace, a.current_version, a.status, a.health_status, a.quarantine_reason, \
             m.manifest_json, m.manifest_hash FROM marketplace_apps a \
             JOIN marketplace_manifests m ON m.namespace = a.namespace AND m.version = a.current_version \
             WHERE a.status = 'active' AND m.legal_status = 'verified' ORDER BY a.namespace",
        )?;
        let rows = stmt.query_map([], |r| {
            let raw: String = r.get(5)?;
            let manifest: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
            Ok(json!({
                "namespace": r.get::<_, String>(0)?, "version": r.get::<_, String>(1)?,
                "status": r.get::<_, String>(2)?, "health_status": r.get::<_, String>(3)?,
                "quarantine_reason": r.get::<_, Option<String>>(4)?, "manifest": manifest,
                "manifest_hash": r.get::<_, String>(6)?,
            }))
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })?;
    Ok(Json(json!({ "ok": true, "apps": apps })))
}

pub async fn get_handler(
    State(state): State<SharedState>,
    Path(namespace): Path<String>,
) -> AppResult<impl IntoResponse> {
    let app = load_app(&state, &namespace)?;
    if app.status == "needs_legal_update" {
        let current = state.db.with(|c| {
            c.query_row(
                "SELECT manifest_json, manifest_hash, validation_json FROM marketplace_manifests \
                 WHERE namespace = ?1 AND version = ?2",
                params![namespace, app.current_version],
                |row| {
                    let raw: String = row.get(0)?;
                    Ok(json!({
                        "manifest": serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
                        "manifest_hash": row.get::<_, String>(1)?,
                        "validation": serde_json::from_str::<Value>(&row.get::<_, String>(2)?).unwrap_or(Value::Null),
                    }))
                },
            )
        })?;
        return Ok(Json(json!({
            "ok": true, "namespace": namespace, "status": app.status,
            "health_status": app.health_status, "quarantine_reason": app.quarantine_reason,
            "reputation": reputation_value(&state, &namespace)?, "current": current,
        })));
    }
    let version = version_manifest_value(&state, &namespace, &app.current_version)?;
    let reputation = reputation_value(&state, &namespace)?;
    Ok(Json(
        json!({ "ok": true, "namespace": namespace, "status": app.status,
        "health_status": app.health_status, "quarantine_reason": app.quarantine_reason,
        "reputation": reputation, "current": version }),
    ))
}

pub async fn report_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(namespace): Path<String>,
    Json(body): Json<ReportBody>,
) -> AppResult<impl IntoResponse> {
    let account = human_account(&state, &headers)?;
    let _app = load_app(&state, &namespace)?;
    let owner: String = state.db.with(|c| {
        c.query_row(
            "SELECT owner_account_id FROM marketplace_apps WHERE namespace = ?1",
            params![namespace],
            |r| r.get(0),
        )
    })?;
    if owner == account {
        return Err(AppError::forbidden(
            "el publisher no puede reportar su propia app",
        ));
    }
    if !matches!(
        body.category.as_str(),
        "fraud" | "unauthorized_action" | "data_exfiltration" | "endpoint_misbehavior" | "other"
    ) || body.details.trim().is_empty()
        || body.details.len() > 4000
        || body.evidence_sha256.len() != 64
        || !body.evidence_sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(AppError::bad_request(
            "categoría, detalle o SHA-256 de evidencia inválido",
        ));
    }
    if let Some(uri) = body.evidence_uri.as_deref() {
        let uri_ok = uri.starts_with("ipfs://")
            || Url::parse(uri).ok().is_some_and(|url| {
                url.scheme() == "https"
                    && url.host_str().is_some()
                    && url.username().is_empty()
                    && url.password().is_none()
            });
        if !uri_ok || uri.len() > 2048 {
            return Err(AppError::bad_request(
                "evidence_uri debe ser HTTPS o IPFS y medir como máximo 2048 caracteres",
            ));
        }
    }
    let invoice_valid: bool = state.db.with(|c| c.query_row(
        "SELECT EXISTS(SELECT 1 FROM x402_invoices i JOIN marketplace_call_events e ON e.invoice_id = i.id \
         WHERE i.id = ?1 AND i.account_id = ?2 AND e.account_id = ?2 AND e.namespace = ?3 \
         AND i.status = 'settled' AND i.consumed_at IS NOT NULL AND i.resource LIKE ?4)",
        params![body.invoice_id, account, namespace, format!("x402:mcp:{namespace}:%")],
        |r| r.get::<_, i64>(0).map(|v| v != 0),
    ))?;
    if !invoice_valid {
        return Err(AppError::forbidden(
            "el reporte debe referir a una ejecución MCP pagada de esta cuenta",
        ));
    }
    let recent_report: bool = state.db.with(|c| c.query_row(
        "SELECT EXISTS(SELECT 1 FROM marketplace_reports WHERE namespace = ?1 AND account_id = ?2 AND created_at > ?3)",
        params![namespace, account, now_ms() - REPORT_WINDOW_MS],
        |r| r.get::<_, i64>(0).map(|v| v != 0),
    ))?;
    if recent_report {
        return Err(AppError::conflict(
            "esta cuenta ya envió un reporte para la app durante las últimas 24 horas",
        ));
    }
    let encrypted = crypto::seal(
        &accounts::master_key_of(&state)?,
        &serde_json::to_string(&json!({
            "details": body.details.trim(), "evidence_uri": body.evidence_uri,
        }))
        .map_err(|e| AppError::internal(format!("serialización del reporte: {e}")))?,
    )?;
    let report_id = new_id("mcp-report");
    state.db.with(|c| c.execute(
        "INSERT INTO marketplace_reports (id, namespace, account_id, invoice_id, category, details_enc, evidence_sha256, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![report_id, namespace, account, body.invoice_id, body.category, encrypted, body.evidence_sha256.to_ascii_lowercase(), now_ms()],
    ))?;
    refresh_app_health(&state, &namespace)?;
    let refreshed = load_app(&state, &namespace)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "ok": true, "report_id": report_id,
        "status": refreshed.status, "health_status": refreshed.health_status,
        "reputation": reputation_value(&state, &namespace)?,
        "notice": "los reportes son señales para cuarentena preventiva; no prueban por sí solos una infracción" })),
    ))
}

pub async fn publisher_reports_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(namespace): Path<String>,
) -> AppResult<impl IntoResponse> {
    let account = human_account(&state, &headers)?;
    let owner: Option<String> = state.db.with(|c| {
        c.query_row(
            "SELECT owner_account_id FROM marketplace_apps WHERE namespace = ?1",
            params![namespace],
            |r| r.get(0),
        )
        .optional()
    })?;
    if owner.as_deref() != Some(account.as_str()) {
        return Err(AppError::not_found("app publisher no encontrada"));
    }
    let rows: Vec<(String, String, String, String, String, i64)> = state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, account_id, category, details_enc, evidence_sha256, created_at FROM marketplace_reports \
             WHERE namespace = ?1 ORDER BY created_at DESC LIMIT 200",
        )?;
        let rows = stmt.query_map(params![namespace], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })?;
    let key = accounts::master_key_of(&state)?;
    let reports: Vec<Value> = rows
        .into_iter()
        .map(
            |(id, _account_id, category, encrypted, evidence_sha256, created_at)| {
                let details = crypto::open(&key, &encrypted)
                    .ok()
                    .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
                    .unwrap_or(Value::Null);
                json!({ "id": id, "category": category,
            "details": details.get("details").cloned().unwrap_or(Value::Null),
            "evidence_uri": details.get("evidence_uri").cloned().unwrap_or(Value::Null),
            "evidence_sha256": evidence_sha256, "created_at": created_at })
            },
        )
        .collect();
    Ok(Json(
        json!({ "ok": true, "namespace": namespace, "reports": reports }),
    ))
}

pub async fn revalidate_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(namespace): Path<String>,
) -> AppResult<impl IntoResponse> {
    let account = human_account(&state, &headers)?;
    let app = load_app(&state, &namespace)?;
    let owner: String = state.db.with(|c| {
        c.query_row(
            "SELECT owner_account_id FROM marketplace_apps WHERE namespace = ?1",
            params![namespace],
            |r| r.get(0),
        )
    })?;
    if owner != account {
        return Err(AppError::forbidden(
            "solo el publisher puede volver a validar la app",
        ));
    }
    let (calls, failures, reporters) = health_metrics(&state, &namespace)?;
    if reporters >= 3 || (calls >= 5 && failures >= 3 && failures * 2 >= calls) {
        return Err(AppError::conflict("no se puede quitar la cuarentena mientras haya tres reporteros distintos activos en la ventana de 24 horas"));
    }
    let manifest = load_manifest(&state, &namespace, &app.current_version)?;
    let manifest_hash: String = state.db.with(|c| {
        c.query_row(
            "SELECT manifest_hash FROM marketplace_manifests WHERE namespace = ?1 AND version = ?2",
            params![namespace, app.current_version],
            |row| row.get(0),
        )
    })?;
    let documents = match fetch_legal_documents(&state, &manifest.legal).await {
        Ok(documents) => documents,
        Err(error) => {
            record_legal_failure(
                &state,
                &namespace,
                &app.current_version,
                &manifest_hash,
                &error,
            )?;
            if error.starts_with("hash_mismatch:") {
                return Err(AppError::conflict(format!(
                    "la app sigue en cuarentena: documento legal cambiado ({error})"
                )));
            }
            return Err(AppError::unavailable(format!(
                "la app sigue en cuarentena: documento legal no verificable ({error})"
            )));
        }
    };
    store_legal_verification(
        &state,
        &namespace,
        &app.current_version,
        &manifest_hash,
        &documents,
    )?;
    let probe = probe_manifest(&state, &manifest).await;
    let (status, health_status, reason) = match probe {
        Ok(_) => ("active", "healthy", None),
        Err(error) => ("quarantined", "quarantined", Some(error)),
    };
    state.db.with(|c| c.execute(
        "UPDATE marketplace_apps SET status = ?1, health_status = ?2, quarantine_reason = ?3, updated_at = ?4 WHERE namespace = ?5",
        params![status, health_status, reason, now_ms(), namespace],
    ))?;
    if let Some(error) = reason {
        return Err(AppError::unavailable(format!(
            "la app sigue en cuarentena: {error}"
        )));
    }
    Ok(Json(
        json!({ "ok": true, "namespace": namespace, "status": status, "health_status": health_status }),
    ))
}

pub async fn my_apps_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let account_id = human_account(&state, &headers)?;
    let apps = state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT namespace, current_version, status, health_status, quarantine_reason \
             FROM marketplace_apps WHERE owner_account_id = ?1 ORDER BY namespace",
        )?;
        let rows = stmt.query_map(params![account_id], |r| {
            Ok(json!({
                "namespace": r.get::<_, String>(0)?, "version": r.get::<_, String>(1)?,
                "status": r.get::<_, String>(2)?, "health_status": r.get::<_, String>(3)?,
                "quarantine_reason": r.get::<_, Option<String>>(4)?,
            }))
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })?;
    Ok(Json(json!({ "ok": true, "apps": apps })))
}

pub async fn account_apps_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let account_id = human_account(&state, &headers)?;
    let apps = state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT i.namespace, i.mode, i.device_ids_json, a.current_version, \
             EXISTS(SELECT 1 FROM marketplace_manifests m JOIN marketplace_consents c \
               ON c.namespace = m.namespace AND c.version = m.version AND c.manifest_hash = m.manifest_hash \
               WHERE m.namespace = a.namespace AND m.version = a.current_version \
               AND c.account_id = i.account_id AND c.terms_sha256 = json_extract(m.manifest_json, '$.legal.terms_sha256') \
               AND c.privacy_sha256 = json_extract(m.manifest_json, '$.legal.privacy_sha256')), \
             COALESCE((SELECT json_group_array(json_object('name', p.tool_name, 'enabled', p.enabled, \
               'max_amount_lamports', p.max_amount_lamports, 'require_confirmation', p.require_confirmation)) \
               FROM marketplace_tool_policies p WHERE p.account_id = i.account_id AND p.namespace = i.namespace), '[]') \
             FROM marketplace_installs i JOIN marketplace_apps a ON a.namespace = i.namespace \
             WHERE i.account_id = ?1 ORDER BY i.namespace",
        )?;
        let rows = stmt.query_map(params![account_id], |row| {
            Ok(json!({
                "namespace": row.get::<_, String>(0)?, "mode": row.get::<_, String>(1)?,
                "device_ids": serde_json::from_str::<Vec<String>>(&row.get::<_, String>(2)?).unwrap_or_default(),
                "version": row.get::<_, String>(3)?, "legal_consent": row.get::<_, i64>(4)? != 0,
                "tools": serde_json::from_str::<Value>(&row.get::<_, String>(5)?).unwrap_or(Value::Array(Vec::new())),
            }))
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })?;
    Ok(Json(json!({ "ok": true, "apps": apps })))
}

fn validate_device_scope(
    state: &SharedState,
    account_id: &str,
    device_ids: &[String],
) -> AppResult<()> {
    let unique: HashSet<_> = device_ids.iter().collect();
    if unique.len() != device_ids.len() {
        return Err(AppError::bad_request("device_ids duplicados"));
    }
    for device_id in device_ids {
        let exists = state.db.with(|c| {
            c.query_row(
                "SELECT EXISTS(SELECT 1 FROM devices WHERE id = ?1 AND account_id = ?2)",
                params![device_id, account_id],
                |r| r.get::<_, i64>(0),
            )
        })?;
        if exists == 0 {
            return Err(AppError::forbidden(format!(
                "dispositivo {device_id} no pertenece a la cuenta"
            )));
        }
    }
    Ok(())
}

pub async fn install_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(namespace): Path<String>,
    Json(body): Json<InstallBody>,
) -> AppResult<Response> {
    let account_id = human_account(&state, &headers)?;
    let session_device_id: Option<String> = None;
    let app = load_app(&state, &namespace)?;
    if app.status != "active" {
        return Err(AppError::unavailable("app no está activa en el registro"));
    }
    if !matches!(body.mode.as_str(), "all" | "selected") {
        return Err(AppError::bad_request("mode debe ser all o selected"));
    }
    let device_ids = if let Some(device_id) = session_device_id {
        if body.mode != "selected"
            || (!body.device_ids.is_empty() && body.device_ids != [device_id.clone()])
        {
            return Err(AppError::forbidden(
                "un dispositivo solo puede instalar para sí mismo",
            ));
        }
        vec![device_id]
    } else {
        body.device_ids.clone()
    };
    if body.mode == "selected" && device_ids.is_empty() {
        return Err(AppError::bad_request("mode selected requiere device_ids"));
    }
    validate_device_scope(&state, &account_id, &device_ids)?;
    let manifest = load_manifest(&state, &namespace, &app.current_version)?;
    ensure_legal_verified(&state, &namespace, &app.current_version)?;
    let (manifest_hash,): (String,) = state.db.with(|c| {
        c.query_row(
            "SELECT manifest_hash FROM marketplace_manifests WHERE namespace = ?1 AND version = ?2",
            params![namespace, app.current_version],
            |r| Ok((r.get(0)?,)),
        )
    })?;
    let Some(consent) = body.legal_consent.as_ref().filter(|consent| {
        consent.accepted
            && consent.manifest_hash == manifest_hash
            && consent.terms_sha256 == manifest.legal.terms_sha256
            && consent.privacy_sha256 == manifest.legal.privacy_sha256
    }) else {
        return Ok((
            StatusCode::CONFLICT,
            Json(json!({
                "ok": false, "code": "LEGAL_CONSENT_REQUIRED",
                "error": "revisa y acepta los términos y la política de privacidad de esta versión",
                "namespace": namespace, "version": app.current_version,
                "manifest_hash": manifest_hash,
                "legal": manifest.legal,
            })),
        )
            .into_response());
    };
    let declared: HashSet<_> = manifest
        .tools
        .iter()
        .map(|tool| tool.name.as_str())
        .collect();
    let mut policies = HashSet::new();
    for policy in &body.tools {
        if !declared.contains(policy.name.as_str()) || !policies.insert(policy.name.as_str()) {
            return Err(AppError::bad_request(format!(
                "tool policy desconocida o duplicada: {}",
                policy.name
            )));
        }
        if policy.max_amount_lamports.is_some_and(|amount| amount <= 0) {
            return Err(AppError::bad_request("max_amount_lamports debe ser > 0"));
        }
    }
    let auth_enc = match body
        .access_token
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        Some(token) => Some(crypto::seal(&accounts::master_key_of(&state)?, token)?),
        None => None,
    };
    let now = now_ms();
    let device_json = serde_json::to_string(&device_ids).unwrap_or_else(|_| "[]".into());
    state.db.with(|c| {
        c.execute(
            "INSERT INTO marketplace_installs (account_id, namespace, mode, device_ids_json, auth_enc, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) \
             ON CONFLICT(account_id, namespace) DO UPDATE SET mode = excluded.mode, \
             device_ids_json = excluded.device_ids_json, auth_enc = excluded.auth_enc, updated_at = excluded.updated_at",
            params![account_id, namespace, body.mode, device_json, auth_enc, now],
        )?;
        for tool in &manifest.tools {
            let policy = body.tools.iter().find(|p| p.name == tool.name);
            let enabled = policy.map(|p| p.enabled).unwrap_or(false);
            let max_price = policy.and_then(|p| p.max_amount_lamports);
            // Publisher-controlled `risk_class` is advisory only. A newly
            // installed remote tool always asks for human approval unless the
            // account explicitly opts out in its own policy.
            let confirm = policy.and_then(|p| p.require_confirmation).unwrap_or(true);
            c.execute(
                "INSERT INTO marketplace_tool_policies (account_id, namespace, tool_name, enabled, max_amount_lamports, require_confirmation, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(account_id, namespace, tool_name) \
                 DO UPDATE SET enabled = excluded.enabled, max_amount_lamports = excluded.max_amount_lamports, \
                 require_confirmation = excluded.require_confirmation, updated_at = excluded.updated_at",
                params![account_id, namespace, tool.name, enabled, max_price, confirm, now],
            )?;
        }
        c.execute(
            "INSERT OR IGNORE INTO marketplace_consents (account_id, namespace, version, manifest_hash, terms_sha256, privacy_sha256, accepted_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![account_id, namespace, app.current_version, manifest_hash,
                consent.terms_sha256, consent.privacy_sha256, now],
        )?;
        Ok(())
    })?;
    Ok(Json(
        json!({ "ok": true, "namespace": namespace, "mode": body.mode,
        "device_ids": device_ids, "version": app.current_version,
        "manifest_hash": manifest_hash, "legal_consent": true,
        "tools": manifest.tools.iter().map(|t| json!({
            "name": t.name, "enabled": body.tools.iter().find(|p| p.name == t.name).map(|p| p.enabled).unwrap_or(false),
            "risk_class": t.risk_class, "price": t.price,
        })).collect::<Vec<_>>() }),
    ).into_response())
}

pub async fn tool_policy_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path((namespace, tool_name)): Path<(String, String)>,
    Json(body): Json<ToolPolicyBody>,
) -> AppResult<impl IntoResponse> {
    let account_id = human_account(&state, &headers)?;
    let app = load_app(&state, &namespace)?;
    let manifest = load_manifest(&state, &namespace, &app.current_version)?;
    let tool = manifest
        .tools
        .iter()
        .find(|t| t.name == tool_name)
        .ok_or_else(|| AppError::not_found("tool no declarada en el manifiesto"))?;
    if body.max_amount_lamports.is_some_and(|amount| amount <= 0) {
        return Err(AppError::bad_request("max_amount_lamports debe ser > 0"));
    }
    let now = now_ms();
    let changed = state.db.with(|c| c.execute(
        "UPDATE marketplace_tool_policies SET enabled = ?1, max_amount_lamports = ?2, \
         require_confirmation = ?3, updated_at = ?4 WHERE account_id = ?5 AND namespace = ?6 AND tool_name = ?7",
        params![body.enabled, body.max_amount_lamports, body.require_confirmation.unwrap_or(true), now, account_id, namespace, tool_name],
    ))?;
    if changed == 0 {
        return Err(AppError::not_found(
            "instala primero la app para configurar sus tools",
        ));
    }
    Ok(Json(
        json!({ "ok": true, "namespace": namespace, "tool": tool.name,
        "enabled": body.enabled, "max_amount_lamports": body.max_amount_lamports,
        "require_confirmation": body.require_confirmation.unwrap_or(true) }),
    ))
}

fn account_device(
    state: &SharedState,
    account_id: &str,
    session_device: Option<&str>,
    requested: Option<&str>,
) -> AppResult<Option<String>> {
    if let Some(actual) = session_device {
        if requested.is_some_and(|requested| requested != actual) {
            return Err(AppError::forbidden(
                "un token de dispositivo no puede actuar por otra placa",
            ));
        }
        return Ok(Some(actual.to_string()));
    }
    let Some(requested) = requested else {
        return Ok(None);
    };
    validate_device_scope(state, account_id, &[requested.to_string()])?;
    Ok(Some(requested.to_string()))
}

fn install_scope(
    state: &SharedState,
    account: &str,
    namespace: &str,
    device_id: Option<&str>,
) -> AppResult<Option<String>> {
    let row: Option<(String, String)> = state.db.with(|c| c.query_row(
        "SELECT mode, device_ids_json FROM marketplace_installs WHERE account_id = ?1 AND namespace = ?2",
        params![account, namespace], |r| Ok((r.get(0)?, r.get(1)?)),
    ).optional())?;
    let Some((mode, raw_ids)) = row else {
        return Err(AppError::forbidden("instala esta app MCP antes de usarla"));
    };
    let ids: Vec<String> = serde_json::from_str(&raw_ids).unwrap_or_default();
    if mode == "selected" && !device_id.is_some_and(|id| ids.iter().any(|selected| selected == id))
    {
        return Err(AppError::forbidden(
            "esta app no está habilitada para el dispositivo de la solicitud",
        ));
    }
    let token: Option<String> = state
        .db
        .with(|c| {
            c.query_row(
            "SELECT auth_enc FROM marketplace_installs WHERE account_id = ?1 AND namespace = ?2",
            params![account, namespace],
            |r| r.get::<_, Option<String>>(0),
        )
        .optional()
        })?
        .flatten();
    match token {
        Some(enc) => {
            let key = accounts::master_key_of(state)?;
            let raw = crypto::open(&key, &enc)?;
            let token = String::from_utf8(raw)
                .map_err(|_| AppError::internal("token MCP cifrado no es UTF-8"))?;
            Ok(Some(token))
        }
        None => Ok(None),
    }
}

fn tool_policy(
    state: &SharedState,
    account: &str,
    namespace: &str,
    tool: &str,
) -> AppResult<(bool, Option<i64>, bool)> {
    state
        .db
        .with(|c| {
            c.query_row(
        "SELECT enabled, max_amount_lamports, require_confirmation FROM marketplace_tool_policies \
         WHERE account_id = ?1 AND namespace = ?2 AND tool_name = ?3",
        params![account, namespace, tool],
        |r| Ok((r.get::<_, i64>(0)? != 0, r.get(1)?, r.get::<_, i64>(2)? != 0)),
    ).optional()
        })?
        .ok_or_else(|| AppError::forbidden("configura permisos para esta herramienta"))
}

fn validate_value(schema: &Value, value: &Value, path: &str) -> AppResult<()> {
    if let Some(types) = schema.get("type") {
        let matches_type = |kind: &str| match kind {
            "object" => value.is_object(),
            "array" => value.is_array(),
            "string" => value.is_string(),
            "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
            "number" => value.is_number(),
            "boolean" => value.is_boolean(),
            "null" => value.is_null(),
            _ => false,
        };
        let valid = types.as_str().is_some_and(matches_type)
            || types
                .as_array()
                .is_some_and(|items| items.iter().filter_map(Value::as_str).any(matches_type));
        if !valid {
            return Err(AppError::bad_request(format!(
                "argumento {path} tiene un tipo no permitido"
            )));
        }
    }
    let kind = match schema.get("type") {
        Some(Value::String(kind)) => kind.as_str(),
        Some(Value::Array(kinds)) => kinds
            .iter()
            .filter_map(Value::as_str)
            .find(|kind| match *kind {
                "object" => value.is_object(),
                "array" => value.is_array(),
                "string" => value.is_string(),
                "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
                "number" => value.is_number(),
                "boolean" => value.is_boolean(),
                "null" => value.is_null(),
                _ => false,
            })
            .unwrap_or(""),
        _ if value.is_object() => "object",
        _ if value.is_array() => "array",
        _ => "",
    };
    if let Some(enum_values) = schema.get("enum").and_then(Value::as_array) {
        if !enum_values.contains(value) {
            return Err(AppError::bad_request(format!(
                "argumento {path} fuera del enum permitido"
            )));
        }
    }
    if kind == "object" {
        let props = schema.get("properties").and_then(Value::as_object);
        let object = value
            .as_object()
            .ok_or_else(|| AppError::bad_request(format!("argumento {path} debe ser objeto")))?;
        if let Some(required) = schema.get("required").and_then(Value::as_array) {
            for name in required.iter().filter_map(Value::as_str) {
                if !object.contains_key(name) {
                    return Err(AppError::bad_request(format!(
                        "falta argumento {path}.{name}"
                    )));
                }
            }
        }
        for (name, val) in object {
            if let Some(prop) = props.and_then(|props| props.get(name)) {
                validate_value(prop, val, &format!("{path}.{name}"))?;
            } else if let Some(additional_schema) =
                schema.get("additionalProperties").filter(|v| v.is_object())
            {
                validate_value(additional_schema, val, &format!("{path}.{name}"))?;
            } else if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
                return Err(AppError::bad_request(format!(
                    "argumento {path}.{name} no está declarado"
                )));
            }
        }
    }
    if kind == "array" {
        let items = value.as_array().expect("array type checked above");
        if schema
            .get("minItems")
            .and_then(Value::as_u64)
            .is_some_and(|min| items.len() < min as usize)
            || schema
                .get("maxItems")
                .and_then(Value::as_u64)
                .is_some_and(|max| items.len() > max as usize)
        {
            return Err(AppError::bad_request(format!(
                "argumento {path} tiene una longitud de array inválida"
            )));
        }
        if let (Some(item_schema), Some(items)) = (schema.get("items"), value.as_array()) {
            for (index, item) in items.iter().enumerate() {
                validate_value(item_schema, item, &format!("{path}[{index}]"))?;
            }
        }
    }
    if let Some(string) = value.as_str() {
        if schema
            .get("minLength")
            .and_then(Value::as_u64)
            .is_some_and(|min| string.chars().count() < min as usize)
            || schema
                .get("maxLength")
                .and_then(Value::as_u64)
                .is_some_and(|max| string.chars().count() > max as usize)
        {
            return Err(AppError::bad_request(format!(
                "argumento {path} tiene una longitud inválida"
            )));
        }
    }
    if let Some(number) = value.as_f64() {
        if schema
            .get("minimum")
            .and_then(Value::as_f64)
            .is_some_and(|min| number < min)
            || schema
                .get("maximum")
                .and_then(Value::as_f64)
                .is_some_and(|max| number > max)
        {
            return Err(AppError::bad_request(format!(
                "argumento {path} está fuera del rango permitido"
            )));
        }
    }
    Ok(())
}

fn compare_mcp_tools(manifest: &SignedManifest, remote: &[Value]) -> Result<(), String> {
    let expected: BTreeMap<_, _> = manifest
        .tools
        .iter()
        .map(|tool| (tool.name.as_str(), tool))
        .collect();
    let mut seen = HashSet::new();
    for tool in remote {
        let name = tool
            .get("name")
            .and_then(Value::as_str)
            .ok_or("tools/list incluye tool sin nombre")?;
        if !seen.insert(name.to_string()) {
            return Err(format!("tools/list contiene nombre duplicado: {name}"));
        }
        let declared = expected
            .get(name)
            .ok_or_else(|| format!("tool no declarada en manifiesto: {name}"))?;
        let remote_schema = tool
            .get("inputSchema")
            .ok_or_else(|| format!("tool {name} no tiene inputSchema"))?;
        if canonical_json(remote_schema).map_err(|e| e.to_string())?
            != canonical_json(&declared.input_schema).map_err(|e| e.to_string())?
        {
            return Err(format!("inputSchema MCP no coincide para {name}"));
        }
    }
    if seen.len() != expected.len() {
        return Err("tools/list no coincide con todas las tools del manifiesto".into());
    }
    Ok(())
}

fn agent_tool_name(namespace: &str, tool: &str) -> String {
    let digest = hex::encode(Sha256::digest(format!("{namespace}:{tool}").as_bytes()));
    format!(
        "mcp_{}_{}",
        namespace.chars().take(36).collect::<String>(),
        &digest[..16]
    )
}

pub async fn account_tools_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let (account, session_device) = account_identity(&state, &headers)?;
    let installs: Vec<(String, String, String)> = state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT i.namespace, i.mode, i.device_ids_json FROM marketplace_installs i \
             JOIN marketplace_apps a ON a.namespace = i.namespace \
             JOIN marketplace_manifests m ON m.namespace = a.namespace AND m.version = a.current_version \
             WHERE i.account_id = ?1 AND a.status = 'active' AND m.legal_status = 'verified'",
        )?;
        let rows = stmt.query_map(params![account], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        rows.collect::<Result<Vec<_>, _>>()
    })?;
    let mut out = Vec::new();
    for (namespace, mode, device_ids_json) in installs {
        let ids: Vec<String> = serde_json::from_str(&device_ids_json).unwrap_or_default();
        if mode == "selected" && !session_device.as_ref().is_some_and(|id| ids.contains(id)) {
            continue;
        }
        let app = load_app(&state, &namespace)?;
        let manifest = load_manifest(&state, &namespace, &app.current_version)?;
        if !consent_matches_current(&state, &account, &namespace, &manifest)? {
            continue;
        }
        for tool in manifest.tools {
            let Ok((enabled, _, _)) = tool_policy(&state, &account, &namespace, &tool.name) else {
                continue;
            };
            if !enabled {
                continue;
            }
            out.push(json!({
                "name": agent_tool_name(&namespace, &tool.name),
                "namespace": namespace,
                "tool_name": tool.name,
                "description": format!("{} (MCP remoto; {} lamports por llamada)", tool.description, tool.price.amount_atomic),
                "input_schema": tool.input_schema,
                "price": tool.price,
                "risk_class": tool.risk_class,
                "permissions": tool.permissions,
                "version": app.current_version,
            }));
        }
    }
    Ok(Json(json!({ "ok": true, "tools": out })))
}

pub async fn approvals_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> AppResult<impl IntoResponse> {
    let account = human_account(&state, &headers)?;
    let rows: Vec<(String, String, String, String, String, i64, i64)> = state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT id, namespace, version, tool_name, args_json_enc, amount_lamports, expires_at \
             FROM marketplace_approvals WHERE account_id = ?1 AND status = 'pending' AND expires_at > ?2 \
             ORDER BY created_at DESC LIMIT 100",
        )?;
        let rows = stmt.query_map(params![account, now_ms()], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?)))?;
        rows.collect::<Result<Vec<_>, _>>()
    })?;
    let key = accounts::master_key_of(&state)?;
    let approvals: Vec<Value> = rows
        .into_iter()
        .filter_map(|(id, namespace, version, tool, enc, amount, expires)| {
            let args = crypto::open(&key, &enc)
                .ok()
                .and_then(|raw| String::from_utf8(raw).ok())
                .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
                .unwrap_or(Value::Null);
            Some(
                json!({ "id":id, "namespace":namespace, "version":version, "tool":tool,
            "arguments":args, "amount_lamports":amount, "expires_at":expires }),
            )
        })
        .collect();
    Ok(Json(json!({ "ok": true, "approvals": approvals })))
}

pub async fn approval_decision_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path(approval_id): Path<String>,
    Json(decision): Json<ApprovalDecision>,
) -> AppResult<impl IntoResponse> {
    let account = human_account(&state, &headers)?;
    let status = if decision.approved {
        "approved"
    } else {
        "rejected"
    };
    let changed = state.db.with(|c| {
        c.execute(
            "UPDATE marketplace_approvals SET status = ?1 WHERE id = ?2 AND account_id = ?3 \
         AND status = 'pending' AND expires_at > ?4",
            params![status, approval_id, account, now_ms()],
        )
    })?;
    if changed == 0 {
        return Err(AppError::not_found(
            "aprobación no existe, venció o ya fue resuelta",
        ));
    }
    Ok(Json(
        json!({ "ok": true, "approval_id": approval_id, "status": status }),
    ))
}

pub async fn call_handler(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Path((namespace, tool_name)): Path<(String, String)>,
    Json(body): Json<ToolCallBody>,
) -> AppResult<Response> {
    let (account, session_device) = account_identity(&state, &headers)?;
    let device_id = account_device(
        &state,
        &account,
        session_device.as_deref(),
        body.device_id.as_deref(),
    )?;
    let app = load_app(&state, &namespace)?;
    if app.status != "active" {
        return Err(AppError::unavailable(format!(
            "app en estado {}",
            app.status
        )));
    }
    let manifest = load_manifest(&state, &namespace, &app.current_version)?;
    ensure_legal_verified(&state, &namespace, &app.current_version)?;
    if !consent_matches_current(&state, &account, &namespace, &manifest)? {
        return Err(AppError::conflict(
            "LEGAL_CONSENT_REQUIRED: acepta los términos de la versión actual antes de invocar sus tools",
        ));
    }
    let tool = manifest
        .tools
        .iter()
        .find(|tool| tool.name == tool_name)
        .ok_or_else(|| AppError::not_found("tool no está en la versión publicada"))?;
    let arguments = if body.arguments.is_null() {
        json!({})
    } else {
        body.arguments
    };
    validate_value(&tool.input_schema, &arguments, "arguments")?;
    let endpoint_token = install_scope(&state, &account, &namespace, device_id.as_deref())?;
    let (enabled, max_price, require_confirmation) =
        tool_policy(&state, &account, &namespace, &tool_name)?;
    if !enabled {
        return Err(AppError::forbidden("el usuario deshabilitó esta tool"));
    }
    if max_price.is_some_and(|max| tool.price.amount_atomic > max) {
        return Err(AppError::forbidden(
            "el precio de la tool excede el límite configurado por la cuenta",
        ));
    }
    let (_environment, network) = x402::execution_context(&state, &account, device_id.as_deref());
    if network != tool.price.network {
        return Err(AppError::conflict(format!(
            "la cuenta opera en {network}, pero esta tool cobra en {}",
            tool.price.network
        )));
    }
    let args_json = canonical_json(&arguments)?;
    let args_hash = hex::encode(Sha256::digest(args_json.as_bytes()));
    let resource = format!(
        "x402:mcp:{}:{}:{}:{}:{}:{}:{}",
        namespace,
        app.current_version,
        tool.name,
        args_hash,
        tool.price.network,
        tool.price.amount_atomic,
        tool.price.pay_to
    );
    let payment_id = headers
        .get("x-payment")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty());

    let approval_id = if require_confirmation {
        let auto_approved: Option<String> = if body.approval_id.is_none() {
            state.db.with(|c| c.query_row(
                "SELECT id FROM marketplace_approvals WHERE account_id = ?1 AND device_id IS ?2 \
                 AND namespace = ?3 AND version = ?4 AND tool_name = ?5 AND args_hash = ?6 \
                 AND status = 'approved' AND expires_at > ?7 ORDER BY created_at DESC LIMIT 1",
                params![account, device_id, namespace, app.current_version, tool.name, args_hash, now_ms()],
                |r| r.get(0),
            ).optional())?
        } else {
            None
        };
        let Some(approval_id) = body.approval_id.as_deref().or(auto_approved.as_deref()) else {
            return create_approval(
                &state,
                &account,
                device_id.as_deref(),
                &namespace,
                &app.current_version,
                &tool.name,
                &args_json,
                &args_hash,
                tool.price.amount_atomic,
            );
        };
        let row: Option<(String, String, String, i64, Option<String>)> = state.db.with(|c| c.query_row(
            "SELECT status, args_hash, version, expires_at, invoice_id FROM marketplace_approvals \
             WHERE id = ?1 AND account_id = ?2 AND namespace = ?3 AND tool_name = ?4 AND device_id IS ?5",
            params![approval_id, account, namespace, tool.name, device_id],
            |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?)),
        ).optional())?;
        let Some((status, approved_hash, approved_version, expires, invoice_id)) = row else {
            return Err(AppError::forbidden(
                "aprobación no corresponde a esta llamada",
            ));
        };
        if status != "approved"
            || approved_hash != args_hash
            || approved_version != app.current_version
            || expires <= now_ms()
        {
            return Err(AppError::forbidden(
                "aprobación vencida, rechazada o para otros argumentos",
            ));
        }
        if payment_id.is_some_and(|payment| invoice_id.as_deref() != Some(payment)) {
            return Err(AppError::conflict(
                "la factura no corresponde a la aprobación de esta llamada",
            ));
        }
        if invoice_id.is_some() && payment_id.is_none() {
            return Ok((StatusCode::PAYMENT_REQUIRED, Json(json!({ "ok": false, "error": "Payment Required",
                "invoice": x402::invoice_value_for(&state, invoice_id.as_deref().unwrap_or_default())?,
                "approval_id": approval_id, "resource": resource }))).into_response());
        }
        Some(approval_id.to_string())
    } else {
        None
    };

    if payment_id.is_none() {
        let invoice = x402::create_invoice_value_for_payee(
            &state,
            &resource,
            tool.price.amount_atomic,
            Some(&account),
            device_id.as_deref(),
            &tool.price.pay_to,
        )
        .await?;
        if let Some(approval_id) = approval_id.as_deref() {
            state.db.with(|c| c.execute(
                "UPDATE marketplace_approvals SET invoice_id = ?1 WHERE id = ?2 AND account_id = ?3 AND status = 'approved'",
                params![invoice["id"].as_str(), approval_id, account],
            ))?;
        }
        let mut response = Json(json!({ "ok": false, "error": "Payment Required (x402)",
            "app": namespace, "tool": tool.name, "resource": resource,
            "price": tool.price, "invoice": invoice,
            "how": ["paga la factura con dPaaS", "reintenta la misma llamada con X-Payment: <invoice_id>"] })).into_response();
        *response.status_mut() = StatusCode::PAYMENT_REQUIRED;
        response
            .headers_mut()
            .insert("WWW-Authenticate", HeaderValue::from_static("X402"));
        if let Some(id) = invoice["id"]
            .as_str()
            .and_then(|s| HeaderValue::from_str(s).ok())
        {
            response.headers_mut().insert("X-Payment-Invoice-Id", id);
        }
        return Ok(response);
    }

    let invoice_id = payment_id.unwrap_or_default();
    let Some((invoice_resource, amount, payee, invoice_network, status, _tx_signature)) =
        x402::invoice_terms(&state, invoice_id)
    else {
        return Err(AppError::not_found("factura no encontrada"));
    };
    if invoice_resource != resource
        || amount != tool.price.amount_atomic
        || payee != tool.price.pay_to
        || invoice_network != tool.price.network
    {
        return Err(AppError::conflict(
            "factura no coincide con versión, tool, argumentos, red y precio actuales",
        ));
    }
    let _ = status; // pending/verifying invoices are rendered as 402 below.
    if let Err(response) =
        x402::verify_access_for_resource(&state, invoice_id, Some(&account), Some(&resource))
    {
        return Ok(response);
    }

    let started = Instant::now();
    let (client, endpoint) = endpoint_client(&state, &manifest.endpoint)
        .await
        .map_err(|e| AppError::unavailable(format!("endpoint MCP: {e}")))?;
    let (remote_tools, session) = list_mcp_tools(&client, &endpoint, endpoint_token.as_deref())
        .await
        .map_err(|e| AppError::unavailable(format!("preflight MCP: {e}")))?;
    compare_mcp_tools(&manifest, &remote_tools)
        .map_err(|e| AppError::conflict(format!("el endpoint cambió desde la publicación: {e}")))?;
    if let Err(response) = x402::consume_access(&state, invoice_id) {
        return Ok(response);
    }
    if let Some(approval_id) = approval_id.as_deref() {
        state.db.with(|c| c.execute(
            "UPDATE marketplace_approvals SET status = 'consumed', consumed_at = ?1 WHERE id = ?2 AND status = 'approved'",
            params![now_ms(), approval_id],
        ))?;
    }
    let (_, _, _, _, _, tx_signature) = x402::invoice_terms(&state, invoice_id).unwrap_or_default();
    let receipt = json!({ "scheme":"exact", "asset":"SOL", "network":invoice_network,
        "amount_atomic":amount, "pay_to":payee, "invoice_id":invoice_id,
        "transaction_signature":tx_signature, "status":"settled" });
    let mut params_value = json!({"name":tool.name,"arguments":arguments,
        "_meta":{"io.nomikos/x402-receipt":receipt}});
    let call_result = mcp_rpc(
        &client,
        &endpoint,
        "tools/call",
        std::mem::take(&mut params_value),
        Some(1000),
        session.as_deref(),
        endpoint_token.as_deref(),
    )
    .await;
    let latency = started.elapsed().as_millis().min(i64::MAX as u128) as i64;
    match call_result {
        Ok((result, _)) => {
            if let Some(schema) = &tool.output_schema {
                let content = result.get("structuredContent").ok_or_else(|| {
                    AppError::unavailable(
                        "respuesta MCP no incluye structuredContent requerido por output_schema",
                    )
                });
                let output_validation = content
                    .and_then(|content| validate_value(schema, content, "structuredContent"));
                if let Err(error) = output_validation {
                    record_call(
                        &state,
                        &account,
                        device_id.as_deref(),
                        &namespace,
                        &app.current_version,
                        &tool.name,
                        invoice_id,
                        "schema_error",
                        Some(502),
                        latency,
                        Some("output_schema"),
                    )?;
                    return Err(AppError::unavailable(format!(
                        "respuesta MCP incumple output_schema: {error}"
                    )));
                }
            }
            let is_error = result
                .get("isError")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            record_call(
                &state,
                &account,
                device_id.as_deref(),
                &namespace,
                &app.current_version,
                &tool.name,
                invoice_id,
                if is_error { "tool_error" } else { "success" },
                Some(200),
                latency,
                is_error.then_some("tool_error"),
            )?;
            Ok(Json(json!({ "ok": !is_error, "app": namespace, "version": app.current_version,
                "tool": tool.name, "result": result, "payment": receipt, "invoice_id": invoice_id })).into_response())
        }
        Err(error) => {
            record_call(
                &state,
                &account,
                device_id.as_deref(),
                &namespace,
                &app.current_version,
                &tool.name,
                invoice_id,
                "endpoint_error",
                Some(502),
                latency,
                Some("mcp_transport"),
            )?;
            Err(AppError::unavailable(format!(
                "la llamada MCP falló después del cobro one-shot: {error}"
            )))
        }
    }
}

fn create_approval(
    state: &SharedState,
    account: &str,
    device_id: Option<&str>,
    namespace: &str,
    version: &str,
    tool: &str,
    args_json: &str,
    args_hash: &str,
    amount: i64,
) -> AppResult<Response> {
    let existing: Option<String> = state.db.with(|c| {
        c.query_row(
            "SELECT id FROM marketplace_approvals WHERE account_id = ?1 AND device_id IS ?2 \
         AND namespace = ?3 AND version = ?4 AND tool_name = ?5 AND args_hash = ?6 \
         AND status = 'pending' AND expires_at > ?7 ORDER BY created_at DESC LIMIT 1",
            params![
                account,
                device_id,
                namespace,
                version,
                tool,
                args_hash,
                now_ms()
            ],
            |r| r.get(0),
        )
        .optional()
    })?;
    if let Some(id) = existing {
        return Ok((
            StatusCode::CONFLICT,
            Json(json!({
                "ok": false, "code": "TOOL_APPROVAL_REQUIRED",
                "error": "se requiere aprobaciÃ³n humana antes de cotizar y cobrar esta acciÃ³n",
                "approval_id": id, "namespace": namespace, "version": version,
                "tool": tool, "amount_lamports": amount,
            })),
        )
            .into_response());
    }
    let key = accounts::master_key_of(state)?;
    let args_enc = crypto::seal(&key, args_json)?;
    let id = new_id("approval");
    let expires = now_ms() + APPROVAL_TTL_MS;
    state.db.with(|c| c.execute(
        "INSERT INTO marketplace_approvals (id, account_id, device_id, namespace, version, tool_name, \
         args_hash, args_json_enc, amount_lamports, status, expires_at, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?11)",
        params![id, account, device_id, namespace, version, tool, args_hash, args_enc, amount, expires, now_ms()],
    ))?;
    Ok((
        StatusCode::CONFLICT,
        Json(json!({ "ok": false, "code": "TOOL_APPROVAL_REQUIRED",
        "error": "se requiere aprobación humana antes de cotizar y cobrar esta acción",
        "approval_id": id, "namespace": namespace, "version": version, "tool": tool,
        "amount_lamports": amount, "expires_at": expires })),
    )
        .into_response())
}

fn record_call(
    state: &SharedState,
    account: &str,
    device_id: Option<&str>,
    namespace: &str,
    version: &str,
    tool: &str,
    invoice: &str,
    status: &str,
    http_status: Option<i64>,
    latency_ms: i64,
    error_class: Option<&str>,
) -> AppResult<()> {
    state.db.with(|c| c.execute(
        "INSERT INTO marketplace_call_events (id, account_id, device_id, namespace, version, tool_name, \
         invoice_id, status, http_status, latency_ms, error_class, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![new_id("mcp-call"), account, device_id, namespace, version, tool, invoice,
            status, http_status, latency_ms, error_class, now_ms()],
    ))?;
    refresh_app_health(state, namespace)?;
    Ok(())
}

fn health_metrics(state: &SharedState, namespace: &str) -> AppResult<(i64, i64, i64)> {
    let rows: Vec<(String, String)> = state.db.with(|c| {
        let mut stmt = c.prepare(
            "SELECT invoice_id, status FROM marketplace_call_events WHERE namespace = ?1 \
             AND invoice_id IS NOT NULL AND created_at > ?2 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![namespace, now_ms() - HEALTH_WINDOW_MS], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        rows.collect::<Result<Vec<_>, _>>()
    })?;
    let mut latest_by_invoice = std::collections::HashMap::new();
    for (invoice, status) in rows {
        latest_by_invoice.entry(invoice).or_insert(status);
    }
    let calls = latest_by_invoice.len() as i64;
    let failures = latest_by_invoice
        .values()
        .filter(|status| {
            matches!(
                status.as_str(),
                "tool_error" | "endpoint_error" | "schema_error"
            )
        })
        .count() as i64;
    let reports: i64 = state.db.with(|c| c.query_row(
        "SELECT COUNT(DISTINCT account_id) FROM marketplace_reports WHERE namespace = ?1 AND created_at > ?2",
        params![namespace, now_ms() - REPORT_WINDOW_MS], |r| r.get(0),
    ))?;
    Ok((calls, failures, reports))
}

fn refresh_app_health(state: &SharedState, namespace: &str) -> AppResult<()> {
    let (calls, failures, reporters) = health_metrics(state, namespace)?;
    let current = load_app(state, namespace)?;
    let report_threshold = reporters >= 3;
    let failure_threshold = calls >= 5 && failures >= 3 && failures * 2 >= calls;
    if report_threshold || failure_threshold {
        let reason = if report_threshold {
            "tres o más cuentas distintas enviaron reportes verificados por factura en 24 horas"
        } else {
            "falló al menos la mitad de cinco o más llamadas pagadas en 15 minutos"
        };
        state.db.with(|c| {
            c.execute(
            "UPDATE marketplace_apps SET status = 'quarantined', health_status = 'quarantined', \
             quarantine_reason = ?1, updated_at = ?2 WHERE namespace = ?3",
            params![reason, now_ms(), namespace],
        )
        })?;
    } else if current.status != "quarantined" {
        let health = if calls >= 4 && failures * 4 >= calls {
            "degraded"
        } else {
            "healthy"
        };
        state.db.with(|c| c.execute(
            "UPDATE marketplace_apps SET status = 'active', health_status = ?1, quarantine_reason = NULL, updated_at = ?2 WHERE namespace = ?3",
            params![health, now_ms(), namespace],
        ))?;
    }
    Ok(())
}

fn reputation_value(state: &SharedState, namespace: &str) -> AppResult<Value> {
    let (calls, failures, reports) = health_metrics(state, namespace)?;
    let reports_total: i64 = state.db.with(|c| {
        c.query_row(
            "SELECT COUNT(*) FROM marketplace_reports WHERE namespace = ?1 AND created_at > ?2",
            params![namespace, now_ms() - REPORT_WINDOW_MS],
            |r| r.get(0),
        )
    })?;
    let successful = (calls - failures).max(0);
    let rate = if calls == 0 {
        Value::Null
    } else {
        json!(successful as f64 / calls as f64)
    };
    Ok(
        json!({ "calls_last_15m": calls, "failures_last_15m": failures,
        "success_rate_last_15m": rate, "reports_last_24h": reports_total,
        "distinct_reporters_last_24h": reports, "circuit_breaker_minimum_calls": 5 }),
    )
}
