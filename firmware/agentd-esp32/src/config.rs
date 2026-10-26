//! Config del firmware: WiFi, api de la LAN e identidad de la placa.
//!
//! El ESP32-S3-Touch-AMOLED-1.43 no tiene entrada de usuario: las
//! credenciales WiFi se fijan en compile-time (`[env]` del
//! `.cargo/config.toml` o variables de entorno al compilar):
//!
//! ```sh
//! SSID=MiRed PASSWORD=secreto cargo build --release
//! ```
//!
//! La dirección del api es un literal IPv4 (el stack blocking no
//! resuelve DNS): la IP LAN del host que corre `api` (igual que
//! `AGENTD_API_URL` en el agentd.conf de la Pi).

/// SSID de la red WiFi (compile-time).
pub const WIFI_SSID: &str = env!("SSID");
/// Password de la red WiFi (compile-time).
pub const WIFI_PASSWORD: &str = env!("PASSWORD");

/// IP del api del ecosistema en la LAN (sin DNS: literal IPv4).
pub const API_HOST: [u8; 4] = [192, 168, 1, 50];
/// Puerto del api (8080 por defecto; ver api/AGENTS.md).
pub const API_PORT: u16 = 8080;
/// Prefijo de rutas del api (el worker del diagrama).
pub const API_PREFIX: &str = "/api";

/// Identidad visible en la flota.
pub const BOARD: &str = "esp32-s3-amoled-143";
pub const NAME: &str = "nomikos-esp32";
