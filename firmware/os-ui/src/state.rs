//! Estado del OS para dibujar (todo prestado: sin heap en el núcleo).
//! El wrapper (WASM/std) lo arma desde el JSON del api.

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Stage {
    Boot,
    Claim,
    #[default]
    Online,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Screen {
    #[default]
    Home,
    Apps,
    AppDetail,
    Banco,
    Settings,
    Providers,
    Models,
}

#[derive(Clone, Copy, Default)]
pub struct SimApp<'a> {
    pub slug: &'a str,
    pub name: &'a str,
    pub status: &'a str,
    pub tools_count: u32,
}

#[derive(Clone, Copy, Default)]
pub struct LlmProvider<'a> {
    pub provider: &'a str,
    pub models: &'a [&'a str],
    pub default_model: &'a str,
    pub has_key: bool,
    pub is_active: bool,
}

#[derive(Clone, Copy, Default)]
pub struct Wallet<'a> {
    /// None = sin dPaaS configurada.
    pub pubkey: Option<&'a str>,
    pub network: &'a str,
    /// None = balance desconocido.
    pub balance_lamports: Option<i64>,
}

#[derive(Clone, Copy, Default)]
pub struct LastX402<'a> {
    pub status: &'a str,
    pub access: &'a str,
    pub hint: &'a str,
    pub lamports: i64,
    pub has: bool,
}

#[derive(Clone, Copy, Default)]
pub struct LastReply<'a> {
    pub text: &'a str,
    pub reply: &'a str,
}

/// Resumen del artifact asociado a un turno. Los productos completos e
/// imágenes quedan en la capa web; el núcleo solo dibuja el acceso visual.
#[derive(Clone, Copy, Default)]
pub struct ChatArtifact<'a> {
    pub title: &'a str,
    pub app: &'a str,
    pub item_count: u32,
}

/// Un turno del historial de chat de la cuenta (lo mantiene el api).
#[derive(Clone, Copy, Default)]
pub struct ChatTurn<'a> {
    pub text: &'a str,
    pub reply: &'a str,
    pub artifact: Option<ChatArtifact<'a>>,
}

#[derive(Clone, Copy, Default)]
pub struct Qr<'a> {
    pub width: u32,
    /// Bits row-major (1 = módulo oscuro).
    pub bits: &'a [u8],
}

#[derive(Clone, Copy)]
pub struct Clock<'a> {
    pub hour: u8,
    pub minute: u8,
    /// "dom 26 oct" ya formateada afuera (no_std no tiene calendario).
    pub date_line: &'a str,
}

impl Default for Clock<'_> {
    fn default() -> Self {
        Self {
            hour: 0,
            minute: 0,
            date_line: "",
        }
    }
}

#[derive(Clone, Copy, Default)]
pub struct OsState<'a> {
    pub stage: Stage,
    pub screen: Screen,
    pub locked: bool,
    pub device_id: &'a str,
    pub claim_code: &'a str,
    pub boot_count: u32,
    pub taps: u32,
    pub apps: &'a [SimApp<'a>],
    pub detail_app: &'a str,
    pub llm_active: &'a str,
    pub llm_providers: &'a [LlmProvider<'a>],
    pub wallet: Wallet<'a>,
    pub last_x402: LastX402<'a>,
    pub last_reply: Option<LastReply<'a>>,
    /// Historial completo de chat de la cuenta (turnos, del más antiguo
    /// al más reciente): lo pinta la pantalla completa del chat.
    pub chat: &'a [ChatTurn<'a>],
    pub qr: Option<Qr<'a>>,
    pub clock: Clock<'a>,
}

/// Estado de VISTA (local del visor, no del OS).
#[derive(Clone, Copy, Default)]
pub struct ViewState<'a> {
    pub scroll_apps: u32,
    pub scroll_providers: u32,
    pub scroll_models: u32,
    pub light: bool,
    /// Shade 0..100.
    pub shade_p: u8,
    pub mic_muted: bool,
    /// Banco: 0 main · 1 receive · 2 send.
    pub banco_tab: u8,
    /// Receive: false QR · true NFC.
    pub banco_recv_nfc: bool,
    /// Send: false NFC · true manual.
    pub banco_send_manual: bool,
    pub send_to: &'a str,
    /// Turno del agente: 0 idle · 1 escuchando · 2 pensando · 3 listo · 4 error.
    pub chat_status: u8,
    /// Lo que dijo el usuario en el turno en curso (micrófono).
    pub chat_heard: &'a str,
    /// ms desde que arrancó el turno (progreso de los pasos).
    pub chat_elapsed_ms: u64,
    /// Pantalla completa del historial de chat (desliza desde la derecha).
    pub chat_full: bool,
    /// Progreso del deslizamiento 0..100 (0 = fuera, 100 = puesta).
    pub chat_anim: u8,
    /// Scroll vertical del historial (px desde el turno más antiguo).
    pub chat_scroll: u32,
    /// La barra inferior es un input para escribir al agente.
    pub chat_compose: bool,
    /// Texto que se está escribiendo (lo teclea el usuario).
    pub chat_draft: &'a str,
    /// Drawer lateral de historial de chat: se desliza de derecha a
    /// izquierda mostrando TODOS los turnos de la cuenta, scrolleable.
    pub chat_drawer: bool,
    /// Progreso del drawer 0..100 (0 = cerrado a la derecha, 100 = abierto).
    pub chat_drawer_anim: u8,
    /// Scroll vertical del drawer (px desde el turno más antiguo).
    pub chat_drawer_scroll: u32,
    /// ms para animaciones (ondas, pulso, boot).
    pub elapsed_ms: u64,
}
