//! state.rs — estado del agente: identidad + device_id + enroll_secret +
//! token (el equivalente del `state/device.json` del simulador host).
//!
//! **Persistencia: PENDIENTE de hardware.** esp-storage 0.4 expone
//! escritura de flash a offsets crudos: sin el mapa de particiones del
//! bootloader de ESTA placa, elegir un offset es arriesgar brick.
//! v0.1 mantiene el estado en RAM y re-enrola en cada arranque (el
//! claim code sale por el AMOLED y por la consola serial — el instalador
//! del dapp lo autodetecta por Web Serial).
//!
//! TODO(nvs): leer la tabla de particiones (o añadir una partición
//! dedicada en el bootloader) y persistir `to_json()` con un checksum.

use esp_println::println;
use heapless::String as HString;

pub struct DeviceState {
    /// Identidad del dispositivo (64 hex de 32 bytes del TRNG). El api la
    /// trata como opaca: el dispositivo NUNCA firma (dPaaS paga).
    pub pubkey: HString<80>,
    pub device_id: Option<HString<80>>,
    pub enroll_secret: Option<HString<80>>,
    pub token: Option<HString<512>>,
    /// El claim code en pantalla mientras no viene el token.
    pub claim_code: Option<HString<16>>,
}

impl DeviceState {
    /// Estado nuevo: identidad TRNG en hex (64 chars).
    pub fn new(seed: u64) -> Self {
        let mut pubkey = HString::<80>::new();
        use core::fmt::Write;
        let mut h = seed | 1;
        for _ in 0..8 {
            h = h.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let _ = write!(pubkey, "{:08x}", h as u32);
        }
        Self { pubkey, device_id: None, enroll_secret: None, token: None, claim_code: None }
    }

    /// Serializa como JSON plano (el formato de agentd-host) — listo
    /// para cuando llegue la persistencia NVS.
    pub fn to_json(&self) -> HString<1024> {
        let mut out = HString::<1024>::new();
        use core::fmt::Write;
        let _ = write!(out, "{{\"pubkey\":\"{}\"", self.pubkey);
        if let Some(d) = &self.device_id {
            let _ = write!(out, ",\"device_id\":\"{d}\"");
        }
        if let Some(e) = &self.enroll_secret {
            let _ = write!(out, ",\"enroll_secret\":\"{e}\"");
        }
        if let Some(t) = &self.token {
            let _ = write!(out, ",\"token\":\"{t}\"");
        }
        let _ = out.push_str("}");
        out
    }

    /// v0.1: sin persistencia (ver cabecera) — el guardado es no-op.
    pub fn save(&self) {
        // TODO(nvs)
    }
}

/// v0.1: identidad nueva siempre (la persistencia llega con el mapa de
/// particiones; ver cabecera).
pub fn load(seed: u64) -> DeviceState {
    println!("[state] identidad nueva (persistencia NVS pendiente — ver state.rs)");
    DeviceState::new(seed)
}

/// Reconstruye desde el JSON plano (parser de agentd-core) — para el día
/// que la NVS exista.
pub fn from_json(json: &str) -> Option<DeviceState> {
    let pubkey = agentd_core::json_str(json, "pubkey")?;
    let mut s = DeviceState::new(0);
    s.pubkey = HString::try_from(pubkey).ok()?;
    s.device_id = agentd_core::json_str(json, "device_id").and_then(|v| HString::try_from(v).ok());
    s.enroll_secret = agentd_core::json_str(json, "enroll_secret").and_then(|v| HString::try_from(v).ok());
    s.token = agentd_core::json_str(json, "token").and_then(|v| HString::try_from(v).ok());
    Some(s)
}
