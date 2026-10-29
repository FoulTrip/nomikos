//! Pantallas del OS: port 1:1 de la geometría del panel
//! (mismas coordenadas 466×466, misma paleta, mismos textos).
//! Sin heap: buffers fijos + rebanadas.

use embedded_graphics::{
    geometry::{AngleUnit, Point, Size},
    pixelcolor::{Rgb888, RgbColor},
    primitives::{Circle, Line, Primitive, PrimitiveStyle, Rectangle, RoundedRectangle, Triangle},
    Drawable,
};
#[cfg(not(feature = "std"))]
use micromath::F32Ext as _;

use crate::{
    frame::{rect, Frame},
    hit::LIST_PAGE,
    icons,
    palette::{Palette, ALERT_RED, BADGE_BLUE, LIGHT},
    state::{ChatTurn, OsState, Screen, Stage, ViewState},
    text::{self, Face},
    CENTER, CLIP_R, PX,
};
use u8g2_fonts::types::HorizontalAlignment as Align;

// ── helpers ────────────────────────────────────────────────────────────

fn txt(f: &mut Frame, face: Face, bold: bool, align: Align, x: i32, y: i32, c: Rgb888, s: &str) {
    text::text_auto(f, face, bold, align, x, y, c, s);
}

fn rrect(
    f: &mut Frame,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
    r: u32,
    fill: Rgb888,
    edge: Option<(Rgb888, u32)>,
) {
    RoundedRectangle::with_equal_corners(rect(x, y, w, h), Size::new(r, r))
        .into_styled(PrimitiveStyle::with_fill(fill))
        .draw(f)
        .ok();
    if let Some((c, sw)) = edge {
        RoundedRectangle::with_equal_corners(rect(x, y, w, h), Size::new(r, r))
            .into_styled(PrimitiveStyle::with_stroke(c, sw))
            .draw(f)
            .ok();
    }
}

fn circle_fill(f: &mut Frame, cx: i32, cy: i32, r: u32, c: Rgb888) {
    Circle::with_center(Point::new(cx, cy), r * 2)
        .into_styled(PrimitiveStyle::with_fill(c))
        .draw(f)
        .ok();
}

fn circle_edge(f: &mut Frame, cx: i32, cy: i32, r: u32, c: Rgb888, w: u32) {
    Circle::with_center(Point::new(cx, cy), r * 2)
        .into_styled(PrimitiveStyle::with_stroke(c, w))
        .draw(f)
        .ok();
}

fn mix(a: Rgb888, b: Rgb888, t: f32) -> Rgb888 {
    let m = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t).clamp(0.0, 255.0) as u8;
    Rgb888::new(m(a.r(), b.r()), m(a.g(), b.g()), m(a.b(), b.b()))
}

/// u32 → texto (buffer del llamador).
fn fmt_u32(mut n: u32, buf: &mut [u8; 32]) -> &str {
    if n == 0 {
        buf[0] = b'0';
        return core::str::from_utf8(&buf[..1]).unwrap_or("0");
    }
    let mut tmp = [0u8; 32];
    let mut len = 0usize;
    while n > 0 && len < 32 {
        tmp[len] = b'0' + (n % 10) as u8;
        n /= 10;
        len += 1;
    }
    for i in 0..len {
        buf[i] = tmp[len - 1 - i];
    }
    core::str::from_utf8(&buf[..len]).unwrap_or("?")
}

/// i64 → texto (para lamports/conteos; maneja negativos).
fn fmt_i64(n: i64, buf: &mut [u8; 32]) -> &str {
    if n < 0 {
        buf[0] = b'-';
        let mut tmp32 = [0u8; 32];
        let s = fmt_u32(n.unsigned_abs() as u32, &mut tmp32);
        let bytes = s.as_bytes();
        let mut tmp = [0u8; 32];
        tmp[0] = b'-';
        let mut len = 1usize;
        for &b in bytes.iter().take(30) {
            tmp[len] = b;
            len += 1;
        }
        buf[..len].copy_from_slice(&tmp[..len]);
        return core::str::from_utf8(&buf[..len]).unwrap_or("?");
    }
    fmt_u32(n as u32, buf)
}

/// Lamports → "0.0499" (4 decimales, redondeado).
fn fmt_sol(lamports: i64, buf: &mut [u8; 32]) -> &str {
    let v = ((lamports + 50_000) / 100_000).max(0) as u64;
    let int = v / 10_000;
    let frac = v % 10_000;
    let mut tmp32 = [0u8; 32];
    let si = fmt_u32(int as u32, &mut tmp32);
    let mut o = [0u8; 32];
    let mut len = 0usize;
    for &b in si.as_bytes() {
        o[len] = b;
        len += 1;
    }
    o[len] = b'.';
    len += 1;
    for d in [1000, 100, 10, 1] {
        o[len] = b'0' + ((frac / d) % 10) as u8;
        len += 1;
    }
    buf[..len].copy_from_slice(&o[..len]);
    core::str::from_utf8(&buf[..len]).unwrap_or("?")
}

/// Reloj "01:29" (dígitos + colon manual: la fuente 92 es solo números).
fn fmt_2(n: u8, buf: &mut [u8; 2]) -> &str {
    buf[0] = b'0' + n / 10;
    buf[1] = b'0' + n % 10;
    core::str::from_utf8(buf).unwrap_or("00")
}

/// Primeros `max` caracteres (corte seguro UTF-8) + "..." si recorta.
fn snip<'a>(s: &'a str, buf: &'a mut [u8], max_chars: usize) -> &'a str {
    let mut len = 0usize;
    let mut n = 0usize;
    let mut cut = false;
    for ch in s.chars() {
        if n >= max_chars {
            cut = true;
            break;
        }
        let cl = ch.len_utf8();
        if len + cl + 3 >= buf.len() {
            cut = true;
            break;
        }
        ch.encode_utf8(&mut buf[len..]);
        len += cl;
        n += 1;
    }
    if cut && len + 3 < 96 {
        buf[len..len + 3].copy_from_slice(b"...");
        len += 3;
    }
    core::str::from_utf8(&buf[..len]).unwrap_or("")
}

/// "abc123...xyz89" para pubkeys (ASCII: corte por bytes seguro).
fn short_key<'a>(pk: &'a str, buf: &'a mut [u8; 96]) -> &'a str {
    let b = pk.as_bytes();
    if b.len() <= 13 || !pk.is_ascii() {
        return snip(pk, buf, 13);
    }
    let mut o = [0u8; 32];
    o[..6].copy_from_slice(&b[..6]);
    o[6..9].copy_from_slice(b"...");
    o[9..14].copy_from_slice(&b[b.len() - 5..]);
    buf[..14].copy_from_slice(&o[..14]);
    core::str::from_utf8(&buf[..14]).unwrap_or("?")
}

/// Color de marca determinista por slug (HSL estable ≈ panel).
fn brand_color(slug: &str) -> Rgb888 {
    let mut h: u32 = 0;
    for b in slug.bytes() {
        h = (h.wrapping_mul(31).wrapping_add(b as u32)) % 360;
    }
    // HSL(70%, 55%) → RGB (f32, sin libm).
    let s = 0.7f32;
    let l = 0.55f32;
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let hp = h as f32 / 60.0;
    let x = c * (1.0 - ((hp % 2.0) - 1.0).abs());
    let (r1, g1, b1) = if hp < 1.0 {
        (c, x, 0.0)
    } else if hp < 2.0 {
        (x, c, 0.0)
    } else if hp < 3.0 {
        (0.0, c, x)
    } else if hp < 4.0 {
        (0.0, x, c)
    } else if hp < 5.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    let m = l - c / 2.0;
    Rgb888::new(
        ((r1 + m) * 255.0) as u8,
        ((g1 + m) * 255.0) as u8,
        ((b1 + m) * 255.0) as u8,
    )
}

/// Iniciales del badge (2 caps ASCII del slug).
fn badge_letters<'a>(slug: &str, buf: &'a mut [u8; 4]) -> &'a str {
    let mut out = [0u8; 4];
    let mut n = 0usize;
    let mut take_next = true;
    for ch in slug.chars() {
        if ch == '-' || ch == '_' {
            take_next = true;
            continue;
        }
        if take_next && ch.is_ascii_alphabetic() && n < 2 {
            out[n] = ch.to_ascii_uppercase() as u8;
            n += 1;
            take_next = false;
        }
        if n >= 2 {
            break;
        }
    }
    if n == 0 {
        return "?";
    }
    buf[..n].copy_from_slice(&out[..n]);
    core::str::from_utf8(&buf[..n]).unwrap_or("?")
}

// ── piezas ─────────────────────────────────────────────────────────────

fn scroll_hints(f: &mut Frame, p: &Palette, total: usize, off: usize, top_y: i32, bot_y: i32) {
    if total <= LIST_PAGE as usize {
        return;
    }
    if off > 0 {
        icons::tri_up(f, p.muted, CENTER + 138, top_y, 10);
    }
    if off + LIST_PAGE as usize <= total.saturating_sub(1) {
        icons::tri_down(f, p.muted, CENTER + 138, bot_y, 10);
    }
}

// ── pantallas ──────────────────────────────────────────────────────────

fn draw_connecting(f: &mut Frame, p: &Palette, elapsed_ms: u64) {
    let dots = match (elapsed_ms / 400) % 3 {
        0 => ".",
        1 => "..",
        _ => "...",
    };
    txt(
        f,
        Face::Xl,
        true,
        Align::Center,
        CENTER,
        CENTER - 6,
        p.muted,
        "NOMIKOS",
    );
    let mut buf = [0u8; 64];
    let msg = snip_append("conectando con el worker", dots, &mut buf);
    txt(
        f,
        Face::Base,
        false,
        Align::Center,
        CENTER,
        CENTER + 24,
        p.muted,
        msg,
    );
    let a0 = -90.0 + (elapsed_ms % 1000) as f32 / 1000.0 * 360.0;
    embedded_graphics::primitives::Arc::with_center(
        embedded_graphics::geometry::Point::new(CENTER, CENTER),
        (CENTER - 6) as u32 * 2,
        a0.deg(),
        90.0.deg(),
    )
    .into_styled(embedded_graphics::primitives::PrimitiveStyle::with_stroke(
        p.gold, 3,
    ))
    .draw(f)
    .ok();
}

/// Concatena a+b en buffer fijo.
fn snip_append<'a>(a: &str, b: &str, buf: &'a mut [u8]) -> &'a str {
    let mut len = 0usize;
    for s in [a, b] {
        for &c in s.as_bytes() {
            if len >= 64 {
                break;
            }
            buf[len] = c;
            len += 1;
        }
    }
    core::str::from_utf8(&buf[..len]).unwrap_or("")
}

/// Reloj "01".."59" (2 dígitos).

/// Notificaciones derivadas del estado (mismas reglas que el panel).
fn notif_count(os: &OsState) -> usize {
    let mut n = 0;
    if os.wallet.pubkey.is_none() {
        n += 1;
    }
    if !os.llm_providers.iter().any(|p| p.has_key) {
        n += 1;
    }
    if os.last_x402.has {
        n += 1;
    }
    if os.last_reply.is_some() {
        n += 1;
    }
    n.min(4)
}

/// Notificación i-ésima (título, cuerpo). `num` respalda cuerpos con cifras.
fn notif_get<'x>(os: &OsState, idx: usize, num: &'x mut [u8; 96]) -> Option<(&'x str, &'x str)> {
    let mut i = 0usize;
    if os.wallet.pubkey.is_none() {
        if idx == i {
            return Some(("Wallet dPaaS", "Sin configurar - créala en Wallet·Red"));
        }
        i += 1;
    }
    if !os.llm_providers.iter().any(|p| p.has_key) {
        if idx == i {
            return Some(("Modelos", "Sin keys - cárgalas en el panel"));
        }
        i += 1;
    }
    if os.last_x402.has {
        if idx == i {
            if os.last_x402.status == "settled" {
                let mut nb = [0u8; 32];
                let ns = fmt_i64(os.last_x402.lamports, &mut nb);
                let mut len = 0usize;
                for part in ["Peaje pagado ".as_bytes(), ns.as_bytes(), b" lamports"] {
                    for &b in part {
                        if len >= 96 {
                            break;
                        }
                        num[len] = b;
                        len += 1;
                    }
                }
                let out = core::str::from_utf8(&num[..len]).unwrap_or("?");
                return Some(("Banco", out));
            } else {
                return Some(("Banco", "No se pudo pagar"));
            }
        }
        i += 1;
    }
    if let Some(r) = os.last_reply {
        if idx == i {
            return Some(("Agente", snip60(r.reply, num)));
        }
    }
    None
}

/// Recorta a 60 caracteres en buffer prestado.
fn snip60<'x>(s: &str, buf: &'x mut [u8; 96]) -> &'x str {
    let mut len = 0usize;
    let mut n = 0usize;
    for ch in s.chars() {
        if n >= 60 || len + ch.len_utf8() >= 96 {
            break;
        }
        ch.encode_utf8(&mut buf[len..]);
        len += ch.len_utf8();
        n += 1;
    }
    core::str::from_utf8(&buf[..len]).unwrap_or("")
}

// ── pantallas de etapa ─────────────────────────────────────────────────

fn draw_boot(f: &mut Frame, p: &Palette, boot_count: u32, elapsed_ms: u64) {
    use crate::CENTER as R;
    let progress = ((elapsed_ms as f32) / 2600.0).min(1.0);
    let done = progress >= 1.0;
    // anillo de progreso
    embedded_graphics::primitives::Circle::with_center(
        embedded_graphics::geometry::Point::new(R, R),
        (R - 6) as u32 * 2,
    )
    .into_styled(PrimitiveStyle::with_stroke(p.track, 3))
    .draw(f)
    .ok();
    embedded_graphics::primitives::Arc::with_center(
        embedded_graphics::geometry::Point::new(R, R),
        (R - 6) as u32 * 2,
        (-90.0).deg(),
        (progress * 360.0).deg(),
    )
    .into_styled(PrimitiveStyle::with_stroke(p.gold, 3))
    .draw(f)
    .ok();
    txt(
        f,
        Face::Clock,
        true,
        Align::Center,
        R,
        R - 78,
        p.gold,
        "NOMIKOS",
    );
    txt(
        f,
        Face::Mid,
        false,
        Align::Center,
        R,
        R - 52,
        p.muted,
        "nomikos v0.1.0",
    );
    // barra
    let bw = 260;
    let bx = R - bw / 2;
    let by = R - 18;
    rrect(f, bx, by, bw as u32, 10, 5, p.track, None);
    if progress > 0.0 {
        let fw = ((bw as f32 * progress) as i32).max(10);
        rrect(f, bx, by, fw as u32, 10, 5, p.gold, None);
    }
    // log por etapas
    const STEPS: [(u64, &str); 4] = [
        (0, "kernel 6.6-rpi"),
        (650, "agentd"),
        (1300, "red"),
        (1950, "worker"),
    ];
    for (i, (t, name)) in STEPS.iter().enumerate() {
        let y = R + 22 + i as i32 * 20;
        if (elapsed_ms as u64) < *t {
            txt(f, Face::Mid, false, Align::Center, R, y, p.dot_edge, "...");
        } else {
            txt(f, Face::Mid, false, Align::Left, R - 80, y, p.text, name);
            if elapsed_ms > t + 350 {
                txt(f, Face::Mid, false, Align::Right, R + 80, y, p.green, "ok");
            }
        }
    }
    if !done {
        let a = (elapsed_ms % 240) as f32 / 240.0 * 360.0;
        embedded_graphics::primitives::Arc::with_center(
            embedded_graphics::geometry::Point::new(R, R + 132),
            18,
            a.deg(),
            252.0.deg(),
        )
        .into_styled(PrimitiveStyle::with_stroke(p.gold, 3))
        .draw(f)
        .ok();
    } else {
        txt(
            f,
            Face::Base,
            true,
            Align::Center,
            R,
            R + 138,
            p.green,
            "listo!",
        );
    }
    let mut buf = [0u8; 32];
    let n = fmt_u32(boot_count, &mut buf);
    let mut line = [0u8; 64];
    let msg = snip_append("boot #", n, &mut line);
    txt(
        f,
        Face::Small,
        false,
        Align::Center,
        R,
        R + 164,
        p.muted,
        msg,
    );
}

fn draw_claim(f: &mut Frame, p: &Palette, os: &OsState) {
    use crate::CENTER as R;
    txt(
        f,
        Face::Xxl,
        true,
        Align::Center,
        R,
        R - 120,
        p.gold,
        "NOMIKOS",
    );
    txt(
        f,
        Face::Large,
        false,
        Align::Center,
        R,
        R - 90,
        p.text,
        os.device_id,
    );
    txt(
        f,
        Face::Xxxl,
        true,
        Align::Center,
        R,
        R + 10,
        p.text,
        if os.claim_code.is_empty() {
            "????????"
        } else {
            os.claim_code
        },
    );
    txt(
        f,
        Face::Base,
        false,
        Align::Center,
        R,
        R + 50,
        p.muted,
        "empareja en el panel",
    );
    txt(
        f,
        Face::Base,
        false,
        Align::Center,
        R,
        R + 74,
        p.muted,
        "(Flota -> Emparejar)",
    );
    let mut buf = [0u8; 32];
    let n = fmt_u32(os.taps, &mut buf);
    let mut line = [0u8; 64];
    // "toques: N · pulsa AGREGAR"
    let mut tmp = [0u8; 64];
    let a = snip_append("toques: ", n, &mut tmp);
    let msg = snip_append(a, " · pulsa AGREGAR", &mut line);
    txt(
        f,
        Face::Small,
        false,
        Align::Center,
        R,
        R + 100,
        p.muted,
        msg,
    );
}

fn draw_lock(
    f: &mut Frame,
    p: &Palette,
    _os: &OsState,
    hour: u8,
    minute: u8,
    date_line: &str,
    elapsed_ms: u64,
) {
    use crate::CENTER as R;
    draw_status_bar(f, p);
    // reloj gigante: HH + colon + MM (fuente de dígitos + puntos manuales)
    let mut hb = [0u8; 2];
    let mut mb = [0u8; 2];
    let hs = fmt_2(hour, &mut hb);
    let ms = fmt_2(minute, &mut mb);
    let w2 = text::text_width(Face::ClockBig, "00");
    let gap = 20;
    let total = w2 * 2 + gap;
    let x0 = R - total / 2;
    txt(
        f,
        Face::ClockBig,
        false,
        Align::Left,
        x0,
        R - 20,
        p.text,
        hs,
    );
    circle_fill(f, x0 + w2 + gap / 2, R - 20 - 28, 4, p.text);
    circle_fill(f, x0 + w2 + gap / 2, R - 20 - 10, 4, p.text);
    txt(
        f,
        Face::ClockBig,
        false,
        Align::Left,
        x0 + w2 + gap,
        R - 20,
        p.text,
        ms,
    );
    txt(
        f,
        Face::Base,
        false,
        Align::Center,
        R,
        R + 14,
        p.muted,
        date_line,
    );
    let pulse = if elapsed_ms == u64::MAX {
        0.9
    } else {
        0.55 + 0.45 * (elapsed_ms as f32 / 380.0).sin()
    };
    txt(
        f,
        Face::Small,
        false,
        Align::Center,
        R,
        R + 120,
        mix(p.bg, p.gold, pulse),
        "Toca para desbloquear",
    );
}

// ── barra + cabecera + tiles ───────────────────────────────────────────

fn draw_status_bar(f: &mut Frame, p: &Palette) {
    #[cfg(not(feature = "std"))]
    use micromath::F32Ext as _;
    for deg in [-12.0f32, -4.0, 4.0, 12.0] {
        let a = deg * core::f32::consts::PI / 180.0;
        let x = CENTER + (210.0 * a.sin()) as i32;
        let y = CENTER - (210.0 * a.cos()) as i32;
        circle_fill(f, x, y, 7, Rgb888::BLACK);
        circle_edge(f, x, y, 7, p.track, 1);
    }
}

fn draw_header(f: &mut Frame, p: &Palette, title: &str) {
    txt(
        f,
        Face::Large,
        true,
        Align::Center,
        CENTER,
        114,
        p.gold,
        title,
    );
}

fn draw_badge(f: &mut Frame, x: i32, y: i32, r: u32, slug: &str) {
    circle_fill(f, x, y, r, Rgb888::new(0x10, 0x10, 0x10));
    circle_edge(f, x, y, r, brand_color(slug), 2);
    let mut buf = [0u8; 4];
    let init = badge_letters(slug, &mut buf);
    let face = if r <= 22 { Face::Large } else { Face::Xl };
    txt(
        f,
        face,
        true,
        Align::Center,
        x,
        y + (r as i32) * 32 / 100,
        brand_color(slug),
        init,
    );
}

fn draw_mic(f: &mut Frame, p: &Palette, muted: bool, elapsed_ms: u64) {
    draw_mic_at(f, p, muted, elapsed_ms, CENTER, 432);
}

fn draw_mic_at(f: &mut Frame, p: &Palette, muted: bool, elapsed_ms: u64, x: i32, y: i32) {
    let t = elapsed_ms as f32;
    for i in 0..5 {
        // fases simétricas (|i-2|): la onda siempre se ve centrada
        let d = if i < 2 { 2 - i } else { i - 2 };
        let h = if muted {
            3
        } else {
            (3.0 + 3.0 * (t / 280.0 + d as f32 * 0.8).sin()).max(2.0) as i32
        };
        let bx = x - 11 + i * 5;
        rrect(
            f,
            bx,
            y - h / 2,
            2,
            h as u32,
            1,
            if muted { p.muted } else { p.gold },
            None,
        );
    }
    if muted {
        circle_edge(f, x, y, 7, ALERT_RED, 2);
        Line::new(Point::new(x - 5, y + 5), Point::new(x + 5, y - 5))
            .into_styled(PrimitiveStyle::with_stroke(ALERT_RED, 2))
            .draw(f)
            .ok();
    }
}

// ── drawer lateral de historial de chat (desliza de derecha a izquierda) ─
// Una lámina que entra desde la derecha mostrando TODOS los turnos de la
// cuenta, scrolleable verticalmente. Barra inferior solo con X para cerrar.

const DRAWER_W: i32 = 300;
const DRAWER_LIST_TOP: i32 = 136;
const DRAWER_LIST_BOT: i32 = 340;
const CHAT_LINE_H: i32 = 17;

/// Burbuja de usuario dentro del drawer (derecha, oro).
fn drawer_user_bubble(
    f: &mut Frame,
    p: &Palette,
    text: &str,
    x_rel: i32,
    y: i32,
    width: i32,
) -> i32 {
    let max_w = (width - 36).min(400);
    let lines = text::wrap_count(Face::Mid, text, max_w - 24, 4).max(1);
    let tw = text::text_width(Face::Mid, text) + 24;
    let w = tw.clamp(120, max_w);
    let h = 16 + lines as i32 * CHAT_LINE_H;
    let x = x_rel + width - w - 14;
    rrect(f, x, y, w as u32, h as u32, 14, p.gold, None);
    text::wrap_lines_at(
        f,
        Face::Mid,
        p.on_gold,
        text,
        x + w - 12,
        y + 20,
        CHAT_LINE_H,
        lines as usize,
        w - 24,
        Align::Right,
    );
    h
}

/// Burbuja de agente dentro del drawer (izquierda, tile).
fn drawer_agent_bubble(
    f: &mut Frame,
    p: &Palette,
    x_rel: i32,
    y: i32,
    reply: &str,
    width: i32,
) -> i32 {
    let max_w = (width - 36).min(400);
    let lines = text::wrap_count(Face::Mid, reply, max_w - 24, 6).max(1);
    let tw = text::text_width(Face::Mid, reply) + 24;
    let w = tw.clamp(140, max_w);
    let h = 16 + 20 + lines as i32 * CHAT_LINE_H + 8;
    let x = x_rel + 14;
    rrect(
        f,
        x,
        y,
        w as u32,
        h as u32,
        14,
        p.tile,
        Some((p.tile_edge, 1)),
    );
    txt(
        f,
        Face::Tiny,
        true,
        Align::Left,
        x + 12,
        y + 18,
        p.gold,
        "AGENTE",
    );
    text::wrap_lines_at(
        f,
        Face::Mid,
        p.text,
        reply,
        x + 12,
        y + 38,
        CHAT_LINE_H,
        lines as usize,
        w - 24,
        Align::Left,
    );
    h
}

/// Drawer lateral: entra desde la derecha (`chat_drawer_anim` 0..100) y
/// se cierra deslizándose de vuelta. Muestra todo el historial scrolleable.
fn draw_chat_drawer(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState) {
    let anim = v.chat_drawer_anim.min(100);
    let drawer_w = (DRAWER_W as f32 * anim as f32 / 100.0) as i32;
    let x0 = 466 - drawer_w; // 466 = cerrado (fuera) · 166 = abierto
    f.dx = x0;
    f.clip_x = Some((x0, 466));

    // Fondo de la lámina.
    rrect(f, 0, 0, drawer_w as u32, 466, 30, p.bg, None);

    // Historial scrolleable verticalmente.
    f.clip_y = Some((DRAWER_LIST_TOP, DRAWER_LIST_BOT));
    if os.chat.is_empty() {
        txt(
            f,
            Face::Small,
            false,
            Align::Center,
            DRAWER_W / 2,
            230,
            p.muted,
            "Sin mensajes todavía",
        );
    } else {
        let mut y = DRAWER_LIST_TOP - v.chat_drawer_scroll as i32;
        for turn in os.chat {
            let uh = drawer_user_bubble(f, p, turn.text, 0, y, DRAWER_W);
            let ah = drawer_agent_bubble(f, p, 0, y + uh + 10, turn.reply, DRAWER_W);
            let block = uh + 10 + ah + 14;
            if y + block < DRAWER_LIST_TOP {
                y += block;
                continue;
            }
            if y > DRAWER_LIST_BOT {
                break;
            }
            y += block;
        }
    }
    f.clip_y = None;

    // Barra inferior: solo X para cerrar el drawer.
    icons::x_mark(f, p.gold, DRAWER_W / 2, 420, 14);

    f.dx = 0;
    f.clip_x = None;
}

/// Hoja completa del historial: entra desde la derecha y cubre el AMOLED.
/// El progreso 0..100 viene del panel.
const CHAT_FULL_TOP: i32 = 48;
const CHAT_FULL_BOT: i32 = 418;
const CHAT_FULL_LINE_H: i32 = 15;
const CHAT_FULL_TEXT_W: i32 = 240;
const CHAT_FULL_CARD_W: i32 = 266;
const CHAT_FULL_TEXT_INSET: i32 = 12;
const CHAT_FULL_SCREEN_GAP: i32 = 10;
const CHAT_FULL_MAX_LINES: usize = 64;
const CHAT_BUBBLE_PAD_Y: i32 = 12;
const CHAT_ARTIFACT_GAP: i32 = 3;
const CHAT_ARTIFACT_H: i32 = 25;
const CHAT_TABLE_COLS: usize = 6;
const CHAT_TABLE_ROW_GAP: i32 = 6;

/// Raíz cuadrada entera, suficiente para calcular el ancho visible del círculo.
fn chat_full_isqrt(n: u32) -> i32 {
    let mut lo = 0u32;
    let mut hi = CLIP_R as u32;
    while lo < hi {
        let mid = (lo + hi + 1) / 2;
        if mid * mid <= n {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    lo as i32
}

/// Las respuestas usan una columna central segura. El mensaje del usuario
/// conserva un ancho compacto y queda alineado a la derecha de esa columna.
fn chat_full_bubble_geometry(width: i32, user: bool) -> (i32, i32) {
    let width = width.clamp(112, CHAT_FULL_CARD_W);
    let column_x = (PX - CHAT_FULL_CARD_W) / 2;
    let x = if user {
        column_x + CHAT_FULL_CARD_W - width
    } else {
        column_x
    };
    (x, width)
}

fn chat_full_draw_bubble(
    f: &mut Frame,
    x: i32,
    y: i32,
    width: i32,
    h: i32,
    fill: Rgb888,
    edge: Option<Rgb888>,
) {
    rrect(
        f,
        x,
        y,
        width.max(1) as u32,
        h.max(1) as u32,
        16,
        fill,
        edge.map(|c| (c, 1)),
    );
}

/// Caja tipográfica interior al card y al área donde la pantalla circular
/// conserva suficiente ancho para leer.
fn chat_full_text_bounds(y: i32, bubble_x: i32, bubble_w: i32) -> (i32, i32) {
    let safe_y = y.clamp(
        CHAT_FULL_TOP + CHAT_BUBBLE_PAD_Y,
        CHAT_FULL_BOT - CHAT_BUBBLE_PAD_Y,
    );
    let dy = (safe_y - CENTER).abs().min(CLIP_R);
    let remaining = (CLIP_R * CLIP_R - dy * dy) as u32;
    let half = chat_full_isqrt(remaining);
    let bubble_right = bubble_x + bubble_w - 1;
    let left = (CENTER - half + CHAT_FULL_SCREEN_GAP).max(bubble_x + CHAT_FULL_TEXT_INSET);
    let right = (CENTER + half - CHAT_FULL_SCREEN_GAP)
        .min(bubble_right - CHAT_FULL_TEXT_INSET)
        .min(PX - bubble_x - 1 - CHAT_FULL_TEXT_INSET);
    (left, right)
}

fn chat_full_agent_geometry(y: i32, bubble_x: i32, bubble_w: i32) -> (i32, i32) {
    let (left, right) = chat_full_text_bounds(y, bubble_x, bubble_w);
    (left, (right - left).min(CHAT_FULL_TEXT_W))
}

fn chat_full_user_geometry(y: i32, bubble_x: i32, bubble_w: i32) -> (i32, i32) {
    let (left, right) = chat_full_text_bounds(y, bubble_x, bubble_w);
    (right, (right - left).min(CHAT_FULL_TEXT_W))
}

fn chat_table_cells<'a>(line: &'a str, cells: &mut [&'a str; CHAT_TABLE_COLS]) -> usize {
    let line = line.trim();
    if !line.contains('|') {
        return 0;
    }
    let line = line.strip_prefix('|').unwrap_or(line);
    let line = line.strip_suffix('|').unwrap_or(line);
    let mut count = 0;
    for cell in line.split('|').take(CHAT_TABLE_COLS) {
        cells[count] = cell.trim();
        count += 1;
    }
    count
}

fn chat_table_separator(line: &str) -> bool {
    let line = line.trim();
    line.contains('-')
        && line
            .chars()
            .all(|ch| matches!(ch, '|' | '-' | ':' | ' ') || ch == '\t')
}

fn chat_list_text(line: &str) -> Option<&str> {
    let line = line.trim_start();
    for marker in ["- ", "* ", "+ "] {
        if let Some(text) = line.strip_prefix(marker) {
            return Some(text);
        }
    }
    let digits = line.bytes().take_while(u8::is_ascii_digit).count();
    if digits > 0
        && line
            .as_bytes()
            .get(digits)
            .is_some_and(|b| *b == b'.' || *b == b')')
    {
        return line.get(digits + 2..);
    }
    None
}

fn chat_heading_text(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    let hashes = trimmed.bytes().take_while(|b| *b == b'#').count();
    if (1..=4).contains(&hashes) && trimmed.as_bytes().get(hashes) == Some(&b' ') {
        Some(trimmed.get(hashes + 1..).unwrap_or(""))
    } else {
        None
    }
}

fn chat_clean_inline<'a>(line: &str, output: &'a mut [u8; 512]) -> &'a str {
    let mut length = 0;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '*' && chars.peek() == Some(&'*') {
            chars.next();
            continue;
        }
        if ch == '`' {
            continue;
        }
        let mut encoded = [0u8; 4];
        let bytes = ch.encode_utf8(&mut encoded).as_bytes();
        if length + bytes.len() > output.len() {
            break;
        }
        output[length..length + bytes.len()].copy_from_slice(bytes);
        length += bytes.len();
    }
    core::str::from_utf8(&output[..length]).unwrap_or("")
}

fn chat_full_user_width(text: &str) -> i32 {
    let content_w = text
        .lines()
        .map(|line| text::text_width(Face::Small, line))
        .max()
        .unwrap_or(0)
        + CHAT_FULL_TEXT_INSET * 2;
    content_w.clamp(112, CHAT_FULL_CARD_W)
}

fn chat_table_row_height(
    cells: &[&str; CHAT_TABLE_COLS],
    head: &[&str; CHAT_TABLE_COLS],
    columns: usize,
    width: i32,
) -> i32 {
    let columns = columns.max(1).min(CHAT_TABLE_COLS);
    let field_w = (width - 24).max(1);
    let mut height = 16;
    for col in 0..columns {
        let mut label_buf = [0u8; 512];
        let label = chat_clean_inline(head[col], &mut label_buf);
        let label_lines = text::wrap_chat_count(Face::Tiny, label, field_w, 8).max(1);
        let mut value_buf = [0u8; 512];
        let value = chat_clean_inline(cells[col], &mut value_buf);
        let value_lines = text::wrap_chat_count(Face::Small, value, field_w, 8).max(1);
        height += label_lines as i32 * 12 + value_lines as i32 * CHAT_FULL_LINE_H + 4;
    }
    height.max(48)
}

fn chat_table_layout<'a>(
    mut lines: core::iter::Peekable<core::str::Lines<'a>>,
    head: &[&str; CHAT_TABLE_COLS],
    columns: usize,
    width: i32,
) -> (usize, i32) {
    let mut rows = 0;
    let mut height = 0;
    while lines
        .peek()
        .is_some_and(|line| line.trim_start().starts_with('|') && !chat_table_separator(line))
    {
        let line = lines.next().unwrap_or("");
        let mut cells = [""; CHAT_TABLE_COLS];
        chat_table_cells(line, &mut cells);
        height += chat_table_row_height(&cells, head, columns, width) + CHAT_TABLE_ROW_GAP;
        rows += 1;
    }
    (rows, height)
}

fn chat_full_user_lines(text: &str) -> usize {
    text::wrap_chat_count(Face::Small, text, CHAT_FULL_TEXT_W, CHAT_FULL_MAX_LINES).max(1)
}

fn chat_full_agent_content_height(reply: &str) -> i32 {
    let mut height = 0;
    let mut lines = reply.lines().peekable();
    while let Some(line) = lines.next() {
        let mut head = [""; CHAT_TABLE_COLS];
        let columns = chat_table_cells(line, &mut head);
        if columns > 0
            && lines
                .peek()
                .is_some_and(|separator| chat_table_separator(separator))
        {
            lines.next();
            let (rows, rows_h) = chat_table_layout(lines.clone(), &head, columns, CHAT_FULL_TEXT_W);
            for _ in 0..rows {
                lines.next();
            }
            height += if rows == 0 { 32 } else { 18 + rows_h };
        } else if line.trim().is_empty() {
            height += 4;
        } else if let Some(title) = chat_heading_text(line) {
            let mut clean_buf = [0u8; 512];
            let title = chat_clean_inline(title, &mut clean_buf);
            let count = text::wrap_chat_count(Face::SmallB, title, CHAT_FULL_TEXT_W, 4).max(1);
            height += count as i32 * 16 + 4;
        } else if let Some(item) = chat_list_text(line) {
            let mut clean_buf = [0u8; 512];
            let item = chat_clean_inline(item, &mut clean_buf);
            let count = text::wrap_chat_count(
                Face::Small,
                item,
                CHAT_FULL_TEXT_W - 14,
                CHAT_FULL_MAX_LINES,
            )
            .max(1);
            height += count as i32 * CHAT_FULL_LINE_H + 4;
        } else {
            let mut clean_buf = [0u8; 512];
            let line = chat_clean_inline(line, &mut clean_buf);
            let count =
                text::wrap_chat_count(Face::Small, line, CHAT_FULL_TEXT_W, CHAT_FULL_MAX_LINES)
                    .max(1);
            height += count as i32 * CHAT_FULL_LINE_H + 4;
        }
    }
    height.max(CHAT_FULL_LINE_H)
}

fn chat_full_user_height(text: &str) -> i32 {
    CHAT_BUBBLE_PAD_Y * 2 + chat_full_user_lines(text) as i32 * CHAT_FULL_LINE_H
}

fn chat_full_agent_height(turn: &ChatTurn<'_>) -> i32 {
    CHAT_BUBBLE_PAD_Y * 2
        + chat_full_agent_content_height(turn.reply)
        + if turn.artifact.is_some() {
            CHAT_ARTIFACT_GAP + CHAT_ARTIFACT_H
        } else {
            0
        }
}

fn chat_full_block_height(turn: &ChatTurn<'_>) -> i32 {
    chat_full_user_height(turn.text) + 8 + chat_full_agent_height(turn) + 12
}

fn chat_full_content_height(chat: &[ChatTurn<'_>]) -> i32 {
    let total: i32 = chat.iter().map(chat_full_block_height).sum();
    if chat.is_empty() {
        total
    } else {
        total.saturating_sub(12)
    }
}

/// Scroll exacto de la hoja completa, calculado con la misma tipografía y
/// reglas de ajuste que usa el dibujo.
pub fn chat_full_scroll_max(chat: &[ChatTurn<'_>]) -> u32 {
    let content_h = chat_full_content_height(chat);
    content_h
        .saturating_sub(CHAT_FULL_BOT - CHAT_FULL_TOP)
        .max(0) as u32
}

/// Devuelve el turno cuyo acceso de artifact recibió el toque.
pub fn chat_full_artifact_hit(
    chat: &[ChatTurn<'_>],
    scroll: u32,
    px: f32,
    py: f32,
) -> Option<usize> {
    if py < CHAT_FULL_TOP as f32 || py > CHAT_FULL_BOT as f32 {
        return None;
    }
    let content_h = chat_full_content_height(chat);
    let visible_h = CHAT_FULL_BOT - CHAT_FULL_TOP;
    let scroll = scroll.min(chat_full_scroll_max(chat)) as i32;
    let mut y = if content_h < visible_h {
        CHAT_FULL_TOP + (visible_h - content_h) / 2
    } else {
        CHAT_FULL_TOP - scroll
    };
    let (bubble_x, bubble_w) = chat_full_bubble_geometry(CHAT_FULL_CARD_W, false);
    for (index, turn) in chat.iter().enumerate() {
        let user_h = chat_full_user_height(turn.text);
        if turn.artifact.is_some() {
            let artifact_y = y
                + user_h
                + 8
                + CHAT_BUBBLE_PAD_Y
                + chat_full_agent_content_height(turn.reply)
                + CHAT_ARTIFACT_GAP;
            let rect = crate::hit::Rect {
                x: bubble_x + 12,
                y: artifact_y,
                w: bubble_w - 24,
                h: CHAT_ARTIFACT_H,
            };
            if crate::hit::in_rect(px, py, rect) {
                return Some(index);
            }
        }
        y += chat_full_block_height(turn);
    }
    None
}

fn chat_full_table_record(
    f: &mut Frame,
    p: &Palette,
    cells: &[&str; CHAT_TABLE_COLS],
    head: &[&str; CHAT_TABLE_COLS],
    columns: usize,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) {
    let columns = columns.max(1).min(CHAT_TABLE_COLS);
    rrect(
        f,
        x,
        y,
        width.max(1) as u32,
        height.max(1) as u32,
        9,
        p.bg,
        Some((p.tile_edge, 1)),
    );
    let content_x = x + 10;
    let content_w = width - 20;
    let mut field_y = y + 8;
    for col in 0..columns {
        let mut label_buf = [0u8; 512];
        let label = chat_clean_inline(head[col], &mut label_buf);
        let label_lines = text::wrap_chat_count(Face::Tiny, label, content_w, 8).max(1);
        let label_geometry = |_| (content_x, content_w);
        text::wrap_chat_lines_at(
            f,
            Face::Tiny,
            p.gold,
            label,
            field_y + 10,
            12,
            label_lines,
            Align::Left,
            label_geometry,
        );
        field_y += label_lines as i32 * 12;

        let mut value_buf = [0u8; 512];
        let value = chat_clean_inline(cells[col], &mut value_buf);
        let value_lines = text::wrap_chat_count(Face::Small, value, content_w, 8).max(1);
        let value_geometry = |_| (content_x, content_w);
        text::wrap_chat_lines_at(
            f,
            Face::Small,
            p.text,
            value,
            field_y + 12,
            CHAT_FULL_LINE_H,
            value_lines,
            Align::Left,
            value_geometry,
        );
        field_y += value_lines as i32 * CHAT_FULL_LINE_H + 4;
        if col + 1 < columns {
            Line::new(
                Point::new(content_x, field_y - 2),
                Point::new(x + width - 10, field_y - 2),
            )
            .into_styled(PrimitiveStyle::with_stroke(p.tile_edge, 1))
            .draw(f)
            .ok();
        }
    }
}

fn chat_full_draw_table<'a, F>(
    f: &mut Frame,
    p: &Palette,
    head: &[&str; CHAT_TABLE_COLS],
    columns: usize,
    lines: &mut core::iter::Peekable<core::str::Lines<'a>>,
    y: i32,
    geometry: F,
) -> i32
where
    F: Fn(i32) -> (i32, i32),
{
    let (x, width) = geometry(y + 14);
    let width = width.max(1);
    let (rows, rows_height) = chat_table_layout(lines.clone(), head, columns, width);
    if rows == 0 {
        rrect(f, x, y, width as u32, 32, 9, p.bg, Some((p.tile_edge, 1)));
        txt(
            f,
            Face::Tiny,
            false,
            Align::Left,
            x + 10,
            y + 20,
            p.muted,
            "Sin registros",
        );
        return 32;
    }
    txt(
        f,
        Face::Tiny,
        true,
        Align::Left,
        x + 4,
        y + 12,
        p.gold,
        "RESULTADOS",
    );
    let mut row_y = y + 18;
    for _ in 0..rows {
        let Some(line) = lines.next() else { break };
        let mut cells = [""; CHAT_TABLE_COLS];
        chat_table_cells(line, &mut cells);
        let row_height = chat_table_row_height(&cells, head, columns, width);
        chat_full_table_record(f, p, &cells, head, columns, x, row_y, width, row_height);
        row_y += row_height + CHAT_TABLE_ROW_GAP;
    }
    18 + rows_height
}

fn chat_full_user_bubble(f: &mut Frame, p: &Palette, text: &str, y: i32) -> i32 {
    let lines = chat_full_user_lines(text);
    let h = CHAT_BUBBLE_PAD_Y * 2 + lines as i32 * CHAT_FULL_LINE_H;
    let width = chat_full_user_width(text);
    let (x, width) = chat_full_bubble_geometry(width, true);
    chat_full_draw_bubble(f, x, y, width, h, p.gold, None);
    let geometry = |line_y| chat_full_user_geometry(line_y, x, width);
    text::wrap_chat_lines_at(
        f,
        Face::Small,
        p.on_gold,
        text,
        y + CHAT_BUBBLE_PAD_Y,
        CHAT_FULL_LINE_H,
        lines,
        Align::Right,
        geometry,
    );
    h
}

fn chat_full_agent_bubble(f: &mut Frame, p: &Palette, turn: &ChatTurn<'_>, y: i32) -> i32 {
    let reply = turn.reply;
    let content_h = chat_full_agent_content_height(reply);
    let h = chat_full_agent_height(turn);
    let (x, width) = chat_full_bubble_geometry(CHAT_FULL_CARD_W, false);
    chat_full_draw_bubble(f, x, y, width, h, p.tile, Some(p.tile_edge));
    let geometry = |line_y| chat_full_agent_geometry(line_y, x, width);
    let mut cursor_y = y + CHAT_BUBBLE_PAD_Y;
    let mut lines = reply.lines().peekable();
    while let Some(line) = lines.next() {
        let mut head = [""; CHAT_TABLE_COLS];
        let columns = chat_table_cells(line, &mut head);
        if columns > 0
            && lines
                .peek()
                .is_some_and(|separator| chat_table_separator(separator))
        {
            lines.next();
            cursor_y += chat_full_draw_table(f, p, &head, columns, &mut lines, cursor_y, &geometry);
        } else if line.trim().is_empty() {
            cursor_y += 4;
        } else if let Some(title) = chat_heading_text(line) {
            let mut clean_buf = [0u8; 512];
            let title = chat_clean_inline(title, &mut clean_buf);
            let count = text::wrap_chat_count(Face::SmallB, title, CHAT_FULL_TEXT_W, 4).max(1);
            text::wrap_chat_lines_at(
                f,
                Face::SmallB,
                p.gold,
                title,
                cursor_y + 13,
                16,
                count,
                Align::Left,
                &geometry,
            );
            cursor_y += count as i32 * 16 + 4;
        } else if let Some(item) = chat_list_text(line) {
            let mut clean_buf = [0u8; 512];
            let item = chat_clean_inline(item, &mut clean_buf);
            let list_geometry = |line_y| {
                let (x, width) = geometry(line_y);
                (x + 14, width - 14)
            };
            let count = text::wrap_chat_count(
                Face::Small,
                item,
                CHAT_FULL_TEXT_W - 14,
                CHAT_FULL_MAX_LINES,
            )
            .max(1);
            let (bullet_x, _) = geometry(cursor_y + 9);
            circle_fill(f, bullet_x + 3, cursor_y + 8, 2, p.gold);
            text::wrap_chat_lines_at(
                f,
                Face::Small,
                p.text,
                item,
                cursor_y + 12,
                CHAT_FULL_LINE_H,
                count,
                Align::Left,
                list_geometry,
            );
            cursor_y += count as i32 * CHAT_FULL_LINE_H + 4;
        } else {
            let mut clean_buf = [0u8; 512];
            let clean_line = chat_clean_inline(line, &mut clean_buf);
            let count = text::wrap_chat_count(
                Face::Small,
                clean_line,
                CHAT_FULL_TEXT_W,
                CHAT_FULL_MAX_LINES,
            )
            .max(1);
            text::wrap_chat_lines_at(
                f,
                Face::Small,
                p.text,
                clean_line,
                cursor_y + 12,
                CHAT_FULL_LINE_H,
                count,
                Align::Left,
                &geometry,
            );
            cursor_y += count as i32 * CHAT_FULL_LINE_H + 4;
        }
    }
    if let Some(artifact) = turn.artifact {
        let chip_y = y + CHAT_BUBBLE_PAD_Y + content_h + CHAT_ARTIFACT_GAP;
        rrect(
            f,
            x + 12,
            chip_y,
            (width - 24) as u32,
            CHAT_ARTIFACT_H as u32,
            8,
            p.bg,
            Some((p.tile_edge, 1)),
        );
        let mut title_buf = [0u8; 512];
        let title = chat_clean_inline(artifact.title, &mut title_buf);
        txt(
            f,
            Face::Tiny,
            true,
            Align::Left,
            x + 22,
            chip_y + 16,
            p.text,
            title,
        );
        txt(
            f,
            Face::Tiny,
            true,
            Align::Right,
            x + width - 22,
            chip_y + 16,
            p.gold,
            "VER",
        );
    }
    h
}

fn draw_chat_full(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState) {
    let progress = v.chat_anim.min(100) as i32;
    let offset = 466 - (466 * progress / 100);
    f.dx = offset;
    f.clip_x = Some((0, 466));

    rrect(f, 0, 0, 466, 466, 0, p.bg, None);
    f.clip_y = Some((CHAT_FULL_TOP, CHAT_FULL_BOT));
    if os.chat.is_empty() {
        txt(
            f,
            Face::Small,
            false,
            Align::Center,
            CENTER,
            220,
            p.muted,
            "Sin mensajes todavía",
        );
    } else {
        let max_scroll = chat_full_scroll_max(os.chat);
        let scroll = v.chat_scroll.min(max_scroll) as i32;
        let content_h = chat_full_content_height(os.chat);
        let visible_h = CHAT_FULL_BOT - CHAT_FULL_TOP;
        let mut y = if content_h < visible_h {
            CHAT_FULL_TOP + (visible_h - content_h) / 2
        } else {
            CHAT_FULL_TOP - scroll
        };
        for (index, turn) in os.chat.iter().enumerate() {
            let uh = chat_full_user_height(turn.text);
            let ah = chat_full_agent_height(turn);
            let block = uh + 8 + ah + if index + 1 < os.chat.len() { 12 } else { 0 };
            if y + block < CHAT_FULL_TOP {
                y += block;
                continue;
            }
            if y > CHAT_FULL_BOT {
                break;
            }
            chat_full_user_bubble(f, p, turn.text, y);
            chat_full_agent_bubble(f, p, turn, y + uh + 8);
            y += block;
        }
    }
    f.clip_y = Some((0, 466));
    // El historial no muestra controles inferiores; se cierra con el gesto
    // desde el borde izquierdo hacia la derecha.
    f.dx = 0;
    f.clip_x = None;
    f.clip_y = None;
}

// ── pantallas online ───────────────────────────────────────────────────

fn draw_home(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState, hour: u8, minute: u8) {
    draw_status_bar(f, p);
    // reloj compacto + fecha: la pantalla principal es el chat del agente
    let mut hb = [0u8; 2];
    let mut mb = [0u8; 2];
    let hs = fmt_2(hour, &mut hb);
    let ms = fmt_2(minute, &mut mb);
    let mut cbuf = [0u8; 8];
    cbuf[..2].copy_from_slice(hs.as_bytes());
    cbuf[2] = b':';
    cbuf[3..5].copy_from_slice(ms.as_bytes());
    let clock = core::str::from_utf8(&cbuf[..5]).unwrap_or("--:--");
    txt(f, Face::Xl, true, Align::Center, CENTER, 78, p.text, clock);
    txt(
        f,
        Face::Small,
        false,
        Align::Center,
        CENTER,
        96,
        p.muted,
        os.clock.date_line,
    );
    // dock curvo con blur: píldora esmerilada + 3 iconos pequeños
    draw_dock(f, p);
    // apps izq (rejilla 2x2 sobre la curva)
    for r in 0..2 {
        for c in 0..2 {
            rrect(f, 171 + c * 9, 416 + r * 9, 6, 6, 2, p.text, None);
        }
    }
    icons::bank(f, p, 288, 423, 13);
    draw_mic(f, p, v.mic_muted, v.elapsed_ms);
}

/// Píldora inferior: blur real del fondo + tinte + borde.
fn draw_dock(f: &mut Frame, p: &Palette) {
    // Banda fina y curva (±22°) con puntas redondas + blur y tinte.
    f.blur_region(130, 388, 208, 62);
    let (tint, alpha) = if p.bg == Rgb888::BLACK {
        (Rgb888::WHITE, 36)
    } else {
        (Rgb888::BLACK, 18)
    };
    for y in 388..450 {
        for x in 130..336 {
            let dx = x - CENTER;
            let dy = y - CENTER;
            if dy <= 0 {
                continue;
            }
            let r2 = dx * dx + dy * dy;
            let in_band = r2 >= 186 * 186 && r2 <= 210 * 210 && dx.abs() * 100 <= dy * 40;
            // puntas redondas (r=12 en los extremos ±22°)
            let ex = 74;
            let ey = 184;
            let cap_l = (dx + ex) * (dx + ex) + (dy - ey) * (dy - ey) <= 12 * 12;
            let cap_r = (dx - ex) * (dx - ex) + (dy - ey) * (dy - ey) <= 12 * 12;
            if in_band || cap_l || cap_r {
                f.blend_px(x, y, tint, alpha);
            }
        }
    }
    // bordes curvos (arcos exterior e interior)
    for r in [210, 186] {
        embedded_graphics::primitives::Arc::with_center(
            Point::new(CENTER, CENTER),
            r as u32 * 2,
            68.0.deg(),
            44.0.deg(),
        )
        .into_styled(PrimitiveStyle::with_stroke(p.tile_edge, 1))
        .draw(f)
        .ok();
    }
}

fn snip_append3<'a>(a: &str, b: &str, c: &str, buf: &'a mut [u8]) -> &'a str {
    let mut len = 0usize;
    for s in [a, b, c] {
        for &ch in s.as_bytes() {
            if len >= 96 {
                break;
            }
            buf[len] = ch;
            len += 1;
        }
    }
    core::str::from_utf8(&buf[..len]).unwrap_or("")
}

fn draw_appdetail(f: &mut Frame, p: &Palette, os: &OsState) {
    let mut app: Option<&crate::state::SimApp> = None;
    for a in os.apps {
        if a.slug == os.detail_app {
            app = Some(a);
            break;
        }
    }
    let app = app.or(os.apps.first());
    let Some(a) = app else {
        draw_status_bar(f, p);
        draw_header(f, p, "< dapp");
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER + 10,
            p.muted,
            "(dapp no instalada)",
        );
        return;
    };
    draw_status_bar(f, p);
    let mut sg = [0u8; 96];
    let mut hb = [0u8; 96];
    draw_header(f, p, snip_append("< ", snip(a.slug, &mut sg, 16), &mut hb));
    draw_badge(f, CENTER, CENTER - 28, 34, a.slug);
    let mut nb = [0u8; 96];
    txt(
        f,
        Face::Large,
        true,
        Align::Center,
        CENTER,
        CENTER + 34,
        p.text,
        snip(a.name, &mut nb, 20),
    );
    // punto verde + estado (centrado como grupo)
    let sw = text::text_width(Face::Mid, a.status);
    let dot_x = CENTER - sw / 2 - 12;
    circle_fill(f, dot_x, CENTER + 58 - 5, 4, p.green);
    txt(
        f,
        Face::Mid,
        false,
        Align::Center,
        CENTER + 8,
        CENTER + 58,
        p.green,
        a.status,
    );
    let mut cb = [0u8; 32];
    let n = fmt_u32(a.tools_count, &mut cb);
    let mut lb = [0u8; 96];
    txt(
        f,
        Face::Mid,
        false,
        Align::Center,
        CENTER,
        CENTER + 80,
        p.muted,
        snip_append3(n, " tools para el agente", "", &mut lb),
    );
    txt(
        f,
        Face::Mid,
        false,
        Align::Center,
        CENTER,
        CENTER + 100,
        p.muted,
        "cada uso paga su peaje x402",
    );
}

fn solana_mark(f: &mut Frame, c: Rgb888, x: i32, y: i32) {
    for i in 0..3 {
        let by = y + i * 7;
        Triangle::new(
            Point::new(x, by),
            Point::new(x + 18, by),
            Point::new(x + 14, by + 4),
        )
        .into_styled(PrimitiveStyle::with_fill(c))
        .draw(f)
        .ok();
        Triangle::new(
            Point::new(x, by),
            Point::new(x + 14, by + 4),
            Point::new(x - 4, by + 4),
        )
        .into_styled(PrimitiveStyle::with_fill(c))
        .draw(f)
        .ok();
    }
}

fn banco_button(f: &mut Frame, p: &Palette, x: i32, label: &str) {
    rrect(f, x, 250, 150, 56, 14, p.gold, None);
    txt(
        f,
        Face::Base,
        true,
        Align::Center,
        x + 75,
        250 + 35,
        p.on_gold,
        label,
    );
}

fn banco_pills(f: &mut Frame, p: &Palette, a: &str, b: &str, first_active: bool) {
    for (i, (label, x)) in [(a, 133), (b, 243)].iter().enumerate() {
        let on = (i == 0) == first_active;
        rrect(
            f,
            *x,
            132,
            90,
            36,
            18,
            if on { p.gold } else { p.dot },
            if on { None } else { Some((p.tile_edge, 1)) },
        );
        txt(
            f,
            Face::Mid,
            true,
            Align::Center,
            x + 45,
            132 + 24,
            if on { p.on_gold } else { p.muted },
            label,
        );
    }
}

fn draw_nfc_view(f: &mut Frame, p: &Palette, line1: &str, line2: &str) {
    for r in [18, 34, 50] {
        embedded_graphics::primitives::Arc::with_center(
            Point::new(CENTER, 280),
            r * 2,
            200.0.deg(),
            140.0.deg(),
        )
        .into_styled(PrimitiveStyle::with_stroke(p.gold, 3))
        .draw(f)
        .ok();
        embedded_graphics::primitives::Arc::with_center(
            Point::new(CENTER, 280),
            r * 2,
            340.0.deg(),
            140.0.deg(),
        )
        .into_styled(PrimitiveStyle::with_stroke(p.gold, 3))
        .draw(f)
        .ok();
    }
    circle_fill(f, CENTER, 280, 5, p.gold);
    txt(
        f,
        Face::Mid,
        true,
        Align::Center,
        CENTER,
        352,
        p.text,
        line1,
    );
    txt(
        f,
        Face::Small,
        false,
        Align::Center,
        CENTER,
        374,
        p.muted,
        line2,
    );
}

fn draw_settings(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState) {
    let active = os.llm_providers.iter().find(|pr| pr.is_active);
    let with_key = os.llm_providers.iter().filter(|pr| pr.has_key).count();
    // (etiqueta, valor?, acento). Valores en buffers fijos.
    let prov_val: &str = match active {
        Some(a) => a.provider,
        None if with_key > 0 => "elegir",
        None => "sin keys",
    };
    let model_val: &str = match active {
        Some(a) => a.default_model.rsplit('/').next().unwrap_or("-"),
        None => "-",
    };
    let theme_val = if v.light { "claro" } else { "oscuro" };
    let rows: [(&str, &str, bool); 6] = [
        ("Wi-Fi", "NomikOS-Sim OK", false),
        ("Dispositivo", os.device_id, false),
        ("Proveedor >", prov_val, true),
        ("Modelo >", model_val, true),
        ("Tema >", theme_val, true),
        ("Bloquear", "", true),
    ];
    for i in 0..6 {
        let (label, value, accent) = rows[i];
        let y = 140 + i as i32 * 44 + 26;
        if label == "Bloquear" {
            icons::lock(f, p, CENTER - 128, y - 5, 18);
            txt(
                f,
                Face::Mid,
                true,
                Align::Left,
                CENTER - 112,
                y,
                p.gold,
                "Bloquear",
            );
        } else {
            let mut lb = [0u8; 48];
            let lab = snip(label, &mut lb, 22);
            txt(
                f,
                Face::Mid,
                accent,
                Align::Left,
                CENTER - 138,
                y,
                if accent { p.gold } else { p.text },
                lab,
            );
        }
        if !value.is_empty() {
            let mut tb = [0u8; 48];
            txt(
                f,
                Face::Small,
                false,
                Align::Right,
                CENTER + 138,
                y,
                p.muted,
                snip(value, &mut tb, 22),
            );
        }
        Rectangle::new(Point::new(CENTER - 138, y + 10), Size::new(276, 1))
            .into_styled(PrimitiveStyle::with_fill(p.hairline))
            .draw(f)
            .ok();
    }
}

fn draw_providers(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState) {
    let mut idx: [usize; 16] = [0; 16];
    let mut n = 0usize;
    for (pi, pr) in os.llm_providers.iter().enumerate() {
        if pr.has_key && n < 16 {
            idx[n] = pi;
            n += 1;
        }
    }
    if n == 0 {
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER + 4,
            p.muted,
            "sin keys en tu cuenta",
        );
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER + 28,
            p.muted,
            "cargalas en Modelos",
        );
        return;
    }
    let o = (v.scroll_providers as usize).min(n.saturating_sub(crate::hit::LIST_PAGE as usize));
    for (i, k) in (o..n).take(crate::hit::LIST_PAGE as usize).enumerate() {
        let pr = &os.llm_providers[idx[k]];
        let y = 148 + i as i32 * 58;
        let active = pr.is_active;
        circle_fill(
            f,
            CENTER - 118,
            y + 26,
            16,
            if active { p.gold } else { p.dot },
        );
        if !active {
            circle_edge(f, CENTER - 118, y + 26, 16, brand_color(pr.provider), 2);
        }
        let mut ib = [0u8; 4];
        txt(
            f,
            Face::Mid,
            true,
            Align::Center,
            CENTER - 118,
            y + 31,
            if active {
                p.on_gold
            } else {
                brand_color(pr.provider)
            },
            badge_letters(pr.provider, &mut ib),
        );
        let mut nb = [0u8; 96];
        txt(
            f,
            Face::Base,
            true,
            Align::Left,
            CENTER - 92,
            y + 22,
            p.text,
            snip(pr.provider, &mut nb, 16),
        );
        let mut cb = [0u8; 32];
        let c = fmt_u32(pr.models.len() as u32, &mut cb);
        let mut lb = [0u8; 96];
        txt(
            f,
            Face::Small,
            false,
            Align::Left,
            CENTER - 92,
            y + 42,
            p.muted,
            snip_append3(c, " modelos · key", "", &mut lb),
        );
    }
    scroll_hints(f, p, n, o, 140, 384);
}

fn draw_models(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState) {
    let mut active: Option<&crate::state::LlmProvider> = None;
    for pr in os.llm_providers {
        if pr.is_active {
            active = Some(pr);
            break;
        }
    }
    let Some(row) = active else {
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER + 10,
            p.muted,
            "elige un proveedor primero",
        );
        return;
    };
    if row.models.is_empty() {
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER + 10,
            p.muted,
            "sin modelos listados",
        );
        return;
    }
    let o = (v.scroll_models as usize).min(
        row.models
            .len()
            .saturating_sub(crate::hit::LIST_PAGE as usize),
    );
    for (i, m) in row
        .models
        .iter()
        .skip(o)
        .take(crate::hit::LIST_PAGE as usize)
        .enumerate()
    {
        let y = 148 + i as i32 * 58;
        let cur = *m == row.default_model;
        circle_fill(
            f,
            CENTER - 118,
            y + 26,
            10,
            if cur { p.green } else { p.dot },
        );
        if !cur {
            circle_edge(f, CENTER - 118, y + 26, 10, p.dot_edge, 2);
        }
        let short = m.rsplit('/').next().unwrap_or(m);
        let mut sb = [0u8; 96];
        txt(
            f,
            Face::Mid,
            cur,
            Align::Left,
            CENTER - 92,
            y + 24,
            if cur { p.text } else { p.muted },
            snip(short, &mut sb, 24),
        );
        let mut fb = [0u8; 96];
        txt(
            f,
            Face::Tiny,
            false,
            Align::Left,
            CENTER - 92,
            y + 42,
            p.faint,
            snip(m, &mut fb, 30),
        );
    }
    scroll_hints(f, p, row.models.len(), o, 140, 384);
}

fn draw_apps_list(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState) {
    if os.apps.is_empty() {
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER + 10,
            p.muted,
            "(sin dapps instaladas)",
        );
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER + 34,
            p.muted,
            "nomikos apps add <slug>",
        );
        return;
    }
    let o =
        (v.scroll_apps as usize).min(os.apps.len().saturating_sub(crate::hit::LIST_PAGE as usize));
    for (i, a) in os
        .apps
        .iter()
        .skip(o)
        .take(crate::hit::LIST_PAGE as usize)
        .enumerate()
    {
        let y = 148 + i as i32 * 66;
        draw_badge(f, CENTER - 118, y + 29, 22, a.slug);
        let mut nb = [0u8; 96];
        txt(
            f,
            Face::Base,
            true,
            Align::Left,
            CENTER - 88,
            y + 22,
            p.text,
            snip(a.name, &mut nb, 18),
        );
        let mut cb = [0u8; 32];
        let c = fmt_u32(a.tools_count, &mut cb);
        let mut lb = [0u8; 96];
        txt(
            f,
            Face::Small,
            false,
            Align::Left,
            CENTER - 88,
            y + 42,
            p.muted,
            snip_append3(c, " tools · ", a.status, &mut lb),
        );
    }
    scroll_hints(f, p, os.apps.len(), o, 140, 412);
}

fn draw_shade(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState, hour: u8, minute: u8) {
    // Lámina completa deslizada según shade_p (0..100).
    let y0 = -(PX as i32) + (PX as i32 * v.shade_p as i32) / 100;
    // fondo pleno
    Rectangle::new(Point::new(0, y0), Size::new(PX as u32, PX as u32))
        .into_styled(PrimitiveStyle::with_fill(p.island))
        .draw(f)
        .ok();
    Line::new(Point::new(0, y0 + PX - 1), Point::new(PX, y0 + PX - 1))
        .into_styled(PrimitiveStyle::with_stroke(p.tile_edge, 1))
        .draw(f)
        .ok();
    // asa
    rrect(f, CENTER - 28, y0 + 10, 56, 5, 2, p.track, None);
    // hora 26px
    let mut hb = [0u8; 2];
    let mut mb = [0u8; 2];
    let hs = fmt_2(hour, &mut hb);
    let ms = fmt_2(minute, &mut mb);
    let mut cb = [0u8; 8];
    cb[..2].copy_from_slice(hs.as_bytes());
    cb[2] = b':';
    cb[3..5].copy_from_slice(ms.as_bytes());
    let clock = core::str::from_utf8(&cb[..5]).unwrap_or("--:--");
    txt(f, Face::Xl, true, Align::Left, 116, y0 + 72, p.text, clock);
    // wifi + ajustes a la derecha de la hora
    circle_fill(f, 282, y0 + 66, 13, p.dot);
    circle_edge(f, 282, y0 + 66, 13, p.tile_edge, 1);
    icons::wifi(f, p.text, 282, y0 + 68, 10);
    circle_fill(f, 318, y0 + 66, 13, p.dot);
    circle_edge(f, 318, y0 + 66, 13, p.tile_edge, 1);
    icons::gear(f, p, 318, y0 + 66, 8);
    // batería
    txt(
        f,
        Face::Small,
        false,
        Align::Left,
        116,
        y0 + 108,
        p.muted,
        "Batería del dispositivo",
    );
    txt(
        f,
        Face::Small,
        true,
        Align::Right,
        350,
        y0 + 108,
        p.text,
        "100%",
    );
    rrect(f, 116, y0 + 116, 234, 8, 4, p.track, None);
    rrect(f, 116, y0 + 116, 234, 8, 4, p.green, None);
    // notificaciones (máx 4)
    let n = notif_count(os);
    if n == 0 {
        txt(
            f,
            Face::Small,
            false,
            Align::Left,
            116,
            y0 + 162,
            p.muted,
            "sin notificaciones",
        );
    } else {
        let mut nb = [0u8; 96];
        for i in 0..n.min(4) {
            let y = y0 + 156 + i as i32 * 36;
            if let Some((title, body)) = notif_get(os, i, &mut nb) {
                circle_fill(f, 122, y - 4, 3, BADGE_BLUE);
                let mut tb = [0u8; 96];
                txt(
                    f,
                    Face::Small,
                    true,
                    Align::Left,
                    134,
                    y,
                    p.text,
                    snip(title, &mut tb, 20),
                );
                let mut bb = [0u8; 96];
                txt(
                    f,
                    Face::Tiny,
                    false,
                    Align::Left,
                    134,
                    y + 15,
                    p.muted,
                    snip(body, &mut bb, 30),
                );
            }
        }
    }
    txt(
        f,
        Face::Tiny,
        false,
        Align::Center,
        CENTER,
        y0 + PX - 20,
        p.faint,
        "desliza ^ para cerrar",
    );
}

/// Oscurece todo el frame (velo del shade, sin blur: portable).
fn dim_frame(f: &mut Frame, keep_pct: u8) {
    let k = keep_pct.min(100) as u32;
    for px in f.buf.chunks_exact_mut(4) {
        px[0] = (px[0] as u32 * k / 100) as u8;
        px[1] = (px[1] as u32 * k / 100) as u8;
        px[2] = (px[2] as u32 * k / 100) as u8;
    }
}

/// Dibuja el OS completo en el frame (y aplica máscara circular).
pub fn draw(
    f: &mut Frame,
    p: &Palette,
    os: Option<&OsState>,
    v: &ViewState,
    hour: u8,
    minute: u8,
    date_line: &str,
    elapsed_ms: u64,
) {
    // fondo
    f.clear(p.bg);
    match os {
        None => draw_connecting(f, p, elapsed_ms),
        Some(os) => match os.stage {
            Stage::Boot => draw_boot(f, p, os.boot_count, elapsed_ms),
            Stage::Claim => draw_claim(f, p, os),
            Stage::Online => {
                if os.locked {
                    draw_lock(f, p, os, hour, minute, date_line, elapsed_ms);
                } else {
                    match os.screen {
                        Screen::Home => draw_home(f, p, os, v, hour, minute),
                        Screen::Apps => {
                            draw_status_bar(f, p);
                            draw_header(f, p, "< dapps");
                            draw_apps_list(f, p, os, v);
                        }
                        Screen::AppDetail => draw_appdetail(f, p, os),
                        Screen::Banco => draw_banco(f, p, os, v),
                        Screen::Settings => {
                            draw_status_bar(f, p);
                            draw_header(f, p, "< ajustes");
                            draw_settings(f, p, os, v);
                        }
                        Screen::Providers => {
                            draw_status_bar(f, p);
                            draw_header(f, p, "< proveedor");
                            draw_providers(f, p, os, v);
                        }
                        Screen::Models => {
                            draw_status_bar(f, p);
                            draw_header(f, p, "< modelo");
                            draw_models(f, p, os, v);
                        }
                    }
                    if v.chat_full || v.chat_anim > 0 {
                        // El historial usa la misma superficie clara que el
                        // panel contiguo, aunque el home del OS esté en dark.
                        draw_chat_full(f, &LIGHT, os, v);
                    }
                    if v.shade_p > 0 {
                        // velo progresivo + lámina (TS: blur+velo; aquí velo: portable)
                        let dim = 100u8.saturating_sub((v.shade_p as u16 * 18 / 100) as u8);
                        dim_frame(f, dim);
                        draw_shade(f, p, os, v, hour, minute);
                    }
                    // Drawer lateral de historial de chat (derecha → izquierda).
                    if !(v.chat_full || v.chat_anim > 0)
                        && (v.chat_drawer || v.chat_drawer_anim > 0)
                    {
                        draw_chat_drawer(f, p, os, v);
                    }
                }
            }
        },
    }
    f.circle_mask();
}

fn draw_banco(f: &mut Frame, p: &Palette, os: &OsState, v: &ViewState) {
    draw_status_bar(f, p);
    draw_header(f, p, "< banco");
    let w = &os.wallet;
    let Some(pk) = w.pubkey else {
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER - 20,
            p.muted,
            "sin wallet dPaaS",
        );
        txt(
            f,
            Face::Mid,
            false,
            Align::Center,
            CENTER,
            CENTER + 2,
            p.muted,
            "configurala en Wallet-Red",
        );
        return;
    };
    match v.banco_tab {
        1 => {
            banco_pills(f, p, "QR", "NFC", !v.banco_recv_nfc);
            if !v.banco_recv_nfc {
                draw_qr_card(f, p, os, pk);
            } else {
                draw_nfc_view(f, p, "Acerca una wallet", "para recibir por NFC");
            }
        }
        2 => {
            banco_pills(f, p, "NFC", "Manual", !v.banco_send_manual);
            if !v.banco_send_manual {
                draw_nfc_view(f, p, "Acerca el dispositivo", "envio NFC (simulado)");
            } else {
                draw_manual_view(f, p, v.send_to);
            }
        }
        _ => {
            let mut sb = [0u8; 32];
            let sol = match w.balance_lamports {
                None => "...",
                Some(l) => {
                    let mut lb = [0u8; 32];
                    let s = fmt_sol(l, &mut lb);
                    let mut o = 0usize;
                    for &b in s.as_bytes().iter().chain(b" SOL".iter()) {
                        if o >= 32 {
                            break;
                        }
                        sb[o] = b;
                        o += 1;
                    }
                    core::str::from_utf8(&sb[..o]).unwrap_or("?")
                }
            };
            txt(f, Face::Xl, true, Align::Center, CENTER, 190, p.text, sol);
            // etiqueta Solana
            rrect(f, 158, 206, 150, 26, 13, p.dot, Some((p.tile_edge, 1)));
            solana_mark(f, p.text, 198, 212);
            txt(
                f,
                Face::Small,
                true,
                Align::Left,
                226,
                224,
                p.text,
                "SOLANA",
            );
            banco_button(f, p, 73, "Enviar");
            banco_button(f, p, 243, "Recibir");
        }
    }
}

fn draw_qr_card(f: &mut Frame, p: &Palette, os: &OsState, pk: &str) {
    let (Some(qr), net) = (os.qr, os.wallet.network) else {
        txt(
            f,
            Face::Small,
            false,
            Align::Center,
            CENTER,
            290,
            p.muted,
            "QR no disponible",
        );
        return;
    };
    let n = qr.width as i32;
    if n <= 0 || n > 64 {
        txt(
            f,
            Face::Small,
            false,
            Align::Center,
            CENTER,
            290,
            p.muted,
            "QR no disponible",
        );
        return;
    }
    let s = 6;
    let qz = 9;
    let size = n * s + qz * 2;
    let x = CENTER - size / 2;
    let y = 182;
    rrect(
        f,
        x,
        y,
        size as u32,
        size as u32,
        16,
        Rgb888::WHITE,
        Some((p.tile_edge, 1)),
    );
    for r in 0..n {
        for c in 0..n {
            let bit = qr.bits.get((r * n + c) as usize).copied().unwrap_or(0);
            if bit != 0 {
                Rectangle::new(
                    Point::new(x + qz + c * s, y + qz + r * s),
                    Size::new(s as u32, s as u32),
                )
                .into_styled(PrimitiveStyle::with_fill(Rgb888::BLACK))
                .draw(f)
                .ok();
            }
        }
    }
    let mut kb = [0u8; 96];
    let short = short_key(pk, &mut kb);
    let mut lb = [0u8; 96];
    txt(
        f,
        Face::Tiny,
        false,
        Align::Center,
        CENTER,
        y + size + 20,
        p.muted,
        snip_append3(net, " · ", short, &mut lb),
    );
}

fn draw_manual_view(f: &mut Frame, p: &Palette, send_to: &str) {
    rrect(f, 53, 190, 360, 70, 12, p.dot, Some((p.tile_edge, 1)));
    let addr = send_to.trim();
    if addr.is_empty() {
        txt(
            f,
            Face::Small,
            false,
            Align::Center,
            CENTER,
            230,
            p.muted,
            "sin dirección",
        );
    } else {
        let mut b1 = [0u8; 96];
        txt(
            f,
            Face::Tiny,
            false,
            Align::Left,
            69,
            218,
            p.text,
            snip(addr, &mut b1, 30),
        );
        if addr.len() > 30 {
            let rest = addr
                .char_indices()
                .nth(30)
                .map(|(i, _)| &addr[i..])
                .unwrap_or("");
            let mut b2 = [0u8; 96];
            txt(
                f,
                Face::Tiny,
                false,
                Align::Left,
                69,
                236,
                p.text,
                snip(rest, &mut b2, 30),
            );
        }
    }
    txt(
        f,
        Face::Tiny,
        false,
        Align::Center,
        CENTER,
        290,
        p.muted,
        "escríbela en el panel",
    );
}

// ── tests de render (humo: dibuja sin pánico + píxeles cuerdos) ───────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::LEN;
    use crate::palette::{DARK, LIGHT};
    use crate::state::*;

    fn os_home() -> OsState<'static> {
        static APPS: [SimApp<'static>; 1] = [SimApp {
            slug: "payload-cms",
            name: "Payload CMS",
            status: "installed",
            tools_count: 4,
        }];
        static M1: [&'static str; 2] = ["z-ai/glm-5.3", "meta/llama-x"];
        static CHAT: [ChatTurn<'static>; 2] = [
            ChatTurn {
                text: "hola",
                reply: "respuesta del agente",
                artifact: None,
            },
            ChatTurn {
                text: "otra pregunta",
                reply: "segunda respuesta con detalle",
                artifact: None,
            },
        ];
        static PROVS: [LlmProvider<'static>; 1] = [LlmProvider {
            provider: "nvidia-nim",
            models: &M1,
            default_model: "z-ai/glm-5.3",
            has_key: true,
            is_active: true,
        }];
        OsState {
            stage: Stage::Online,
            screen: Screen::Home,
            locked: false,
            device_id: "dev-1",
            claim_code: "AB12CD34",
            boot_count: 2,
            taps: 9,
            apps: &APPS,
            detail_app: "payload-cms",
            llm_active: "nvidia-nim",
            llm_providers: &PROVS,
            wallet: Wallet {
                pubkey: Some("5h5B5kvvJHNyEYsRAxa38AKQbhew9rCY2iabP7wKFUkv"),
                network: "devnet",
                balance_lamports: Some(49_794_000),
            },
            last_x402: LastX402 {
                status: "settled",
                access: "ACCESO CONCEDIDO (one-shot)",
                hint: "",
                lamports: 1000,
                has: true,
            },
            last_reply: Some(LastReply {
                text: "hola",
                reply: "respuesta del agente",
            }),
            chat: &CHAT,
            qr: None,
            clock: Clock {
                hour: 1,
                minute: 29,
                date_line: "mar 27 oct",
            },
        }
    }

    fn render(os: Option<&OsState>, v: &ViewState, ms: u64) -> Vec<u8> {
        let mut buf = vec![0u8; LEN];
        let mut f = Frame {
            buf: &mut buf,
            dx: 0,
            dy: 0,
            clip_x: None,
            clip_y: None,
        };
        let p = if v.light { &LIGHT } else { &DARK };
        draw(&mut f, p, os, v, 1, 29, "mar 27 oct", ms);
        buf
    }

    fn count_opaque(buf: &[u8]) -> usize {
        buf.chunks_exact(4).filter(|p| p[3] != 0).count()
    }

    fn count_color(buf: &[u8], r: u8, g: u8, b: u8) -> usize {
        buf.chunks_exact(4)
            .filter(|p| p[3] != 0 && p[0] == r && p[1] == g && p[2] == b)
            .count()
    }

    #[test]
    fn all_screens_render() {
        let mut os = os_home();
        let v = ViewState::default();
        for screen in [
            Screen::Home,
            Screen::Apps,
            Screen::AppDetail,
            Screen::Banco,
            Screen::Settings,
            Screen::Providers,
            Screen::Models,
        ] {
            os.screen = screen;
            let buf = render(Some(&os), &v, 1200);
            // círculo visible ≈ π·225² ≈ 159k px opacos (±dibujo)
            let n = count_opaque(&buf);
            assert!(n > 100_000, "pocos píxeles en {screen:?}: {n}");
        }
        // lock + boot + claim + connecting
        os.locked = true;
        assert!(count_opaque(&render(Some(&os), &v, 1200)) > 100_000);
        os.locked = false;
        os.stage = Stage::Boot;
        assert!(count_opaque(&render(Some(&os), &v, 1200)) > 100_000);
        os.stage = Stage::Claim;
        assert!(count_opaque(&render(Some(&os), &v, 1200)) > 100_000);
        assert!(count_opaque(&render(None, &v, 1200)) > 50_000);
    }

    #[test]
    fn mask_and_theme() {
        let os = os_home();
        let v = ViewState::default();
        let buf = render(Some(&os), &v, 1200);
        // esquina fuera del círculo → transparente
        assert_eq!(buf[3], 0);
        // centro opaco
        let c = (233 * 466 + 233) * 4;
        assert_eq!(buf[c + 3], 255);
        // tema claro: fondo claro en un punto despejado
        // (encima del reloj: y=40 está libre de puntos y chat)
        let mut vl = ViewState::default();
        vl.light = true;
        let bufl = render(Some(&os), &vl, 1200);
        let o = (40 * 466 + 233) * 4;
        assert!(bufl[o] > 200, "fondo claro esperado");
        assert!(buf[o] < 60, "fondo oscuro esperado");
    }

    #[test]
    fn shade_and_banco_views() {
        let mut os = os_home();
        os.screen = Screen::Banco;
        let mut v = ViewState::default();
        v.shade_p = 100;
        let buf = render(Some(&os), &v, 1200);
        assert!(count_opaque(&buf) > 100_000);
        // banco receive/send sin QR (fallback texto, sin pánico)
        v.shade_p = 0;
        v.banco_tab = 1;
        let _ = render(Some(&os), &v, 1200);
        v.banco_recv_nfc = true;
        let _ = render(Some(&os), &v, 1200);
        v.banco_tab = 2;
        v.banco_send_manual = true;
        let _ = render(Some(&os), &v, 1200);
    }

    #[test]
    fn gold_and_text_pixels_exist() {
        // humo tipográfico: oro y texto aparecen (fuentes rinden).
        let os = os_home();
        let buf = render(Some(&os), &ViewState::default(), 1200);
        let gold = count_color(&buf, 0xff, 0xc0, 0x00);
        let white = count_color(&buf, 0xff, 0xff, 0xff);
        assert!(gold > 80, "sin píxeles oro (banco+onda): {gold}");
        assert!(white > 200, "sin píxeles blancos: {white}");
    }
}
