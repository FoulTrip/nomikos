# context.md — os/ (Fase 4)

**NomikOS** (antes "HackatOS" en el diseño): Linux embebido Buildroot
para SBCs del ecosistema — nivel B de `docs/nomikos-design.md`.

## Mapa del código

```
buildroot-external/        — árbol BR2_EXTERNAL "NOMIKOS"
├── external.desc|Config.in|external.mk   — registro del árbol + defconfigs
├── configs/nomikos_rpi4_defconfig        — RPi4 aarch64 · systemd · agentd
├── package/agentd/                       — infra cargo: compila
│        firmware/ (agentd-core+host) → /usr/bin/agentd (SITE relativo
│        ../../firmware — REQUIERE symlink sin espacios, regla #1)
└── board/rpi4/                          — overlay (agentd.service,
         /etc/agentd/agentd.conf, networkd), post-build (servicios),
         post-image + genimage.cfg (sdcard.img), config/cmdline.txt
swupdate/nomikos.swdescription            — estructura OTA rootfs (pendiente
                                            activar BR2_PACKAGE_SWUPDATE)
```

## Contratos clave

- El agente dentro de la imagen es el MISMO `firmware/agentd-host`
  (validado contra el api real): enroll → claim → token → heartbeat →
  peaje x402. Estado en `/var/lib/agentd/`, `Restart=always`,
  `EnvironmentFile=/etc/agentd/agentd.conf` (API de la LAN).
- Validado sin build completo: discovery (`list-defconfigs` →
  `nomikos_rpi4_defconfig`), carga del defconfig y resolución de
  `BR2_PACKAGE_AGENTD=y` + systemd networkd/resolved + genimage en .config.
- El build completo (~40–90 min) no se corre aquí: kernel rpi-6.6.y +
  toolchain Rust/glibc. Documentado en README con el patrón symlink
  (BR2_EXTERNAL no tolera la ruta con espacio del workspace).

## Regla del workspace que aplica SIEMPRE aquí

La ruta termina en espacio → todo `make` con `BR2_EXTERNAL` va vía
symlink sin espacios (`ln -s "…/Hackaton " ~/nomikos-ws`). El
`AGENTD_SITE` relativo (`../../firmware`) resuelve a través del symlink.
