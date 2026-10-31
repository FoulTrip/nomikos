# AGENTS.md — api/ (Rust)

Reglas de agente para la API Rust (fuente única de verdad). Complemento
imprescindible: [`context.md`](context.md).

## Reglas duras

1. **axum 0.8**: rutas con parámetros `{id}` (NO `:id`). Extractores: `State`,
   `Path`, `HeaderMap`, `Json`. Middleware con `axum::middleware::from_fn_with_state`.
2. **Errores SIEMPRE con `AppError`** (`src/error.rs`) → respuestas JSON
   `{"ok": false, "error": …}`. Variantes: `bad_request`, `not_found`,
   `unauthorized` (401), `forbidden` (403), `conflict` (409), `too_many_requests`
   (429), `unavailable` (503), `internal`. No inventar StatusCodes sueltos.
3. **Acceso a SQLite**: `state.db.with(|c| { … })` (bloquea la conexión; sin
   awaits dentro). Tablas nuevas/migraciones → `src/db.rs::schema()` con
   `Self::add_column_if_missing()` — idempotentes, nunca `ALTER TABLE` directos.
4. **IDs**: `db::new_id("<prefijo>")` (ej. `acc_`, `wlt`, `x402`, `payout`).
   Timestamps en ms: `db::now_ms()`.
5. **Secretos en reposo** (api_keys, keypairs): SOLO con `crypto::seal/open`
   (XChaCha20-Poly1305, `ACCOUNTS_MASTER_KEY`). NUNCA en plaintext, logs ni
   respuestas. Passwords: `crypto::hash_password`/`verify_password` (argon2id).
6. **Identidad**: extractor `AuthedAccount` (obligatorio) o
   `accounts::resolve_account_id(&state, &headers)` (opcional: `Ok(None)` =
   system, `Err(401)` = token inválido — NO se ignora).
7. **x402**: crear facturas con `x402::create_invoice_value_for(state,
   resource, amount, account_id_opt)`. Verificar X-Payment SOLO con
   `x402::settle_access()` (one-shot: consume `consumed_at`; replay → 409;
   ownership → 403). El middleware `x402_gate` tras validar hace
   `next.run(req)` — el recurso DEBE ejecutarse.
8. **dPaaS**: firmar con `solana::transfer_lamports_with_kp(client, &kp, …)`
   (keypair en memoria). `x402::resolve_payer` decide system vs cuenta
   (descifra + red de la cuenta). Validar SIEMPRE `check_limits` antes de firmar.
9. **SOLANA SIN SDK**: RPC JSON-RPC a mano (`SolanaClient`), firma ed25519 con
   `ed25519-dalek`, base58 en `b58.rs`, tx legacy en
   `solana::build_transfer_message`. No agregar crates de Solana.
10. **Object storage SIN SDK**: firma SigV4 a mano en `r2.rs` para RustFS local y
    R2. OJO: hashes hex **minúsculas** (`hex_string`), `x-amz-content-sha256`
    SIEMPRE presente y región SigV4 según backend. `device::get_model` descarga
    del bucket seleccionado; NO reintroducir fallback a archivo local.
11. **Logging**: `tracing` (`tracing::info/warn/error`). Sin `println!`.
    Nombres de módulo en el logger: `agent_os_api::<módulo>`.
12. **Compilar y probar antes de dar por buena una tarea**:
    `cargo build && cargo test` (15 tests deben pasar).

## Qué NO hacer

- No duplicar estado de negocio en brain/dapp: la verdad vive aquí.
- No commitear `.env` con credenciales reales (`.env.example` es la plantilla).
- No cambiar el nombre del binario (`Cargo.toml name = "agent-os-api"`) —
  rompe `Dockerfile` y scripts; el nombre de CARPETA es `api/`.
- No tocar `dapps/payload-cms/` desde aquí: el ERP se consulta vía HTTP
  (`PAYLOAD_URL`), módulo `modules/erp.rs`.
