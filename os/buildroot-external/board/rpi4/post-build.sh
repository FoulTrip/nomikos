#!/bin/sh
# post-build NomikOS (rpi4): servicios de primera altura + stack de voz.
set -e
TARGET_DIR="${1:?}"

EXTERNAL="$(cd "$(dirname "$0")/../.." && pwd)"
VOICE_SRC="$EXTERNAL/../../os/voice"

enable() {
	# unidades del sistema → /usr/lib; unidades del overlay (agentd…) → /etc
	local src="/usr/lib/systemd/system/$1"
	[ -f "$TARGET_DIR$src" ] || src="/etc/systemd/system/$1"
	mkdir -p "$TARGET_DIR/etc/systemd/system/multi-user.target.wants"
	ln -sf "$src" "$TARGET_DIR/etc/systemd/system/multi-user.target.wants/$1"
}

enable systemd-networkd.service
enable systemd-resolved.service
enable agentd.service
enable dropbear.service

# hostname del dispositivo: nomikos-<4 últimos del serial>/MAC no es
# accesible aquí; usamos un nombre fijo editable en /etc/hostname.
echo "nomikos-rpi4" > "$TARGET_DIR/etc/hostname"

# ── [W1] Bucle de voz: script compartido + gate de emparejado ───────
install -D -m 0755 "$VOICE_SRC/voice-loop.sh" "$TARGET_DIR/usr/bin/voice-loop.sh"
chmod 0755 "$TARGET_DIR/usr/bin/wait-agent-token.sh" 2>/dev/null || true
enable agentd-voice.service

# ── [W1] piper prebuilt (aarch64) + modelos — todo con sha256 fijado ─
# (sin red o hash roto → la imagen sigue siendo válida, solo sin voz)
CACHE="${BASE_DIR:-/tmp}/dl-nomikos-extra"
mkdir -p "$CACHE"

fetch() { # fetch <url> <sha256> <nombre-cache> [destino]
	url="$1"; want="$2"; name="$3"; dest="$4"
	if [ ! -f "$CACHE/$name" ]; then
		echo "post-build: descargando $name…"
		if ! curl -qL --retry 3 -o "$CACHE/$name" "$url"; then
			echo "post-build: sin red → voz incompleta ($name)" >&2
			return 1
		fi
	fi
	if ! echo "$want  $CACHE/$name" | sha256sum -c - >/dev/null 2>&1; then
		echo "post-build: sha256 NO coincide ($name) — borra $CACHE/$name" >&2
		return 1
	fi
	if [ -n "$dest" ]; then
		cp "$CACHE/$name" "$dest"
	fi
	return 0
}

# piper portable (binario + libonnxruntime + espeak-ng-data)
if fetch \
	"https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_aarch64.tar.gz" \
	"fea0fd2d87c54dbc7078d0f878289f404bd4d6eea6e7444a77835d1537ab88eb" \
	"piper_linux_aarch64.tar.gz"
then
	mkdir -p "$TARGET_DIR/opt"
	tar -xzf "$CACHE/piper_linux_aarch64.tar.gz" -C "$TARGET_DIR/opt"
	chmod 0755 "$TARGET_DIR/opt/piper/piper" 2>/dev/null || true
fi

mkdir -p "$TARGET_DIR/opt/piper/voices" "$TARGET_DIR/usr/share/whisper"

# voz TTS es_ES (piper)
fetch \
	"https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx" \
	"40febfb1679c69a4505ff311dc136e121e3419a13a290ef264fdf43ddedd0fb1" \
	"es_ES-sharvard-medium.onnx" \
	"$TARGET_DIR/opt/piper/voices/es_ES-sharvard-medium.onnx" || true
fetch \
	"https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json" \
	"7438c9b699c72b0c3388dae1b68d3f364dc66a2150fe554a1c11f03372957b2c" \
	"es_ES-sharvard-medium.onnx.json" \
	"$TARGET_DIR/opt/piper/voices/es_ES-sharvard-medium.onnx.json" || true

# modelo STT ggml-base (whisper multilingüe)
fetch \
	"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" \
	"60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe" \
	"ggml-base.bin" \
	"$TARGET_DIR/usr/share/whisper/ggml-base.bin" || true

if [ -x "$TARGET_DIR/opt/piper/piper" ] && [ -f "$TARGET_DIR/usr/share/whisper/ggml-base.bin" ]; then
	echo "post-build: voz completa (piper + whisper-cli + modelos)"
else
	echo "post-build: voz PARCIAL — revisa las descargas de arriba" >&2
fi
