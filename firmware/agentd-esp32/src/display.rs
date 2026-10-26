//! display.rs — AMOLED 466×466 (RM67162, interfaz QSPI) de la
//! ESP32-S3-Touch-AMOLED-1.43.
//!
//! **Arquitectura real; dos verificaciones de hardware pendientes** (la
//! placa no está conectada en esta sesión — ver README):
//!   1. `BOARD_PINS`: contrastar con el esquemático/demo C de Waveshare.
//!   2. `INIT_SEQUENCE`: la secuencia de init del RM67162 del demo C
//!      (la de aquí es la mínima documentada: reset, sleep-out, on).
//!
//! El framing de comandos del RM67162 (prefijos 0x02/0x32) es el mismo
//! que usa el demo C: comando = palabra `[0x02, 0x00, cmd, 0x00]`,
//! datos = prefijo `0x32` + payload.
//!
//! Dibujo: `embedded-graphics` con ventana de 1 px por punto (lento pero
//! sin framebuffer de 435 KB — para el claim code una vez por arranque
//! es más que suficiente; framebuffer en PSRAM queda de TODO).

use embedded_graphics::{
    mono_font::{ascii::FONT_10X20, MonoTextStyle},
    pixelcolor::Rgb565,
    prelude::*,
    text::Text,
};
use embedded_graphics::geometry::Size;

use esp_hal::gpio::Output;

/// Pines del AMOLED según la placa. **Verificar contra el demo C de
/// Waveshare antes del primer flasheo** (ver README, sección hardware).
#[allow(dead_code)] // documentación de la placa (ver README)
pub struct BoardPins {
    pub sclk: u32,
    pub sda: u32,
    pub cs: u32,
    pub dc: u32,
    pub rst: u32,
}

/// Set documentado de la familia ESP32-S3-Touch-AMOLED (wiki Waveshare).
pub const BOARD_PINS: BoardPins = BoardPins { sclk: 6, sda: 7, cs: 8, dc: 9, rst: 10 };

pub const WIDTH: u32 = 466;
pub const HEIGHT: u32 = 466;

/// Comandos RM67162 (documentación pública del panel + demo C).
mod cmd {
    pub const SWRESET: u8 = 0x01;
    pub const SLPOUT: u8 = 0x11;
    pub const DISPON: u8 = 0x29;
    pub const CASET: u8 = 0x2A;
    pub const RASET: u8 = 0x2B;
    pub const RAMWR: u8 = 0x2C;
    pub const MADCTL: u8 = 0x36;
    pub const PAGE: u8 = 0xFE; // selector de página de registros
}

pub struct Amoled<'a, SPI> {
    spi: SPI,
    dc: Output<'a>,
    rst: Output<'a>,
}

impl<'a, SPI> Amoled<'a, SPI>
where
    SPI: embedded_hal::spi::SpiBus,
{
    /// Inicializa el panel: reset → secuencia → display on.
    pub fn new(spi: SPI, dc: Output<'a>, mut rst: Output<'a>) -> Self {
        rst.set_low();
        esp_hal::delay::Delay::new().delay_millis(20);
        rst.set_high();
        esp_hal::delay::Delay::new().delay_millis(120);

        let mut display = Self { spi, dc, rst };
        display.command(cmd::SWRESET);
        esp_hal::delay::Delay::new().delay_millis(120);
        display.command(cmd::SLPOUT);
        esp_hal::delay::Delay::new().delay_millis(120);
        display.reg(cmd::MADCTL, &[0x00]);
        display.command(cmd::DISPON);
        display
    }

    /// Comando RM67162: `[0x02, 0x00, cmd, 0x00]` (fase de 1 bit).
    fn command(&mut self, c: u8) {
        self.dc.set_low();
        let _ = self.spi.write(&[0x02, 0x00, c, 0x00]);
    }

    /// Registro con argumentos: comando + datos (framing 0x32).
    fn reg(&mut self, c: u8, args: &[u8]) {
        self.command(c);
        self.dc.set_high();
        let mut head = [0u8; 4];
        head[0] = 0x32;
        let _ = self.spi.write(&head);
        let _ = self.spi.write(args);
    }

    /// Ventana de escritura (columna/fila, inclusiva).
    fn set_window(&mut self, x0: u32, y0: u32, x1: u32, y1: u32) {
        self.reg(cmd::CASET, &[(x0 >> 8) as u8, x0 as u8, (x1 >> 8) as u8, x1 as u8]);
        self.reg(cmd::RASET, &[(y0 >> 8) as u8, y0 as u8, (y1 >> 8) as u8, y1 as u8]);
        self.command(cmd::RAMWR);
        self.dc.set_high();
    }

    /// Pinta un pixel (ventana 1×1 + RAMWR). Para el claim code alcanza;
    /// framebuffer streaming queda como optimización futura.
    pub fn pixel(&mut self, x: u32, y: u32, color: Rgb565) {
        if x >= WIDTH || y >= HEIGHT {
            return;
        }
        self.set_window(x, y, x, y);
        let head = [0x32u8, 0, 0, 0];
        let _ = self.spi.write(&head);
        let be = color.to_be_bytes();
        let _ = self.spi.write(&be);
    }

    /// Fondo completo a un color (barrido por filas de 32 px).
    pub fn clear(&mut self, color: Rgb565) {
        let mut row = [0u8; 32 * 2];
        for chunk in row.chunks_mut(2) {
            chunk.copy_from_slice(&color.to_be_bytes());
        }
        for y in (0..HEIGHT).step_by(32) {
            self.set_window(0, y, WIDTH - 1, (y + 31).min(HEIGHT - 1));
            let head = [0x32u8, 0, 0, 0];
            let _ = self.spi.write(&head);
            for _ in 0..WIDTH {
                let _ = self.spi.write(&row);
            }
        }
    }

    /// Banner de emparejado: el claim code GRANDE (lo que el usuario
    /// canjea en el panel 📡 Flota → Emparejar).
    pub fn claim_banner(&mut self, code: &str, name: &str) {
        self.clear(Rgb565::new(0, 0, 0));
        let gold = MonoTextStyle::new(&FONT_10X20, Rgb565::new(0xFF, 0xC0, 0x00));
        let white = MonoTextStyle::new(&FONT_10X20, Rgb565::new(0xFF, 0xFF, 0xFF));
        let gray = MonoTextStyle::new(&FONT_10X20, Rgb565::new(0x60, 0x60, 0x60));
        let x = ((WIDTH as i32) - (code.len() as i32 * 12)) / 2;
        let _ = Text::new("NOMIKOS", Point::new(10, 30), gold).draw(&mut DisplayRef(self));
        let _ = Text::new(name, Point::new(10, 55), gold).draw(&mut DisplayRef(self));
        let _ = Text::new(code, Point::new(x.max(0), 200), white).draw(&mut DisplayRef(self));
        let _ = Text::new("empareja en el panel", Point::new(10, 230), gray).draw(&mut DisplayRef(self));
    }

    /// Estado operativo (post-claim): nombre + estado + peajes.
    pub fn status(&mut self, msg: &str, toll: bool) {
        self.clear(Rgb565::new(0, 0, 0));
        let white = MonoTextStyle::new(&FONT_10X20, Rgb565::new(0xFF, 0xFF, 0xFF));
        let accent = MonoTextStyle::new(
            &FONT_10X20,
            if toll { Rgb565::new(0xFF, 0xC0, 0x00) } else { Rgb565::new(0x00, 0xC0, 0x00) },
        );
        let _ = Text::new("ONLINE", Point::new(10, 30), white).draw(&mut DisplayRef(self));
        let _ = Text::new(msg, Point::new(10, 60), white).draw(&mut DisplayRef(self));
        let _ = Text::new(if toll { "peaje x402" } else { "operativo" }, Point::new(10, 90), accent)
            .draw(&mut DisplayRef(self));
    }
}

/// Adapter embedded-graphics: cada punto → pixel().
struct DisplayRef<'x, 'a, SPI>(&'x mut Amoled<'a, SPI>);

impl<SPI> OriginDimensions for DisplayRef<'_, '_, SPI> {
    fn size(&self) -> Size {
        Size::new(WIDTH, HEIGHT)
    }
}

impl<SPI> DrawTarget for DisplayRef<'_, '_, SPI>
where
    SPI: embedded_hal::spi::SpiBus,
{
    type Color = Rgb565;
    type Error = core::convert::Infallible;

    fn draw_iter<I: IntoIterator<Item = Pixel<Self::Color>>>(
        &mut self,
        pixels: I,
    ) -> Result<(), Self::Error> {
        for Pixel(Point { x, y }, c) in pixels {
            self.0.pixel(x as u32, y as u32, c);
        }
        Ok(())
    }
}
