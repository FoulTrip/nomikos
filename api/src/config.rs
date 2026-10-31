//! Carga de configuración desde variables de entorno (+ `.env` opcional).

use std::collections::BTreeMap;

/// Lee el `.env` del directorio actual o el `.env` central de la raíz.
/// Las claves ya presentes en el entorno NO se sobreescriben.
fn load_dotenv() {
    let content = std::fs::read_to_string(".env").or_else(|_| std::fs::read_to_string("../.env"));
    let Ok(content) = content else {
        return;
    };
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        let key = k.trim();
        let mut value = v.trim().to_string();
        if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
            value = value[1..value.len() - 1].to_string();
        } else if value.len() >= 2 && value.starts_with('\'') && value.ends_with('\'') {
            value = value[1..value.len() - 1].to_string();
        }
        // Ignora comentarios en línea: `FOO=bar # nada`
        if let Some(pos) = value.find(" #") {
            value = value[..pos].trim().to_string();
        }
        if !key.is_empty() && std::env::var(key).is_err() {
            std::env::set_var(key, value);
        }
    }
}

fn env_str(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn env_opt(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(default)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObjectStoreBackend {
    LocalS3,
    CloudflareR2,
}

impl ObjectStoreBackend {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::LocalS3 => "local-s3",
            Self::CloudflareR2 => "r2",
        }
    }
}

/// S3-compatible object storage. Local Docker defaults to the RustFS service;
/// Cloudflare credentials are only read when OBJECT_STORE_BACKEND=r2.
#[derive(Debug, Clone)]
pub struct ObjectStoreConfig {
    pub backend: ObjectStoreBackend,
    pub endpoint_url: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub bucket: String,
    pub region: String,
    pub account_id: Option<String>,
    pub api_token: Option<String>,
}

impl ObjectStoreConfig {
    /// URL de la Cloudflare REST API para un objeto R2.
    /// https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/r2/objects/{bucket}/{key}
    pub fn cf_object_url(&self, key: &str) -> String {
        let encoded = key.replace('/', "%2F");
        format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/storage/r2/objects/{}/{}",
            self.account_id.as_deref().unwrap_or_default(),
            self.bucket,
            encoded
        )
    }

    pub fn endpoint_host(&self) -> String {
        let url = reqwest::Url::parse(&self.endpoint_url)
            .expect("OBJECT_STORE_ENDPOINT must be a valid URL");
        match url.port() {
            Some(port) => format!("{}:{port}", url.host_str().unwrap_or_default()),
            None => url.host_str().unwrap_or_default().to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub db_path: String,
    /// Intervalo del ciclo que sincroniza la DB con el estado real.
    pub sync_interval_secs: u64,

    /// [ Módulo Salud / ERP Avanzado ] — servidor Payload CMS (Kodetap → Payload).
    pub payload_url: String,
    /// Auth de la app (Payload): token fijo, o email+password con login
    /// automático (JWT cacheado). La política de acceso la decide la app.
    pub payload_token: Option<String>,
    pub payload_email: Option<String>,
    pub payload_password: Option<String>,
    /// [ NomikOS F5 — voz ] orquestador (brain) al que el worker pasa los
    /// turnos de voz/texto del dispositivo.
    pub brain_url: String,
    /// [ NomikOS F5 ] peaje de cada petición del agente a la app.
    pub x402_app_lamports: i64,
    /// [ NomikOS W6 — Faucet Devnet ] habilitado mientras exista un RPC Devnet,
    /// sin depender de la red activa de la cuenta ni de una treasury financiada.
    pub faucet_enabled: bool,
    /// [ Tienda de apps ] directorio con los manifiestos de las dapps
    /// (`<slug>.json` — catálogo + specs de tools). Ver dapps/README.md.
    pub dapps_registry: String,
    /// Script probado que instala una dapp localmente: `<script> <slug>
    /// <result.json>`. Lo ejecuta el worker al POST /api/apps/{slug}/install.
    pub app_install_script: String,

    /// [ Módulo Medusa MCP ] — servidor MCP remoto (Streamable HTTP).
    pub medusa_mcp_url: String,
    /// Token Bearer opcional si el servidor MCP lo exige (OAuth se hace
    /// interactivamente desde un cliente MCP).
    pub medusa_mcp_token: Option<String>,

    /// [ Módulo x402 Solana ]
    pub solana_network: String,
    /// local | devnet | testnet | mainnet → URL JSON-RPC.
    pub solana_urls: BTreeMap<String, String>,
    /// pubkey base58 o ruta a keypair; None = la del CLI local.
    pub solana_wallet: Option<String>,
    /// keypair que PAGA liquidaciones salientes (None = solo entrantes).
    pub payer_keypair: Option<String>,
    pub x402_payee: Option<String>,
    pub x402_settle_interval_secs: u64,
    pub x402_max_verify_attempts: u32,

    /// [ Fase 3 — Gateway 402 reactivo ] Paths protegidos por micro-peaje:
    /// sin X-Payment → 402 + invoice; con X-Payment settled de un solo uso
    /// → acceso. Separados por coma, matching exacto de path.
    pub x402_protected_paths: Vec<String>,
    /// Precio (lamports) de un acceso a un path protegido.
    pub x402_path_lamports: i64,
    /// [ NomikOS Fase 5 ] Precio (lamports) de UN MINUTO de llamada —
    /// cada minuto es una factura x402 que la cuenta paga por dPaaS.
    pub x402_call_lamports: i64,

    /// [ Dispositivo + object storage ]
    pub device_name: String,
    pub device_model_file: String,
    pub object_model_key: String,
    pub r2_public_base: Option<String>,
    pub object_store: Option<ObjectStoreConfig>,

    /// [ Cuentas / dPaaS ] Master key (32 bytes) para cifrar secretos de
    /// cuentas en reposo (API keys de proveedores, keypairs del orquestador).
    /// ACCOUNTS_MASTER_KEY = base64 de 32 bytes (`openssl rand -base64 32`).
    /// None = el servidor arranca, pero las operaciones que cifran fallan.
    pub accounts_master_key: Option<[u8; 32]>,

    /// [ Verificador legal S2 ] Solo el proceso api lee estos directorios.
    /// Brain/dapp/ui jamás tocan ground_truth (0600).
    pub verifier_enabled: bool,
    pub verifier_gt_dir: String,
    pub verifier_cases_dir: String,
    pub verifier_ui_port: u16,
    pub verifier_world_token: Option<String>,
}

impl Config {
    pub fn load() -> Self {
        load_dotenv();

        let solana_network = env_str("SOLANA_NETWORK", "devnet").to_lowercase();

        let solana_urls: BTreeMap<String, String> = [
            (
                "local",
                env_str("SOLANA_LOCAL_URL", "http://localhost:8899"),
            ),
            (
                "devnet",
                env_str("SOLANA_DEVNET_URL", "https://api.devnet.solana.com"),
            ),
            (
                "testnet",
                env_str("SOLANA_TESTNET_URL", "https://api.testnet.solana.com"),
            ),
            (
                "mainnet",
                env_str("SOLANA_MAINNET_URL", "https://api.mainnet.solana.com"),
            ),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.trim_end_matches('/').to_string()))
        .collect();

        let object_store_backend = env_str("OBJECT_STORE_BACKEND", "local").to_lowercase();
        let object_store = match object_store_backend.as_str() {
            "local" => Some(ObjectStoreConfig {
                backend: ObjectStoreBackend::LocalS3,
                endpoint_url: env_str("OBJECT_STORE_ENDPOINT", "http://localhost:9000")
                    .trim_end_matches('/')
                    .to_string(),
                access_key_id: env_str("OBJECT_STORE_ACCESS_KEY_ID", "nomikos-local"),
                secret_access_key: env_str(
                    "OBJECT_STORE_SECRET_ACCESS_KEY",
                    "nomikos-local-s3-secret",
                ),
                bucket: env_str("OBJECT_STORE_BUCKET", "nomikos-models"),
                region: env_str("OBJECT_STORE_REGION", "us-east-1"),
                account_id: None,
                api_token: None,
            }),
            "r2" => match (
                env_opt("R2_ACCOUNT_ID"),
                env_opt("R2_ACCESS_KEY_ID"),
                env_opt("R2_SECRET_ACCESS_KEY"),
                env_opt("R2_BUCKET"),
            ) {
                (Some(account_id), Some(access_key_id), Some(secret_access_key), Some(bucket)) => {
                    let endpoint_region = env_opt("R2_REGION");
                    let endpoint_host = endpoint_region
                        .map(|region| format!("{account_id}.{region}.r2.cloudflarestorage.com"))
                        .unwrap_or_else(|| format!("{account_id}.r2.cloudflarestorage.com"));
                    Some(ObjectStoreConfig {
                        backend: ObjectStoreBackend::CloudflareR2,
                        endpoint_url: format!("https://{endpoint_host}"),
                        access_key_id,
                        secret_access_key,
                        bucket,
                        region: "auto".to_string(),
                        account_id: Some(account_id),
                        api_token: env_opt("R2_API_TOKEN")
                            .or_else(|| env_opt("CLOUDFLARE_API_TOKEN")),
                    })
                }
                _ => None,
            },
            _ => None,
        };

        let faucet_enabled = solana_urls.get("devnet").is_some_and(|url| !url.is_empty());

        Self {
            host: env_str("AGENT_OS_API_HOST", "127.0.0.1"),
            port: env_str("AGENT_OS_API_PORT", "8080").parse().unwrap_or(8080),
            db_path: env_str("AGENT_OS_API_DB_PATH", "data/agent-os.db"),
            sync_interval_secs: env_u64("SYNC_INTERVAL_SECS", 10),
            payload_url: env_str("PAYLOAD_URL", "http://localhost:3000")
                .trim_end_matches('/')
                .to_string(),
            payload_token: env_opt("PAYLOAD_TOKEN"),
            payload_email: env_opt("PAYLOAD_EMAIL"),
            payload_password: env_opt("PAYLOAD_PASSWORD"),
            brain_url: env_str("BRAIN_URL", "http://localhost:8322")
                .trim_end_matches('/')
                .to_string(),
            x402_app_lamports: env_str("X402_APP_LAMPORTS", "1000").parse().unwrap_or(1000),
            faucet_enabled,
            dapps_registry: env_str("DAPPS_REGISTRY", "../dapps/registry"),
            app_install_script: env_str("APP_INSTALL_SCRIPT", "../scripts/install-app.sh"),
            medusa_mcp_url: env_str("MEDUSA_MCP_URL", "https://cloud.medusajs.com/mcp"),
            medusa_mcp_token: env_opt("MEDUSA_MCP_TOKEN"),
            solana_network,
            solana_urls,
            solana_wallet: env_opt("SOLANA_WALLET"),
            payer_keypair: env_opt("SOLANA_PAYER_KEYPAIR"),
            x402_payee: env_opt("X402_PAYEE_WALLET"),
            x402_settle_interval_secs: env_u64("X402_SETTLE_INTERVAL_SECS", 15),
            x402_max_verify_attempts: env_u64("X402_MAX_VERIFY_ATTEMPTS", 10) as u32,
            x402_protected_paths: std::env::var("X402_PROTECTED_PATHS")
                .unwrap_or_default()
                .split(',')
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect(),
            x402_path_lamports: env_str("X402_PATH_LAMPORTS", "1000")
                .parse()
                .unwrap_or(1000),
            x402_call_lamports: env_str("X402_CALL_LAMPORTS", "1000")
                .parse()
                .unwrap_or(1000),
            device_name: env_str("DEVICE_NAME", "ESP32-S3-Touch-AMOLED-1.43"),
            device_model_file: env_str(
                "DEVICE_MODEL_FILE",
                "../dapp/public/models/ESP32-S3-Touch-AMOLED-1.43.glb",
            ),
            object_model_key: env_str(
                "OBJECT_STORE_MODEL_KEY",
                &env_str("R2_MODEL_KEY", "models/ESP32-S3-Touch-AMOLED-1.43.glb"),
            ),
            r2_public_base: env_opt("R2_PUBLIC_URL_BASE")
                .map(|b| b.trim_end_matches('/').to_string()),
            object_store,
            accounts_master_key: load_master_key(),
            verifier_enabled: env_str("VERIFIER_ENABLED", "1") == "1",
            verifier_gt_dir: env_str("VERIFIER_GT_DIR", "../ground_truth"),
            verifier_cases_dir: env_str("VERIFIER_CASES_DIR", "../cases"),
            verifier_ui_port: env_str("VERIFIER_UI_PORT", "8765").parse().unwrap_or(8765),
            verifier_world_token: env_opt("VERIFIER_WORLD_TOKEN"),
        }
    }

    /// URL RPC de la red seleccionada (None si la red es desconocida).
    pub fn solana_url(&self) -> Option<&String> {
        self.solana_urls.get(&self.solana_network)
    }

    /// "devnet" → "Devnet" (etiqueta para el navbar).
    pub fn solana_network_label(&self) -> String {
        let mut chars = self.solana_network.chars();
        match chars.next() {
            Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            None => self.solana_network.clone(),
        }
    }
}

/// Carga ACCOUNTS_MASTER_KEY (base64 de 32 bytes). Si falta o es inválida,
/// devuelve None con warning: el servidor arranca, pero sellar/abrir secretos
/// de cuentas fallará con un error claro (no rompe el resto de la API).
fn load_master_key() -> Option<[u8; 32]> {
    use base64::Engine;
    let raw = env_opt("ACCOUNTS_MASTER_KEY")?;
    let trimmed = raw.trim();
    // Acepta base64 estándar o base64url (openssl usa estándar con padding).
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .or_else(|_| {
            base64::engine::general_purpose::URL_SAFE.decode(trimmed.trim_end_matches('='))
        });
    match decoded {
        Ok(bytes) if bytes.len() == 32 => {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            Some(key)
        }
        _ => {
            eprintln!("ACCOUNTS_MASTER_KEY inválida (se esperan 32 bytes en base64) — el cifrado de cuentas queda deshabilitado");
            None
        }
    }
}
