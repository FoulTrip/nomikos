//! Pegamento WASM (solo wasm32): JSON del api/visor → núcleo → píxeles.
//! El núcleo no ve JSON ni heap: este módulo traduce y posee los buffers.

use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::{
    draw,
    frame::{Frame, LEN},
    hit::{self, Hit},
    palette::{DARK, LIGHT},
    state::*,
};

// ── framebuffer ────────────────────────────────────────────────────────
// Se devuelve copiado (Vec → Uint8Array): 868 KB por frame, trivial
// frente al coste del dibujo. Evita exponer memoria lineal (el target
// web de wasm-pack no exporta `memory` de forma estable).

#[wasm_bindgen]
pub fn osui_frame_len() -> usize {
    LEN
}

#[wasm_bindgen]
pub fn osui_width() -> u32 {
    crate::PX as u32
}

/// Máximo de scroll del historial calculado con el layout real del renderer.
#[wasm_bindgen]
pub fn osui_chat_scroll_max(state_json: &str) -> u32 {
    let sv: Value = serde_json::from_str(state_json).unwrap_or(Value::Null);
    let owned_chat = parse_chat(&sv);
    let chat: Vec<ChatTurn> = owned_chat
        .iter()
        .map(|turn| ChatTurn {
            text: &turn.text,
            reply: &turn.reply,
            artifact: turn.artifact.as_ref().map(|artifact| ChatArtifact {
                title: &artifact.title,
                app: &artifact.app,
                item_count: artifact.item_count,
            }),
        })
        .collect();
    draw::chat_full_scroll_max(&chat)
}

// ── mapeo JSON → prestado (owners viven en el llamador) ─────────────────

fn get<'a>(v: &'a Value, k: &str) -> &'a Value {
    v.get(k).unwrap_or(&Value::Null)
}

fn sn<'a>(v: &'a Value, k: &str) -> &'a str {
    get(v, k).as_str().unwrap_or("")
}

fn un(v: &Value, k: &str) -> u32 {
    get(v, k).as_u64().unwrap_or(0) as u32
}

fn bn(v: &Value, k: &str, d: bool) -> bool {
    get(v, k).as_bool().unwrap_or(d)
}

struct OApp {
    slug: String,
    name: String,
    status: String,
    tools_count: u32,
}

struct OProv {
    provider: String,
    models: Vec<String>,
    default_model: String,
    has_key: bool,
    is_active: bool,
}

struct OWallet {
    pubkey: Option<String>,
    network: String,
    balance: Option<i64>,
}

struct OX402 {
    status: String,
    access: String,
    hint: String,
    lamports: i64,
    has: bool,
}

struct OReply {
    text: String,
    reply: String,
}

/// Un turno del historial de chat (lo mantiene el api por cuenta).
struct OChat {
    text: String,
    reply: String,
    artifact: Option<OArtifact>,
}

struct OArtifact {
    title: String,
    app: String,
    item_count: u32,
}

fn parse_chat(v: &Value) -> Vec<OChat> {
    get(v, "chat")
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|t| OChat {
            text: sn(t, "text").to_string(),
            reply: sn(t, "reply").to_string(),
            artifact: get(t, "artifacts")
                .as_array()
                .and_then(|items| items.first())
                .map(|artifact| OArtifact {
                    title: sn(artifact, "title").to_string(),
                    app: sn(artifact, "app").to_string(),
                    item_count: get(artifact, "items")
                        .as_array()
                        .map(|items| items.len() as u32)
                        .unwrap_or_else(|| {
                            un(artifact, "item_count").max(un(artifact, "total_items"))
                        }),
                }),
        })
        .collect()
}

fn parse_apps(v: &Value) -> Vec<OApp> {
    get(v, "apps")
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|a| OApp {
            slug: sn(a, "slug").to_string(),
            name: sn(a, "name").to_string(),
            status: sn(a, "status").to_string(),
            tools_count: un(a, "tools_count"),
        })
        .collect()
}

fn parse_providers(v: &Value) -> Vec<OProv> {
    get(&get(v, "llm"), "providers")
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|p| OProv {
            provider: sn(p, "provider").to_string(),
            models: p
                .get("models")
                .and_then(|m| m.as_array())
                .cloned()
                .unwrap_or_default()
                .iter()
                .filter_map(|m| m.as_str().map(str::to_string))
                .collect(),
            default_model: sn(p, "default_model").to_string(),
            has_key: bn(p, "has_key", false),
            is_active: bn(p, "is_active", false),
        })
        .collect()
}

fn parse_wallet(v: &Value) -> OWallet {
    let w = get(v, "agent_wallet");
    OWallet {
        pubkey: w
            .get("wallet_pubkey")
            .and_then(|x| x.as_str())
            .map(str::to_string),
        network: sn(w, "network").to_string(),
        balance: w.get("balance_lamports").and_then(|x| x.as_i64()),
    }
}

fn parse_x402(v: &Value) -> OX402 {
    let x = get(v, "last_x402");
    OX402 {
        status: sn(x, "status").to_string(),
        access: sn(x, "access").to_string(),
        hint: sn(x, "hint").to_string(),
        lamports: x.get("lamports").and_then(|n| n.as_i64()).unwrap_or(0),
        has: !x.is_null(),
    }
}

fn parse_reply(v: &Value) -> Option<OReply> {
    let r = get(v, "last_reply");
    if r.is_null() {
        return None;
    }
    Some(OReply {
        text: sn(r, "text").to_string(),
        reply: sn(r, "reply").to_string(),
    })
}

fn parse_screen(v: &Value) -> Screen {
    match sn(v, "screen") {
        "apps" => Screen::Apps,
        "appdetail" => Screen::AppDetail,
        "x402" => Screen::Banco,
        "settings" => Screen::Settings,
        "providers" => Screen::Providers,
        "models" => Screen::Models,
        _ => Screen::Home,
    }
}

fn parse_stage(v: &Value) -> Stage {
    match sn(v, "stage") {
        "boot" => Stage::Boot,
        "claim" => Stage::Claim,
        _ => Stage::Online,
    }
}

/// Vista parseada del JSON que manda el visor.
struct ViewParsed {
    scroll_apps: u32,
    scroll_providers: u32,
    scroll_models: u32,
    light: bool,
    shade_p: u8,
    mic_muted: bool,
    banco_tab: u8,
    banco_recv_nfc: bool,
    banco_send_manual: bool,
    send_to: String,
    chat_status: u8,
    chat_elapsed_ms: u64,
    chat_heard: String,
    chat_full: bool,
    chat_anim: u8,
    chat_scroll: u32,
    chat_compose: bool,
    chat_draft: String,
    chat_drawer: bool,
    chat_drawer_anim: u8,
    chat_drawer_scroll: u32,
}

fn parse_view(v: &Value) -> ViewParsed {
    let sc = get(v, "scroll");
    let b = get(v, "banco");
    let chat = get(v, "chat");
    let chat_status = match sn(chat, "status") {
        "listening" => 1,
        "thinking" => 2,
        "done" => 3,
        "error" => 4,
        _ => 0,
    };
    ViewParsed {
        scroll_apps: un(sc, "apps"),
        scroll_providers: un(sc, "providers"),
        scroll_models: un(sc, "models"),
        light: sn(v, "theme") == "light",
        shade_p: un(v, "shadeP").min(100) as u8,
        mic_muted: bn(v, "micMuted", false),
        banco_tab: match sn(b, "tab") {
            "receive" => 1,
            "send" => 2,
            _ => 0,
        },
        banco_recv_nfc: sn(b, "recv") == "nfc",
        banco_send_manual: sn(b, "send") == "manual",
        send_to: sn(v, "sendTo").to_string(),
        chat_status,
        chat_elapsed_ms: chat.get("elapsed_ms").and_then(|x| x.as_u64()).unwrap_or(0),
        chat_heard: sn(chat, "heard").to_string(),
        chat_full: bn(v, "chatFull", false),
        chat_anim: un(v, "chatAnim").min(100) as u8,
        chat_scroll: un(v, "chatScroll"),
        chat_compose: bn(v, "chatCompose", false),
        chat_draft: sn(v, "chatDraft").to_string(),
        chat_drawer: bn(v, "chatDrawer", false),
        chat_drawer_anim: un(v, "chatDrawerAnim").min(100) as u8,
        chat_drawer_scroll: un(v, "chatDrawerScroll"),
    }
}

/// QR → bits row-major (1 = oscuro). None si falla.
fn qr_bits(data: &str) -> Option<(u32, Vec<u8>)> {
    let code = qrcode::QrCode::new(data.as_bytes()).ok()?;
    let w = code.width() as u32;
    let mut bits = Vec::with_capacity((w * w) as usize);
    for y in 0..w as usize {
        for x in 0..w as usize {
            let dark = matches!(code[(x, y)], qrcode::Color::Dark);
            bits.push(dark as u8);
        }
    }
    Some((w, bits))
}

#[wasm_bindgen]
pub fn osui_render(
    state_json: &str,
    view_json: &str,
    elapsed_ms: u64,
    hour: u8,
    minute: u8,
    date_line: &str,
) -> Vec<u8> {
    let mut buf = vec![0u8; LEN];
    let mut fb = Frame {
        buf: &mut buf,
        dx: 0,
        dy: 0,
        clip_x: None,
        clip_y: None,
    };
    let sv: Value = serde_json::from_str(state_json).unwrap_or(Value::Null);
    let vv: Value = serde_json::from_str(view_json).unwrap_or(Value::Null);
    let pv = parse_view(&vv);

    // Owners (viven hasta el fin del render).
    let oapps = parse_apps(&sv);
    let oprovs = parse_providers(&sv);
    let owallet = parse_wallet(&sv);
    let ox402 = parse_x402(&sv);
    let oreply = parse_reply(&sv);
    let ochat = parse_chat(&sv);
    let device_id = sn(&sv, "device_id").to_string();
    let claim_code = sn(&sv, "claim_code").to_string();
    let detail_app = sn(&sv, "detail_app").to_string();
    let llm_active = sn(get(&sv, "llm"), "active_provider").to_string();
    let network = owallet.network.clone();
    let x_status = ox402.status.clone();
    let x_access = ox402.access.clone();
    let x_hint = ox402.hint.clone();
    let date_owned = date_line.to_string();
    let sim_apps: Vec<SimApp> = oapps
        .iter()
        .map(|a| SimApp {
            slug: &a.slug,
            name: &a.name,
            status: &a.status,
            tools_count: a.tools_count,
        })
        .collect();
    let model_lists: Vec<Vec<&str>> = oprovs
        .iter()
        .map(|p| p.models.iter().map(|m| m.as_str()).collect())
        .collect();
    let sim_provs: Vec<LlmProvider> = oprovs
        .iter()
        .zip(model_lists.iter())
        .map(|(p, m)| LlmProvider {
            provider: &p.provider,
            models: m,
            default_model: &p.default_model,
            has_key: p.has_key,
            is_active: p.is_active,
        })
        .collect();
    let sim_chat: Vec<ChatTurn> = ochat
        .iter()
        .map(|t| ChatTurn {
            text: &t.text,
            reply: &t.reply,
            artifact: t.artifact.as_ref().map(|artifact| ChatArtifact {
                title: &artifact.title,
                app: &artifact.app,
                item_count: artifact.item_count,
            }),
        })
        .collect();

    // QR solo si la vista lo pide (banco › recibir › QR).
    let screen = parse_screen(&sv);
    let btab = pv.banco_tab;
    let brecv = pv.banco_recv_nfc;
    let mut qr_bits_vec: Vec<u8> = Vec::new();
    let mut qr_width = 0u32;
    if screen == Screen::Banco && btab == 1 && !brecv {
        if let Some(pk) = owallet.pubkey.as_deref() {
            if !pk.is_empty() {
                if let Some((w, bits)) = qr_bits(pk) {
                    qr_width = w;
                    qr_bits_vec = bits;
                }
            }
        }
    }
    let qr = if qr_width > 0 {
        Some(Qr {
            width: qr_width,
            bits: &qr_bits_vec,
        })
    } else {
        None
    };

    let os = OsState {
        stage: parse_stage(&sv),
        screen,
        locked: bn(&sv, "locked", true),
        device_id: &device_id,
        claim_code: &claim_code,
        boot_count: un(&sv, "boot_count"),
        taps: un(&sv, "taps"),
        apps: &sim_apps,
        detail_app: &detail_app,
        llm_active: &llm_active,
        llm_providers: &sim_provs,
        wallet: Wallet {
            pubkey: owallet.pubkey.as_deref(),
            network: &network,
            balance_lamports: owallet.balance,
        },
        last_x402: LastX402 {
            status: &x_status,
            access: &x_access,
            hint: &x_hint,
            lamports: ox402.lamports,
            has: ox402.has,
        },
        last_reply: oreply.as_ref().map(|r| LastReply {
            text: &r.text,
            reply: &r.reply,
        }),
        chat: &sim_chat,
        qr,
        clock: Clock {
            hour,
            minute,
            date_line: &date_owned,
        },
    };
    let view = ViewState {
        scroll_apps: pv.scroll_apps,
        scroll_providers: pv.scroll_providers,
        scroll_models: pv.scroll_models,
        light: pv.light,
        shade_p: pv.shade_p,
        mic_muted: pv.mic_muted,
        banco_tab: pv.banco_tab,
        banco_recv_nfc: pv.banco_recv_nfc,
        banco_send_manual: pv.banco_send_manual,
        send_to: &pv.send_to,
        chat_status: pv.chat_status,
        chat_heard: &pv.chat_heard,
        chat_elapsed_ms: pv.chat_elapsed_ms,
        chat_full: pv.chat_full,
        chat_anim: pv.chat_anim,
        chat_scroll: pv.chat_scroll,
        chat_compose: pv.chat_compose,
        chat_draft: &pv.chat_draft,
        chat_drawer: pv.chat_drawer,
        chat_drawer_anim: pv.chat_drawer_anim,
        chat_drawer_scroll: pv.chat_drawer_scroll,
        elapsed_ms,
    };
    let some_os = if sv.is_null() { None } else { Some(&os) };
    draw::draw(
        &mut fb,
        if pv.light { &LIGHT } else { &DARK },
        some_os,
        &view,
        hour,
        minute,
        date_line,
        elapsed_ms,
    );
    buf
}

fn hit_to_string(h: Hit, sv: &Value) -> String {
    match h {
        Hit::None => String::new(),
        Hit::Unlock => "unlock".into(),
        Hit::Lock => "lock".into(),
        Hit::Home => "home".into(),
        Hit::Apps => "apps".into(),
        Hit::Banco => "x402".into(),
        Hit::Settings => "settings".into(),
        Hit::Providers => "providers".into(),
        Hit::Models => "models".into(),
        Hit::Theme => "local:theme".into(),
        Hit::Mic => "local:mic".into(),
        Hit::ShadeOpen => "local:shade-open".into(),
        Hit::ShadeClose => "local:shade-close".into(),
        Hit::ShadeBody => "local:shade-body".into(),
        Hit::ShadeSettings => "settings".into(),
        Hit::BankMain => "local:bank-main".into(),
        Hit::BankSend => "local:bank-send".into(),
        Hit::BankReceive => "local:bank-receive".into(),
        Hit::BankQr => "local:bank-qr".into(),
        Hit::BankNfc => "local:bank-nfc".into(),
        Hit::BankSendNfc => "local:bank-send-nfc".into(),
        Hit::BankSendManual => "local:bank-send-manual".into(),
        Hit::ChatDrawerClose => "local:chat-drawer-close".into(),
        Hit::ChatArtifact(i) => format!("local:chat-artifact:{i}"),
        Hit::App(i) => get(
            get(sv, "apps")
                .as_array()
                .and_then(|a| a.get(i))
                .unwrap_or(&Value::Null),
            "slug",
        )
        .as_str()
        .map(|s| format!("app:{s}"))
        .unwrap_or_default(),
        Hit::ProviderIdx(i) => get(&get(sv, "llm"), "providers")
            .as_array()
            .and_then(|a| a.get(i))
            .and_then(|p| p.get("provider"))
            .and_then(|s| s.as_str())
            .map(|s| format!("provider:{s}"))
            .unwrap_or_default(),
        Hit::ModelIdx(i) => {
            let provs = get(&get(sv, "llm"), "providers");
            let active = provs
                .as_array()
                .cloned()
                .unwrap_or_default()
                .into_iter()
                .find(|p| bn(p, "is_active", false));
            active
                .and_then(|p| p.get("models").and_then(|m| m.as_array()).cloned())
                .and_then(|m| m.get(i).and_then(|s| s.as_str()).map(str::to_string))
                .map(|s| format!("model:{s}"))
                .unwrap_or_default()
        }
    }
}

#[wasm_bindgen]
pub fn osui_hit(state_json: &str, view_json: &str, px: f32, py: f32) -> String {
    let sv: Value = serde_json::from_str(state_json).unwrap_or(Value::Null);
    let vv: Value = serde_json::from_str(view_json).unwrap_or(Value::Null);
    if sv.is_null() {
        return String::new();
    }
    let oapps = parse_apps(&sv);
    let oprovs = parse_providers(&sv);
    let sim_apps: Vec<SimApp> = oapps
        .iter()
        .map(|a| SimApp {
            slug: &a.slug,
            name: &a.name,
            status: &a.status,
            tools_count: a.tools_count,
        })
        .collect();
    let model_lists: Vec<Vec<&str>> = oprovs
        .iter()
        .map(|p| p.models.iter().map(|m| m.as_str()).collect())
        .collect();
    let sim_provs: Vec<LlmProvider> = oprovs
        .iter()
        .zip(model_lists.iter())
        .map(|(p, m)| LlmProvider {
            provider: &p.provider,
            models: m,
            default_model: &p.default_model,
            has_key: p.has_key,
            is_active: p.is_active,
        })
        .collect();
    let pv = parse_view(&vv);
    let _ = (
        pv.light,
        pv.mic_muted,
        pv.send_to,
        pv.chat_status,
        pv.chat_heard,
        pv.chat_elapsed_ms,
    );
    if pv.shade_p > 50 {
        return hit_to_string(hit::shade_hit(px, py), &sv);
    }
    let ochat = parse_chat(&sv);
    let sim_chat: Vec<ChatTurn> = ochat
        .iter()
        .map(|t| ChatTurn {
            text: &t.text,
            reply: &t.reply,
            artifact: t.artifact.as_ref().map(|artifact| ChatArtifact {
                title: &artifact.title,
                app: &artifact.app,
                item_count: artifact.item_count,
            }),
        })
        .collect();
    let os = OsState {
        stage: parse_stage(&sv),
        screen: parse_screen(&sv),
        locked: bn(&sv, "locked", true),
        device_id: "",
        claim_code: "",
        boot_count: 0,
        taps: 0,
        apps: &sim_apps,
        detail_app: "",
        llm_active: "",
        llm_providers: &sim_provs,
        wallet: Wallet::default(),
        last_x402: LastX402::default(),
        last_reply: None,
        chat: &sim_chat,
        qr: None,
        clock: Clock::default(),
    };
    let view = ViewState {
        scroll_apps: pv.scroll_apps,
        scroll_providers: pv.scroll_providers,
        scroll_models: pv.scroll_models,
        light: false,
        shade_p: 0,
        mic_muted: false,
        banco_tab: pv.banco_tab,
        banco_recv_nfc: pv.banco_recv_nfc,
        banco_send_manual: pv.banco_send_manual,
        send_to: "",
        chat_status: 0,
        chat_heard: "",
        chat_elapsed_ms: 0,
        chat_full: pv.chat_full,
        chat_anim: pv.chat_anim,
        chat_scroll: pv.chat_scroll,
        chat_compose: pv.chat_compose,
        chat_draft: "",
        chat_drawer: pv.chat_drawer,
        chat_drawer_anim: pv.chat_drawer_anim,
        chat_drawer_scroll: pv.chat_drawer_scroll,
        elapsed_ms: 0,
    };
    hit_to_string(hit::hit_test(&os, &view, px, py), &sv)
}
