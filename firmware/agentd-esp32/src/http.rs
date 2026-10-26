//! http.rs — cliente HTTP/1.1 minimalista sobre el stack blocking.
//!
//! Una petición = una conexión (`Connection: close`): el peer cierra al
//! terminar y el read termina en EOF. Sin chunked ni gzip: los endpoints
//! del api responden JSON con content-length.

use crate::config::{API_HOST, API_PORT, API_PREFIX};
use crate::net::Stack;

/// Buffer de respuesta (facturas x402 con sus metadatos caben de sobra).
pub const BODY_MAX: usize = 2048;

pub struct Response {
    pub status: u16,
    pub body: [u8; BODY_MAX],
    pub body_len: usize,
}

impl Response {
    pub fn body_str(&self) -> &str {
        // el api SIEMPRE responde JSON UTF-8; lo no válido se corta
        core::str::from_utf8(&self.body[..self.body_len]).unwrap_or("")
    }

    /// `"clave":"valor"` del body (parser plano de agentd-core).
    pub fn str_field(&self, key: &str) -> Option<&str> {
        agentd_core::json_str(self.body_str(), key)
    }

    pub fn num_field(&self, key: &str) -> Option<&str> {
        agentd_core::json_num(self.body_str(), key)
    }
}

/// Petición HTTP al api. Bloquea hasta respuesta o timeout interno.
/// `body` = cuerpo JSON (POST); `bearer` = token de cuenta/dispositivo;
/// `x_payment` = factura liquidada para el handshake x402.
pub fn request(
    stack: &mut Stack<'_>,
    method: &str,
    path: &str,
    body: Option<&str>,
    bearer: Option<&str>,
    x_payment: Option<&str>,
) -> Option<Response> {
    stack.connect(API_HOST, API_PORT).ok()?;

    use core::fmt::Write;
    let mut req = heapless::String::<512>::new();
    let _ = write!(
        req,
        "{method} {API_PREFIX}{path} HTTP/1.1\r\nHost: {}.{}.{}.{}:{}\r\n",
        API_HOST[0], API_HOST[1], API_HOST[2], API_HOST[3], API_PORT
    );
    let _ = req.push_str("Content-Type: application/json\r\n");
    if let Some(b) = bearer {
        let _ = write!(req, "Authorization: Bearer {b}\r\n");
    }
    if let Some(p) = x_payment {
        let _ = write!(req, "X-Payment: {p}\r\n");
    }
    if let Some(b) = body {
        let _ = write!(req, "Content-Length: {}\r\n", b.len());
    }
    let _ = req.push_str("Connection: close\r\n\r\n");
    if let Some(b) = body {
        let _ = req.push_str(b);
    }

    use embedded_io::{Read as _, Write as _};
    if stack.write_all(req.as_bytes()).is_err() {
        stack.close();
        return None;
    }
    let _ = stack.flush();

    // leer hasta EOF del peer (Connection: close) o límite del buffer
    let mut raw = [0u8; BODY_MAX + 512];
    let mut total = 0usize;
    loop {
        if total >= raw.len() {
            break;
        }
        match stack.read(&mut raw[total..]) {
            Ok(0) | Err(_) => break,
            Ok(n) => total += n,
        }
    }
    stack.close();

    // HTTP/1.1 200 … → status; body tras \r\n\r\n
    let text = core::str::from_utf8(&raw[..total]).ok()?;
    let status = text.split_ascii_whitespace().nth(1)?.parse().ok()?;
    let split = text.find("\r\n\r\n")?;
    let body_bytes = &raw[split + 4..total];

    let mut resp = Response { status, body: [0u8; BODY_MAX], body_len: body_bytes.len().min(BODY_MAX) };
    resp.body[..resp.body_len].copy_from_slice(&body_bytes[..resp.body_len]);
    Some(resp)
}
