//! Cliente mínimo de Cloudflare R2 (S3-compatible) con firma SigV4 a mano.
//!
//! Se firma con sha2 + hmac y se calcula la fecha civil sin dependencias.
//! La petición es path-style: https://{account}.r2.cloudflarestorage.com/{bucket}/{key}
//!
//! (Se evitó `object_store` porque introduce checksums que R2 rechaza con
//! `XAmzContentSHA256Mismatch`.)

use crate::config::R2Config;
use base64::Engine;
use hmac::{Hmac, Mac};
use reqwest::header::{AUTHORIZATION, CONTENT_LENGTH};
use reqwest::{Method, Response};
use serde_json::Value;
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;
const REGION: &str = "auto"; // así trata R2 a la región en SigV4

pub struct R2 {
    cfg: R2Config,
    http: reqwest::Client,
}

pub struct Uploaded {
    pub size: i64,
    pub etag: Option<String>,
}

fn sha256(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("hmac acepta cualquier longitud");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn hex_string(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Percent-encoding mínimo del key de objeto (caracteres unreserved + '/').
fn pct_path(key: &str) -> String {
    let mut out = String::new();
    for &b in key.as_bytes() {
        let safe = b.is_ascii_alphanumeric()
            || b == b'-'
            || b == b'_'
            || b == b'.'
            || b == b'~'
            || b == b'/';
        if safe {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max])
    }
}

/// Algoritmo de Howard Hinnant: días desde la época → (y, m, d) UTC.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era: i64 = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe: u64 = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

impl R2 {
    pub fn new(cfg: R2Config, http: reqwest::Client) -> Self {
        Self { cfg, http }
    }

    /// URI canónica del recurso: /{bucket}/{key}
    fn canonical_uri(&self, key: &str) -> String {
        format!("/{}/{}", self.cfg.bucket, pct_path(key))
    }

    /// Devuelve (amz_date, scope, header Authorization).
    fn build_authz(
        &self,
        method: &str,
        canonical_uri: &str,
        payload_hash: &str,
    ) -> (String, String, String) {
        let unix = (crate::db::now_ms() / 1000) as i64;
        let days = unix.div_euclid(86_400);
        let secs = unix.rem_euclid(86_400);
        let (year, month, day) = civil_from_days(days);
        let (h, m, s) = (
            (secs / 3600) as u32,
            ((secs % 3600) / 60) as u32,
            (secs % 60) as u32,
        );
        let amz_date = format!("{year:04}{month:02}{day:02}T{h:02}{m:02}{s:02}Z");
        let date_str = format!("{year:04}{month:02}{day:02}");
        let scope = format!("{date_str}/{REGION}/s3/aws4_request");

        let host = self.cfg.host();
        let signed_headers = "host;x-amz-content-sha256;x-amz-date";
        let canonical_headers =
            format!("host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n");

        // Canonical request: METHOD \n URI \n query(vacío) \n headers \n signed \n hash
        let canonical_request = format!(
            "{method}\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
        );
        let canonical_hash = hex_string(&sha256(canonical_request.as_bytes()));
        let string_to_sign = format!("AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{canonical_hash}");

        let k_date = hmac_sha256(
            format!("AWS4{}", self.cfg.secret_access_key).as_bytes(),
            date_str.as_bytes(),
        );
        let k_region = hmac_sha256(&k_date, REGION.as_bytes());
        let k_service = hmac_sha256(&k_region, b"s3");
        let k_signing = hmac_sha256(&k_service, b"aws4_request");
        let signature = hex_string(&hmac_sha256(&k_signing, string_to_sign.as_bytes()));

        let authorization = format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            self.cfg.access_key_id, scope, signed_headers, signature
        );
        (amz_date, scope, authorization)
    }

    async fn signed_request(
        &self,
        method: Method,
        key: &str,
        body: Option<Vec<u8>>,
    ) -> Result<Response, String> {
        let url = format!("https://{}{}", self.cfg.host(), self.canonical_uri(key));
        // x-amz-content-sha256: hash del body (vacío para GET, real para PUT)
        let payload_hash = match &body {
            Some(data) => hex_string(&sha256(data)),
            None => hex_string(&sha256(b"")),
        };
        let (amz_date, _scope, authz) =
            self.build_authz(method.as_str(), &self.canonical_uri(key), &payload_hash);

        let mut req = self
            .http
            .request(method, &url)
            .header(AUTHORIZATION, authz)
            .header("x-amz-date", amz_date)
            .header("x-amz-content-sha256", &payload_hash)
            .header(
                CONTENT_LENGTH,
                if body.is_some() {
                    body.as_deref().unwrap().len()
                } else {
                    0
                },
            );
        if let Some(data) = body {
            req = req.body(data);
        }

        let res = req.send().await.map_err(|e| format!("R2 request: {e}"))?;
        let status = res.status();
        if !status.is_success() {
            let text = res.text().await.unwrap_or_default();
            return Err(format!("R2 {status}: {}", truncate(&text, 300)));
        }
        Ok(res)
    }

    /// Sube un objeto; devuelve tamaño y ETag (md5 entre comillas se recorta).
    pub async fn put(&self, key: &str, data: Vec<u8>) -> Result<Uploaded, String> {
        let size = data.len() as i64;
        let res = self.signed_request(Method::PUT, key, Some(data)).await?;
        let etag = res
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.trim_matches('"').to_string());
        Ok(Uploaded { size, etag })
    }

    /// Descarga el objeto entero a memoria (el GLB cabe de sobra).
    pub async fn get(&self, key: &str) -> Result<Vec<u8>, String> {
        let res = self.signed_request(Method::GET, key, None).await?;
        let bytes = res.bytes().await.map_err(|e| format!("R2 body: {e}"))?;
        Ok(bytes.to_vec())
    }

    /// Descarga un objeto vía Cloudflare REST API con Bearer token.
    /// GET https://api.cloudflare.com/client/v4/accounts/{id}/storage/r2/objects/{bucket}/{key}
    pub async fn get_via_cloudflare_api(&self, key: &str) -> Result<Vec<u8>, String> {
        let Some(token) = self.cfg.api_token.as_deref().filter(|t| !t.is_empty()) else {
            return Err("R2 API Token no configurado".to_string());
        };
        let url = self.cfg.cf_object_url(key);
        let res = self
            .http
            .get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| format!("Cloudflare API request: {e}"))?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("Cloudflare API {status}: {}", truncate(&text, 300)));
        }
        // La API devuelve JSON: { result: { data: "<base64>" }, ... }
        let body: Value = res
            .json()
            .await
            .map_err(|e| format!("Cloudflare API JSON: {e}"))?;
        let data_b64 = body
            .get("result")
            .and_then(|r| r.get("data"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Cloudflare API sin campo result.data".to_string())?;
        base64::engine::general_purpose::STANDARD
            .decode(data_b64)
            .map_err(|e| format!("Cloudflare API base64 decode: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_dates() {
        // 1970-01-01 → (1970, 1, 1)
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        // 2000-02-29 (día 11016 desde la época)
        assert_eq!(civil_from_days(11_016), (2000, 2, 29));
        // 2026-10-22 ( día 20748 desde la época )
        assert_eq!(civil_from_days(20_748), (2026, 10, 22));
    }

    #[test]
    fn pct() {
        assert_eq!(
            pct_path("models/ESP32-S3-Touch-AMOLED-1.43.glb"),
            "models/ESP32-S3-Touch-AMOLED-1.43.glb"
        );
        // '/' se preserva (keys con carpetas); espacio y '+' se escapan.
        assert_eq!(pct_path("a b/c+d"), "a%20b/c%2Bd");
    }
}
