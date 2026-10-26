# ═══════════════════════════════════════════════════════════════════
# NomikOS — Makefile del monorepo (el front door)
#
#   make help      — todo lo que se puede hacer
#   make up        — prende el ecosistema completo (desde el .env raíz)
#   make image     — construye la imagen NomikOS para la placa (sdcard.img)
#   make flash     — la escribe a la microSD (make flash DISK=/dev/sdX)
#
# La placa NO lleva dapp/ ni brain/: esos viven en la PC. En la placa
# corren agentd (Rust), whisper/piper (voz) y el puente SIP.
# ═══════════════════════════════════════════════════════════════════

SHELL := /bin/bash
ROOT  := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
LOGS  := /tmp/nomikos
.DEFAULT_GOAL := help
.PHONY: help env secrets install up down status logs test test-smoke app-init \
        image flash esp32 esp32-flash clean

# ── puertos del ecosistema ──
P_API := 8080
P_BRAIN := 8322
P_STACK := 8321
P_OLLAMA := 11434
P_DAPP := 3000
P_APP := 3100

## ── CONFIGURACIÓN ─────────────────────────────────────────────────────

## env: sincroniza el .env central (raíz) a api/, brain/, dapp/ y la app local
env:
	@chmod +x "$(ROOT)/scripts/env-sync.sh" 2>/dev/null || true
	@"$(ROOT)/scripts/env-sync.sh"

## secrets: genera en .env los secretos que falten (openssl)
secrets:
	@cd "$(ROOT)" && for k in ACCOUNTS_MASTER_KEY AUTH_SECRET; do \
		grep -qE "^$$k=.+" .env || { V=$$(openssl rand -base64 32); \
			printf '%s=%s\n' "$$k" "$$V" >> .env; echo "  ✓ $$k generado"; }; \
	done; \
	grep -qE '^PAYLOAD_SECRET=.+' .env || { V=$$(openssl rand -hex 32); \
		printf 'PAYLOAD_SECRET=%s\n' "$$V" >> .env; echo "  ✓ PAYLOAD_SECRET generado"; }

## app-init: crea el primer usuario de la app local (EMAIL=… PASSWORD=…) y lo guarda en .env
app-init:
	@test -n "$(EMAIL)" && test -n "$(PASSWORD)" || { echo "uso: make app-init EMAIL=tucorreo@x.dev PASSWORD=secreto"; exit 2; }
	@curl -s -X POST http://localhost:$(P_APP)/api/users/first-register \
		-H 'Content-Type: application/json' \
		-d '{"email":"$(EMAIL)","password":"$(PASSWORD)"}' \
		-w '\nfirst-register → %{http_code}\n' | tail -2
	@cd "$(ROOT)" && { grep -qE '^PAYLOAD_EMAIL=.+' .env || \
		printf 'PAYLOAD_EMAIL=%s\nPAYLOAD_PASSWORD=%s\n' "$(EMAIL)" "$(PASSWORD)" >> .env; }
	@$(MAKE) --no-print-directory env

## ── INSTALACIÓN (una vez por máquina) ─────────────────────────────────

## install: dependencias + builds (api, venvs de brain, dapp, tests, ollama)
install:
	@cd "$(ROOT)/api" && cargo build
	@cd "$(ROOT)/brain" && [ -x .venv/bin/python ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; }
	@cd "$(ROOT)/brain" && [ -x .venv-stack/bin/llama ] || { echo "  (stack de NIM: make install-stack)"; }
	@cd "$(ROOT)/dapp" && [ -d node_modules ] || npm install
	@cd "$(ROOT)/tests" && [ -d node_modules ] || npm install
	@command -v ollama >/dev/null || { echo "⚠ instala ollama: curl -fsSL https://ollama.com/install.sh | sh"; exit 1; }
	@for m in llama-guard3:1b llama3.2:1b; do ollama list 2>/dev/null | grep -q "$$m" || ollama pull "$$m"; done
	@echo "install listo — make up"

## install-stack: venv de Llama Stack (NIM real para razonamiento fluido)
install-stack:
	@cd "$(ROOT)/brain" && { [ -x .venv-stack/bin/llama ] || \
		{ python3 -m venv .venv-stack && .venv-stack/bin/pip install -q llama-stack openai "mcp==1.23.0" chardet pypdf; }; }
	@echo "stack listo — pon NVIDIA_API_KEY en .env y make up"

## ── ECOSISTEMA LOCAL (la PC) ──────────────────────────────────────────

## up: sincroniza .env y prende TODO (api, brain, ollama, dapp, la app local)
up:
	@mkdir -p "$(LOGS)"
	@cd "$(ROOT)" && test -f .env || { echo "falta .env — cp .env.example .env && make secrets"; exit 1; }
	@$(MAKE) --no-print-directory env
	@echo "── arrancando (logs en $(LOGS)/):"
	@# ollama (shields Llama Guard + fallback LLM)
	@bash -c '(echo > /dev/tcp/localhost/$(P_OLLAMA)) 2>/dev/null || \
		{ nohup ollama serve > "$(LOGS)/ollama.log" 2>&1 & echo "  ↑ ollama :$(P_OLLAMA)"; }'
	@# api (binario ya compilado por make install)
	@test -x "$(ROOT)/api/target/debug/agent-os-api" || { $(MAKE) --no-print-directory install; }
	@bash -c '(echo > /dev/tcp/localhost/$(P_API)) 2>/dev/null || \
		{ cd "$(ROOT)/api" && nohup ./target/debug/agent-os-api > "$(LOGS)/api.log" 2>&1 & echo "  ↑ api :$(P_API)"; }'
	@# brain
	@bash -c '(echo > /dev/tcp/localhost/$(P_BRAIN)) 2>/dev/null || \
		{ cd "$(ROOT)/brain" && nohup .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port $(P_BRAIN) > "$(LOGS)/brain.log" 2>&1 & echo "  ↑ brain :$(P_BRAIN)"; }'
	@# llama stack (solo con key NIM viva y venv-stack)
	@bash -c 'grep -qE "^NVIDIA_API_KEY=." "$(ROOT)/.env" && [ -x "$(ROOT)/brain/.venv-stack/bin/llama" ] && \
		{ (echo > /dev/tcp/localhost/$(P_STACK)) 2>/dev/null || \
		{ cd "$(ROOT)/brain" && nohup ./scripts/stack-up.sh > "$(LOGS)/stack.log" 2>&1 & echo "  ↑ llama-stack :$(P_STACK)"; }; } || echo "  · stack: sin NVIDIA_API_KEY (brain usa ollama)"'
	@# la app local (Payload CMS u otra; ver dapps/README.md)
	@bash -c '[ -d "$(ROOT)/dapps/payload-cms/templates/with-cloudflare-d1" ] && \
		{ (echo > /dev/tcp/localhost/$(P_APP)) 2>/dev/null || \
		{ cd "$(ROOT)/dapps/payload-cms/templates/with-cloudflare-d1" && nohup pnpm dev --port $(P_APP) > "$(LOGS)/app.log" 2>&1 & echo "  ↑ app :$(P_APP)"; }; } || echo "  · app: dapps/ sin app local clonada"'
	@# dapp (SOLO local — en la placa no existe)
	@bash -c '(echo > /dev/tcp/localhost/$(P_DAPP)) 2>/dev/null || \
		{ cd "$(ROOT)/dapp" && nohup npm run dev > "$(LOGS)/dapp.log" 2>&1 & echo "  ↑ dapp :$(P_DAPP)"; }'
	@echo "── esperando salud de los servicios…"
	@bash -c 'ok=0; for p in $(P_OLLAMA) $(P_API) $(P_BRAIN) $(P_DAPP) $(P_APP); do \
		for i in $$(seq 1 60); do (echo > /dev/tcp/localhost/$$p) 2>/dev/null && { ok=1; break; }; sleep 1.5; done; \
		if [ $$ok -eq 1 ]; then echo "  ✓ :$$p listo"; else echo "  ✗ :$$p no respondió (revisa make logs svc=<api|brain|app|dapp>)"; fi; ok=0; done'
	@$(MAKE) --no-print-directory status

## down: apaga todo el ecosistema local
down:
	@for p in $(P_DAPP) $(P_APP) $(P_BRAIN) $(P_STACK) $(P_API); do fuser -k $$p/tcp 2>/dev/null && echo "  ↓ :$$p" || true; done
	@pkill -x agent-os-api 2>/dev/null || true; pkill -x ollama 2>/dev/null || true
	@echo "ecosistema apagado"

## status: salud de los servicios
status:
	@echo "── NomikOS:"
	@for p in "$(P_API)=api" "$(P_BRAIN)=brain" "$(P_STACK)=llama-stack" "$(P_OLLAMA)=ollama" "$(P_DAPP)=dapp" "$(P_APP)=app"; do \
		port="$${p%%=*}"; name="$${p##*=}"; \
		if (echo > /dev/tcp/localhost/$$port) 2>/dev/null; then printf "  ✓ :%-5s %s\n" "$$port" "$$name"; \
		else printf "  ✗ :%-5s %s (DOWN)\n" "$$port" "$$name"; fi; done
	@curl -sm3 http://localhost:$(P_API)/api/health -o /dev/null 2>/dev/null && echo "  ✓ api /health 200" || true
	@curl -sm3 http://localhost:$(P_BRAIN)/v1/health -o /dev/null 2>/dev/null && echo "  ✓ brain /v1/health 200" || true

## logs: tail de los logs del ecosistema (logs svc=api)
logs:
	@if [ -z "$(svc)" ]; then ls "$(LOGS)" 2>/dev/null; else tail -f "$(LOGS)/$(svc).log"; fi

## ── PRUEBAS ───────────────────────────────────────────────────────────

## test: batería rápida (contratos duros). make test suite=tests/13… para una sola
test:
	@cd "$(ROOT)/tests" && npm run test:e2e -- \
		tests/01.ecosystem.health.e2e.ts tests/02.api.idp.e2e.ts tests/03.api.cuenta.e2e.ts \
		tests/04.api.x402-gateway.e2e.ts tests/09.api.services-wallet.e2e.ts \
		tests/13.settlement.real-chain.e2e.ts tests/14.calls.sip-bridge.e2e.ts \
		$(suite)

## test-smoke: una sola vuelta de humo del gateway agéntico
test-smoke:
	@curl -s --max-time 120 -X POST http://localhost:$(P_BRAIN)/v1/agentic-gateway \
		-H 'Content-Type: application/json' -d '{"text":"estado de salud de la API"}' | head -c 400; echo

## ── LA PLACA (NomikOS en la Raspberry Pi 4) ────────────────────────────

BUILDROOT ?= $(HOME)/buildroot
OS_BUILD ?= $(HOME)/os-build

## image: construye la imagen NomikOS (sdcard.img) para la Pi4 — SIN dapp/brain (la placa no los lleva)
image:
	@test -d "$(BUILDROOT)/.git" || git clone --depth 1 https://gitlab.com/buildroot.org/buildroot.git "$(BUILDROOT)"
	@ln -sfn "$(ROOT)" "$(HOME)/os-ws"
	@cd "$(BUILDROOT)" && umask 0022 && \
		BR2_EXTERNAL="$(HOME)/os-ws/os/buildroot-external" \
		make O="$(OS_BUILD)" nomikos_rpi4_defconfig
	@cd "$(BUILDROOT)" && umask 0022 && \
		BR2_EXTERNAL="$(HOME)/os-ws/os/buildroot-external" \
		make O="$(OS_BUILD)" -j$$(nproc)
	@echo "═══ imagen lista: $(OS_BUILD)/images/sdcard.img ═══"
	@echo "flashea con: make flash DISK=/dev/sdX"

## flash: escribe sdcard.img a la microSD (¡BORRA EL DISCO!)
flash:
	@test -e "$(DISK)" || { echo "uso: make flash DISK=/dev/sdX (la microSD)"; exit 2; }
	@test -f "$(OS_BUILD)/images/sdcard.img" || { echo "primero: make image"; exit 2; }
	@echo "¡SE BORRARÁ $(DISK) COMPLETO! Continúa tú mismo:"; \
	echo "  sudo dd if=$(OS_BUILD)/images/sdcard.img of=$(DISK) bs=4M conv=fsync status=progress"

## ── ESP32-S3 (el AMOLED de la flota) ──────────────────────────────────

## esp32: compila el firmware del ESP32-S3 (SSID=… PASSWORD=… del WiFi)
esp32:
	@. "$(HOME)/export-esp.sh" 2>/dev/null || { echo "instala el toolchain: espup install --targets esp32s3"; exit 1; }; \
	cd "$(ROOT)/firmware/agentd-esp32" && SSID="$${SSID:-Nomikos}" PASSWORD="$${PASSWORD:-nomikos1234}" \
	cargo build --release
	@ls -lh "$(ROOT)/firmware/agentd-esp32/target/xtensa-esp32s3-none-elf/release/agentd-esp32" | awk '{print "binario:", $$5}'

## esp32-flash: flashea el ESP32 por USB (SSID=… PASSWORD=…)
esp32-flash:
	@. "$(HOME)/export-esp.sh" 2>/dev/null || { echo "instala el toolchain: espup install --targets esp32s3"; exit 1; }; \
	cd "$(ROOT)/firmware/agentd-esp32" && SSID="$${SSID:-Nomikos}" PASSWORD="$${PASSWORD:-nomikos1234}" \
	cargo flash

## ── LIMPIEZA ───────────────────────────────────────────────────────────

## clean: apaga el ecosistema y borra logs (no toca builds ni datos)
clean:
	@$(MAKE) --no-print-directory down || true
	@rm -rf "$(LOGS)" && echo "logs limpiados"

## help: esta lista
help:
	@awk '/^## / { d = substr($$0, 4); if (d ~ /^──/) { printf "\n%s\n", d } else { pend = d; sub(/^[a-zA-Z0-9-]+: /, "", pend) } next } /^[a-zA-Z0-9_-]+:/ { if (pend != "") { split($$0, a, ":"); printf "  make %-13s %s\n", a[1], pend; pend = "" } }' $(MAKEFILE_LIST)
