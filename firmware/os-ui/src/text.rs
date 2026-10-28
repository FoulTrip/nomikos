//! Texto del OS: tabla de fuentes u8g2 (tamaños ≈ los del panel).
//! Coordenadas = las del canvas (x + baseline y). Negrita real donde
//! existe variante B; si no, doble pasada (faux-bold).

use embedded_graphics::{
    geometry::Point,
    pixelcolor::Rgb888,
};
use u8g2_fonts::{
    fonts::*,
    types::{FontColor, HorizontalAlignment, VerticalPosition},
    FontRenderer,
};

use crate::frame::Frame;

/// Tamaños lógicos (px canvas que aproximan).
#[derive(Clone, Copy)]
pub enum Face {
    /// 10-11px
    Tiny,
    /// 12-13px (+bold real)
    Small,
    SmallB,
    /// 14-15px (+bold real)
    Mid,
    MidB,
    /// 16-17px (+bold real)
    Base,
    BaseB,
    /// 19-20px
    Large,
    /// 26-30px (balances, shade)
    Xl,
    /// 34px (claim, títulos)
    Xxl,
    /// 42-44px (reloj inicio)
    Clock,
    /// 54px (código claim)
    Xxxl,
    /// 92px dígitos (reloj bloqueo; colon manual)
    ClockBig,
}

fn render_with<FONT: u8g2_fonts::Font>(
    text: &str,
    x: i32,
    y: i32,
    align: HorizontalAlignment,
    color: Rgb888,
    frame: &mut Frame,
    bold_pass: bool,
) {
    let r = FontRenderer::new::<FONT>().with_ignore_unknown_chars(true);
    let pos = Point::new(x, y);
    let _ = r.render_aligned(
        text,
        pos,
        VerticalPosition::Baseline,
        align,
        FontColor::Transparent(color),
        frame,
    );
    if bold_pass {
        let _ = r.render_aligned(
            text,
            Point::new(x + 1, y),
            VerticalPosition::Baseline,
            align,
            FontColor::Transparent(color),
            frame,
        );
    }
}

fn width_with<FONT: u8g2_fonts::Font>(text: &str) -> i32 {
    let r = FontRenderer::new::<FONT>().with_ignore_unknown_chars(true);
    r.get_rendered_dimensions_aligned(
        text,
        Point::zero(),
        VerticalPosition::Baseline,
        HorizontalAlignment::Left,
    )
    .ok()
    .flatten()
    .map(|rc| rc.size.width as i32)
    .unwrap_or(0)
}

macro_rules! face_fns {
    ($($v:ident => $f:ty),*) => {
        /// Ancho en px de un texto (para envolver).
        pub fn text_width(face: Face, text: &str) -> i32 {
            match face {
                $(Face::$v => width_with::<$f>(text),)*
            }
        }
        /// Texto en baseline (x según align).
        pub fn text(
            frame: &mut Frame,
            face: Face,
            align: HorizontalAlignment,
            x: i32,
            baseline_y: i32,
            color: Rgb888,
            content: &str,
        ) {
            match face {
                $(Face::$v => render_with::<$f>(content, x, baseline_y, align, color, frame, false),)*
            }
        }
        /// Negrita: doble pasada desplazada (para fuentes sin variante B).
        pub fn text_bold(
            frame: &mut Frame,
            face: Face,
            align: HorizontalAlignment,
            x: i32,
            baseline_y: i32,
            color: Rgb888,
            content: &str,
        ) {
            match face {
                $(Face::$v => render_with::<$f>(content, x, baseline_y, align, color, frame, true),)*
            }
        }
    };
}

face_fns! {
    Tiny => u8g2_font_6x10_tf,
    Small => u8g2_font_7x13_tf,
    SmallB => u8g2_font_7x13B_tf,
    Mid => u8g2_font_9x15_tf,
    MidB => u8g2_font_9x15B_tf,
    Base => u8g2_font_9x18_tf,
    BaseB => u8g2_font_9x18B_tf,
    Large => u8g2_font_10x20_tf,
    Xl => u8g2_font_logisoso30_tf,
    Xxl => u8g2_font_logisoso34_tf,
    Clock => u8g2_font_logisoso42_tf,
    Xxxl => u8g2_font_logisoso54_tf,
    ClockBig => u8g2_font_logisoso92_tn
}

/// Negrita real si existe variante B; si no, faux (doble pasada).
pub fn text_auto(
    frame: &mut Frame,
    face: Face,
    bold: bool,
    align: HorizontalAlignment,
    x: i32,
    baseline_y: i32,
    color: Rgb888,
    content: &str,
) {
    match (face, bold) {
        (Face::Small, true) => text(frame, Face::SmallB, align, x, baseline_y, color, content),
        (Face::Mid, true) => text(frame, Face::MidB, align, x, baseline_y, color, content),
        (Face::Base, true) => text(frame, Face::BaseB, align, x, baseline_y, color, content),
        (f, true) => text_bold(frame, f, align, x, baseline_y, color, content),
        (f, false) => text(frame, f, align, x, baseline_y, color, content),
    }
}

/// Cuenta las líneas que `wrap_lines_at` pintaría (sin dibujar).
pub fn wrap_count(
    face: Face,
    content: &str,
    max_width: i32,
    max_lines: usize,
) -> usize {
    let mut words = [""; 64];
    let mut n_words = 0usize;
    for w in content.split(|c: char| c.is_whitespace()) {
        if w.is_empty() || n_words >= 64 {
            continue;
        }
        words[n_words] = w;
        n_words += 1;
    }
    let space_w = text_width(face, " ");
    let mut painted = 0usize;
    let mut start = 0usize;
    while start < n_words && painted < max_lines {
        let mut end = start;
        let mut wsum = 0i32;
        while end < n_words {
            let ww = text_width(face, words[end]);
            let sp = if end > start { space_w } else { 0 };
            if end > start && wsum + sp + ww > max_width {
                break;
            }
            wsum += sp + ww;
            end += 1;
        }
        painted += 1;
        start = end.max(start + 1);
    }
    painted
}

/// Envuelve por palabras y pinta con la alineación pedida.
/// Devuelve cuántas líneas pintó.
pub fn wrap_lines_at(
    frame: &mut Frame,
    face: Face,
    color: Rgb888,
    content: &str,
    x: i32,
    first_baseline: i32,
    line_h: i32,
    max_lines: usize,
    max_width: i32,
    align: HorizontalAlignment,
) -> usize {
    let mut words = [""; 64];
    let mut n_words = 0usize;
    for w in content.split(|c: char| c.is_whitespace()) {
        if w.is_empty() || n_words >= 64 {
            continue;
        }
        words[n_words] = w;
        n_words += 1;
    }
    let space_w = text_width(face, " ");
    let mut painted = 0usize;
    let mut start = 0usize;
    while start < n_words && painted < max_lines {
        let mut end = start;
        let mut wsum = 0i32;
        while end < n_words {
            let ww = text_width(face, words[end]);
            let sp = if end > start { space_w } else { 0 };
            if end > start && wsum + sp + ww > max_width {
                break;
            }
            wsum += sp + ww;
            end += 1;
        }
        // Une con espacios en un buffer fijo (sin heap).
        let mut buf = [0u8; 160];
        let mut blen = 0usize;
        for (k, w) in words[start..end].iter().enumerate() {
            if k > 0 && blen < 159 {
                buf[blen] = b' ';
                blen += 1;
            }
            for &b in w.as_bytes() {
                if blen >= 160 {
                    break;
                }
                buf[blen] = b;
                blen += 1;
            }
        }
        // Última línea permitida y sobran palabras → marca de recorte
        // "..." para que se vea que la respuesta continúa.
        if painted + 1 == max_lines && end < n_words {
            let ell = text_width(face, "...");
            let mut wsum2 = text_width(face, core::str::from_utf8(&buf[..blen]).unwrap_or(""));
            while wsum2 + ell > max_width && blen > 0 {
                // retrocede un carácter UTF-8 completo
                while blen > 0 && (buf[blen - 1] & 0xC0) == 0x80 {
                    blen -= 1;
                }
                if blen > 0 {
                    blen -= 1;
                }
                wsum2 = text_width(face, core::str::from_utf8(&buf[..blen]).unwrap_or(""));
            }
            for &b in b"..." {
                if blen < 159 {
                    buf[blen] = b;
                    blen += 1;
                }
            }
        }
        if let Ok(line) = core::str::from_utf8(&buf[..blen]) {
            text(
                frame,
                face,
                align,
                x,
                first_baseline + (painted as i32) * line_h,
                color,
                line,
            );
            painted += 1;
        }
        start = end.max(start + 1);
    }
    painted
}

/// Envuelve por palabras, centrado en `cx` (compat).
/// Devuelve cuántas líneas pintó.
pub fn wrap_lines(
    frame: &mut Frame,
    face: Face,
    color: Rgb888,
    content: &str,
    cx: i32,
    first_baseline: i32,
    line_h: i32,
    max_lines: usize,
    max_width: i32,
) -> usize {
    wrap_lines_at(
        frame,
        face,
        color,
        content,
        cx,
        first_baseline,
        line_h,
        max_lines,
        max_width,
        HorizontalAlignment::Center,
    )
}
