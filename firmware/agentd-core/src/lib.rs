//! agentd-core — núcleo portable del agente de dispositivos NomikOS.
//!
//! Sin I/O: el simulador host (std) y el firmware ESP32 (no_std + esp-hal)
//! inyectan transporte, reloj y persistencia. Aquí vive la lógica común:
//! máquina de estados del ciclo enroll → claim → token → heartbeat,
//! extracción mínima de JSON (sin dependencias) y el banner de
//! emparejado (válido para serial y para la pantalla AMOLED).
#![cfg_attr(not(test), no_std)]

use core::fmt::{self, Write};

/// Estados del dispositivo según lo persistido (NVS en la placa,
/// state/*.json en el simulador host).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceState {
    /// Sin enroll: presentarse al api (POST /api/devices/enroll).
    Unenrolled,
    /// Enroll hecho; la cuenta aún no canjea el claim_code.
    AwaitingClaim,
    /// Token de dispositivo operativo (sesión con device_id, TTL 30 días).
    Operational,
}

/// Próxima acción del bucle principal según el estado persistido.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    Enroll,
    RequestToken,
    /// Ya operativo: heartbeat periódico + (opcional) peaje x402 del
    /// recurso protegido — el dispositivo NUNCA firma: paga la cuenta.
    Run { x402_pending: bool },
}

/// El registro persistido por el agente (ver Persisted en cada bin).
pub fn classify(device_id: Option<&str>, token: Option<&str>) -> DeviceState {
    match (device_id, token) {
        (None, _) => DeviceState::Unenrolled,
        (Some(_), None) => DeviceState::AwaitingClaim,
        (Some(_), Some(_)) => DeviceState::Operational,
    }
}

pub fn next_action(state: &DeviceState) -> Action {
    match state {
        DeviceState::Unenrolled => Action::Enroll,
        DeviceState::AwaitingClaim => Action::RequestToken,
        DeviceState::Operational => Action::Run { x402_pending: true },
    }
}

/// Extrae `"clave":"valor"` de un JSON plano. Los valores del protocolo
/// (ids hex/base58, tokens opacos, códigos) nunca llevan escapes, así que
/// un escáner de bytes basta y evita cualquier dependencia (no_std).
pub fn json_str<'a>(body: &'a str, key: &str) -> Option<&'a str> {
    let hay = body.as_bytes();
    let needle = key.as_bytes();
    if needle.is_empty() || hay.len() < needle.len() + 4 {
        return None;
    }
    let mut i = 0usize;
    while i + needle.len() + 3 < hay.len() {
        // '"clave"'
        if hay[i] == b'"'
            && &hay[i + 1..i + 1 + needle.len()] == needle
            && hay[i + 1 + needle.len()] == b'"'
        {
            let mut j = i + needle.len() + 2;
            let mut saw_colon = false;
            while j < hay.len() && (hay[j] == b' ' || hay[j] == b':') {
                if hay[j] == b':' {
                    saw_colon = true;
                }
                j += 1;
            }
            if saw_colon && j < hay.len() && hay[j] == b'"' {
                let start = j + 1;
                // cerrar comillas
                let mut end = start;
                while end < hay.len() && hay[end] != b'"' {
                    end += 1;
                }
                if end < hay.len() {
                    return core::str::from_utf8(&hay[start..end]).ok();
                }
            }
        }
        i += 1;
    }
    None
}

/// Extrae un número `"clave":123` de un JSON plano (sin dependencias).
pub fn json_num<'a>(body: &'a str, key: &str) -> Option<&'a str> {
    let hay = body.as_bytes();
    let needle = key.as_bytes();
    if needle.is_empty() || hay.len() < needle.len() + 4 {
        return None;
    }
    let mut i = 0usize;
    while i + needle.len() + 3 < hay.len() {
        if hay[i] == b'"'
            && &hay[i + 1..i + 1 + needle.len()] == needle
            && hay[i + 1 + needle.len()] == b'"'
        {
            let mut j = i + needle.len() + 2;
            let mut saw_colon = false;
            while j < hay.len() && (hay[j] == b' ' || hay[j] == b':') {
                if hay[j] == b':' {
                    saw_colon = true;
                }
                j += 1;
            }
            if saw_colon && j < hay.len() && (hay[j].is_ascii_digit() || hay[j] == b'-') {
                let start = j;
                let mut end = start;
                while end < hay.len() && (hay[end].is_ascii_digit() || hay[end] == b'-') {
                    end += 1;
                }
                return core::str::from_utf8(&hay[start..end]).ok();
            }
        }
        i += 1;
    }
    None
}

/// Banner de emparejado para la pantalla/serial: el claim_code es lo único
/// que el usuario necesita teclear en el panel (📡 Flota → Emparejar).
pub fn write_claim_banner<W: Write>(w: &mut W, code: &str) -> fmt::Result {
    writeln!(w, "========================================")?;
    writeln!(w, "  CODIGO DE EMPAREJADO:  {code}")?;
    writeln!(w, "  Introduce este codigo en el panel de")?;
    writeln!(w, "  tu cuenta:  Flota -> Emparejar")?;
    writeln!(w, "  (caduca en 15 minutos)")?;
    writeln!(w, "========================================")
}

/// Mensaje del peaje x402 visto por el dispositivo (lo paga la cuenta).
pub fn write_toll_banner<W: Write>(
    w: &mut W,
    invoice_id: &str,
    lamports: &str,
) -> fmt::Result {
    writeln!(w, "----------------------------------------")?;
    writeln!(w, "  x402: peaje requerido ({lamports} lamports)")?;
    writeln!(w, "  factura: {invoice_id}")?;
    writeln!(w, "  La CUENTA paga por mi (dPaaS): yo no firmo.")?;
    writeln!(w, "----------------------------------------")
}

// ---------------------------------------------------------------------------
// Tests del núcleo (corren en host: json/classify son puros)
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    const ENROLL: &str = r#"{"ok":true,"device_id":"dev-123","name":"x","claim_code":"D4151F9F","claim_expires_at":1792894000000,"enroll_secret":"sec-abc"}"#;
    const TOKEN_202: &str = r#"{"ok":false,"error":"aun sin claim: introduce el codigo"}"#;
    const INVOICE: &str = r#"{"ok":false,"invoice":{"id":"x402-1","resource":"x402:path:/api/device","amount_lamports":1000,"status":"pending","account_id":"acc-1","device_id":"dev-123"},"how":["a"]}"#;

    #[test]
    fn extrae_campos_de_string_del_contrato_real() {
        assert_eq!(json_str(ENROLL, "device_id"), Some("dev-123"));
        assert_eq!(json_str(ENROLL, "claim_code"), Some("D4151F9F"));
        assert_eq!(json_str(ENROLL, "enroll_secret"), Some("sec-abc"));
        assert_eq!(json_str(ENROLL, "inexistente"), None);
        assert_eq!(json_str(TOKEN_202, "error").is_some(), true);
    }

    #[test]
    fn extrae_numeros_y_respeta_espacios() {
        // números
        assert_eq!(json_num(INVOICE, "amount_lamports"), Some("1000"));
        assert_eq!(json_num(INVOICE, "id"), None); // id es string, no número
        // espacios alrededor del ':' y campo anidado
        assert_eq!(json_str(r#"{ "a" : "b" }"#, "a"), Some("b"));
        assert_eq!(json_str(INVOICE, "account_id"), Some("acc-1"));
        assert_eq!(json_str(INVOICE, "device_id"), Some("dev-123"));
    }

    #[test]
    fn maquina_de_estados_del_ciclo() {
        assert_eq!(classify(None, None), DeviceState::Unenrolled);
        assert_eq!(classify(Some("dev-1"), None), DeviceState::AwaitingClaim);
        assert_eq!(classify(Some("dev-1"), Some("tok")), DeviceState::Operational);
        assert_eq!(next_action(&DeviceState::Unenrolled), Action::Enroll);
        assert_eq!(next_action(&DeviceState::AwaitingClaim), Action::RequestToken);
        assert_eq!(
            next_action(&DeviceState::Operational),
            Action::Run { x402_pending: true }
        );
    }

    #[test]
    fn banners_formatean() {
        let mut out = String::new();
        write_claim_banner(&mut out, "AB12CD34").ok();
        assert!(out.contains("AB12CD34"));
        let mut out2 = String::new();
        write_toll_banner(&mut out2, "x402-9", "1000").ok();
        assert!(out2.contains("x402-9") && out2.contains("1000"));
    }
}
