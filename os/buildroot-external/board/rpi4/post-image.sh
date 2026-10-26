#!/bin/sh
# post-image NomikOS (rpi4): copia los archivos de arranque y genera la
# imagen de la microSD (sdcard.img) con genimage.
#
# OJO: buildroot NO pasa el board dir como argumento (post-image recibe
# TARGET_DIR en $1 y BINARIES_DIR/CONFIG_DIR por entorno). El board dir
# se deriva de $0 — mismo patrón que post-build.sh.
set -e

BINARIES_DIR="${BINARIES_DIR:?post-image necesita BINARIES_DIR del entorno}"
BOARD_DIR="$(cd "$(dirname "$0")" && pwd)"

cp "$BOARD_DIR/config.txt" "$BOARD_DIR/cmdline.txt" "$BINARIES_DIR/"

support/scripts/genimage.sh -c "$BOARD_DIR/genimage.cfg"
