//! Estado compartido de la aplicación (Arc).

use crate::config::Config;
use crate::db::Db;
use crate::modules::mcp::McpClient;
use crate::r2::R2;

pub struct AppState {
    pub cfg: Config,
    pub db: Db,
    pub http: reqwest::Client,
    /// Cliente R2 si hay credenciales; None = solo archivo local.
    pub r2: Option<R2>,
    /// [ Medusa MCP ] cliente MCP remoto (siempre presente).
    pub mcp: McpClient,
    pub started_at: i64,
}

pub type SharedState = std::sync::Arc<AppState>;
