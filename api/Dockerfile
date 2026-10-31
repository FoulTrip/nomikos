# Dockerfile para el api de NomikOS (Rust) — contexto = ./api
# Las credenciales NUNCA van horneadas: las inyecta docker compose desde
# el .env de la raíz (ver forwardToApi/compose).
FROM rust:1.88 AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      pkg-config libssl-dev ca-certificates && \
    rm -rf /var/lib/apt/lists/*
COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release && cp /app/target/release/agent-os-api /app/agent-os-api

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl sqlite3 && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/agent-os-api /usr/local/bin/agent-os-api
# runtime: el DB path default es data/agent-os.db (montar volumen si se
# quiere persistencia entre recreaciones del contenedor)
EXPOSE 8080
CMD ["agent-os-api"]
