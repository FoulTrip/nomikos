//! agent.rs — el ciclo NomikOS del dispositivo (diagram.d2 F1-F4):
//!
//! ```text
//! enroll → [claim en el panel 📡 Flota] → token → heartbeat
//!   └─ x402: GET /device → 402 + factura → la CUENTA paga (dPaaS;
//!      la placa no firma) → poll settled → reintento X-Payment
//! ```
//!
//! La máquina de estados vive en `agentd-core` (la misma del simulador
//! host): aquí solo conectan HTTP + pantalla + NVS.

use crate::{config, display::Amoled, http, net::Stack, state};
use alloc::format;
use esp_println::println;

/// UI del dispositivo (desacopla el AMOLED para poder testear sin él).
pub trait Ui {
    fn claim(&mut self, code: &str);
    fn status(&mut self, msg: &str, toll: bool);
}

impl<'a, SPI> Ui for Amoled<'a, SPI>
where
    SPI: embedded_hal::spi::SpiBus,
{
    fn claim(&mut self, code: &str) {
        self.claim_banner(code, config::NAME);
    }
    fn status(&mut self, msg: &str, toll: bool) {
        self.status(msg, toll);
    }
}

/// No-op (si el driver de pantalla no está disponible).
#[allow(dead_code)]
pub struct NoUi;
impl Ui for NoUi {
    fn claim(&mut self, _code: &str) {}
    fn status(&mut self, _msg: &str, _toll: bool) {}
}

const HEARTBEAT_SECS: u64 = 15;
const TOKEN_POLL_SECS: u64 = 5;
const X402_POLL_MS: u64 = 3_000;
const X402_TIMEOUT_MS: u64 = 180_000;

fn now_ms() -> u64 {
    esp_hal::time::now().duration_since_epoch().to_millis()
}

fn sleep_ms(ms: u64) {
    esp_hal::delay::Delay::new().delay_millis(ms as u32);
}

pub fn run(
    stack: &mut Stack<'_>,
    ui: &mut dyn Ui,
    mut state: state::DeviceState,
) -> ! {
    let mut x402_done = false;
    println!("[boot] agentd-esp32 · identidad {}… (la clave no sale del dispositivo)", &state.pubkey[..8.min(state.pubkey.len())]);

    loop {
        let cs = agentd_core::classify(state.device_id.as_deref(), state.token.as_deref());
        match agentd_core::next_action(&cs) {
            // ① La placa se presenta al api (sin auth: aún no es de nadie).
            agentd_core::Action::Enroll => {
                let mut body = heapless::String::<256>::new();
                use core::fmt::Write;
                let _ = write!(
                    body,
                    "{{\"board\":\"{}\",\"name\":\"{}\",\"pubkey\":\"{}\"}}",
                    config::BOARD, config::NAME, state.pubkey
                );
                match http::request(stack, "POST", "/devices/enroll", Some(&body), None, None) {
                    Some(resp) if resp.status == 201 => {
                        if let Some(id) = resp.str_field("device_id").and_then(|v| heapless::String::<80>::try_from(v).ok()) {
                            state.device_id = Some(id);
                        }
                        if let Some(sec) = resp.str_field("enroll_secret").and_then(|v| heapless::String::<80>::try_from(v).ok()) {
                            state.enroll_secret = Some(sec);
                        }
                        if let Some(code) = resp.str_field("claim_code") {
                            state.claim_code = heapless::String::<16>::try_from(code).ok();
                            println!("[enroll] device_id: {} · canjea «{code}» en el panel 📡 Flota",
                                state.device_id.as_deref().unwrap_or("?"));
                            ui.claim(code);
                        }
                        state.save();
                    }
                    Some(resp) => {
                        println!("[enroll] HTTP {} — reintento en 10 s", resp.status);
                        sleep_ms(10_000);
                    }
                    None => {
                        println!("[enroll] sin conexión — reintento en 10 s");
                        sleep_ms(10_000);
                    }
                }
                sleep_ms(2_000);
            }

            // ③ Sondea su token: 202 = sin claim aún, 200 = Bearer de device.
            agentd_core::Action::RequestToken => {
                let mut body = heapless::String::<256>::new();
                use core::fmt::Write;
                let _ = write!(
                    body,
                    "{{\"device_id\":\"{}\",\"enroll_secret\":\"{}\"}}",
                    state.device_id.as_deref().unwrap_or_default(),
                    state.enroll_secret.as_deref().unwrap_or_default(),
                );
                match http::request(stack, "POST", "/devices/token", Some(&body), None, None) {
                    Some(resp) if resp.status == 200 => {
                        if let Some(t) = resp.str_field("token").and_then(|v| heapless::String::<512>::try_from(v).ok()) {
                            state.token = Some(t);
                            println!("[token] Bearer de dispositivo recibido (TTL 30 dias)");
                            state.save();
                        }
                    }
                    Some(resp) if resp.status == 202 => {
                        println!("[token] aún sin claim — muestra el código en pantalla");
                        if let Some(code) = &state.claim_code {
                            ui.claim(code);
                        }
                        sleep_ms(TOKEN_POLL_SECS * 1000);
                    }
                    Some(resp) if resp.status == 401 => {
                        println!("[token] enroll_secret inválido → re-enroll");
                        state.device_id = None;
                        state.enroll_secret = None;
                        state.token = None;
                        state.save();
                    }
                    Some(resp) => {
                        println!("[token] HTTP {} — reintento", resp.status);
                        sleep_ms(TOKEN_POLL_SECS * 1000);
                    }
                    None => {
                        println!("[token] sin conexión");
                        sleep_ms(TOKEN_POLL_SECS * 1000);
                    }
                }
            }

            // ④ Runtime: heartbeat + peaje x402 del recurso protegido.
            agentd_core::Action::Run { .. } => {
                let token = state.token.clone().unwrap_or_default();
                let beat = "{\"agent_version\":\"agentd-esp32-0.1\"}";
                match http::request(stack, "POST", "/devices/me/heartbeat", Some(beat), Some(&token), None) {
                    Some(r) if r.status == 200 => println!("[heartbeat] online"),
                    Some(r) if r.status == 401 => {
                        println!("[heartbeat] token expirado → re-enroll");
                        state.device_id = None;
                        state.token = None;
                        state.save();
                        continue;
                    }
                    Some(r) => println!("[heartbeat] HTTP {}", r.status),
                    None => println!("[heartbeat] sin conexión"),
                }

                if !x402_done {
                    x402_done = true;
                    x402_demo(stack, ui, &token);
                }

                // ── Tienda de dapps: las apps del worker en pantalla ──
                // (GET /api/apps es público: la placa muestra las apps
                //  INSTALADAS; «apretar agregar» corre desde la consola
                //  con el CLI nomikos — ver scripts/nomikos.)
                if let Some(res) = http::request(stack, "GET", "/apps", None, None, None) {
                    if res.status == 200 {
                        let installed = res.body_str().matches(r#""status":"installed""#).count();
                        if installed > 0 {
                            let first = res.str_field("slug").unwrap_or("?");
                            ui.status(&format!("apps: {installed} ({first})"), false);
                            println!("[apps] {installed} dapp(s) instalada(s) en el agente (p.ej. {first})");
                        }
                    }
                }

                sleep_ms(HEARTBEAT_SECS * 1000);
            }
        }
    }
}

/// Peaje x402 desde el punto de vista del dispositivo: 402 + factura →
/// la CUENTA paga por dPaaS (nosotros no firmamos nada) → poll settled →
/// reintento con X-Payment (one-shot).
fn x402_demo(stack: &mut Stack<'_>, ui: &mut dyn Ui, token: &str) {
    println!("[x402] solicitando recurso protegido GET /api/device…");
    let Some(first) = http::request(stack, "GET", "/device", None, Some(token), None) else {
        return;
    };
    if first.status == 200 {
        return println!("[x402] 200 sin peaje (ruta no protegida en esta config)");
    }
    if first.status != 402 {
        return println!("[x402] HTTP {} inesperado", first.status);
    }
    let Some(invoice_id) = first.str_field("id") else {
        return println!("[x402] factura sin id");
    };
    let lamports = first.num_field("amount_lamports").unwrap_or("?");
    println!("[x402] peaje de {lamports} lamports — factura {invoice_id}");
    println!("[x402] espera a que la cuenta pague (dPaaS)…");
    ui.status("peaje x402", true);

    let deadline = now_ms() + X402_TIMEOUT_MS;
    loop {
        sleep_ms(X402_POLL_MS);
        let mut path = heapless::String::<128>::new();
        use core::fmt::Write as _;
        let _ = write!(path, "/x402/invoices/{invoice_id}");
        let Some(inv) = http::request(stack, "GET", &path, None, None, None) else {
            continue;
        };
        match inv.str_field("status") {
            Some("settled") => break,
            Some("pending") | Some("verifying") => {}
            _ => continue,
        }
        if now_ms() > deadline {
            return println!("[x402] la cuenta no pagó a tiempo — recurso no consumido");
        }
    }

    match http::request(stack, "GET", "/device", None, Some(token), Some(invoice_id)) {
        Some(r) if r.status == 200 => {
            let name = r.str_field("name").unwrap_or("?");
            println!("[x402] ACCESO CONCEDIDO (one-shot) → dispositivo: {name}");
            ui.status("one-shot ok", false);
        }
        Some(r) => println!("[x402] HTTP {} con X-Payment", r.status),
        None => println!("[x402] sin conexión en el reintento"),
    }
}
