//! Framebuffer RGBA 466×466: el DrawTarget que el navegador
//! convierte en textura 3D (y que la placa volcará al AMOLED).

use embedded_graphics::{
    draw_target::DrawTarget,
    geometry::{OriginDimensions, Size},
    pixelcolor::{Rgb888, RgbColor},
    primitives::Rectangle,
    Pixel,
};
use crate::{CLIP_R, CENTER, PX};

pub const W: usize = PX as usize;
pub const H: usize = PX as usize;
pub const LEN: usize = W * H * 4;

/// Lienzo RGBA sobre un buffer prestado (el dueño vive en el wrapper).
pub struct Frame<'a> {
    pub buf: &'a mut [u8],
}

impl<'a> Frame<'a> {
    pub fn clear(&mut self, c: Rgb888) {
        for px in self.buf.chunks_exact_mut(4) {
            px[0] = c.r();
            px[1] = c.g();
            px[2] = c.b();
            px[3] = 255;
        }
    }

    /// Máscara circular: fuera del radio visible, alfa 0.
    pub fn circle_mask(&mut self) {
        for y in 0..H as i32 {
            for x in 0..W as i32 {
                let dx = x - CENTER;
                let dy = y - CENTER;
                if dx * dx + dy * dy > CLIP_R * CLIP_R {
                    self.buf[(y as usize * W + x as usize) * 4 + 3] = 0;
                }
            }
        }
    }

    /// Blur de caja separable en una región (radio 3, RGB; alfa intacto).
    /// Scratch fijo (~1.5 KB): seguro en pila de MCU.
    pub fn blur_region(&mut self, x0: i32, y0: i32, w: i32, h: i32) {
        const R: i32 = 3;
        let x0 = x0.max(0);
        let y0 = y0.max(0);
        let x1 = (x0 + w).min(W as i32);
        let y1 = (y0 + h).min(H as i32);
        if x1 <= x0 || y1 <= y0 {
            return;
        }
        // pasada horizontal (fila por fila, scratch de una fila)
        let mut row = [0u8; 466 * 4];
        for y in y0..y1 {
            let len = ((x1 - x0) * 4) as usize;
            row[..len].copy_from_slice(&self.buf[y as usize * W * 4 + x0 as usize * 4..][..len]);
            for x in x0..x1 {
                let mut acc = [0u32; 3];
                let mut n = 0u32;
                for k in -R..=R {
                    let sx = (x + k).clamp(x0, x1 - 1);
                    let o = ((sx - x0) * 4) as usize;
                    acc[0] += row[o] as u32;
                    acc[1] += row[o + 1] as u32;
                    acc[2] += row[o + 2] as u32;
                    n += 1;
                }
                let o = (y as usize * W + x as usize) * 4;
                self.buf[o] = (acc[0] / n) as u8;
                self.buf[o + 1] = (acc[1] / n) as u8;
                self.buf[o + 2] = (acc[2] / n) as u8;
            }
        }
        // pasada vertical (columna por columna)
        let mut col = [0u8; 466 * 4];
        for x in x0..x1 {
            let hgt = (y1 - y0) as usize;
            for (i, y) in (y0..y1).enumerate() {
                let o = (y as usize * W + x as usize) * 4;
                col[i * 4..i * 4 + 4].copy_from_slice(&self.buf[o..o + 4]);
            }
            for y in y0..y1 {
                let mut acc = [0u32; 3];
                let mut n = 0u32;
                for k in -R..=R {
                    let sy = (y + k).clamp(y0, y1 - 1);
                    let o = ((sy - y0) * 4) as usize;
                    acc[0] += col[o] as u32;
                    acc[1] += col[o + 1] as u32;
                    acc[2] += col[o + 2] as u32;
                    n += 1;
                }
                let o = (y as usize * W + x as usize) * 4;
                self.buf[o] = (acc[0] / n) as u8;
                self.buf[o + 1] = (acc[1] / n) as u8;
                self.buf[o + 2] = (acc[2] / n) as u8;
            }
            let _ = hgt;
        }
    }

    /// Mezcla un color sobre un píxel (alpha 0..255).
    pub fn blend_px(&mut self, x: i32, y: i32, color: Rgb888, alpha: u8) {
        if x < 0 || y < 0 || x >= W as i32 || y >= H as i32 {
            return;
        }
        let o = (y as usize * W + x as usize) * 4;
        let a = alpha as u32;
        self.buf[o] = ((color.r() as u32 * a + self.buf[o] as u32 * (255 - a)) / 255) as u8;
        self.buf[o + 1] = ((color.g() as u32 * a + self.buf[o + 1] as u32 * (255 - a)) / 255) as u8;
        self.buf[o + 2] = ((color.b() as u32 * a + self.buf[o + 2] as u32 * (255 - a)) / 255) as u8;
    }
}

impl<'a> DrawTarget for Frame<'a> {
    type Color = Rgb888;
    type Error = core::convert::Infallible;

    fn draw_iter<I>(&mut self, pixels: I) -> Result<(), Self::Error>
    where
        I: IntoIterator<Item = Pixel<Self::Color>>,
    {
        for Pixel(point, color) in pixels {
            if point.x < 0 || point.y < 0 || point.x >= PX || point.y >= PX {
                continue;
            }
            let o = (point.y as usize * W + point.x as usize) * 4;
            self.buf[o] = color.r();
            self.buf[o + 1] = color.g();
            self.buf[o + 2] = color.b();
            self.buf[o + 3] = 255;
        }
        Ok(())
    }
}

impl<'a> OriginDimensions for Frame<'a> {
    fn size(&self) -> Size {
        Size::new(W as u32, H as u32)
    }
}

/// Rectángulo de ayuda (x, y, w, h en px lógicos).
pub fn rect(x: i32, y: i32, w: u32, h: u32) -> Rectangle {
    Rectangle::new(
        embedded_graphics::geometry::Point::new(x, y),
        Size::new(w, h),
    )
}
