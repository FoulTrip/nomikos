//! Estado compartido de la aplicación (Arc).

use crate::config::Config;
use crate::db::Db;
use crate::modules::mcp::McpClient;
use crate::r2::ObjectStore;

pub struct AppState {
    pub cfg: Config,
    pub db: Db,
    pub http: reqwest::Client,
    /// Cliente S3 compatible (RustFS local o Cloudflare R2).
    pub object_store: Option<ObjectStore>,
    /// [ Medusa MCP ] cliente MCP remoto (siempre presente).
    pub mcp: McpClient,
    pub started_at: i64,
}

pub type SharedState = std::sync::Arc<AppState>;
