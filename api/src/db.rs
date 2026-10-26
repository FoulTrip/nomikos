//! SQLite (rusqlite, bundled): único origen de verdad del estado expuesto.
//!
//! Tablas:
//! - `device`          → nombre + metadatos del modelo 3D (R2)
//! - `device_specs`    → ficha técnica (seeds)
//! - `service_status`  → ERP (Medusa.js) y Solana sincronizados en background
//! - `x402_invoices`   → micro-peajes entrantes
//! - `x402_payouts`    → liquidaciones salientes en background

use rusqlite::params;
use serde::Serialize;
use std::sync::Mutex;

pub struct Db(pub Mutex<rusqlite::Connection>);

impl Db {
    pub fn open(path: &str, device_name: &str) -> rusqlite::Result<Self> {
        if let Some(parent) = std::path::Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        let conn = rusqlite::Connection::open(path)?;
        Self::schema(&conn)?;
        Self::seed(&conn, device_name);
        Ok(Self(Mutex::new(conn)))
    }

    /// Ejecuta un cierre con la conexión bloqueada (sin awaits dentro).
    pub fn with<T>(
        &self,
        f: impl FnOnce(&rusqlite::Connection) -> rusqlite::Result<T>,
    ) -> rusqlite::Result<T> {
        let conn = self.0.lock().expect("db lock envenenado");
        f(&conn)
    }

    fn schema(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;

             CREATE TABLE IF NOT EXISTS device (
                 id                INTEGER PRIMARY KEY CHECK (id = 1),
                 name              TEXT NOT NULL,
                 model_r2_key      TEXT,
                 model_size        INTEGER,
                 model_etag        TEXT,
                 model_public_url  TEXT,
                 updated_at        INTEGER NOT NULL
             );

             CREATE TABLE IF NOT EXISTS device_specs (
                 id        INTEGER PRIMARY KEY AUTOINCREMENT,
                 device_id INTEGER NOT NULL REFERENCES device(id),
                 slot      TEXT NOT NULL,
                 value     TEXT NOT NULL,
                 position  INTEGER NOT NULL,
                 UNIQUE (device_id, slot)
             );

             CREATE TABLE IF NOT EXISTS service_status (
                 id               TEXT PRIMARY KEY,        -- 'erp' | 'solana'
                 label            TEXT NOT NULL,
                 running          INTEGER NOT NULL DEFAULT 0,
                 network          TEXT,
                 endpoint         TEXT,
                 version          TEXT,
                 slot             INTEGER,
                 wallet           TEXT,
                 balance_lamports INTEGER,
                 detail           TEXT,
                 updated_at       INTEGER NOT NULL
             );

             CREATE TABLE IF NOT EXISTS x402_invoices (
                 id                  TEXT PRIMARY KEY,
                 resource            TEXT NOT NULL,
                 amount_lamports     INTEGER NOT NULL,
                 payee               TEXT NOT NULL,
                 status              TEXT NOT NULL,       -- pending|verifying|settled|failed
                 tx_signature        TEXT,
                 confirmation_status TEXT,
                 verify_attempts     INTEGER NOT NULL DEFAULT 0,
                 created_at          INTEGER NOT NULL,
                 updated_at          INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_invoices_status ON x402_invoices(status);

             CREATE TABLE IF NOT EXISTS x402_payouts (
                 id              TEXT PRIMARY KEY,
                 to_wallet       TEXT NOT NULL,
                 amount_lamports INTEGER NOT NULL,
                 memo            TEXT,
                 status          TEXT NOT NULL,           -- queued|sent|confirmed|failed
                 tx_signature    TEXT,
                 attempts        INTEGER NOT NULL DEFAULT 0,
                 error           TEXT,
                 created_at      INTEGER NOT NULL,
                 updated_at      INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_payouts_status ON x402_payouts(status);

             -- ── Gestión de cuentas (IdP email+password, dPaaS) ──
             CREATE TABLE IF NOT EXISTS accounts (
                 id            TEXT PRIMARY KEY,
                 email         TEXT UNIQUE NOT NULL,
                 password_hash TEXT NOT NULL,
                 display_name  TEXT,
                 is_active     INTEGER NOT NULL DEFAULT 1,
                 created_at    INTEGER NOT NULL,
                 updated_at    INTEGER NOT NULL
             );

             CREATE TABLE IF NOT EXISTS sessions (
                 token_hash TEXT PRIMARY KEY,
                 account_id TEXT NOT NULL REFERENCES accounts(id),
                 created_at INTEGER NOT NULL,
                 expires_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);

             -- LEGACY (fuente de migración — ver abajo): una sola fila LLM
             -- por cuenta. El esquema vivo es account_llm_providers.
             CREATE TABLE IF NOT EXISTS account_llm (
                 account_id    TEXT PRIMARY KEY REFERENCES accounts(id),
                 provider      TEXT NOT NULL,
                 base_url      TEXT NOT NULL,
                 api_key_enc   TEXT,
                 models        TEXT NOT NULL DEFAULT '[]',
                 default_model TEXT,
                 updated_at    INTEGER NOT NULL
             );

             CREATE TABLE IF NOT EXISTS account_chain (
                 account_id            TEXT PRIMARY KEY REFERENCES accounts(id),
                 network               TEXT NOT NULL DEFAULT 'devnet',
                 wallet_pubkey         TEXT,
                 payer_keypair_enc     TEXT,
                 payee                 TEXT,
                 daily_limit_lamports  INTEGER,
                 tx_limit_lamports     INTEGER,
                 updated_at            INTEGER NOT NULL
             );

             CREATE TABLE IF NOT EXISTS account_wallets (
                 id                   TEXT PRIMARY KEY,
                 account_id           TEXT NOT NULL REFERENCES accounts(id),
                 label                TEXT NOT NULL,
                 network              TEXT NOT NULL DEFAULT 'devnet',
                 pubkey               TEXT NOT NULL,
                 keypair_enc          TEXT NOT NULL,
                 daily_limit_lamports INTEGER,
                 created_at           INTEGER NOT NULL,
                 UNIQUE(account_id, label)
             );

             CREATE TABLE IF NOT EXISTS login_attempts (
                 id    INTEGER PRIMARY KEY AUTOINCREMENT,
                 email TEXT NOT NULL,
                 at    INTEGER NOT NULL,
                 ok    INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_login_attempts_email_at ON login_attempts(email, at);

             CREATE TABLE IF NOT EXISTS account_services (
                 id           TEXT PRIMARY KEY,
                 account_id   TEXT NOT NULL REFERENCES accounts(id),
                 service      TEXT NOT NULL,          -- 'medusa' (id del catálogo)
                 display_name TEXT NOT NULL,
                 via_x402     INTEGER NOT NULL DEFAULT 1,  -- TODO el flujo de la dapp usa x402
                 resource     TEXT NOT NULL,          -- patrón del peaje (x402:path:…)
                 payer_pubkey TEXT,                    -- snapshot del payer dPaaS al agregar
                 network      TEXT,                    -- snapshot de la red del agente
                 status       TEXT NOT NULL DEFAULT 'active',
                 created_at   INTEGER NOT NULL,
                 UNIQUE(account_id, service)
             );

             CREATE TABLE IF NOT EXISTS account_connected_wallets (
                 id         TEXT PRIMARY KEY,
                 account_id TEXT NOT NULL REFERENCES accounts(id),
                 label      TEXT NOT NULL,          -- 'Phantom · 1' (visible)
                 provider   TEXT NOT NULL,          -- phantom|solflare|backpack|metamask…
                 chain      TEXT NOT NULL,          -- solana | evm
                 pubkey     TEXT NOT NULL,          -- SOLO la pubkey: la clave privada nunca sale de la wallet
                 is_active  INTEGER NOT NULL DEFAULT 0,  -- la wallet en uso (una por cuenta)
                 created_at INTEGER NOT NULL,
                 UNIQUE(account_id, label)
             );

             CREATE TABLE IF NOT EXISTS devices (
                 id            TEXT PRIMARY KEY,          -- 'dev-…'
                 account_id    TEXT REFERENCES accounts(id), -- NULL hasta el claim (pareja con la cuenta)
                 name          TEXT NOT NULL,
                 board         TEXT NOT NULL,              -- esp32-s3-amoled-143 | rpi4 | …
                 pubkey        TEXT NOT NULL,              -- identidad ed25519 del dispositivo
                 claim_code    TEXT,                       -- código de emparejado (NULL tras claim)
                 claim_expires_at INTEGER,
                 enroll_secret_hash TEXT NOT NULL,        -- sha256: el dispositivo lo presenta para pedir su token
                 status        TEXT NOT NULL DEFAULT 'offline',
                 last_seen_at  INTEGER,
                 agent_version TEXT,
                 daily_limit_lamports INTEGER,             -- dPaaS por dispositivo
                 tx_limit_lamports INTEGER,
                 created_at    INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id);

             CREATE TABLE IF NOT EXISTS calls (
                 id              TEXT PRIMARY KEY,          -- 'call-…'
                 account_id      TEXT NOT NULL,
                 device_id       TEXT,                      -- origen: dispositivo de la flota (opcional)
                 destination     TEXT NOT NULL,             -- número / SIP URI
                 status          TEXT NOT NULL DEFAULT 'ringing',  -- ringing|active|ended
                 minutes_paid    INTEGER NOT NULL DEFAULT 0,
                 started_at      INTEGER,
                 ended_at        INTEGER,
                 created_at       INTEGER NOT NULL,
                 updated_at       INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_calls_account ON calls(account_id);

             CREATE TABLE IF NOT EXISTS apps (
                 slug            TEXT PRIMARY KEY,
                 name            TEXT NOT NULL,
                 description     TEXT,
                 version         TEXT,
                 status          TEXT NOT NULL DEFAULT 'available',
                 base_url        TEXT,
                 auth_enc        TEXT,
                 tools           TEXT NOT NULL DEFAULT '[]',
                 install_log     TEXT,
                 installed_at    INTEGER,
                 created_at      INTEGER NOT NULL,
                 updated_at      INTEGER NOT NULL
             );

             CREATE TABLE IF NOT EXISTS simulation_states (
                 account_id      TEXT PRIMARY KEY,
                 state           TEXT NOT NULL,
                 updated_at      INTEGER NOT NULL
             );",
        )?;

        // Migraciones para DBs ya existentes (idempotentes):
        // x402 pasa a ser multi-tenant con cuenta implícita "system".
        Self::add_column_if_missing(conn, "x402_invoices", "account_id", "TEXT DEFAULT 'system'")?;
        Self::add_column_if_missing(conn, "x402_payouts", "account_id", "TEXT DEFAULT 'system'")?;
        // Fase 3 — anti-replay del X-Payment: factura de un solo uso.
        Self::add_column_if_missing(conn, "x402_invoices", "consumed_at", "INTEGER")?;
        // Wallet operativa del agente: label de la sub-wallet seleccionada
        // (NULL → wallet principal del dPaaS). Modal del panel del dapp.
        Self::add_column_if_missing(conn, "account_chain", "active_wallet_label", "TEXT")?;
        // NomikOS Fase 1 — flota: facturas ligadas al dispositivo que las
        // provocó, y tokens de dispositivo (= sesiones con device_id).
        Self::add_column_if_missing(conn, "x402_invoices", "device_id", "TEXT")?;
        Self::add_column_if_missing(conn, "sessions", "device_id", "TEXT")?;
        // Multi-proveedor LLM por cuenta (un solo activo): la tabla vieja
        // account_llm (una fila por cuenta) migra a account_llm_providers.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS account_llm_providers (
                 account_id    TEXT NOT NULL REFERENCES accounts(id),
                 provider      TEXT NOT NULL,
                 base_url      TEXT NOT NULL,
                 api_key_enc   TEXT,
                 models        TEXT NOT NULL DEFAULT '[]',
                 default_model TEXT,
                 is_active     INTEGER NOT NULL DEFAULT 0,
                 updated_at    INTEGER NOT NULL,
                 PRIMARY KEY (account_id, provider)
             )",
            [],
        )?;
        conn.execute(
            "INSERT OR IGNORE INTO account_llm_providers \
             (account_id, provider, base_url, api_key_enc, models, default_model, is_active, updated_at) \
             SELECT account_id, provider, base_url, api_key_enc, models, default_model, 1, updated_at \
             FROM account_llm",
            [],
        )?;
        conn.execute("DROP TABLE IF EXISTS account_llm", [])?;
        // Wallets conectadas: una sola fila por (cuenta, provider, pubkey).
        // Limpia duplicados históricos (conservar la activa, si no la última)
        // y lo blinda con índice único: reconectar la misma wallet la
        // reactiva en vez de duplicarla.
        conn.execute(
            "DELETE FROM account_connected_wallets WHERE rowid NOT IN (
                 SELECT rowid FROM (
                   SELECT rowid, ROW_NUMBER() OVER (
                     PARTITION BY account_id, provider, pubkey
                     ORDER BY is_active DESC, rowid DESC
                   ) AS rn FROM account_connected_wallets
                 ) WHERE rn = 1
             )",
            [],
        )?;
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_connected_wallets_unique \
             ON account_connected_wallets (account_id, provider, pubkey)",
            [],
        )?;
        Ok(())
    }

    /// Migración idempotente: añade una columna si no existe (DBs ya creadas).
    fn add_column_if_missing(
        conn: &rusqlite::Connection,
        table: &str,
        column: &str,
        ddl: &str,
    ) -> rusqlite::Result<()> {
        let exists = conn
            .prepare(&format!("PRAGMA table_info({table})"))?
            .query_map([], |r| r.get::<_, String>(1))?
            .filter_map(Result::ok)
            .any(|name| name == column);
        if !exists {
            conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {ddl}"), [])?;
        }
        Ok(())
    }

    /// Semillas: dispositivo + ficha técnica.
    fn seed(conn: &rusqlite::Connection, device_name: &str) {
        let now = now_ms();
        let _ = conn.execute(
            "INSERT OR IGNORE INTO device (id, name, updated_at) VALUES (1, ?1, ?2)",
            params![device_name, now],
        );

        const SPECS: &[(&str, &str)] = &[
            ("Controlador", "ESP32-S3R8 · dual-core 240 MHz"),
            ("Pantalla", "AMOLED redonda 1.43\" · 466 × 466 px"),
            ("Táctil", "Capacitivo de 5 puntos"),
            ("Memoria", "16 MB Flash · 8 MB PSRAM"),
            ("Inalámbrico", "Wi\u{2011}Fi 2.4 GHz · BLE 5"),
            ("Extras", "microSD · SPI · I2C · RGB LED"),
        ];
        for (i, (slot, value)) in SPECS.iter().enumerate() {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO device_specs (device_id, slot, value, position)
                 VALUES (1, ?1, ?2, ?3)",
                params![slot, value, i as i64],
            );
        }
    }
}

// ---------------------------------------------------------------------------
// service_status
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct ServiceRow {
    pub id: String,
    pub label: String,
    pub running: bool,
    pub network: Option<String>,
    pub endpoint: Option<String>,
    pub version: Option<String>,
    pub slot: Option<i64>,
    pub wallet: Option<String>,
    pub balance_lamports: Option<i64>,
    pub detail: Option<String>,
    pub updated_at: i64,
}

const SERVICE_COLS: &str = "id, label, running, network, endpoint, version, slot, wallet, \
                            balance_lamports, detail, updated_at";

fn row_to_service(r: &rusqlite::Row<'_>) -> rusqlite::Result<ServiceRow> {
    Ok(ServiceRow {
        id: r.get(0)?,
        label: r.get(1)?,
        running: r.get::<_, i64>(2)? != 0,
        network: r.get(3)?,
        endpoint: r.get(4)?,
        version: r.get(5)?,
        slot: r.get(6)?,
        wallet: r.get(7)?,
        balance_lamports: r.get(8)?,
        detail: r.get(9)?,
        updated_at: r.get(10)?,
    })
}

impl Db {
    pub fn upsert_service(&self, s: &ServiceRow) -> rusqlite::Result<()> {
        self.with(|c| {
            c.execute(
                "INSERT INTO service_status (id, label, running, network, endpoint, version, slot, \
                 wallet, balance_lamports, detail, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(id) DO UPDATE SET
                    label = ?2, running = ?3, network = ?4, endpoint = ?5, version = ?6,
                    slot = ?7, wallet = ?8, balance_lamports = ?9, detail = ?10, updated_at = ?11",
                params![
                    s.id,
                    s.label,
                    s.running as i64,
                    s.network,
                    s.endpoint,
                    s.version,
                    s.slot,
                    s.wallet,
                    s.balance_lamports,
                    s.detail,
                    s.updated_at,
                ],
            )?;
            Ok(())
        })
    }

    pub fn get_service(&self, id: &str) -> rusqlite::Result<Option<ServiceRow>> {
        self.with(|c| {
            let sql = format!("SELECT {SERVICE_COLS} FROM service_status WHERE id = ?1");
            match c.query_row(&sql, params![id], row_to_service) {
                Ok(row) => Ok(Some(row)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(e),
            }
        })
    }
}

// ---------------------------------------------------------------------------
// device
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct DeviceRow {
    pub name: String,
    pub model_r2_key: Option<String>,
    pub model_size: Option<i64>,
    pub model_etag: Option<String>,
    pub model_public_url: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpecRow {
    pub slot: String,
    pub value: String,
}

impl Db {
    pub fn get_device(&self) -> rusqlite::Result<DeviceRow> {
        self.with(|c| {
            c.query_row(
                "SELECT name, model_r2_key, model_size, model_etag, model_public_url, updated_at
                 FROM device WHERE id = 1",
                [],
                |r| {
                    Ok(DeviceRow {
                        name: r.get(0)?,
                        model_r2_key: r.get(1)?,
                        model_size: r.get(2)?,
                        model_etag: r.get(3)?,
                        model_public_url: r.get(4)?,
                        updated_at: r.get(5)?,
                    })
                },
            )
        })
    }

    pub fn update_model(
        &self,
        r2_key: &str,
        size: i64,
        etag: Option<&str>,
        public_url: Option<&str>,
    ) -> rusqlite::Result<()> {
        self.with(|c| {
            c.execute(
                "UPDATE device SET model_r2_key = ?1, model_size = ?2, model_etag = ?3, \
                 model_public_url = ?4, updated_at = ?5 WHERE id = 1",
                params![r2_key, size, etag, public_url, now_ms()],
            )?;
            Ok(())
        })
    }

    pub fn list_specs(&self) -> rusqlite::Result<Vec<SpecRow>> {
        self.with(|c| {
            let mut stmt =
                c.prepare("SELECT slot, value FROM device_specs WHERE device_id = 1 ORDER BY position")?;
            let rows = stmt.query_map([], |r| Ok(SpecRow { slot: r.get(0)?, value: r.get(1)? }))?;
            rows.collect()
        })
    }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// ID corto legible: `x402-1731234567890-7`
pub fn new_id(prefix: &str) -> String {
    static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("{prefix}-{}-{n:x}", now_ms())
}
