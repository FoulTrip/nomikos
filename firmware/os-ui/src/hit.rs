//! Hit-testing táctil: mismas zonas que el panel (px 466×466).
//! Devuelve acciones; el wrapper las traduce a targets del api/locales.

use crate::{
    state::{OsState, Stage, ViewState},
    CENTER, CLIP_R,
};

// ── Geometría (idéntica a lib/screen/layout.ts) ────────────────────────

pub const LIST_PAGE: u32 = 4;

#[derive(Clone, Copy)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

pub fn in_rect(px: f32, py: f32, r: Rect) -> bool {
    px >= r.x as f32 && px <= (r.x + r.w) as f32 && py >= r.y as f32 && py <= (r.y + r.h) as f32
}

pub const HEADER_ZONE: Rect = Rect {
    x: CENTER - 150,
    y: 52,
    w: 300,
    h: 44,
};
pub const STATUS_STRIP: Rect = Rect {
    x: CENTER - 160,
    y: 36,
    w: 320,
    h: 60,
};
pub const SHADE_PANEL_H: i32 = 466;
pub const SHADE_GEAR: Rect = Rect {
    x: 296,
    y: 44,
    w: 44,
    h: 44,
};
pub const MIC_ZONE: Rect = Rect {
    x: CENTER - 34,
    y: 404,
    w: 68,
    h: 52,
};
pub const BANK_SEND: Rect = Rect {
    x: 73,
    y: 250,
    w: 150,
    h: 56,
};
pub const BANK_RECV: Rect = Rect {
    x: 243,
    y: 250,
    w: 150,
    h: 56,
};
pub const BANK_PILL_A: Rect = Rect {
    x: 133,
    y: 132,
    w: 90,
    h: 36,
};
pub const BANK_PILL_B: Rect = Rect {
    x: 243,
    y: 132,
    w: 90,
    h: 36,
};

/** Iconos junto a la onda (apps izq · banco der), sin texto. */
pub const APPS_ICON: Rect = Rect {
    x: 150,
    y: 395,
    w: 56,
    h: 54,
};
pub const BANK_ICON: Rect = Rect {
    x: 260,
    y: 395,
    w: 56,
    h: 54,
};

/// Drawer lateral de chat (derecha → izquierda): X para cerrar.
/// Cuando está abierto (anim=100) el drawer ocupa x=166..466; la X va en x≈316.
pub const DRAWER_X: Rect = Rect {
    x: 288,
    y: 392,
    w: 56,
    h: 56,
};
/// Acción resuelta (el wrapper la ejecuta: api o local).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Hit {
    None,
    Unlock,
    Lock,
    Home,
    Apps,
    App(usize),
    Banco,
    Settings,
    Providers,
    Models,
    ProviderIdx(usize),
    ModelIdx(usize),
    Theme,
    Mic,
    ShadeOpen,
    ShadeClose,
    ShadeBody,
    ShadeSettings,
    BankMain,
    BankSend,
    BankReceive,
    BankQr,
    BankNfc,
    BankSendNfc,
    BankSendManual,
    /// Cerrar el drawer lateral de chat (X).
    ChatDrawerClose,
    /// Abrir el artifact asociado a un turno del historial.
    ChatArtifact(usize),
}

fn clamp_offset(total: usize, want: u32) -> usize {
    let max = total.saturating_sub(LIST_PAGE as usize);
    (want as usize).min(max)
}

/// Toque principal (pantallas del OS). El shade se evalúa aparte.
pub fn hit_test(os: &OsState, view: &ViewState, px: f32, py: f32) -> Hit {
    if os.stage != Stage::Online {
        return Hit::None;
    }
    // fuera del círculo visible → nada
    let dx = px - CENTER as f32;
    let dy = py - CENTER as f32;
    if dx * dx + dy * dy > (CLIP_R * CLIP_R) as f32 {
        return Hit::None;
    }
    if os.locked {
        return Hit::Unlock;
    }
    // Tira de estado en inicio abre el shade.
    if matches!(os.screen, crate::state::Screen::Home) && in_rect(px, py, STATUS_STRIP) {
        return Hit::ShadeOpen;
    }
    // Historial a pantalla completa, sin botones inferiores.
    if view.chat_full {
        if view.chat_anim >= 95 {
            if let Some(index) =
                crate::draw::chat_full_artifact_hit(os.chat, view.chat_scroll, px, py)
            {
                return Hit::ChatArtifact(index);
            }
        }
        return Hit::None;
    }
    // Si quedó abierto el drawer antiguo, solo la X es interactiva.
    if view.chat_drawer {
        if in_rect(px, py, DRAWER_X) {
            return Hit::ChatDrawerClose;
        }
        return Hit::None;
    }
    match os.screen {
        crate::state::Screen::Home => {
            if in_rect(px, py, APPS_ICON) {
                return Hit::Apps;
            }
            if in_rect(px, py, BANK_ICON) {
                return Hit::Banco;
            }
            if in_rect(px, py, MIC_ZONE) {
                return Hit::Mic;
            }
            Hit::None
        }
        crate::state::Screen::Apps => {
            if in_rect(px, py, HEADER_ZONE) {
                return Hit::Home;
            }
            let o = clamp_offset(os.apps.len(), view.scroll_apps);
            for (i, _) in os.apps.iter().skip(o).take(LIST_PAGE as usize).enumerate() {
                let r = Rect {
                    x: CENTER - 150,
                    y: 148 + i as i32 * 66,
                    w: 300,
                    h: 58,
                };
                if in_rect(px, py, r) {
                    return Hit::App(o + i);
                }
            }
            Hit::None
        }
        crate::state::Screen::AppDetail => {
            if in_rect(px, py, HEADER_ZONE) {
                Hit::Apps
            } else {
                Hit::None
            }
        }
        crate::state::Screen::Settings => {
            if in_rect(px, py, HEADER_ZONE) {
                return Hit::Home;
            }
            // wifi, dispositivo, proveedor, modelo, tema, bloquear
            const TARGETS: [Hit; 6] = [
                Hit::None,
                Hit::None,
                Hit::Providers,
                Hit::Models,
                Hit::Theme,
                Hit::Lock,
            ];
            for (i, t) in TARGETS.iter().enumerate() {
                let r = Rect {
                    x: CENTER - 150,
                    y: 140 + i as i32 * 44,
                    w: 300,
                    h: 40,
                };
                if in_rect(px, py, r) {
                    return *t;
                }
            }
            Hit::None
        }
        crate::state::Screen::Providers => {
            if in_rect(px, py, HEADER_ZONE) {
                return Hit::Settings;
            }
            let mut idx = 0usize;
            let o = view.scroll_providers as usize;
            // Clamp como en el panel (offset máx = total - página).
            let total = os.llm_providers.iter().filter(|p| p.has_key).count();
            let o = o.min(total.saturating_sub(LIST_PAGE as usize));
            let mut shown = 0usize;
            for (pi, p) in os.llm_providers.iter().enumerate() {
                if !p.has_key {
                    continue;
                }
                if idx >= o && shown < LIST_PAGE as usize {
                    let r = Rect {
                        x: CENTER - 150,
                        y: 148 + shown as i32 * 58,
                        w: 300,
                        h: 52,
                    };
                    if in_rect(px, py, r) {
                        return Hit::ProviderIdx(pi);
                    }
                    shown += 1;
                }
                idx += 1;
            }
            Hit::None
        }
        crate::state::Screen::Models => {
            if in_rect(px, py, HEADER_ZONE) {
                return Hit::Settings;
            }
            let mut active_models: &[&str] = &[];
            for p in os.llm_providers {
                if p.is_active {
                    active_models = p.models;
                    break;
                }
            }
            let o = clamp_offset(active_models.len(), view.scroll_models);
            for (i, _) in active_models
                .iter()
                .skip(o)
                .take(LIST_PAGE as usize)
                .enumerate()
            {
                let r = Rect {
                    x: CENTER - 150,
                    y: 148 + i as i32 * 58,
                    w: 300,
                    h: 52,
                };
                if in_rect(px, py, r) {
                    return Hit::ModelIdx(o + i);
                }
            }
            Hit::None
        }
        crate::state::Screen::Banco => {
            if view.banco_tab != 0 {
                if in_rect(px, py, HEADER_ZONE) {
                    return Hit::BankMain;
                }
                return banco_hit(view.banco_tab, px, py);
            }
            if in_rect(px, py, HEADER_ZONE) {
                return Hit::Home;
            }
            banco_hit(0, px, py)
        }
    }
}

/// Toque en subvistas de Banco.
pub fn banco_hit(tab: u8, px: f32, py: f32) -> Hit {
    match tab {
        1 => {
            if in_rect(px, py, BANK_PILL_A) {
                return Hit::BankQr;
            }
            if in_rect(px, py, BANK_PILL_B) {
                return Hit::BankNfc;
            }
            Hit::None
        }
        2 => {
            if in_rect(px, py, BANK_PILL_A) {
                return Hit::BankSendNfc;
            }
            if in_rect(px, py, BANK_PILL_B) {
                return Hit::BankSendManual;
            }
            Hit::None
        }
        _ => {
            if in_rect(px, py, BANK_SEND) {
                return Hit::BankSend;
            }
            if in_rect(px, py, BANK_RECV) {
                return Hit::BankReceive;
            }
            Hit::None
        }
    }
}

/// Toque con el shade abierto (el wrapper decide por umbral de progreso).
pub fn shade_hit(px: f32, py: f32) -> Hit {
    if in_rect(px, py, SHADE_GEAR) {
        return Hit::ShadeSettings;
    }
    if py >= 0.0 && py <= SHADE_PANEL_H as f32 {
        return Hit::ShadeBody;
    }
    Hit::ShadeClose
}

// ── tests (espejo de scripts/test-layout.sh) ─────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::*;

    static M1: [&str; 1] = ["m1"];
    static G1: [&str; 1] = ["g1"];
    static M6: [&str; 6] = ["m1", "m2", "m3", "m4", "m5", "m6"];
    static APPS: [SimApp<'static>; 1] = [SimApp {
        slug: "payload-cms",
        name: "Payload CMS",
        status: "installed",
        tools_count: 4,
    }];
    static PROVS: [LlmProvider<'static>; 2] = [
        LlmProvider {
            provider: "nvidia-nim",
            models: &M1,
            default_model: "m1",
            has_key: true,
            is_active: true,
        },
        LlmProvider {
            provider: "openai",
            models: &G1,
            default_model: "g1",
            has_key: true,
            is_active: false,
        },
    ];
    static PROV6: [LlmProvider<'static>; 1] = [LlmProvider {
        provider: "p",
        models: &M6,
        default_model: "m1",
        has_key: true,
        is_active: true,
    }];

    fn home_os() -> OsState<'static> {
        OsState {
            stage: Stage::Online,
            screen: Screen::Home,
            locked: false,
            apps: &APPS,
            llm_providers: &PROVS,
            ..Default::default()
        }
    }

    fn view() -> ViewState<'static> {
        ViewState::default()
    }

    #[test]
    fn home_icons_mic_empty_outside() {
        let os = home_os();
        let v = view();
        // iconos junto a la onda: apps izq · banco der · mic centro
        assert_eq!(hit_test(&os, &v, 169.0, 418.0), Hit::Apps);
        assert_eq!(hit_test(&os, &v, 297.0, 418.0), Hit::Banco);
        assert_eq!(hit_test(&os, &v, 233.0, 418.0), Hit::Mic);
        assert_eq!(hit_test(&os, &v, 120.0, 400.0), Hit::None);
        assert_eq!(hit_test(&os, &v, 10.0, 10.0), Hit::None);
    }

    #[test]
    fn apps_detail_settings() {
        let mut os = home_os();
        let v = view();
        os.screen = Screen::Apps;
        assert_eq!(hit_test(&os, &v, 233.0, 74.0), Hit::Home);
        assert_eq!(hit_test(&os, &v, 233.0, 177.0), Hit::App(0));
        os.screen = Screen::AppDetail;
        assert_eq!(hit_test(&os, &v, 233.0, 74.0), Hit::Apps);
        os.screen = Screen::Settings;
        assert_eq!(hit_test(&os, &v, 233.0, 74.0), Hit::Home);
        assert_eq!(
            hit_test(&os, &v, 233.0, (140 + 2 * 44 + 20) as f32),
            Hit::Providers
        );
        assert_eq!(
            hit_test(&os, &v, 233.0, (140 + 3 * 44 + 20) as f32),
            Hit::Models
        );
        assert_eq!(
            hit_test(&os, &v, 233.0, (140 + 4 * 44 + 20) as f32),
            Hit::Theme
        );
        assert_eq!(
            hit_test(&os, &v, 233.0, (140 + 5 * 44 + 20) as f32),
            Hit::Lock
        );
        assert_eq!(hit_test(&os, &v, 233.0, (140 + 20) as f32), Hit::None);
    }

    #[test]
    fn providers_models_lists() {
        let mut os = home_os();
        let v = view();
        os.screen = Screen::Providers;
        assert_eq!(hit_test(&os, &v, 233.0, 74.0), Hit::Settings);
        assert_eq!(
            hit_test(&os, &v, 233.0, (148 + 29) as f32),
            Hit::ProviderIdx(0)
        );
        os.screen = Screen::Models;
        assert_eq!(hit_test(&os, &v, 233.0, 74.0), Hit::Settings);
        assert_eq!(
            hit_test(&os, &v, 233.0, (148 + 29) as f32),
            Hit::ModelIdx(0)
        );
    }

    #[test]
    fn x402_locked_claim() {
        let mut os = home_os();
        let v = view();
        os.screen = Screen::Banco;
        assert_eq!(hit_test(&os, &v, 233.0, 74.0), Hit::Home);
        os.locked = true;
        assert_eq!(hit_test(&os, &v, 100.0, 300.0), Hit::Unlock);
        os.locked = false;
        os.stage = Stage::Claim;
        assert_eq!(hit_test(&os, &v, 125.0, 205.0), Hit::None);
    }

    #[test]
    fn models_scroll() {
        let mut os = home_os();
        os.llm_providers = &PROV6;
        os.screen = Screen::Models;
        let mut v = view();
        v.scroll_models = 2;
        assert_eq!(
            hit_test(&os, &v, 233.0, (148 + 29) as f32),
            Hit::ModelIdx(2)
        );
        assert_eq!(
            hit_test(&os, &v, 233.0, (148 + 3 * 58 + 29) as f32),
            Hit::ModelIdx(5)
        );
        v.scroll_models = 99; // clamp → 2
        assert_eq!(
            hit_test(&os, &v, 233.0, (148 + 29) as f32),
            Hit::ModelIdx(2)
        );
    }

    #[test]
    fn shade_zones() {
        assert_eq!(shade_hit(318.0, 66.0), Hit::ShadeSettings);
        assert_eq!(shade_hit(233.0, 200.0), Hit::ShadeBody);
        assert_eq!(shade_hit(233.0, 430.0), Hit::ShadeBody);
        assert_eq!(shade_hit(233.0, 500.0), Hit::ShadeClose);
    }

    #[test]
    fn banco_zones() {
        assert_eq!(banco_hit(0, 148.0, 278.0), Hit::BankSend);
        assert_eq!(banco_hit(0, 318.0, 278.0), Hit::BankReceive);
        assert_eq!(banco_hit(1, 178.0, 150.0), Hit::BankQr);
        assert_eq!(banco_hit(1, 288.0, 150.0), Hit::BankNfc);
        assert_eq!(banco_hit(2, 178.0, 150.0), Hit::BankSendNfc);
        assert_eq!(banco_hit(2, 288.0, 150.0), Hit::BankSendManual);
        assert_eq!(banco_hit(0, 233.0, 430.0), Hit::None);
    }

    #[test]
    fn strip_opens_shade_on_home() {
        let os = home_os();
        let v = view();
        // STATUS_STRIP (73..393, 36..96) en inicio → ShadeOpen
        assert_eq!(hit_test(&os, &v, 233.0, 60.0), Hit::ShadeOpen);
    }

    #[test]
    fn chat_full_has_no_bottom_buttons() {
        let os = home_os();
        let mut v = view();
        v.chat_full = true;
        assert_eq!(hit_test(&os, &v, 202.0, 420.0), Hit::None);
        assert_eq!(hit_test(&os, &v, 264.0, 420.0), Hit::None);
        assert_eq!(hit_test(&os, &v, 174.0, 420.0), Hit::None);
        // el resto de la pantalla no hace nada (el scroll es del visor)
        assert_eq!(hit_test(&os, &v, 233.0, 200.0), Hit::None);
        v.chat_compose = true;
        assert_eq!(hit_test(&os, &v, 330.0, 420.0), Hit::None);
        assert_eq!(hit_test(&os, &v, 134.0, 420.0), Hit::None);
        assert_eq!(hit_test(&os, &v, 230.0, 420.0), Hit::None);
    }
}
