//! os-ui — GUI del OS NomikOS (fuente única compartida).
//!
//! El mismo código dibuja la pantalla de 466×466 en la placa ESP32-S3
//! (AMOLED vía embedded-graphics) y en el navegador (WASM → framebuffer
//! RGBA → textura 3D del panel). Estado entra, píxeles salen; sin heap
//! en el núcleo (`no_std`, todo prestado) para que quepa en la placa.

#![cfg_attr(not(feature = "std"), no_std)]

pub mod draw;
pub mod frame;
pub mod hit;
pub mod icons;
pub mod palette;
pub mod state;
pub mod text;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

/// Pantalla AMOLED 1.43" (px lógicos, igual que el lienzo del panel).
pub const PX: i32 = 466;
pub const CENTER: i32 = PX / 2;
/// Radio visible = radio completo (el fondo llega al filo; sin anillo).
pub const CLIP_R: i32 = 233;
