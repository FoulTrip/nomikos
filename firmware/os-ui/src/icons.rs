//! Iconos geométricos del OS (sin emoji ni SVG: primitivas puras
//! para que placa y navegador dibujen idéntico).

use embedded_graphics::{
    geometry::{AngleUnit, Point},
    pixelcolor::Rgb888,
    primitives::{
        Arc, Circle, Line, Polyline, Primitive, PrimitiveStyle, Rectangle, RoundedRectangle,
        Triangle,
    },
    Drawable,
};

use crate::{frame::Frame, palette::Palette};

fn fill(c: Rgb888) -> PrimitiveStyle<Rgb888> {
    PrimitiveStyle::with_fill(c)
}

fn edge(c: Rgb888, w: u32) -> PrimitiveStyle<Rgb888> {
    PrimitiveStyle::with_stroke(c, w)
}

/// Banco: tejado + 3 columnas + base, centrado en (cx, cy), alto ≈ s.
pub fn bank(frame: &mut Frame, p: &Palette, cx: i32, cy: i32, s: i32) {
    // Proporcional a s: tejado + 3 columnas + base, centrado en (cx, cy).
    let w = s / 2;
    let cw = (s / 7).max(2);
    let top = cy - s / 2;
    // tejado
    Triangle::new(
        Point::new(cx - w, top + s * 3 / 10),
        Point::new(cx + w, top + s * 3 / 10),
        Point::new(cx, top),
    )
    .into_styled(fill(p.gold))
    .draw(frame)
    .ok();
    // columnas (3 repartidas en [-w+1, w-1-cw])
    let span = (2 * w - 2 - cw).max(2);
    for i in 0..3 {
        let x = cx - w + 1 + i * span / 2;
        Rectangle::new(
            Point::new(x, top + s * 3 / 10 + 2),
            embedded_graphics::geometry::Size::new(cw as u32, (s * 4 / 10) as u32),
        )
        .into_styled(fill(p.gold))
        .draw(frame)
        .ok();
    }
    // base
    Rectangle::new(
        Point::new(cx - w, top + s - (s / 8).max(2)),
        embedded_graphics::geometry::Size::new((2 * w) as u32, (s / 8).max(2) as u32),
    )
    .into_styled(fill(p.gold))
    .draw(frame)
    .ok();
}

/// Engranaje: corona + 8 dientes + buje.
pub fn gear(frame: &mut Frame, p: &Palette, cx: i32, cy: i32, r: i32) {
    for k in 0..8 {
        // dientes como radios gruesos (ángulos aproximados por octantes)
        let (dx, dy) = match k {
            0 => (r, 0),
            1 => (r * 7 / 10, r * 7 / 10),
            2 => (0, r),
            3 => (-r * 7 / 10, r * 7 / 10),
            4 => (-r, 0),
            5 => (-r * 7 / 10, -r * 7 / 10),
            6 => (0, -r),
            _ => (r * 7 / 10, -r * 7 / 10),
        };
        Line::new(
            Point::new(cx + dx * 55 / 100, cy + dy * 55 / 100),
            Point::new(cx + dx, cy + dy),
        )
        .into_styled(edge(p.gold, 3))
        .draw(frame)
        .ok();
    }
    Circle::with_center(Point::new(cx, cy), (r * 12 / 10) as u32)
        .into_styled(edge(p.gold, 3))
        .draw(frame)
        .ok();
    Circle::with_center(Point::new(cx, cy), (r * 4 / 10) as u32)
        .into_styled(fill(p.gold))
        .draw(frame)
        .ok();
}

/// Candado: cuerpo + arco.
pub fn lock(frame: &mut Frame, p: &Palette, cx: i32, cy: i32, s: i32) {
    let w = s * 2 / 3;
    Rectangle::new(
        Point::new(cx - w / 2, cy),
        embedded_graphics::geometry::Size::new(w as u32, (s / 2) as u32),
    )
    .into_styled(fill(p.gold))
    .draw(frame)
    .ok();
    // arco del candado (semicírculo superior)
    Arc::with_center(
        Point::new(cx, cy + 2),
        (w - 4).max(4) as u32,
        180.0.deg(),
        180.0.deg(),
    )
    .into_styled(edge(p.gold, 3))
    .draw(frame)
    .ok();
}

/// Wifi: 3 arcos + punto (grados sexagesimales EG).
pub fn wifi(frame: &mut Frame, color: Rgb888, cx: i32, cy: i32, s: i32) {
    for r in [4, 7, 10] {
        let rr = r * s / 10;
        Arc::with_center(
            Point::new(cx, cy),
            (rr * 2).max(2) as u32,
            220.0.deg(),
            100.0.deg(),
        )
        .into_styled(edge(color, 2))
        .draw(frame)
        .ok();
    }
    Circle::with_center(Point::new(cx, cy), 4)
        .into_styled(fill(color))
        .draw(frame)
        .ok();
}

/// Check pequeño (polyline).
pub fn check(frame: &mut Frame, color: Rgb888, x: i32, y: i32, s: i32) {
    Polyline::new(&[
        Point::new(x, y),
        Point::new(x + s * 4 / 10, y + s * 5 / 10),
        Point::new(x + s, y - s * 4 / 10),
    ])
    .into_styled(edge(color, 2))
    .draw(frame)
    .ok();
}

/// Triángulo arriba/abajo (scroll) o derecha (disclosure rows).
pub fn tri_up(frame: &mut Frame, color: Rgb888, cx: i32, cy: i32, s: i32) {
    Triangle::new(
        Point::new(cx - s / 2, cy + s / 3),
        Point::new(cx + s / 2, cy + s / 3),
        Point::new(cx, cy - s * 2 / 3),
    )
    .into_styled(fill(color))
    .draw(frame)
    .ok();
}

pub fn tri_down(frame: &mut Frame, color: Rgb888, cx: i32, cy: i32, s: i32) {
    Triangle::new(
        Point::new(cx - s / 2, cy - s / 3),
        Point::new(cx + s / 2, cy - s / 3),
        Point::new(cx, cy + s * 2 / 3),
    )
    .into_styled(fill(color))
    .draw(frame)
    .ok();
}

/// X: dos trazos cruzados (cerrar el historial del chat).
pub fn x_mark(frame: &mut Frame, color: Rgb888, cx: i32, cy: i32, s: i32) {
    let d = s / 2;
    Line::new(Point::new(cx - d, cy - d), Point::new(cx + d, cy + d))
        .into_styled(edge(color, 3))
        .draw(frame)
        .ok();
    Line::new(Point::new(cx + d, cy - d), Point::new(cx - d, cy + d))
        .into_styled(edge(color, 3))
        .draw(frame)
        .ok();
}

/// Burbuja de chat: rectángulo + cola abajo a la izquierda.
pub fn chat_bubble(frame: &mut Frame, p: &Palette, cx: i32, cy: i32, s: i32) {
    let w = s;
    let h = s * 4 / 5;
    let x = cx - w / 2;
    let y = cy - h / 2;
    let corner = ((s / 3).max(2)) as u32;
    RoundedRectangle::with_equal_corners(
        Rectangle::new(
            Point::new(x, y),
            embedded_graphics::geometry::Size::new(w as u32, h as u32),
        ),
        embedded_graphics::geometry::Size::new(corner, corner),
    )
    .into_styled(fill(p.gold))
    .draw(frame)
    .ok();
    // cola
    Triangle::new(
        Point::new(x + 2, y + h - 2),
        Point::new(x + 2 + s / 2, y + h - 2),
        Point::new(x + 2, y + h + s / 2),
    )
    .into_styled(fill(p.gold))
    .draw(frame)
    .ok();
}

/// Flecha de envío (triángulo a la derecha).
pub fn send_arrow(frame: &mut Frame, color: Rgb888, cx: i32, cy: i32, s: i32) {
    Triangle::new(
        Point::new(cx - s / 2, cy - s / 2),
        Point::new(cx + s / 2, cy),
        Point::new(cx - s / 2, cy + s / 2),
    )
    .into_styled(fill(color))
    .draw(frame)
    .ok();
}
