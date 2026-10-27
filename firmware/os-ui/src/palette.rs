//! Paleta del OS (dark/light), mismos valores que el panel.

use embedded_graphics::pixelcolor::Rgb888;

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Palette {
    pub bg: Rgb888,
    pub text: Rgb888,
    pub muted: Rgb888,
    pub faint: Rgb888,
    pub gold: Rgb888,
    pub green: Rgb888,
    pub track: Rgb888,
    pub dot_edge: Rgb888,
    pub hairline: Rgb888,
    pub dot: Rgb888,
    pub on_gold: Rgb888,
    pub island: Rgb888,
    pub tile: Rgb888,
    pub tile_edge: Rgb888,
}

pub const DARK: Palette = Palette {
    bg: Rgb888::new(0x00, 0x00, 0x00),
    text: Rgb888::new(0xff, 0xff, 0xff),
    muted: Rgb888::new(0x9a, 0x9a, 0x9a),
    faint: Rgb888::new(0x55, 0x55, 0x55),
    gold: Rgb888::new(0xff, 0xc0, 0x00),
    green: Rgb888::new(0x00, 0xc0, 0x00),
    track: Rgb888::new(0x1c, 0x1c, 0x1c),
    dot_edge: Rgb888::new(0x3a, 0x3a, 0x3a),
    hairline: Rgb888::new(0x22, 0x22, 0x22),
    dot: Rgb888::new(0x10, 0x10, 0x10),
    on_gold: Rgb888::new(0x00, 0x00, 0x00),
    island: Rgb888::new(0x0d, 0x0d, 0x0d),
    tile: Rgb888::new(0x14, 0x14, 0x14),
    tile_edge: Rgb888::new(0x2e, 0x2e, 0x2e),
};

pub const LIGHT: Palette = Palette {
    bg: Rgb888::new(0xf4, 0xf4, 0xf5),
    text: Rgb888::new(0x18, 0x18, 0x1b),
    muted: Rgb888::new(0x5b, 0x5b, 0x66),
    faint: Rgb888::new(0x8a, 0x8a, 0x93),
    gold: Rgb888::new(0x9a, 0x6b, 0x00),
    green: Rgb888::new(0x00, 0x7a, 0x00),
    track: Rgb888::new(0xdc, 0xdc, 0xe0),
    dot_edge: Rgb888::new(0xb9, 0xb9, 0xc0),
    hairline: Rgb888::new(0xd4, 0xd4, 0xd8),
    dot: Rgb888::new(0xe4, 0xe4, 0xe8),
    on_gold: Rgb888::new(0xff, 0xff, 0xff),
    island: Rgb888::new(0xff, 0xff, 0xff),
    tile: Rgb888::new(0xff, 0xff, 0xff),
    tile_edge: Rgb888::new(0xd4, 0xd4, 0xd8),
};

/// Azul badge fijo en ambos temas (notificaciones).
pub const BADGE_BLUE: Rgb888 = Rgb888::new(0x4d, 0xa3, 0xff);
/// Rojo fijo en ambos temas (prohibido mic).
pub const ALERT_RED: Rgb888 = Rgb888::new(0xff, 0x44, 0x44);
