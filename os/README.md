# NomikOS — Linux embebido para los dispositivos del ecosistema

> El **nivel B** del ecosistema (`docs/nomikos-design.md`): un Linux
> liviano (Buildroot + systemd) para SBCs con `agentd` corriendo como
> servicio — el mismo agente ya validado por `firmware/agentd-host`
> contra el api real.

```
os/
├── buildroot-external/        — árbol BR2_EXTERNAL "NOMIKOS"
│   ├── configs/nomikos_rpi4_defconfig   — placa soportada (RPi 4)
│   ├── package/agentd/                 — compila firmware/ (Rust, sin deps)
│   └── board/rpi4/
│       ├── rootfs-overlay/    — agentd.service, /etc/agentd/, networkd
│       ├── post-build.sh      — habilita servicios (systemd)
│       ├── post-image.sh      — genera la microSD (genimage)
│       └── genimage.cfg · config.txt · cmdline.txt
└── swupdate/nomikos.swdescription   — estructura del OTA (rootfs A/B)
```

## Construir la imagen

> **Regla #1 del workspace**: la ruta termina en ESPACIO y `make` no
> acepta `BR2_EXTERNAL` con espacios. Construye vía un symlink sin
> espacios:
>
> ```bash
> ln -sfn "/home/foultrip/Documentos/Hackaton " ~/os-ws
> # y usa BR2_EXTERNAL=~/os-ws/os/buildroot-external
> ```

```bash
# 1. Buildroot (una vez)
git clone --depth 1 https://gitlab.com/buildroot.org/buildroot.git
cd buildroot

# 2. Config NomikOS (reconoce el prefijo nomikos_ vía BR2_EXTERNAL)
make O=../os-build \
     BR2_EXTERNAL=~/os-ws/os/buildroot-external \
     nomikos_rpi4_defconfig

# 3. Imagen completa (primer build: 40–90 min — kernel + toolchain)
#    OJO: BR2_EXTERNAL va en CADA invocación de make (no se recuerda).
make O=../os-build \
     BR2_EXTERNAL=~/os-ws/os/buildroot-external \
     -j$(nproc)
# → os-build/images/sdcard.img   (escribir a la microSD con el Imager)
```

**Validado en este workspace**: el árbol externo se descubre
(`make list-defconfigs` → `nomikos_rpi4_defconfig`) y **el build
completo corre** (toolchain → kernel rpi-6.6.y → rootfs). Trampas
encontradas por el camino (todas corregidas en este árbol):

| Trampa | Síntoma | Cura |
|---|---|---|
| `BR2_EXTERNAL` se olvida entre invocaciones | `make` solo arranca con la variable EN CADA llamada (también vale exportarla) | `BR2_EXTERNAL=… make O=…` siempre |
| `include configs/*_defconfig` en external.mk | el include dispara el remake de los defconfigs con la regla `%_defconfig` → `Can't find <path completo>` | external.mk incluye `package/*/*.mk`, NUNCA los defconfigs (los descubre Buildroot) |
| `BR2_LINUX_KERNEL_CUSTOM_GIT_URL/_VERSION` | kconfig los ignora en silencio → descarga kernel.org mainline (sin `bcm2711_defconfig`) | los símbolos reales son `CUSTOM_REPO_URL` + `CUSTOM_REPO_VERSION` y hay que seleccionar `CUSTOM_GIT=y` |
| `KERNEL_HEADERS_AS_KERNEL` con toolchain interno | glibc necesita headers antes de existir el árbol del kernel → `expected 2.6.x, got 6.6.x` | `BR2_KERNEL_HEADERS_6_6=y` (familia del kernel) |
| `--release` en `CARGO_BUILD_OPTS` | la infra cargo-package ya lo pone → `cannot be used multiple times` | no repetirlo |
| `RUST_TARGET_NAME` en el install | no existe (expandió vacío → instaló el binario x86 del `target/` copiado del host) | la variable real es `$(RUSTC_TARGET_NAME)`; el check de arquitectura de Buildroot lo caza |
| post-image recibe `$1=TARGET_DIR` | `cp ${BOARD_DIR}/…` falla: no es el board dir | derivar el board dir de `$0` (como post-build) |
| genimage sin mkdosfs | `vfat(boot.vfat): failed to generate` | `BR2_PACKAGE_HOST_DOSFSTOOLS=y` + `BR2_PACKAGE_HOST_MTOOLS=y` junto a `HOST_GENIMAGE` |
| wants/ symlink a unidades del overlay | el enable de /usr/lib deja enlaces colgando (las unidades del overlay viven en /etc) | el enable() detecta /usr/lib vs /etc |
| `BR2_PACKAGE_BARESIP=y` | **baresip no existe en buildroot 2026.11** (removido upstream; kconfig tira la línea en silencio) | el puente SIP (W4) corre con cualquier binario en pipe mode (`AGENTD_SIP_CMD`); empaquetar baresip queda TODO |

## Primer arranque de la placa

1. Escribe `sdcard.img` en la microSD (Raspberry Pi Imager/Etcher).
2. Conecta ethernet + USB-serial (o HDMI) — DHCP automático.
3. La consola muestra el arranque y `agentd` imprime el **claim code**
   (`[enroll] CODIGO DE EMPAREJADO: XXXXXXXX`) — igual que el simulador.
4. Canjéalo en el panel del dapp: **📡 Flota → Emparejar**. El dispositivo
   queda ONLINE con su token y el ecosistema le cobra x402 por recurso.
5. Configura el api de tu LAN editando `/etc/agentd/agentd.conf` y
   `systemctl restart agentd` (por consola o SSH/dropbear, root/nomikos).

## Qué hay dentro

| Pieza | Detalle |
|---|---|
| Init | systemd (systemd-networkd + resolved; consola en `tty1` y `serial0`) |
| Agente | `/usr/bin/agentd` — Rust sin deps (workspace `firmware/`), estado en `/var/lib/agentd/`, `Restart=always` |
| Kernel | rpi-6.6.y con DTBs de la familia Pi 4/400/CM4 |
| Acceso | dropbear (SSH) + consola serial — sin entorno gráfico |
| Tamaño | rootfs ext4 + FAT de arranque 256 MB (imagen total ≈ 250–400 MB comprimida) |
| Voz (F5) | baresip + alsa en el defconfig; trunk SIP en /etc/baresip/accounts; la sesión y el peaje x402 por minuto viven en el api |
| OTA | estructura swupdate lista (`swupdate/nomikos.swdescription`); activar el paquete en el defconfig cuando se valide en hardware |

## Otras placas

Añade un defconfig + `board/<placa>/` nuevo (overlay + genimage) — el
paquete `agentd` y el servicio son comunes. El instalador del dapp
(Fase 2) ya lista las placas y sirve el artefacto por BSP.
