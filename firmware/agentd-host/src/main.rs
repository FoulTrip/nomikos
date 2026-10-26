//! agentd-host — simulador del agente de dispositivo (NomikOS Fase 3).
//!
//! Compila la MISMA lógica que llevará el firmware ESP32 (`agentd-core`)
//! sobre std: red por TCP directo, persistencia en `state/` y "consola"
//! por stdout. Permite desarrollar y validar todo el ciclo contra el api
//! REAL sin placa conectada:
//!
//!   enroll → banner de claim → token → heartbeat → peaje x402 (402 →
//!   la cuenta paga por dPaaS → reintento one-shot con X-Payment → 200)
//!
//! Uso:
//!   cargo run -p agentd-host --release
//!   AGENTD_API_URL=http://localhost:8080/api AGENTD_NAME=mi-placa …
//!   AGENTD_X402=0  → desactiva la demo del peaje

use agentd_core::{classify, json_num, json_str, next_action, write_claim_banner, write_toll_banner};
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const HEARTBEAT_SECS: u64 = 15;
const TOKEN_POLL_SECS: u64 = 5;
const INVOICE_POLL_MS: u64 = 3_000;
const INVOICE_TIMEOUT_MS: u64 = 180_000;

fn log(tag: &str, msg: &str) {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    println!("[{secs:>10}] [{tag}] {msg}");
}

// ---------------------------------------------------------------------------
// Persistencia (equivalente NVS del firmware): state/device.json
// ---------------------------------------------------------------------------

struct Persisted {
    pubkey: String,
    device_id: Option<String>,
    enroll_secret: Option<String>,
    token: Option<String>,
}

fn state_path() -> PathBuf {
    env::var("AGENTD_STATE").unwrap_or_else(|_| "state/device.json".into()).into()
}

fn save_state(p: &Persisted) -> std::io::Result<()> {
    let json = format!(
        "{{\"pubkey\":\"{}\",\"device_id\":{},\"enroll_secret\":{},\"token\":{}}}",
        p.pubkey,
        opt(&p.device_id),
        opt(&p.enroll_secret),
        opt(&p.token),
    );
    if let Some(dir) = state_path().parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(state_path(), json)
}

fn opt(v: &Option<String>) -> String {
    match v {
        Some(s) => format!("\"{s}\""),
        None => "null".into(),
    }
}

fn load_state() -> Persisted {
    let mut pubkey = hex_identity();
    let mut device_id = None;
    let mut enroll_secret = None;
    let mut token = None;
    if let Ok(raw) = fs::read_to_string(state_path()) {
        if let Some(k) = json_str(&raw, "pubkey") {
            pubkey = k.to_string();
        }
        device_id = json_str(&raw, "device_id").map(str::to_string);
        enroll_secret = json_str(&raw, "enroll_secret").map(str::to_string);
        token = json_str(&raw, "token").map(str::to_string);
    }
    Persisted { pubkey, device_id, enroll_secret, token }
}

/// Identidad del dispositivo: 32 bytes de /dev/urandom en hex (en la placa
/// real: RNG del ESP32-S3, sellado en NVS; la clave privada no sale).
fn hex_identity() -> String {
    let mut b = [0u8; 32];
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut b);
    } else {
        // fallback: semilla temporal (solo hosts sin /dev/urandom)
        let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        for (i, x) in b.iter_mut().enumerate() {
            *x = ((t >> (i % 16)) as u8) ^ (i as u8).wrapping_mul(31);
        }
    }
    b.iter().map(|x| format!("{x:02X}")).collect()
}

// ---------------------------------------------------------------------------
// Cliente HTTP plano sobre TCP (el api local es HTTP; sin dependencias)
// ---------------------------------------------------------------------------

struct Api {
    host: String,
    port: u16,
    prefix: String,
}

impl Api {
    fn from_url(url: &str) -> Api {
        let rest = url.trim().trim_start_matches("http://").trim_start_matches("https://");
        let (hostport, prefix) = rest.split_once('/').unwrap_or((rest, ""));
        let (host, port) = match hostport.rsplit_once(':') {
            Some((h, p)) => (h.to_string(), p.parse().unwrap_or(8080)),
            None => (hostport.to_string(), 8080),
        };
        Api {
            host,
            port,
            prefix: format!("/{prefix}"),
        }
    }

    /// Devuelve (status, headers, body).
    fn call(
        &self,
        method: &str,
        path: &str,
        body: Option<&str>,
        bearer: Option<&str>,
        x_payment: Option<&str>,
    ) -> Result<(u16, String, String), String> {
        let mut stream =
            TcpStream::connect((self.host.as_str(), self.port)).map_err(|e| e.to_string())?;
        stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
        let mut req = format!(
            "{method} {}{path} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n",
            self.prefix, self.host
        );
        if let Some(t) = bearer {
            req.push_str(&format!("Authorization: Bearer {t}\r\n"));
        }
        if let Some(inv) = x_payment {
            req.push_str(&format!("X-Payment: {inv}\r\n"));
        }
        if let Some(b) = body {
            req.push_str(&format!("Content-Type: application/json\r\nContent-Length: {}\r\n", b.len()));
        }
        req.push_str("\r\n");
        if let Some(b) = body {
            req.push_str(b);
        }
        stream.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
        let mut raw = Vec::new();
        stream.read_to_end(&mut raw).map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&raw);
        let (head, rest) = match text.split_once("\r\n\r\n") {
            Some((h, b)) => (h.to_string(), b.to_string()),
            None => (text.to_string(), String::new()),
        };
        let status: u16 = head
            .lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        // chunked: colapsa los "len\r\n…\r\n" (suficiente para cuerpos cortos)
        let body = if head.to_lowercase().contains("transfer-encoding: chunked") {
            dechunk(&rest)
        } else {
            rest
        };
        Ok((status, head, body))
    }
}

fn dechunk(raw: &str) -> String {
    let mut out = String::new();
    let mut rest = raw;
    loop {
        let Some((len_s, tail)) = rest.split_once("\r\n") else { break };
        let Ok(len) = usize::from_str_radix(len_s.trim(), 16) else { break };
        if len == 0 {
            break;
        }
        if tail.len() < len {
            out.push_str(tail);
            break;
        }
        out.push_str(&tail[..len]);
        rest = &tail[len..].trim_start_matches("\r\n");
    }
    out
}

// ---------------------------------------------------------------------------
// Bucle principal
// ---------------------------------------------------------------------------

fn main() {
    let api = Api::from_url(&env::var("AGENTD_API_URL").unwrap_or_else(|_| "http://localhost:8080/api".into()));
    let name = env::var("AGENTD_NAME").unwrap_or_else(|_| "agentd-host-1".into());
    let board = env::var("AGENTD_BOARD").unwrap_or_else(|_| "esp32-s3-amoled-143".into());
    let x402_enabled = env::var("AGENTD_X402").map(|v| v != "0").unwrap_or(true);
    // NomikOS F5 — modo VOZ: cada línea del stdin es un turno del usuario
    // (en la Pi real: mic → whisper.cpp → esta misma petición; la respuesta
    // se pasaría a piper/espeak para el altavoz). AGENTD_VOICE=1 para activar.
    let voice_mode = env::var("AGENTD_VOICE").map(|v| v == "1").unwrap_or(false);
    // NomikOS W4 — puente SIP: la placa consulta SU llamada en el api
    // (GET /calls/for-device) y mueve el audio con baresip (pipe mode):
    // active → /dial sip:destino, terminada → /hangup. El peaje x402 por
    // minuto vive en el api; aquí solo el audio.
    let sip_mode = env::var("AGENTD_SIP").map(|v| v == "1").unwrap_or(false);
    let mut sip = if sip_mode { SipBridge::from_env() } else { None };

    log("boot", &format!("agentd-host v0.1.0 · api {} · board {board} · name {name}", api.prefix));
    let mut p = load_state();
    log("boot", &format!("identidad: {}… (la clave no sale del dispositivo)", &p.pubkey[..12]));
    save_state(&p).ok();
    let mut x402_done = false;

    loop {
        let state = classify(p.device_id.as_deref(), p.token.as_deref());
        match next_action(&state) {
            // ① La placa se presenta al api (sin auth: aún no es de nadie).
            agentd_core::Action::Enroll => {
                let body = format!("{{\"board\":\"{board}\",\"name\":\"{name}\",\"pubkey\":\"{}\"}}", p.pubkey);
                match api.call("POST", "/devices/enroll", Some(&body), None, None) {
                    Ok((201, _, resp)) => {
                        p.device_id = json_str(&resp, "device_id").map(str::to_string);
                        p.enroll_secret = json_str(&resp, "enroll_secret").map(str::to_string);
                        let code = json_str(&resp, "claim_code").unwrap_or("????????").to_string();
                        save_state(&p).ok();
                        log("enroll", &format!("device_id: {}", p.device_id.as_deref().unwrap_or("?")));
                        let mut out = String::new();
                        write_claim_banner(&mut out, &code).ok();
                        println!("{out}");
                    }
                    Ok((s, _, b)) => {
                        log("enroll", &format!("HTTP {s}: {b} — reintento en 10s"));
                        sleep(Duration::from_secs(10));
                    }
                    Err(e) => {
                        log("enroll", &format!("sin conexión al api: {e} — reintento en 10s"));
                        sleep(Duration::from_secs(10));
                    }
                }
                sleep(Duration::from_secs(2));
            }

            // ③ Sondea su token: 202 = aún sin claim, 200 = Bearer de device.
            agentd_core::Action::RequestToken => {
                let body = format!(
                    "{{\"device_id\":\"{}\",\"enroll_secret\":\"{}\"}}",
                    p.device_id.as_deref().unwrap_or_default(),
                    p.enroll_secret.as_deref().unwrap_or_default(),
                );
                match api.call("POST", "/devices/token", Some(&body), None, None) {
                    Ok((200, _, resp)) => {
                        p.token = json_str(&resp, "token").map(str::to_string);
                        save_state(&p).ok();
                        log("token", "Bearer de dispositivo recibido (TTL 30 dias)");
                    }
                    Ok((202, _, _)) => {
                        log("token", "aun sin claim — ensena el codigo en el panel");
                        sleep(Duration::from_secs(TOKEN_POLL_SECS));
                    }
                    Ok((401, _, _)) => {
                        log("token", "enroll_secret invalido → re-enroll");
                        p.device_id = None;
                        p.enroll_secret = None;
                        p.token = None;
                        save_state(&p).ok();
                    }
                    Ok((s, _, _)) => {
                        log("token", &format!("HTTP {s} — reintento en {TOKEN_POLL_SECS}s"));
                        sleep(Duration::from_secs(TOKEN_POLL_SECS));
                    }
                    Err(e) => {
                        log("token", &format!("sin conexión: {e}"));
                        sleep(Duration::from_secs(TOKEN_POLL_SECS));
                    }
                }
            }

            // ④ Runtime: heartbeat + peaje x402 del recurso protegido.
            agentd_core::Action::Run { .. } => {
                let token = p.token.clone().unwrap_or_default();
                let body = "{\"agent_version\":\"agentd-host-0.1.0\"}";
                match api.call("POST", "/devices/me/heartbeat", Some(body), Some(&token), None) {
                    Ok((200, _, _)) => log("heartbeat", "online"),
                    Ok((401, _, _)) => {
                        log("heartbeat", "token expirado/revocado → re-enroll");
                        p.device_id = None;
                        p.token = None;
                        save_state(&p).ok();
                        continue;
                    }
                    Ok((s, _, b)) => log("heartbeat", &format!("HTTP {s}: {b}")),
                    Err(e) => log("heartbeat", &format!("sin conexión: {e}")),
                }

                if x402_enabled && !x402_done {
                    x402_done = true;
                    x402_demo(&api, &token);
                }

                // ── Puente SIP (W4): la Pi consulta SU llamada (3 s) ──
                if let Some(bridge) = sip.as_mut() {
                    bridge.tick(&api, &token);
                }

                // ── Modo voz (diagram.d2: User → Worker "Voz / texto") ──
                if voice_mode {
                    let mut line = String::new();
                    if std::io::stdin().read_line(&mut line).unwrap_or(0) > 0 {
                        let text = line.trim();
                        if !text.is_empty() {
                            log("voz", &format!("◀ «{text}»"));
                            let body = format!("{{\"text\":\"{}\",\"device_id\":\"{board}\"}}", text.replace('"', "\\\""));
                            match api.call("POST", "/voice", Some(&body), Some(&token), None) {
                                Ok((200, _, resp)) => {
                                    let reply = agentd_core::json_str(&resp, "reply").unwrap_or("(sin respuesta)");
                                    let tools = agentd_core::json_str(&resp, "tools_used").map(str::to_string).unwrap_or_default();
                                    println!("  🎙 → {reply}");
                                    let _ = tools;
                                }
                                Ok((s, _, b)) => log("voz", &format!("HTTP {s}: {b}")),
                                Err(e) => log("voz", &format!("sin conexión: {e}")),
                            }
                        }
                    } else {
                        // stdin cerrado → sin turnos: mantener heartbeat
                        sleep(Duration::from_secs(HEARTBEAT_SECS));
                    }
                } else if sip.is_some() {
                    // tick de llamada más ágil que el heartbeat (3 s)
                    sleep(Duration::from_secs(3));
                } else {
                    sleep(Duration::from_secs(HEARTBEAT_SECS));
                }
            }
        }
    }
}

// ── Puente SIP (NomikOS W4 — diagram.d2 C1-C4) ────────────────────────
//
// El api guarda la sesión de llamada y cobra el peaje x402 por minuto;
// la placa mueve el AUDIO: baresip en pipe mode recibe `/dial` y
// `/hangup` por stdin. AGENTD_SIP_CMD permite sustituir baresip por un
// mock en pruebas (los comandos se registran y la suite los congela).

struct SipBridge {
    /// binario de control de llamadas (default baresip).
    cmd: String,
    /// dominio SIP del trunk (opcional): sip:destino@dominio.
    domain: String,
    /// id de la llamada marcada (para no re-marcar el mismo turno).
    dialed: Option<String>,
    child: Option<std::process::Child>,
    stdin: Option<std::process::ChildStdin>,
}

impl SipBridge {
    fn from_env() -> Option<Self> {
        let cmd = env::var("AGENTD_SIP_CMD").unwrap_or_else(|_| "baresip".into());
        let domain = env::var("AGENTD_SIP_DOMAIN").unwrap_or_default();
        Some(Self { cmd, domain, dialed: None, child: None, stdin: None })
    }

    fn tick(&mut self, api: &Api, token: &str) {
        let Ok((200, _, body)) = api.call("GET", "/calls/for-device", None, Some(token), None)
        else {
            return;
        };
        let has_call = agentd_core::json_str(&body, "has_call") == Some("true");
        if !has_call {
            if self.child.is_some() {
                self.hangup("la llamada terminó en el api (end/peaje)");
            }
            return;
        }
        let id = agentd_core::json_str(&body, "call_id").unwrap_or_default().to_string();
        let status = agentd_core::json_str(&body, "call_status").unwrap_or_default();
        let dest = agentd_core::json_str(&body, "call_destination").unwrap_or_default();
        // se marca cuando el minuto 0 está pagado (active) — ringing aún no suena
        if status == "active" && self.dialed.as_deref() != Some(id.as_str()) {
            self.dial(&id, &dest);
        }
    }

    fn dial(&mut self, id: &str, dest: &str) {
        if self.child.is_none() {
            match std::process::Command::new(&self.cmd)
                .arg("-p")
                .arg("-f")
                .arg("/etc/baresip")
                .stdin(std::process::Stdio::piped())
                .spawn()
            {
                Ok(c) => {
                    self.child = Some(c);
                    log("sip", &format!("baresip arriba ({} -p)", self.cmd));
                }
                Err(e) => {
                    log("sip", &format!("no pude lanzar {}: {e}", self.cmd));
                    return;
                }
            }
        }
        let uri = if self.domain.is_empty() {
            format!("sip:{dest}")
        } else {
            format!("sip:{dest}@{}", self.domain)
        };
        log("sip", &format!("marcando {uri} (llamada {id})"));
        self.write_cmd(&format!("/dial {uri}"));
        self.dialed = Some(id.to_string());
    }

    fn hangup(&mut self, why: &str) {
        log("sip", why);
        self.write_cmd("/hangup");
        self.stdin = None; // EOF: el proceso de audio cierra limpio
        if let Some(mut c) = self.child.take() {
            // darle un instante a baresip para procesar el /hangup antes
            // del kill de respaldo (un SIGKILL inmediato pierde la línea
            // que aún viaja por el pipe).
            for _ in 0..20 {
                if matches!(c.try_wait(), Ok(Some(_))) {
                    break;
                }
                sleep(Duration::from_millis(100));
            }
            let _ = c.kill();
            let _ = c.wait();
        }
        self.dialed = None;
    }

    fn write_cmd(&mut self, cmd: &str) {
        if self.stdin.is_none() {
            if let Some(child) = self.child.as_mut() {
                self.stdin = child.stdin.take();
            }
        }
        if let Some(stdin) = self.stdin.as_mut() {
            use std::io::Write;
            if writeln!(stdin, "{cmd}").and_then(|_| stdin.flush()).is_err() {
                log("sip", "baresip cerró el stdin (¿se cayó?)");
                self.child = None;
                self.stdin = None;
            }
        }
    }
}

/// Peaje x402 desde el punto de vista del dispositivo:
/// 402 + invoice (con device_id) → la CUENTA paga por dPaaS (nosotros no
/// firmamos nada) → reintento con X-Payment → recurso consumido (one-shot).
fn x402_demo(api: &Api, token: &str) {
    log("x402", "solicitando recurso protegido GET /api/device…");
    let (status, head, body) = match api.call("GET", "/device", None, Some(token), None) {
        Ok(r) => r,
        Err(e) => return log("x402", &format!("sin conexión: {e}")),
    };
    if status == 200 {
        return log("x402", "200 sin peaje (ruta no protegida en esta config)");
    }
    if status != 402 {
        return log("x402", &format!("HTTP {status} inesperado"));
    }
    let invoice_id = head
        .to_lowercase()
        .split("x-payment-invoice-id:")
        .nth(1)
        .and_then(|rest| rest.split(|c| c == '\r' || c == '\n').next())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| json_str(&body, "id").map(str::to_string))
        .unwrap_or_default();
    let lamports = json_num(&body, "amount_lamports").unwrap_or("?").to_string();
    let mut out = String::new();
    write_toll_banner(&mut out, &invoice_id, &lamports).ok();
    println!("{out}");

    // Espera a que la cuenta pague (dPaaS). En el ecosistema real lo
    // dispara el orquestador; en pruebas, el settler confirma on-chain.
    let deadline = std::time::Instant::now() + Duration::from_millis(INVOICE_TIMEOUT_MS);
    loop {
        sleep(Duration::from_millis(INVOICE_POLL_MS));
        let Ok((_, _, inv)) = api.call("GET", &format!("/x402/invoices/{invoice_id}"), None, None, None) else {
            continue;
        };
        match json_str(&inv, "status") {
            Some("settled") => break,
            Some(s) if s == "pending" || s == "verifying" => {}
            _ => continue,
        }
        if std::time::Instant::now() > deadline {
            return log("x402", "la cuenta no pago a tiempo — recurso no consumido");
        }
    }

    // Reintento con X-Payment (one-shot): el acceso consume la factura.
    match api.call("GET", "/device", None, Some(token), Some(&invoice_id)) {
        Ok((200, _, body)) => {
            let dev = json_str(&body, "name").unwrap_or("?");
            log("x402", &format!("ACCESO CONCEDIDO (one-shot) → dispositivo: {dev}"));
        }
        Ok((s, _, b)) => log("x402", &format!("reintento HTTP {s}: {b}")),
        Err(e) => log("x402", &format!("sin conexión en reintento: {e}")),
    }
}
