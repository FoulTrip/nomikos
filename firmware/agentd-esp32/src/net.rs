//! net.rs — stack TCP blocking sobre smoltcp 0.12 (el glue que esp-wifi
//! ≥0.11 ya no trae). Un solo socket TCP reutilizado por petición
//! (connect → write → read → close), con buffers "leaked" una vez en el
//! arranque: sin DNS, destinos IPv4 literales (ver config.rs).

use core::net::Ipv4Addr;

use embedded_io::{ErrorType, Read, Write};
use smoltcp::{
    iface::{Interface, SocketHandle, SocketSet, SocketStorage},
    socket::tcp::Socket as TcpSocket,
    socket::dhcpv4::Socket as DhcpSocket,
    storage::RingBuffer,
    time::Instant,
    wire::{DhcpOption, IpAddress, IpEndpoint, Ipv4Address},
};

/// Reloj en ms para smoltcp (esp-hal time).
fn now_ms() -> u64 {
    esp_hal::time::now().duration_since_epoch().to_millis()
}

fn sleep_ms(ms: u32) {
    esp_hal::delay::Delay::new().delay_millis(ms);
}

/// Error de red (io in-band).
#[derive(Debug)]
pub struct NetError;
impl embedded_io::Error for NetError {
    fn kind(&self) -> embedded_io::ErrorKind {
        embedded_io::ErrorKind::Other
    }
}

pub struct Stack<'d> {
    interface: Interface,
    device: esp_wifi::wifi::WifiDevice<'d, esp_wifi::wifi::WifiStaDevice>,
    sockets: SocketSet<'static>,
    tcp: SocketHandle,
}

impl<'d> Stack<'d> {
    /// Stack: interfaz STA + DHCP (hostname «nomikos») + UN socket TCP
    /// reutilizable. `storage`, `rx` y `tx` deben venir "leaked" del
    /// caller (viven todo el programa: ver main.rs).
    pub fn new(
        interface: Interface,
        device: esp_wifi::wifi::WifiDevice<'d, esp_wifi::wifi::WifiStaDevice>,
        storage: &'static mut [SocketStorage<'static>],
        rx: &'static mut [u8],
        tx: &'static mut [u8],
    ) -> Self {
        let mut sockets = SocketSet::new(storage);
        let mut dhcp = DhcpSocket::new();
        dhcp.set_outgoing_options(&[DhcpOption { kind: 12, data: b"nomikos" }]);
        sockets.add(dhcp);
        let tcp = sockets.add(TcpSocket::new(RingBuffer::new(rx), RingBuffer::new(tx)));
        Self { interface, device, sockets, tcp }
    }

    /// Bombea la interfaz (llamar frecuente: entre esperas y lecturas).
    pub fn work(&mut self) {
        let Self { interface, device, sockets, .. } = self;
        let _ = interface.poll(Instant::from_millis(now_ms() as i64), device, sockets);
    }

    /// ¿Ya tenemos IPv4 del DHCP?
    pub fn is_up(&mut self) -> bool {
        self.work();
        self.interface.ipv4_addr().map(|a| !a.is_unspecified()).unwrap_or(false)
    }

    pub fn ip(&mut self) -> Option<Ipv4Addr> {
        self.work();
        // Ipv4Address → [u8; 4] (octetos) → core Ipv4Addr
        self.interface.ipv4_addr().map(|a| Ipv4Addr::from(a.octets()))
    }

    /// Conecta al destino (HTTP/1.1 con Connection: close por petición).
    pub fn connect(&mut self, ip: [u8; 4], port: u16) -> Result<(), NetError> {
        let remote = IpEndpoint {
            addr: IpAddress::Ipv4(Ipv4Address::from(Ipv4Addr::from(ip))),
            port,
        };
        let local_port = 40_000 + (now_ms() % 10_000) as u16;
        self.work();
        let Self { interface, sockets, .. } = self;
        let cx = interface.context();
        match sockets.get_mut::<TcpSocket>(self.tcp).connect(cx, remote, local_port) {
            Ok(()) => {}
            Err(_) => return Err(NetError),
        }
        for _ in 0..200 {
            self.work();
            let s = self.sockets.get_mut::<TcpSocket>(self.tcp);
            if s.can_send() {
                return Ok(());
            }
            if !s.is_active() {
                return Err(NetError);
            }
            sleep_ms(50);
        }
        Err(NetError)
    }

    /// Cierra el socket actual (deja que smoltcp mande el FIN).
    pub fn close(&mut self) {
        self.sockets.get_mut::<TcpSocket>(self.tcp).close();
        for _ in 0..20 {
            self.work();
            sleep_ms(10);
        }
    }
}

impl<'d> ErrorType for Stack<'d> {
    type Error = NetError;
}

impl<'d> Write for Stack<'d> {
    fn write(&mut self, buf: &[u8]) -> Result<usize, Self::Error> {
        let mut sent = 0;
        while sent < buf.len() {
            let mut spins = 0;
            loop {
                self.work();
                let s = self.sockets.get_mut::<TcpSocket>(self.tcp);
                if s.can_send() {
                    break;
                }
                spins += 1;
                if spins > 200 {
                    return Err(NetError);
                }
                sleep_ms(20);
            }
            let s = self.sockets.get_mut::<TcpSocket>(self.tcp);
            match s.send_slice(&buf[sent..]) {
                Ok(n) => sent += n,
                Err(_) => return Err(NetError),
            }
        }
        Ok(sent)
    }

    fn flush(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }
}

impl<'d> Read for Stack<'d> {
    /// Lee hasta datos disponibles o EOF del peer (Connection: close).
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, Self::Error> {
        for _ in 0..600 {
            self.work();
            let s = self.sockets.get_mut::<TcpSocket>(self.tcp);
            if s.can_recv() {
                match s.recv_slice(buf) {
                    Ok(n) => return Ok(n),
                    Err(_) => return Err(NetError),
                }
            }
            if !s.is_active() && !s.can_recv() {
                return Ok(0); // FIN del peer
            }
            sleep_ms(20);
        }
        Err(NetError)
    }
}
