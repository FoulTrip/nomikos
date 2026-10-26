-- Esquema D1 (SQLite de Cloudflare) para el OS del dispositivo.
-- Base: hackaton-meta-db
-- Aplicar:  npx wrangler d1 execute hackaton-meta-db --remote --file=scripts/d1-schema.sql

-- Mensajes del chat del OS (Muse) — persisten entre reinicios del contenedor
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  text TEXT NOT NULL,
  ts INTEGER NOT NULL,
  mode TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages (ts);

-- Estado general del OS (app activa, batería, modo IA…)
CREATE TABLE IF NOT EXISTS os_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
