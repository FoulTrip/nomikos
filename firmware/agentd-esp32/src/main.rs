//! agentd-esp32 — firmware NomikOS para el ESP32-S3-Touch-AMOLED-1.43.
//!
//! El ciclo del agente (enroll → claim → token → heartbeat → x402) vive
//! en `agentd-core` (validado por el simulador host contra el api real);
//! este crate aporta los periféricos de la placa: WiFi (esp-wifi),
//! HTTP blocking propio (smoltcp) y el AMOLED RM67162 (claim code en
//! pantalla — el instalador del dapp por Web Serial también lo detecta).
//!
//! Compilar (requiere el toolchain xtensa: `espup install --targets esp32s3`):
//! ```sh
//! cd firmware/agentd-esp32
//! SSID=MiRed PASSWORD=secreto cargo build --release   # API_HOST en src/config.rs
//! cargo flash   # = espflash (ver .cargo/config.toml)
//! ```

#![no_std]
#![no_main]

extern crate alloc;

use esp_backtrace as _;
use esp_hal::{
    clock::CpuClock,
    gpio::{Io, Level, Output},
    main,
    rng::Rng,
    spi::master::{Config as SpiConfig, Spi},
    time::RateExtU32,
    timer::timg::TimerGroup,
};
use esp_println::println;

mod agent;
mod config;
mod display;
mod http;
mod net;
mod state;

#[main]
fn main() -> ! {
    esp_println::logger::init_logger_from_env();
    println!("[boot] agentd-esp32 v0.1.0 · NomikOS");

    // ── Periféricos: 240 MHz, heap 72 KB ─────────────────────────────
    let board_config = esp_hal::Config::default().with_cpu_clock(CpuClock::max());
    let peripherals = esp_hal::init(board_config);
    esp_alloc::heap_allocator!(72 * 1024);

    // ── Pantalla AMOLED (RM67162 QSPI) ──────────────────────────────
    // Pines de BOARD_PINS (display.rs) — TODO-hardware: contrastar con
    // el esquemático Waveshare antes del primer flasheo real.
    let _io_mux = Io::new(peripherals.IO_MUX); // mux de pines (los Output/Spi toman peripherals.GPIO<n> directo)
    let spi_config = SpiConfig::default().with_frequency(40.MHz());
    let lcd_spi = Spi::new(peripherals.SPI2, spi_config)
        .expect("SPI2 del AMOLED")
        .with_sck(peripherals.GPIO6)
        .with_mosi(peripherals.GPIO7);
    let dc = Output::new(peripherals.GPIO9, Level::Low);
    let rst = Output::new(peripherals.GPIO10, Level::Low);
    let mut amoled = display::Amoled::new(lcd_spi, dc, rst);
    amoled.claim_banner("arrancando…", config::NAME);

    // ── WiFi: estación + DHCP (credenciales de compile-time) ─────────
    let timg0 = TimerGroup::new(peripherals.TIMG0);
    let mut rng = Rng::new(peripherals.RNG);
    let seed = (rng.random() as u64) | ((rng.random() as u64) << 32);
    let wifi_init = esp_wifi::init(timg0.timer0, rng.clone(), peripherals.RADIO_CLK).unwrap();
    let mut wifi = peripherals.WIFI;
    let (iface, device, mut controller) = esp_wifi::wifi::utils::create_network_interface(
        &wifi_init,
        &mut wifi,
        esp_wifi::wifi::WifiStaDevice,
    )
    .unwrap();

    // storage del SocketSet + buffers TCP del stack (leak: viven siempre)
    let sockets: &'static mut [smoltcp::iface::SocketStorage<'static>] =
        alloc::boxed::Box::leak(alloc::boxed::Box::new(
            core::array::from_fn::<smoltcp::iface::SocketStorage<'static>, 3, _>(
                |_| smoltcp::iface::SocketStorage::EMPTY,
            ),
        ));
    let tcp_rx: &'static mut [u8] = alloc::vec![0u8; 2048].leak();
    let tcp_tx: &'static mut [u8] = alloc::vec![0u8; 2048].leak();
    let mut stack = net::Stack::new(iface, device, sockets, tcp_rx, tcp_tx);

    use esp_wifi::wifi::{ClientConfiguration, Configuration};
    let client = Configuration::Client(ClientConfiguration {
        ssid: config::WIFI_SSID.try_into().unwrap(),
        password: config::WIFI_PASSWORD.try_into().unwrap(),
        ..Default::default()
    });
    controller.set_configuration(&client).unwrap();
    controller.start().unwrap();
    println!("[wifi] conectando a «{}»…", config::WIFI_SSID);
    controller.connect().unwrap();
    while !stack.is_up() {
        esp_hal::delay::Delay::new().delay_millis(200);
    }
    println!("[wifi] online · ip {:?}", stack.ip());

    // ── El ciclo del agente (no regresa) ─────────────────────────────
    let device_state = state::load(seed);
    agent::run(&mut stack, &mut amoled, device_state)
}
