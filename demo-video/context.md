This file is a merged representation of a subset of the codebase, containing specifically included files and files not matching ignore patterns, combined into a single document by Repomix.
The content has been processed where line numbers have been added.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: README.md, diagram.d2, AGENTS.md, Makefile, .env.example, api/context.md, api/AGENTS.md, api/src/api.rs, api/src/db.rs, api/src/modules/x402.rs, api/src/modules/accounts.rs, api/src/modules/solana.rs, brain/context.md, brain/AGENTS.md, brain/app/main.py, brain/app/tools.py, brain/app/x402.py, brain/app/llm.py, brain/app/shields.py, brain/app/context.py, dapp/context.md, demo-video/src/types.ts, demo-video/src/config/themes.ts, demo-video/package.json
- Files matching these patterns are excluded: dapps/**, **/node_modules/**, **/.venv*/**, **/target/**, **/out/**, **/dist/**, **/.next/**, api/data/**, **/*.mp4, **/*.mp3, **/*.glb, demo-video/context.md, demo-video/public/**
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Line numbers have been added to the beginning of each line
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
````
api/
  src/
    modules/
      accounts.rs
      solana.rs
      x402.rs
    api.rs
    db.rs
  AGENTS.md
  context.md
brain/
  app/
    context.py
    llm.py
    main.py
    shields.py
    tools.py
    x402.py
  AGENTS.md
  context.md
dapp/
  context.md
demo-video/
  src/
    config/
      themes.ts
    types.ts
  package.json
.env.example
AGENTS.md
diagram.d2
Makefile
README.md
````

# Files

## File: demo-video/src/config/themes.ts
````typescript
 1: // Skills visuales: un themeId en data.json cambia todo el look sin tocar componentes.
 2: 
 3: export interface VisualTheme {
 4:   id: string;
 5:   label: string;
 6:   colors: {
 7:     bg: string;
 8:     accent: string;
 9:     text: string;
10:     muted: string;
11:     border: string;
12:     glow: string;
13:     // Glow cromático por letra para DotsTitle (d, o, t, s)
14:     glowPerLetter?: [string, string, string, string];
15:   };
16:   textures: {
17:     overlay: 'noise' | 'grid' | 'dots' | 'felt' | 'none';
18:     blurAmount: string;
19:     noiseOpacity: number;
20:   };
21:   fonts: {
22:     code: string;
23:     heading: string;
24:     body: string;
25:   };
26: }
27: 
28: export const THEMES: Record<string, VisualTheme> = {
29:   dots_plush: {
30:     id: 'dots_plush',
31:     label: 'Dots Plush (hero negro + felt)',
32:     colors: {
33:       bg: '#000000',
34:       accent: '#14F195',
35:       text: '#FFFFFF',
36:       muted: 'rgba(255,255,255,0.72)',
37:       border: 'rgba(255,255,255,0.12)',
38:       glow: 'rgba(20,241,149,0.35)',
39:       glowPerLetter: ['#3B82F6', '#22C55E', '#F59E0B', '#E879F9'],
40:     },
41:     textures: { overlay: 'felt', blurAmount: '40px', noiseOpacity: 0.1 },
42:     fonts: {
43:       code: 'JetBrains Mono, monospace',
44:       heading: 'Nunito, Baloo 2, Inter, sans-serif',
45:       body: 'Inter, sans-serif',
46:     },
47:   },
48:   cyberpunk_dark: {
49:     id: 'cyberpunk_dark',
50:     label: 'Cyberpunk Dark (Solana)',
51:     colors: {
52:       bg: '#090d16',
53:       accent: '#14F195',
54:       text: '#F3F4F6',
55:       muted: 'rgba(243,244,246,0.7)',
56:       border: 'rgba(20,241,149,0.2)',
57:       glow: 'rgba(20,241,149,0.4)',
58:     },
59:     textures: { overlay: 'grid', blurAmount: '40px', noiseOpacity: 0.06 },
60:     fonts: {
61:       code: 'JetBrains Mono, monospace',
62:       heading: 'Inter, sans-serif',
63:       body: 'Inter, sans-serif',
64:     },
65:   },
66:   claude_matte: {
67:     id: 'claude_matte',
68:     label: 'Claude Matte (estudio claro)',
69:     colors: {
70:       bg: '#E8E4DC',
71:       accent: '#D97757',
72:       text: '#1A1A1A',
73:       muted: 'rgba(26,26,26,0.68)',
74:       border: 'rgba(26,26,26,0.12)',
75:       glow: 'rgba(217,119,87,0.3)',
76:     },
77:     textures: { overlay: 'dots', blurAmount: '60px', noiseOpacity: 0.05 },
78:     fonts: {
79:       code: 'Fira Code, monospace',
80:       heading: 'Inter, sans-serif',
81:       body: 'Inter, sans-serif',
82:     },
83:   },
84: };
85: 
86: export const getTheme = (id: string): VisualTheme =>
87:   THEMES[id] ?? THEMES.dots_plush;
````

## File: demo-video/src/types.ts
````typescript
 1: import { z } from 'zod';
 2: 
 3: // Acción visual por escena. El renderer elige componente según esto.
 4: export const SceneActionType = z.enum([
 5:   'hero_dots',
 6:   'terminal',
 7:   'diagram',
 8:   'solana_tx',
 9:   'fleet_map',
10:   'voice_loop',
11:   'outro_cta',
12: ]);
13: export type SceneActionType = z.infer<typeof SceneActionType>;
14: 
15: export const CodeLanguage = z.enum(['rust', 'python', 'typescript', 'bash']);
16: export type CodeLanguage = z.infer<typeof CodeLanguage>;
17: 
18: export const SceneSchema = z.object({
19:   id: z.string().min(1),
20:   durationInFrames: z.number().int().positive(),
21:   narrationText: z.string().min(1),
22:   // Ruta relativa a public/, ej: "audio/scene-01.mp3". Si falta, la escena es muda.
23:   audioFile: z.string().optional(),
24:   codeSnippet: z.string().optional(),
25:   codeLanguage: CodeLanguage.optional(),
26:   // 402, 200, 409... para TxCard/diagramas x402
27:   httpStatus: z.number().int().optional(),
28:   actionType: SceneActionType,
29: });
30: export type Scene = z.infer<typeof SceneSchema>;
31: 
32: export const VideoPropsSchema = z.object({
33:   title: z.string(),
34:   subtitle: z.string(),
35:   themeId: z.string(),
36:   scenes: z.array(SceneSchema).min(1),
37: });
38: export type VideoProps = z.infer<typeof VideoPropsSchema>;
39: 
40: export const totalFrames = (props: VideoProps): number =>
41:   props.scenes.reduce((acc, s) => acc + s.durationInFrames, 0);
````

## File: demo-video/package.json
````json
 1: {
 2:   "name": "nomikos-demo-video",
 3:   "version": "0.1.0",
 4:   "private": true,
 5:   "type": "module",
 6:   "scripts": {
 7:     "repomix": "repomix --config repomix.config.json",
 8:     "generate:script": "python3 scripts/generate-script.py",
 9:     "generate:tts": "python3 scripts/generate-tts.py",
10:     "preview": "remotion preview",
11:     "render:16x9": "remotion render HackathonDemo out/demo_16x9.mp4 --props=src/config/data.json",
12:     "render:9x16": "remotion render HackathonShort out/demo_9x16.mp4 --props=src/config/data.json",
13:     "typecheck": "tsc --noEmit"
14:   },
15:   "dependencies": {
16:     "@react-three/drei": "^10.0.0",
17:     "@react-three/fiber": "^9.0.0",
18:     "@remotion/captions": "4.0.538",
19:     "@remotion/cli": "4.0.538",
20:     "@remotion/effects": "4.0.538",
21:     "@remotion/google-fonts": "4.0.538",
22:     "@remotion/layout-utils": "4.0.538",
23:     "@remotion/media-utils": "4.0.538",
24:     "@remotion/paths": "4.0.538",
25:     "@remotion/shapes": "4.0.538",
26:     "@remotion/three": "4.0.538",
27:     "@types/three": "^0.170.0",
28:     "lucide-react": "^0.460.0",
29:     "react": "^19.0.0",
30:     "react-dom": "^19.0.0",
31:     "remotion": "4.0.538",
32:     "three": "^0.170.0",
33:     "zod": "^3.23.8"
34:   },
35:   "devDependencies": {
36:     "@types/node": "^22.0.0",
37:     "@types/react": "^19.0.0",
38:     "typescript": "^5.6.0"
39:   }
40: }
````

## File: api/src/modules/accounts.rs
````rust
   1: //! [ Gestión de Cuentas — IdP + dPaaS ]
   2: //!
   3: //! Cada cuenta (email + password) encapsula el contexto de su orquestador:
   4: //!  - `account_llm`:   proveedor y modelos a usar (api_key cifrada en reposo)
   5: //!  - `account_chain`: red y wallet del orquestador (keypair cifrado → dPaaS)
   6: //!  - `account_wallets`: sub-wallets por propósito (App 00..N del diagrama)
   7: //!
   8: //! Flujo del diagrama: el orquestador (brain) consulta identidad
   9: //! (`GET /api/accounts/me/context`) con su Bearer y resuelve TODO su
  10: //! contexto sin secretos globales.
  11: //!
  12: //! Seguridad:
  13: //!  - passwords: argon2id (PHC); tokens opacos de 32 bytes (solo sha256 en DB)
  14: //!  - api_keys / keypairs: XChaCha20-Poly1305 con ACCOUNTS_MASTER_KEY
  15: //!  - anti-bruteforce: 5 intentos fallidos por email → 429 (60s)
  16: 
  17: use crate::crypto;
  18: use crate::db::{new_id, now_ms};
  19: use crate::error::{AppError, AppResult};
  20: use crate::state::SharedState;
  21: use axum::extract::{FromRequestParts, State};
  22: use axum::http::request::Parts;
  23: use axum::http::{HeaderMap, StatusCode};
  24: use axum::response::{IntoResponse, Response};
  25: use axum::Json;
  26: use rusqlite::params;
  27: use serde::Deserialize;
  28: use serde_json::{json, Value};
  29: 
  30: const SESSION_TTL_SECS: i64 = 7 * 24 * 3600; // 7 días
  31: const LOGIN_WINDOW_MS: i64 = 60_000; // ventana anti-bruteforce
  32: const LOGIN_MAX_FAILS: i64 = 5;
  33: 
  34: /// Proveedores LLM soportados por cuenta.
  35: const PROVIDERS: &[&str] = &["nvidia-nim", "openai", "muse", "llama-stack", "custom"];
  36: const NETWORKS: &[&str] = &["local", "devnet", "testnet", "mainnet"];
  37: 
  38: fn default_base_url(provider: &str) -> &'static str {
  39:     match provider {
  40:         "nvidia-nim" => "https://integrate.api.nvidia.com/v1",
  41:         "openai" => "https://api.openai.com/v1",
  42:         "llama-stack" => "http://localhost:8321/v1",
  43:         _ => "",
  44:     }
  45: }
  46: 
  47: fn valid_email(email: &str) -> bool {
  48:     let email = email.trim();
  49:     if email.len() < 5 || email.len() > 254 {
  50:         return false;
  51:     }
  52:     let Some((local, domain)) = email.split_once('@') else { return false };
  53:     !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
  54: }
  55: 
  56: // ---------------------------------------------------------------------------
  57: // Extractor de autenticación: Authorization: Bearer <token>
  58: // ---------------------------------------------------------------------------
  59: 
  60: pub struct AuthedAccount {
  61:     pub account_id: String,
  62: }
  63: 
  64: impl FromRequestParts<SharedState> for AuthedAccount {
  65:     type Rejection = AppError;
  66: 
  67:     async fn from_request_parts(
  68:         parts: &mut Parts,
  69:         state: &SharedState,
  70:     ) -> Result<Self, Self::Rejection> {
  71:         let header = parts
  72:             .headers
  73:             .get(axum::http::header::AUTHORIZATION)
  74:             .and_then(|v| v.to_str().ok())
  75:             .ok_or_else(|| AppError::unauthorized("falta header Authorization: Bearer <token>"))?;
  76:         let token = header
  77:             .strip_prefix("Bearer ")
  78:             .map(str::trim)
  79:             .filter(|t| !t.is_empty())
  80:             .ok_or_else(|| AppError::unauthorized("Authorization debe ser: Bearer <token>"))?;
  81: 
  82:         let hash = crypto::sha256_hex(token.as_bytes());
  83:         let account_id: String = state
  84:             .db
  85:             .with(|c| {
  86:                 c.query_row(
  87:                     "SELECT a.id FROM sessions s JOIN accounts a ON a.id = s.account_id \
  88:                      WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND a.is_active = 1",
  89:                     params![hash, now_ms()],
  90:                     |r| r.get(0),
  91:                 )
  92:             })
  93:             .map_err(|_| AppError::unauthorized("sesión inválida o expirada"))?;
  94:         Ok(AuthedAccount { account_id })
  95:     }
  96: }
  97: 
  98: /// Recupera el hash del token desde el header (para logout).
  99: fn token_hash_of(headers: &HeaderMap) -> AppResult<String> {
 100:     let header = headers
 101:         .get(axum::http::header::AUTHORIZATION)
 102:         .and_then(|v| v.to_str().ok())
 103:         .ok_or_else(|| AppError::unauthorized("falta header Authorization"))?;
 104:     let token = header
 105:         .strip_prefix("Bearer ")
 106:         .map(str::trim)
 107:         .filter(|t| !t.is_empty())
 108:         .ok_or_else(|| AppError::unauthorized("Authorization debe ser: Bearer <token>"))?;
 109:     Ok(crypto::sha256_hex(token.as_bytes()))
 110: }
 111: 
 112: /// Identidad opcional para el gateway 402 y handlers multi-tenant:
 113: /// - `Ok(None)`: no viene Authorization → cuenta implícita "system".
 114: /// - `Ok(Some(id))`: sesión válida → cuenta autenticada.
 115: /// - `Err(401)`: viene un token pero es inválido/expirado (no se ignora).
 116: pub fn resolve_account_id(state: &SharedState, headers: &HeaderMap) -> AppResult<Option<String>> {
 117:     let Some(header) = headers
 118:         .get(axum::http::header::AUTHORIZATION)
 119:         .and_then(|v| v.to_str().ok())
 120:     else {
 121:         return Ok(None);
 122:     };
 123:     let Some(token) = header
 124:         .strip_prefix("Bearer ")
 125:         .map(str::trim)
 126:         .filter(|t| !t.is_empty())
 127:     else {
 128:         return Err(AppError::unauthorized("Authorization debe ser: Bearer <token>"));
 129:     };
 130:     let hash = crypto::sha256_hex(token.as_bytes());
 131:     let account_id: Option<String> = state
 132:         .db
 133:         .with(|c| {
 134:             let mut stmt = c.prepare(
 135:                 "SELECT a.id FROM sessions s JOIN accounts a ON a.id = s.account_id \
 136:                  WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND a.is_active = 1",
 137:             )?;
 138:             let mut rows = stmt.query_map(params![hash, now_ms()], |r| r.get::<_, String>(0))?;
 139:             Ok(rows.next().transpose()?)
 140:         })
 141:         .map_err(|_| AppError::unauthorized("sesión inválida o expirada"))?;
 142:     account_id.map(Some).ok_or_else(|| AppError::unauthorized("sesión inválida o expirada"))
 143: }
 144: 
 145: pub fn master_key_of(state: &SharedState) -> AppResult<[u8; 32]> {
 146:     state
 147:         .cfg
 148:         .accounts_master_key
 149:         .ok_or_else(|| {
 150:             AppError::unavailable(
 151:                 "ACCOUNTS_MASTER_KEY no configurada (genera con: openssl rand -base64 32)",
 152:             )
 153:         })
 154: }
 155: 
 156: // ---------------------------------------------------------------------------
 157: // Handlers: Auth
 158: // ---------------------------------------------------------------------------
 159: 
 160: #[derive(Deserialize)]
 161: pub struct RegisterBody {
 162:     email: String,
 163:     password: String,
 164:     display_name: Option<String>,
 165: }
 166: 
 167: pub async fn register_handler(
 168:     State(state): State<SharedState>,
 169:     Json(body): Json<RegisterBody>,
 170: ) -> AppResult<Response> {
 171:     let email = body.email.trim().to_lowercase();
 172:     if !valid_email(&email) {
 173:         return Err(AppError::bad_request("email inválido"));
 174:     }
 175:     if body.password.len() < 8 {
 176:         return Err(AppError::bad_request("password: mínimo 8 caracteres"));
 177:     }
 178: 
 179:     let phc = crypto::hash_password(&body.password)?;
 180:     let id = new_id("acc");
 181:     let now = now_ms();
 182: 
 183:     let inserted = state.db.with(|c| {
 184:         c.execute(
 185:             "INSERT INTO accounts (id, email, password_hash, display_name, created_at, updated_at) \
 186:              VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
 187:             params![id, email, phc, body.display_name, now],
 188:         )?;
 189:         Ok(())
 190:     });
 191:     if let Err(rusqlite::Error::SqliteFailure(e, _)) = &inserted {
 192:         if e.code == rusqlite::ErrorCode::ConstraintViolation {
 193:             return Err(AppError::conflict("email ya registrado"));
 194:         }
 195:     }
 196:     inserted?;
 197: 
 198:     tracing::info!("cuenta registrada: {id} ({email})");
 199:     Ok((
 200:         StatusCode::CREATED,
 201:         Json(json!({ "ok": true, "account_id": id, "email": email })),
 202:     )
 203:         .into_response())
 204: }
 205: 
 206: #[derive(Deserialize)]
 207: pub struct LoginBody {
 208:     email: String,
 209:     password: String,
 210: }
 211: 
 212: pub async fn login_handler(
 213:     State(state): State<SharedState>,
 214:     Json(body): Json<LoginBody>,
 215: ) -> AppResult<Response> {
 216:     let email = body.email.trim().to_lowercase();
 217:     let now = now_ms();
 218: 
 219:     // Anti-bruteforce: ≥5 fallos en el último minuto → 429.
 220:     let fails: i64 = state
 221:         .db
 222:         .with(|c| {
 223:             c.query_row(
 224:                 "SELECT COUNT(*) FROM login_attempts WHERE email = ?1 AND ok = 0 AND at > ?2",
 225:                 params![email, now - LOGIN_WINDOW_MS],
 226:                 |r| r.get(0),
 227:             )
 228:         })
 229:         .unwrap_or(0);
 230:     if fails >= LOGIN_MAX_FAILS {
 231:         return Err(AppError::too_many_requests(
 232:             "demasiados intentos fallidos; espera un minuto",
 233:         ));
 234:     }
 235: 
 236:     // Limpieza oportunista de intentos viejos (>1h).
 237:     let _ = state.db.with(|c| {
 238:         c.execute("DELETE FROM login_attempts WHERE at < ?1", params![now - 3_600_000])?;
 239:         Ok(())
 240:     });
 241: 
 242:     let row = state.db.with(|c| {
 243:         c.query_row(
 244:             "SELECT id, password_hash, is_active FROM accounts WHERE email = ?1",
 245:             params![email],
 246:             |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)),
 247:         )
 248:     });
 249: 
 250:     let (account_id, ok) = match row {
 251:         Ok((id, phc, active)) => {
 252:             let ok = active == 1 && crypto::verify_password(&body.password, &phc);
 253:             (id, ok)
 254:         }
 255:         Err(_) => {
 256:             // Timing igualitario: verificamos igual contra un hash dummy.
 257:             let _ = crypto::verify_password(&body.password, "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
 258:             (String::new(), false)
 259:         }
 260:     };
 261:     let _ = state.db.with(|c| {
 262:         c.execute(
 263:             "INSERT INTO login_attempts (email, at, ok) VALUES (?1, ?2, ?3)",
 264:             params![email, now, ok as i64],
 265:         )?;
 266:         Ok(())
 267:     });
 268:     if !ok {
 269:         return Err(AppError::unauthorized("email o password incorrectos"));
 270:     }
 271: 
 272:     let (token, token_hash) = crypto::new_session_token();
 273:     let expires_at = now + SESSION_TTL_SECS * 1000;
 274:     state.db.with(|c| {
 275:         c.execute(
 276:             "INSERT INTO sessions (token_hash, account_id, created_at, expires_at) \
 277:              VALUES (?1, ?2, ?3, ?4)",
 278:             params![token_hash, account_id, now, expires_at],
 279:         )?;
 280:         Ok(())
 281:     })?;
 282: 
 283:     tracing::info!("login OK: {account_id} ({email})");
 284:     Ok(Json(json!({
 285:         "ok": true,
 286:         "account_id": account_id,
 287:         "token": token,
 288:         "token_type": "Bearer",
 289:         "expires_at": expires_at,
 290:     }))
 291:     .into_response())
 292: }
 293: 
 294: pub async fn logout_handler(
 295:     State(state): State<SharedState>,
 296:     _auth: AuthedAccount,
 297:     headers: HeaderMap,
 298: ) -> AppResult<Response> {
 299:     let hash = token_hash_of(&headers)?;
 300:     state.db.with(|c| {
 301:         c.execute("DELETE FROM sessions WHERE token_hash = ?1", params![hash])?;
 302:         Ok(())
 303:     })?;
 304:     Ok(Json(json!({ "ok": true, "revoked": true })).into_response())
 305: }
 306: 
 307: /// Lista de proveedores LLM de la cuenta para la UI (SIN secretos).
 308: /// El agente usa solo el de `is_active = 1`.
 309: pub(crate) fn llm_providers_list(state: &SharedState, account_id: &str) -> Vec<Value> {
 310:     state
 311:         .db
 312:         .with(|c| {
 313:             let mut stmt = c.prepare(
 314:                 "SELECT provider, base_url, models, default_model, \
 315:                  api_key_enc IS NOT NULL, is_active \
 316:                  FROM account_llm_providers WHERE account_id = ?1 ORDER BY provider",
 317:             )?;
 318:             let rows = stmt.query_map(params![account_id], |r| {
 319:                 let models: Value =
 320:                     serde_json::from_str(&r.get::<_, String>(2)?).unwrap_or(json!([]));
 321:                 Ok(json!({
 322:                     "provider": r.get::<_, String>(0)?,
 323:                     "base_url": r.get::<_, String>(1)?,
 324:                     "models": models,
 325:                     "default_model": r.get::<_, Option<String>>(3)?,
 326:                     "has_key": r.get::<_, i64>(4)? != 0,
 327:                     "is_active": r.get::<_, i64>(5)? != 0,
 328:                 }))
 329:             })?;
 330:             Ok(rows.collect::<Result<Vec<_>, _>>()?)
 331:         })
 332:         .unwrap_or_default()
 333: }
 334: 
 335: /// GET /api/auth/me — perfil + qué está configurado (sin secretos).
 336: pub async fn me_handler(
 337:     State(state): State<SharedState>,
 338:     auth: AuthedAccount,
 339: ) -> AppResult<Response> {
 340:     let account = state.db.with(|c| {
 341:         c.query_row(
 342:             "SELECT id, email, display_name, is_active, created_at FROM accounts WHERE id = ?1",
 343:             params![auth.account_id],
 344:             |r| {
 345:                 Ok(json!({
 346:                     "id": r.get::<_, String>(0)?,
 347:                     "email": r.get::<_, String>(1)?,
 348:                     "display_name": r.get::<_, Option<String>>(2)?,
 349:                     "is_active": r.get::<_, i64>(3)? != 0,
 350:                     "created_at": r.get::<_, i64>(4)?,
 351:                 }))
 352:             },
 353:         )
 354:     })?;
 355:     let providers = llm_providers_list(&state, &auth.account_id);
 356:     let llm: Option<Value> = providers
 357:         .iter()
 358:         .find(|p| p["is_active"].as_bool().unwrap_or(false))
 359:         .map(|p| {
 360:             json!({
 361:                 "provider": p["provider"],
 362:                 "models": p["models"],
 363:                 "default_model": p["default_model"],
 364:             })
 365:         });
 366:     let chain: Option<Value> = state.db.with(|c| {
 367:         c.query_row(
 368:             "SELECT network, wallet_pubkey, payee, daily_limit_lamports, tx_limit_lamports, \
 369:              payer_keypair_enc IS NOT NULL FROM account_chain WHERE account_id = ?1",
 370:             params![auth.account_id],
 371:             |r| {
 372:                 Ok(json!({
 373:                     "network": r.get::<_, String>(0)?,
 374:                     "wallet_pubkey": r.get::<_, Option<String>>(1)?,
 375:                     "payee": r.get::<_, Option<String>>(2)?,
 376:                     "daily_limit_lamports": r.get::<_, Option<i64>>(3)?,
 377:                     "tx_limit_lamports": r.get::<_, Option<i64>>(4)?,
 378:                     "payer_configured": r.get::<_, i64>(5)? != 0,
 379:                 }))
 380:             },
 381:         )
 382:     })
 383:     .ok();
 384:     let wallets: i64 = state
 385:         .db
 386:         .with(|c| {
 387:             c.query_row(
 388:                 "SELECT COUNT(*) FROM account_wallets WHERE account_id = ?1",
 389:                 params![auth.account_id],
 390:                 |r| r.get(0),
 391:             )
 392:         })
 393:         .unwrap_or(0);
 394: 
 395:     Ok(Json(json!({
 396:         "ok": true,
 397:         "account": account,
 398:         "llm_configured": llm.is_some(),
 399:         "llm": llm,
 400:         "llm_providers": providers,
 401:         "chain_configured": chain.is_some(),
 402:         "chain": chain,
 403:         "sub_wallets": wallets,
 404:     }))
 405:     .into_response())
 406: }
 407: 
 408: // ---------------------------------------------------------------------------
 409: // Handlers: config por cuenta
 410: // ---------------------------------------------------------------------------
 411: 
 412: #[derive(Deserialize)]
 413: pub struct PutLlmBody {
 414:     provider: String,
 415:     base_url: Option<String>,
 416:     api_key: Option<String>,
 417:     models: Vec<String>,
 418:     default_model: Option<String>,
 419: }
 420: 
 421: /// PUT /api/accounts/me/llm — guarda (upsert) la config de UN proveedor
 422: /// LLM de la cuenta. La cuenta puede tener N proveedores con key, pero el
 423: /// agente usa solo el ACTIVO (POST …/llm/active). El primero que se guarda
 424: /// queda activo automáticamente.
 425: pub async fn put_llm_handler(
 426:     State(state): State<SharedState>,
 427:     auth: AuthedAccount,
 428:     Json(body): Json<PutLlmBody>,
 429: ) -> AppResult<Response> {
 430:     let provider = body.provider.trim().to_lowercase();
 431:     if !PROVIDERS.contains(&provider.as_str()) {
 432:         return Err(AppError::bad_request(format!(
 433:             "provider inválido; soportados: {PROVIDERS:?}"
 434:         )));
 435:     }
 436:     let base_url = body
 437:         .base_url
 438:         .map(|u| u.trim().trim_end_matches('/').to_string())
 439:         .filter(|u| !u.is_empty())
 440:         .unwrap_or_else(|| default_base_url(&provider).to_string());
 441:     if base_url.is_empty() {
 442:         return Err(AppError::bad_request("base_url requerido para este provider"));
 443:     }
 444:     if body.models.is_empty() {
 445:         return Err(AppError::bad_request("models: al menos un modelo"));
 446:     }
 447:     let default_model = body
 448:         .default_model
 449:         .filter(|m| body.models.contains(m))
 450:         .unwrap_or_else(|| body.models[0].clone());
 451: 
 452:     // api_key: se cifra si viene; si no, se conserva la existente.
 453:     let api_key_enc = match body.api_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
 454:         Some(key) => {
 455:             let mk = master_key_of(&state)?;
 456:             Some(crypto::seal(&mk, key)?)
 457:         }
 458:         None => None,
 459:     };
 460:     let models_json = serde_json::to_string(&body.models)?;
 461:     let now = now_ms();
 462: 
 463:     state.db.with(|c| {
 464:         c.execute(
 465:             "INSERT INTO account_llm_providers (account_id, provider, base_url, api_key_enc, models, \
 466:              default_model, is_active, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7) \
 467:              ON CONFLICT(account_id, provider) DO UPDATE SET \
 468:                base_url = excluded.base_url, \
 469:                api_key_enc = COALESCE(excluded.api_key_enc, account_llm_providers.api_key_enc), \
 470:                models = excluded.models, default_model = excluded.default_model, \
 471:                updated_at = excluded.updated_at",
 472:             params![auth.account_id, provider, base_url, api_key_enc, models_json, default_model, now],
 473:         )?;
 474:         // primer proveedor de la cuenta → activo automáticamente
 475:         c.execute(
 476:             "UPDATE account_llm_providers SET is_active = 1, updated_at = ?3 \
 477:              WHERE account_id = ?1 AND provider = ?2 \
 478:              AND NOT EXISTS (SELECT 1 FROM account_llm_providers \
 479:                               WHERE account_id = ?1 AND is_active = 1 AND provider != ?2)",
 480:             params![auth.account_id, provider, now],
 481:         )?;
 482:         Ok(())
 483:     })?;
 484: 
 485:     let active: Option<String> = state
 486:         .db
 487:         .with(|c| {
 488:             c.query_row(
 489:                 "SELECT provider FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
 490:                 params![auth.account_id],
 491:                 |r| r.get(0),
 492:             )
 493:         })
 494:         .ok();
 495:     tracing::info!(
 496:         "account {} llm [{}] → {} (activo: {})",
 497:         auth.account_id, provider, default_model,
 498:         active.as_deref().unwrap_or("—")
 499:     );
 500:     Ok(Json(json!({
 501:         "ok": true,
 502:         "provider": provider,
 503:         "base_url": base_url,
 504:         "models": body.models,
 505:         "default_model": default_model,
 506:         "api_key_updated": api_key_enc.is_some(),
 507:         "active_provider": active,
 508:     }))
 509:     .into_response())
 510: }
 511: 
 512: #[derive(Deserialize)]
 513: pub struct ActivateLlmBody {
 514:     provider: Option<String>,
 515:     model: Option<String>,
 516: }
 517: 
 518: /// Lógica compartida (panel con Bearer de cuenta + dispositivo con Bearer
 519: /// de device): selecciona el ÚNICO proveedor activo y/o su modelo por
 520: /// defecto. Al menos uno de los dos debe venir.
 521: pub(crate) fn set_active_llm(
 522:     state: &SharedState,
 523:     account_id: &str,
 524:     provider: Option<&str>,
 525:     model: Option<&str>,
 526: ) -> AppResult<Value> {
 527:     let provider = provider
 528:         .map(|p| p.trim().to_lowercase())
 529:         .filter(|p| !p.is_empty());
 530:     let model = model.map(str::trim).filter(|m| !m.is_empty());
 531:     if provider.is_none() && model.is_none() {
 532:         return Err(AppError::bad_request("manda provider y/o model a activar"));
 533:     }
 534:     if let Some(p) = provider.as_deref() {
 535:         let row: Option<(String, bool)> = state
 536:             .db
 537:             .with(|c| {
 538:                 c.query_row(
 539:                     "SELECT models, api_key_enc IS NOT NULL FROM account_llm_providers \
 540:                      WHERE account_id = ?1 AND provider = ?2",
 541:                     params![account_id, p],
 542:                     |r| Ok((r.get(0)?, r.get(1)?)),
 543:                 )
 544:             })
 545:             .ok();
 546:         let (models_json, has_key) = row.ok_or_else(|| {
 547:             AppError::not_found(format!("provider «{p}» no configurado en tu cuenta"))
 548:         })?;
 549:         if !has_key {
 550:             return Err(AppError::bad_request(format!(
 551:                 "provider «{p}» sin api_key — guárdala primero"
 552:             )));
 553:         }
 554:         if let Some(m) = model {
 555:             let models: Vec<String> = serde_json::from_str(&models_json).unwrap_or_default();
 556:             if !models.contains(&m.to_string()) {
 557:                 return Err(AppError::bad_request(format!(
 558:                     "modelo «{m}» no está en la lista de «{p}»"
 559:                 )));
 560:             }
 561:         }
 562:         state.db.with(|c| {
 563:             c.execute(
 564:                 "UPDATE account_llm_providers SET is_active = 0, updated_at = ?2 WHERE account_id = ?1",
 565:                 params![account_id, now_ms()],
 566:             )?;
 567:             c.execute(
 568:                 "UPDATE account_llm_providers SET is_active = 1, updated_at = ?3 \
 569:                  WHERE account_id = ?1 AND provider = ?2",
 570:                 params![account_id, p, now_ms()],
 571:             )?;
 572:             Ok(())
 573:         })?;
 574:         tracing::info!("account {account_id} llm activo → {p}");
 575:     }
 576:     if let Some(m) = model {
 577:         let target: Option<String> = provider.clone().or_else(|| {
 578:             state
 579:                 .db
 580:                 .with(|c| {
 581:                     c.query_row(
 582:                         "SELECT provider FROM account_llm_providers \
 583:                          WHERE account_id = ?1 AND is_active = 1",
 584:                         params![account_id],
 585:                         |r| r.get(0),
 586:                     )
 587:                 })
 588:                 .ok()
 589:         });
 590:         let target =
 591:             target.ok_or_else(|| AppError::bad_request("sin proveedor activo — elige uno primero"))?;
 592:         let models_json: Option<String> = state
 593:             .db
 594:             .with(|c| {
 595:                 c.query_row(
 596:                     "SELECT models FROM account_llm_providers \
 597:                      WHERE account_id = ?1 AND provider = ?2",
 598:                     params![account_id, target],
 599:                     |r| r.get(0),
 600:                 )
 601:             })
 602:             .ok();
 603:         let models: Vec<String> = models_json
 604:             .as_deref()
 605:             .and_then(|s| serde_json::from_str(s).ok())
 606:             .unwrap_or_default();
 607:         if !models.contains(&m.to_string()) {
 608:             return Err(AppError::bad_request(format!(
 609:                 "modelo «{m}» no está en la lista de «{target}»"
 610:             )));
 611:         }
 612:         state.db.with(|c| {
 613:             c.execute(
 614:                 "UPDATE account_llm_providers SET default_model = ?3, updated_at = ?4 \
 615:                  WHERE account_id = ?1 AND provider = ?2",
 616:                 params![account_id, target, m, now_ms()],
 617:             )?;
 618:             Ok(())
 619:         })?;
 620:         tracing::info!("account {account_id} llm [{target}] modelo → {m}");
 621:     }
 622:     let active: Option<String> = state
 623:         .db
 624:         .with(|c| {
 625:             c.query_row(
 626:                 "SELECT provider FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
 627:                 params![account_id],
 628:                 |r| r.get(0),
 629:             )
 630:         })
 631:         .ok();
 632:     Ok(json!({ "active_provider": active }))
 633: }
 634: 
 635: /// POST /api/accounts/me/llm/active — selecciona el ÚNICO proveedor que
 636: /// usa el agente y/o su modelo: {provider?, model?} (al menos uno).
 637: pub async fn activate_llm_handler(
 638:     State(state): State<SharedState>,
 639:     auth: AuthedAccount,
 640:     Json(body): Json<ActivateLlmBody>,
 641: ) -> AppResult<Response> {
 642:     let v = set_active_llm(
 643:         &state,
 644:         &auth.account_id,
 645:         body.provider.as_deref(),
 646:         body.model.as_deref(),
 647:     )?;
 648:     Ok(Json(json!({ "ok": true, "active_provider": v["active_provider"] })).into_response())
 649: }
 650: 
 651: /// DELETE /api/accounts/me/llm?provider=X — borra la config de ESE
 652: /// proveedor (botón "Desconectar" del modal Modelos). Sin provider, borra
 653: /// el activo. Si era el activo, la cuenta queda SIN agente hasta elegir
 654: /// otro: no hay fallback global, la cuenta es 100% responsable de sus keys.
 655: pub async fn delete_llm_handler(
 656:     State(state): State<SharedState>,
 657:     auth: AuthedAccount,
 658:     query: axum::extract::Query<std::collections::HashMap<String, String>>,
 659: ) -> AppResult<Response> {
 660:     let target = query
 661:         .get("provider")
 662:         .map(|p| p.trim().to_lowercase())
 663:         .filter(|p| !p.is_empty());
 664:     let deleted: i64 = state
 665:         .db
 666:         .with(|c| {
 667:             if let Some(p) = target.as_deref() {
 668:                 c.execute(
 669:                     "DELETE FROM account_llm_providers WHERE account_id = ?1 AND provider = ?2",
 670:                     params![auth.account_id, p],
 671:                 )
 672:             } else {
 673:                 c.execute(
 674:                     "DELETE FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
 675:                     params![auth.account_id],
 676:                 )
 677:             }
 678:             .map(|n| n as i64)
 679:         })
 680:         .unwrap_or(0);
 681:     let active: Option<String> = state
 682:         .db
 683:         .with(|c| {
 684:             c.query_row(
 685:                 "SELECT provider FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
 686:                 params![auth.account_id],
 687:                 |r| r.get(0),
 688:             )
 689:         })
 690:         .ok();
 691:     tracing::info!(
 692:         "account {} desconectó LLM {:?} (activo ahora: {})",
 693:         auth.account_id, target, active.as_deref().unwrap_or("— ninguno —")
 694:     );
 695:     Ok(Json(json!({
 696:         "ok": true,
 697:         "deleted": deleted,
 698:         "active_provider": active,
 699:         "llm": null,
 700:     }))
 701:     .into_response())
 702: }
 703: 
 704: #[derive(Deserialize)]
 705: pub struct PutChainBody {
 706:     network: Option<String>,
 707:     wallet_pubkey: Option<String>,
 708:     payee: Option<String>,
 709:     daily_limit_lamports: Option<i64>,
 710:     tx_limit_lamports: Option<i64>,
 711:     /// Sub-wallet operativa del agente (label). Tri-state:
 712:     /// ausente → no tocar · null/"" → wallet principal dPaaS · label → esa wallet.
 713:     #[serde(default, deserialize_with = "deserialize_some")]
 714:     active_wallet_label: Option<Option<String>>,
 715: }
 716: 
 717: /// Deserializador tri-state: distingue "clave ausente" (None externo) de
 718: /// "clave presente con null" (Some(None)) en los campos Option<Option<T>>.
 719: fn deserialize_some<'de, T, D>(d: D) -> Result<Option<T>, D::Error>
 720: where
 721:     T: Deserialize<'de>,
 722:     D: serde::Deserializer<'de>,
 723: {
 724:     T::deserialize(d).map(Some)
 725: }
 726: 
 727: /// Resuelve la wallet operativa del agente: label → pubkey de la sub-wallet;
 728: /// NULL → wallet principal del dPaaS (`wallet_pubkey` del chain).
 729: fn resolve_active_wallet(state: &SharedState, account_id: &str, chain: &mut Value) {
 730:     let label = chain
 731:         .get("active_wallet_label")
 732:         .and_then(|v| v.as_str())
 733:         .map(String::from);
 734:     chain["active_wallet_pubkey"] = match label {
 735:         Some(label) => state
 736:             .db
 737:             .with(|c| {
 738:                 c.query_row(
 739:                     "SELECT pubkey FROM account_wallets WHERE account_id = ?1 AND label = ?2",
 740:                     params![account_id, label],
 741:                     |r| r.get::<_, String>(0),
 742:                 )
 743:             })
 744:             .ok()
 745:             .map(|p| json!(p))
 746:             .unwrap_or(Value::Null),
 747:         None => chain.get("wallet_pubkey").cloned().unwrap_or(Value::Null),
 748:     };
 749: }
 750: 
 751: /// PUT /api/accounts/me/chain — red y wallet del orquestador (dPaaS).
 752: pub async fn put_chain_handler(
 753:     State(state): State<SharedState>,
 754:     auth: AuthedAccount,
 755:     Json(body): Json<PutChainBody>,
 756: ) -> AppResult<Response> {
 757:     if let Some(net) = &body.network {
 758:         if !NETWORKS.contains(&net.as_str()) {
 759:             return Err(AppError::bad_request(format!("network inválida; válidas: {NETWORKS:?}")));
 760:         }
 761:     }
 762:     // La sub-wallet operativa debe existir en la cuenta ("" / null = principal).
 763:     if let Some(Some(label)) = body.active_wallet_label.as_ref() {
 764:         let label = label.trim();
 765:         if !label.is_empty() {
 766:             let exists = state
 767:                 .db
 768:                 .with(|c| {
 769:                     c.query_row(
 770:                         "SELECT COUNT(*) FROM account_wallets WHERE account_id = ?1 AND label = ?2",
 771:                         params![auth.account_id, label],
 772:                         |r| Ok(r.get::<_, i64>(0)? > 0),
 773:                     )
 774:                 })
 775:                 .unwrap_or(false);
 776:             if !exists {
 777:                 return Err(AppError::bad_request(format!(
 778:                     "sub-wallet «{label}» no existe en la cuenta; créala primero (POST /accounts/me/wallets)"
 779:                 )));
 780:             }
 781:         }
 782:     }
 783:     // Tri-state → parámetro SQL: NULL (ausente: no tocar) · "" (limpiar) · label.
 784:     let active_wallet_param: Option<String> = match body.active_wallet_label {
 785:         None => None,                      // ausente → no tocar
 786:         Some(None) => Some(String::new()), // null → wallet principal (limpiar)
 787:         Some(Some(label)) => Some(label.trim().to_string()),
 788:     };
 789:     let now = now_ms();
 790:     state.db.with(|c| {
 791:         c.execute(
 792:             "INSERT INTO account_chain (account_id, network, wallet_pubkey, payee, \
 793:              daily_limit_lamports, tx_limit_lamports, active_wallet_label, updated_at) \
 794:              VALUES (?1, COALESCE(?2, 'devnet'), ?3, ?4, ?5, ?6, NULLIF(?7, ''), ?8) \
 795:              ON CONFLICT(account_id) DO UPDATE SET \
 796:                network = COALESCE(?2, account_chain.network), \
 797:                wallet_pubkey = COALESCE(?3, account_chain.wallet_pubkey), \
 798:                payee = COALESCE(?4, account_chain.payee), \
 799:                daily_limit_lamports = COALESCE(?5, account_chain.daily_limit_lamports), \
 800:                tx_limit_lamports = COALESCE(?6, account_chain.tx_limit_lamports), \
 801:                active_wallet_label = \
 802:                  CASE WHEN ?7 IS NULL THEN account_chain.active_wallet_label \
 803:                       ELSE NULLIF(?7, '') END, \
 804:                updated_at = ?8",
 805:             params![auth.account_id, body.network, body.wallet_pubkey, body.payee,
 806:                     body.daily_limit_lamports, body.tx_limit_lamports,
 807:                     active_wallet_param, now],
 808:         )?;
 809:         Ok(())
 810:     })?;
 811: 
 812:     let mut chain = state.db.with(|c| {
 813:         c.query_row(
 814:             "SELECT network, wallet_pubkey, payee, daily_limit_lamports, tx_limit_lamports, \
 815:              active_wallet_label, payer_keypair_enc IS NOT NULL FROM account_chain WHERE account_id = ?1",
 816:             params![auth.account_id],
 817:             |r| {
 818:                 Ok(json!({
 819:                     "network": r.get::<_, String>(0)?,
 820:                     "wallet_pubkey": r.get::<_, Option<String>>(1)?,
 821:                     "payee": r.get::<_, Option<String>>(2)?,
 822:                     "daily_limit_lamports": r.get::<_, Option<i64>>(3)?,
 823:                     "tx_limit_lamports": r.get::<_, Option<i64>>(4)?,
 824:                     "active_wallet_label": r.get::<_, Option<String>>(5)?,
 825:                     "payer_configured": r.get::<_, i64>(6)? != 0,
 826:                 }))
 827:             },
 828:         )
 829:     })?;
 830:     resolve_active_wallet(&state, &auth.account_id, &mut chain);
 831:     Ok(Json(json!({ "ok": true, "chain": chain })).into_response())
 832: }
 833: 
 834: // ---------------------------------------------------------------------------
 835: // Keypair (dPaaS) — import cifrado + derivación de pubkey
 836: // ---------------------------------------------------------------------------
 837: 
 838: #[derive(Deserialize)]
 839: pub struct ImportKeypairBody {
 840:     /// Keypair: array de 64 enteros O string con el JSON serializado.
 841:     keypair_json: Option<Value>,
 842:     /// Ruta al archivo keypair JSON del CLI de Solana (~/ permitido).
 843:     keypair_path: Option<String>,
 844: }
 845: 
 846: /// Parsea un keypair JSON inline: `[seed(32) ‖ pubkey(32)]`.
 847: /// Acepta Value::String (JSON serializado) o Value::Array (array directo).
 848: pub fn parse_keypair_str(raw: &str) -> AppResult<[u8; 64]> {
 849:     let arr: Vec<u8> = serde_json::from_str(raw.trim())
 850:         .map_err(|e| AppError::bad_request(format!("keypair JSON inválido: {e}")))?;
 851:     if arr.len() < 64 {
 852:         return Err(AppError::bad_request(format!(
 853:             "keypair con {} bytes (se esperaban 64)",
 854:             arr.len()
 855:         )));
 856:     }
 857:     let mut kp = [0u8; 64];
 858:     kp.copy_from_slice(&arr[..64]);
 859:     Ok(kp)
 860: }
 861: 
 862: fn keypair_json_to_string(v: &Value) -> AppResult<String> {
 863:     match v {
 864:         Value::String(s) => Ok(s.clone()),
 865:         Value::Array(_) => Ok(v.to_string()),
 866:         _ => Err(AppError::bad_request(
 867:             "keypair_json debe ser un array de 64 enteros o un string JSON",
 868:         )),
 869:     }
 870: }
 871: 
 872: fn load_keypair(state: &SharedState, body: &ImportKeypairBody) -> AppResult<(String, String)> {
 873:     let raw_json = if let Some(json) = body.keypair_json.as_ref() {
 874:         keypair_json_to_string(json)?
 875:     } else if let Some(path) = body.keypair_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
 876:         crate::modules::solana::keypair_bytes_from_json(path)
 877:             .map(|kp| serde_json::to_string(&kp.to_vec()).unwrap_or_default())
 878:             .map_err(AppError::bad_request)?
 879:     } else {
 880:         return Err(AppError::bad_request("falta keypair_json o keypair_path"));
 881:     };
 882: 
 883:     let kp = parse_keypair_str(&raw_json)?;
 884:     let pubkey = crate::b58::encode(&kp[32..]);
 885:     let mk = master_key_of(state)?;
 886:     let sealed = crypto::seal(&mk, &raw_json)?;
 887:     Ok((pubkey, sealed))
 888: }
 889: 
 890: /// POST /api/accounts/me/chain/keypair/import — cifra el keypair del
 891: /// orquestador y deriva la pubkey. El secreto nunca se loguea.
 892: pub async fn import_keypair_handler(
 893:     State(state): State<SharedState>,
 894:     auth: AuthedAccount,
 895:     Json(body): Json<ImportKeypairBody>,
 896: ) -> AppResult<Response> {
 897:     let (pubkey, sealed) = load_keypair(&state, &body)?;
 898:     let now = now_ms();
 899:     state.db.with(|c| {
 900:         c.execute(
 901:             "INSERT INTO account_chain (account_id, network, wallet_pubkey, payer_keypair_enc, \
 902:              payee, updated_at) VALUES (?1, 'devnet', ?2, ?3, ?4, ?5) \
 903:              ON CONFLICT(account_id) DO UPDATE SET \
 904:                wallet_pubkey = excluded.wallet_pubkey, \
 905:                payer_keypair_enc = excluded.payer_keypair_enc, \
 906:                payee = COALESCE(account_chain.payee, excluded.payee), \
 907:                updated_at = excluded.updated_at",
 908:             params![auth.account_id, pubkey, sealed, pubkey, now],
 909:         )?;
 910:         Ok(())
 911:     })?;
 912: 
 913:     tracing::info!("account {}: keypair del orquestador importado → {pubkey}", auth.account_id);
 914:     Ok(Json(json!({
 915:         "ok": true,
 916:         "wallet_pubkey": pubkey,
 917:         "encrypted_at_rest": true,
 918:     }))
 919:     .into_response())
 920: }
 921: 
 922: // ---------------------------------------------------------------------------
 923: // Sub-wallets (Gestor de Wallet & Sub-Wallets del diagrama)
 924: // ---------------------------------------------------------------------------
 925: 
 926: #[derive(Deserialize)]
 927: pub struct CreateWalletBody {
 928:     label: String,
 929:     network: Option<String>,
 930:     keypair_json: Option<Value>,
 931:     keypair_path: Option<String>,
 932:     daily_limit_lamports: Option<i64>,
 933: }
 934: 
 935: pub async fn create_wallet_handler(
 936:     State(state): State<SharedState>,
 937:     auth: AuthedAccount,
 938:     Json(body): Json<CreateWalletBody>,
 939: ) -> AppResult<Response> {
 940:     let label = body.label.trim().to_string();
 941:     if label.is_empty() {
 942:         return Err(AppError::bad_request("label vacío"));
 943:     }
 944:     if let Some(net) = &body.network {
 945:         if !NETWORKS.contains(&net.as_str()) {
 946:             return Err(AppError::bad_request(format!("network inválida; válidas: {NETWORKS:?}")));
 947:         }
 948:     }
 949:     let (pubkey, sealed) = load_keypair(
 950:         &state,
 951:         &ImportKeypairBody {
 952:             keypair_json: body.keypair_json.clone(),
 953:             keypair_path: body.keypair_path.clone(),
 954:         },
 955:     )?;
 956: 
 957:     let id = new_id("wlt");
 958:     let inserted = state.db.with(|c| {
 959:         c.execute(
 960:             "INSERT INTO account_wallets (id, account_id, label, network, pubkey, keypair_enc, \
 961:              daily_limit_lamports, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
 962:             params![id, auth.account_id, label, body.network.clone().unwrap_or("devnet".into()),
 963:                     pubkey, sealed, body.daily_limit_lamports, now_ms()],
 964:         )?;
 965:         Ok(())
 966:     });
 967:     if let Err(rusqlite::Error::SqliteFailure(e, _)) = &inserted {
 968:         if e.code == rusqlite::ErrorCode::ConstraintViolation {
 969:             return Err(AppError::conflict("ya existe una sub-wallet con ese label"));
 970:         }
 971:     }
 972:     inserted?;
 973: 
 974:     tracing::info!("account {} sub-wallet «{label}» → {pubkey}", auth.account_id);
 975:     Ok((
 976:         StatusCode::CREATED,
 977:         Json(json!({
 978:             "ok": true,
 979:             "wallet_id": id,
 980:             "label": label,
 981:             "pubkey": pubkey,
 982:         })),
 983:     )
 984:         .into_response())
 985: }
 986: 
 987: pub async fn list_wallets_handler(
 988:     State(state): State<SharedState>,
 989:     auth: AuthedAccount,
 990: ) -> AppResult<Response> {
 991:     let wallets: Vec<Value> = state
 992:         .db
 993:         .with(|c| {
 994:             let mut stmt = c.prepare(
 995:                 "SELECT id, label, network, pubkey, daily_limit_lamports, created_at \
 996:                  FROM account_wallets WHERE account_id = ?1 ORDER BY created_at",
 997:             )?;
 998:             let rows = stmt.query_map(params![auth.account_id], |r| {
 999:                 Ok(json!({
1000:                     "id": r.get::<_, String>(0)?,
1001:                     "label": r.get::<_, String>(1)?,
1002:                     "network": r.get::<_, String>(2)?,
1003:                     "pubkey": r.get::<_, String>(3)?,
1004:                     "daily_limit_lamports": r.get::<_, Option<i64>>(4)?,
1005:                     "created_at": r.get::<_, i64>(5)?,
1006:                 }))
1007:             })?;
1008:             rows.collect()
1009:         })
1010:         .unwrap_or_default();
1011:     Ok(Json(json!({ "ok": true, "wallets": wallets })).into_response())
1012: }
1013: 
1014: // ---------------------------------------------------------------------------
1015: // Wallets conectadas del navegador (Phantom / MetaMask / …) — solo pubkeys
1016: // ---------------------------------------------------------------------------
1017: 
1018: /// Cadenas soportadas por las wallets del navegador.
1019: const WALLET_CHAINS: &[&str] = &["solana", "evm"];
1020: 
1021: #[derive(Deserialize)]
1022: pub struct ConnectWalletBody {
1023:     /// Etiqueta visible; por defecto "{provider} · N".
1024:     label: Option<String>,
1025:     /// Proveedor: phantom | solflare | backpack | metamask | …
1026:     provider: String,
1027:     /// Cadena de la wallet: solana | evm.
1028:     chain: String,
1029:     /// Pubkey pública (base58 Solana · 0x… EVM). La clave privada NUNCA
1030:     /// sale de la wallet del navegador — no se recibe ni se guarda.
1031:     pubkey: String,
1032:     /// Marcarla como la wallet en uso (default true; solo una activa).
1033:     #[serde(default = "default_true")]
1034:     set_active: bool,
1035: }
1036: 
1037: fn default_true() -> bool {
1038:     true
1039: }
1040: 
1041: /// POST /api/accounts/me/connected-wallets — conecta una wallet del
1042: /// navegador a la cuenta. Por defecto pasa a ser la wallet en uso
1043: /// (se desactivan las demás: solo UNA activa por cuenta).
1044: pub async fn connect_wallet_handler(
1045:     State(state): State<SharedState>,
1046:     auth: AuthedAccount,
1047:     Json(body): Json<ConnectWalletBody>,
1048: ) -> AppResult<Response> {
1049:     let provider = body.provider.trim().to_lowercase();
1050:     if provider.is_empty() {
1051:         return Err(AppError::bad_request("provider vacío"));
1052:     }
1053:     let chain = body.chain.trim().to_lowercase();
1054:     if !WALLET_CHAINS.contains(&chain.as_str()) {
1055:         return Err(AppError::bad_request(format!(
1056:             "chain inválida; válidas: {WALLET_CHAINS:?}"
1057:         )));
1058:     }
1059:     let pubkey = body.pubkey.trim().to_string();
1060:     if pubkey.len() < 20 {
1061:         return Err(AppError::bad_request("pubkey inválida"));
1062:     }
1063: 
1064:     // label por defecto: "{provider} · N" según las ya conectadas de ese proveedor
1065:     let label = match body.label.as_deref().map(str::trim).filter(|l| !l.is_empty()) {
1066:         Some(l) => l.to_string(),
1067:         None => {
1068:             let n: i64 = state
1069:                 .db
1070:                 .with(|c| {
1071:                     Ok(c.query_row(
1072:                         "SELECT COUNT(*) FROM account_connected_wallets \
1073:                          WHERE account_id = ?1 AND provider = ?2",
1074:                         params![auth.account_id, provider],
1075:                         |r| r.get::<_, i64>(0),
1076:                     )? + 1)
1077:                 })
1078:                 .unwrap_or(1);
1079:             format!("{provider} · {n}")
1080:         }
1081:     };
1082: 
1083:     let id = new_id("cwt");
1084:     let now = now_ms();
1085:     let inserted = state.db.with(|c| {
1086:         c.execute(
1087:             "INSERT INTO account_connected_wallets \
1088:              (id, account_id, label, provider, chain, pubkey, is_active, created_at) \
1089:              VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
1090:             params![id, auth.account_id, label, provider, chain, pubkey, now],
1091:         )?;
1092:         if body.set_active {
1093:             c.execute(
1094:                 "UPDATE account_connected_wallets SET is_active = 0 WHERE account_id = ?1",
1095:                 params![auth.account_id],
1096:             )?;
1097:             c.execute(
1098:                 "UPDATE account_connected_wallets SET is_active = 1 WHERE id = ?1",
1099:                 params![id],
1100:             )?;
1101:         }
1102:         Ok(())
1103:     });
1104:     if let Err(rusqlite::Error::SqliteFailure(e, _)) = &inserted {
1105:         if e.code == rusqlite::ErrorCode::ConstraintViolation {
1106:             return Err(AppError::conflict("ya existe una wallet conectada con ese nombre"));
1107:         }
1108:     }
1109:     inserted?;
1110: 
1111:     tracing::info!(
1112:         "account {} + wallet conectada «{label}» ({provider}/{chain})",
1113:         auth.account_id
1114:     );
1115:     Ok((
1116:         StatusCode::CREATED,
1117:         Json(json!({
1118:             "ok": true,
1119:             "wallet": {
1120:                 "id": id, "label": label, "provider": provider,
1121:                 "chain": chain, "pubkey": pubkey, "is_active": body.set_active,
1122:             }
1123:         })),
1124:     )
1125:         .into_response())
1126: }
1127: 
1128: /// GET /api/accounts/me/connected-wallets — lista + la que está en uso.
1129: pub async fn list_connected_wallets_handler(
1130:     State(state): State<SharedState>,
1131:     auth: AuthedAccount,
1132: ) -> AppResult<Response> {
1133:     let wallets: Vec<Value> = state
1134:         .db
1135:         .with(|c| {
1136:             let mut stmt = c.prepare(
1137:                 "SELECT id, label, provider, chain, pubkey, is_active, created_at \
1138:                  FROM account_connected_wallets WHERE account_id = ?1 ORDER BY created_at",
1139:             )?;
1140:             let rows = stmt.query_map(params![auth.account_id], |r| {
1141:                 Ok(json!({
1142:                     "id": r.get::<_, String>(0)?,
1143:                     "label": r.get::<_, String>(1)?,
1144:                     "provider": r.get::<_, String>(2)?,
1145:                     "chain": r.get::<_, String>(3)?,
1146:                     "pubkey": r.get::<_, String>(4)?,
1147:                     "is_active": r.get::<_, i64>(5)? != 0,
1148:                     "created_at": r.get::<_, i64>(6)?,
1149:                 }))
1150:             })?;
1151:             rows.collect()
1152:         })
1153:         .unwrap_or_default();
1154:     let active = wallets
1155:         .iter()
1156:         .find(|w| w.get("is_active").map_or(false, |v| v == &json!(true)))
1157:         .cloned()
1158:         .unwrap_or(Value::Null);
1159:     Ok(Json(json!({ "ok": true, "wallets": wallets, "active": active })).into_response())
1160: }
1161: 
1162: #[derive(Deserialize)]
1163: pub struct ActivateWalletBody {
1164:     label: String,
1165: }
1166: 
1167: /// PUT /api/accounts/me/connected-wallets/activate — marca una wallet como
1168: /// la en uso y desactiva las demás (invariante: exactamente una activa).
1169: pub async fn activate_connected_wallet_handler(
1170:     State(state): State<SharedState>,
1171:     auth: AuthedAccount,
1172:     Json(body): Json<ActivateWalletBody>,
1173: ) -> AppResult<Response> {
1174:     let label = body.label.trim().to_string();
1175:     if label.is_empty() {
1176:         return Err(AppError::bad_request("label vacío"));
1177:     }
1178:     let updated = state.db.with(|c| {
1179:         c.execute(
1180:             "UPDATE account_connected_wallets SET is_active = 0 WHERE account_id = ?1",
1181:             params![auth.account_id],
1182:         )?;
1183:         Ok(c.execute(
1184:             "UPDATE account_connected_wallets SET is_active = 1 \
1185:              WHERE account_id = ?1 AND label = ?2",
1186:             params![auth.account_id, label],
1187:         )?)
1188:     })?;
1189:     if updated == 0 {
1190:         return Err(AppError::bad_request(format!(
1191:             "wallet conectada «{label}» no existe en la cuenta"
1192:         )));
1193:     }
1194:     Ok(Json(json!({ "ok": true, "active": label })).into_response())
1195: }
1196: 
1197: // ---------------------------------------------------------------------------
1198: // Servicios del ecosistema — dapps que el agente usará con x402
1199: // ---------------------------------------------------------------------------
1200: 
1201: /// Catálogo de servicios/dapps que el agente puede agregar a su cuenta.
1202: /// TODO el flujo de estas dapps viaja por el gateway x402 (peaje reactivo
1203: /// 402 firmado por la wallet dPaaS de la cuenta), y así queda registrado
1204: /// en `account_services` al agregarlas.
1205: pub const SERVICE_CATALOG: &[(&str, &str, &str)] = &[
1206:     // (id, display_name, resource x402)
1207:     ("medusa", "Medusa.js · ERP", "x402:path:/api/erp/*"),
1208: ];
1209: 
1210: fn catalog_ids() -> Vec<&'static str> {
1211:     SERVICE_CATALOG.iter().map(|(id, _, _)| *id).collect()
1212: }
1213: 
1214: #[derive(Deserialize)]
1215: pub struct AddServiceBody {
1216:     service: String,
1217: }
1218: 
1219: /// GET /api/accounts/me/services — catálogo + estado por cuenta.
1220: pub async fn list_services_handler(
1221:     State(state): State<SharedState>,
1222:     auth: AuthedAccount,
1223: ) -> AppResult<Response> {
1224:     // Filas ya agregadas por la cuenta (id → fila).
1225:     let added: Vec<Value> = state
1226:         .db
1227:         .with(|c| {
1228:             let mut stmt = c.prepare(
1229:                 "SELECT service, display_name, via_x402, resource, payer_pubkey, network, \
1230:                  status, created_at FROM account_services WHERE account_id = ?1 ORDER BY created_at",
1231:             )?;
1232:             let rows = stmt.query_map(params![auth.account_id], |r| {
1233:                 Ok(json!({
1234:                     "service": r.get::<_, String>(0)?,
1235:                     "display_name": r.get::<_, String>(1)?,
1236:                     "via_x402": r.get::<_, i64>(2)? != 0,
1237:                     "resource": r.get::<_, String>(3)?,
1238:                     "payer_pubkey": r.get::<_, Option<String>>(4)?,
1239:                     "network": r.get::<_, Option<String>>(5)?,
1240:                     "status": r.get::<_, String>(6)?,
1241:                     "added_at": r.get::<_, i64>(7)?,
1242:                 }))
1243:             })?;
1244:             rows.collect()
1245:         })
1246:         .unwrap_or_default();
1247: 
1248:     let services: Vec<Value> = SERVICE_CATALOG
1249:         .iter()
1250:         .map(|(id, name, resource)| {
1251:             let row = added
1252:                 .iter()
1253:                 .find(|v| v.get("service").and_then(|s| s.as_str()) == Some(*id));
1254:             json!({
1255:                 "service": id,
1256:                 "display_name": name,
1257:                 "resource": resource,
1258:                 "via_x402": true,   // TODO el flujo de la dapp usa x402 (reactivo 402 + dPaaS)
1259:                 "added": row.is_some(),
1260:                 "status": row.and_then(|v| v.get("status").cloned()).unwrap_or(Value::Null),
1261:                 "added_at": row.and_then(|v| v.get("added_at").cloned()).unwrap_or(Value::Null),
1262:                 "payer_pubkey": row.and_then(|v| v.get("payer_pubkey").cloned()).unwrap_or(Value::Null),
1263:                 "network": row.and_then(|v| v.get("network").cloned()).unwrap_or(Value::Null),
1264:             })
1265:         })
1266:         .collect();
1267: 
1268:     Ok(Json(json!({ "ok": true, "services": services })).into_response())
1269: }
1270: 
1271: /// POST /api/accounts/me/services — agrega una dapp a la cuenta.
1272: ///
1273: /// El registro persiste el vínculo cuenta→servicio→x402: `via_x402=1`,
1274: /// el resource del peaje y el snapshot del payer dPaaS/red del agente
1275: /// en el momento del alta (el flujo completo de la dapp usará x402).
1276: pub async fn add_service_handler(
1277:     State(state): State<SharedState>,
1278:     auth: AuthedAccount,
1279:     Json(body): Json<AddServiceBody>,
1280: ) -> AppResult<Response> {
1281:     let service = body.service.trim().to_string();
1282:     let Some((id, name, resource)) = SERVICE_CATALOG
1283:         .iter()
1284:         .find(|(s, _, _)| *s == service)
1285:         .map(|(a, b, c)| (*a, *b, *c))
1286:     else {
1287:         return Err(AppError::bad_request(format!(
1288:             "servicio desconocido «{}»; catálogo: {:?}",
1289:             service,
1290:             catalog_ids()
1291:         )));
1292:     };
1293: 
1294:     // Snapshot del contexto dPaaS de la cuenta al agregar (documentación
1295:     // del flujo: qué wallet/red firma los peajes x402 de la dapp).
1296:     let (payer_pubkey, network): (Option<String>, String) = state
1297:         .db
1298:         .with(|c| {
1299:             c.query_row(
1300:                 "SELECT wallet_pubkey, network FROM account_chain WHERE account_id = ?1",
1301:                 params![auth.account_id],
1302:                 |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)),
1303:             )
1304:         })
1305:         .unwrap_or((None, "devnet".to_string()));
1306: 
1307:     let sid = new_id("svc");
1308:     let now = now_ms();
1309:     let inserted = state.db.with(|c| {
1310:         c.execute(
1311:             "INSERT INTO account_services (id, account_id, service, display_name, via_x402, \
1312:              resource, payer_pubkey, network, status, created_at) \
1313:              VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, 'active', ?8)",
1314:             params![sid, auth.account_id, id, name, resource, payer_pubkey, network, now],
1315:         )?;
1316:         Ok(())
1317:     });
1318:     if let Err(rusqlite::Error::SqliteFailure(e, _)) = &inserted {
1319:         if e.code == rusqlite::ErrorCode::ConstraintViolation {
1320:             return Err(AppError::conflict("servicio ya agregado a la cuenta"));
1321:         }
1322:     }
1323:     inserted?;
1324: 
1325:     tracing::info!(
1326:         "account {} + servicio «{id}» (flujo x402: {resource}, payer {}, red {network})",
1327:         auth.account_id,
1328:         payer_pubkey.as_deref().unwrap_or("sin wallet")
1329:     );
1330:     Ok((
1331:         StatusCode::CREATED,
1332:         Json(json!({
1333:             "ok": true,
1334:             "service": {
1335:                 "service": id,
1336:                 "display_name": name,
1337:                 "via_x402": true,
1338:                 "resource": resource,
1339:                 "status": "active",
1340:                 "payer_pubkey": payer_pubkey,
1341:                 "network": network,
1342:                 "added_at": now,
1343:             }
1344:         })),
1345:     )
1346:         .into_response())
1347: }
1348: 
1349: // ---------------------------------------------------------------------------
1350: // Contexto resuelto (lo que consume el orquestador/brain)
1351: // ---------------------------------------------------------------------------
1352: 
1353: /// GET /api/accounts/me/context — resolución única para el orquestador:
1354: /// proveedor+modelos+api_key, red+wallet, dPaaS y sub-wallets.
1355: ///
1356: /// ⚠️ Trade-off documentado: devuelve el api_key del proveedor en claro
1357: /// (solo por TLS, componente de confianza). Fase 6: credential-proxy.
1358: pub async fn context_handler(
1359:     State(state): State<SharedState>,
1360:     auth: AuthedAccount,
1361: ) -> AppResult<Response> {
1362:     let account = state.db.with(|c| {
1363:         c.query_row(
1364:             "SELECT id, email, display_name FROM accounts WHERE id = ?1",
1365:             params![auth.account_id],
1366:             |r| {
1367:                 Ok(json!({
1368:                     "id": r.get::<_, String>(0)?,
1369:                     "email": r.get::<_, String>(1)?,
1370:                     "display_name": r.get::<_, Option<String>>(2)?,
1371:                 }))
1372:             },
1373:         )
1374:     })?;
1375: 
1376:     // LLM de la cuenta: SOLO el proveedor ACTIVO (api_key desencriptada).
1377:     // Sin activo → llm null y el agente exige configurar (sin fallback global).
1378:     let llm: Option<Value> = state
1379:         .db
1380:         .with(|c| {
1381:             c.query_row(
1382:                 "SELECT provider, base_url, api_key_enc, models, default_model \
1383:                  FROM account_llm_providers WHERE account_id = ?1 AND is_active = 1",
1384:                 params![auth.account_id],
1385:                 |r| {
1386:                     let models: Value =
1387:                         serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or(json!([]));
1388:                     Ok(json!({
1389:                         "provider": r.get::<_, String>(0)?,
1390:                         "base_url": r.get::<_, String>(1)?,
1391:                         "api_key_enc": r.get::<_, Option<String>>(2)?,
1392:                         "models": models,
1393:                         "default_model": r.get::<_, Option<String>>(4)?,
1394:                     }))
1395:                 },
1396:             )
1397:         })
1398:         .ok();
1399:     let llm = match llm {
1400:         Some(mut v) => {
1401:             let api_key = match v.get("api_key_enc").and_then(|x| x.as_str()) {
1402:                 Some(enc) => state
1403:                     .cfg
1404:                     .accounts_master_key
1405:                     .and_then(|k| crypto::open(&k, enc).ok())
1406:                     .and_then(|b| String::from_utf8(b).ok())
1407:                     .unwrap_or_default(),
1408:                 None => String::new(),
1409:             };
1410:             v["api_key"] = json!(api_key);
1411:             v.as_object_mut().unwrap().remove("api_key_enc");
1412:             Some(v)
1413:         }
1414:         None => None,
1415:     };
1416: 
1417:     // Chain (red + wallet del orquestador + dPaaS + wallet operativa).
1418:     let mut chain: Option<Value> = state
1419:         .db
1420:         .with(|c| {
1421:             c.query_row(
1422:                 "SELECT network, wallet_pubkey, payee, daily_limit_lamports, tx_limit_lamports, \
1423:                  active_wallet_label, payer_keypair_enc IS NOT NULL FROM account_chain WHERE account_id = ?1",
1424:                 params![auth.account_id],
1425:                 |r| {
1426:                     Ok(json!({
1427:                         "network": r.get::<_, String>(0)?,
1428:                         "wallet_pubkey": r.get::<_, Option<String>>(1)?,
1429:                         "payee": r.get::<_, Option<String>>(2)?,
1430:                         "daily_limit_lamports": r.get::<_, Option<i64>>(3)?,
1431:                         "tx_limit_lamports": r.get::<_, Option<i64>>(4)?,
1432:                         "active_wallet_label": r.get::<_, Option<String>>(5)?,
1433:                         "payer_configured": r.get::<_, i64>(6)? != 0,
1434:                     }))
1435:                 },
1436:             )
1437:         })
1438:         .ok();
1439:     if let Some(ch) = chain.as_mut() {
1440:         resolve_active_wallet(&state, &auth.account_id, ch);
1441:     }
1442: 
1443:     let wallets: Vec<Value> = state
1444:         .db
1445:         .with(|c| {
1446:             let mut stmt = c.prepare(
1447:                 "SELECT id, label, network, pubkey, daily_limit_lamports \
1448:                  FROM account_wallets WHERE account_id = ?1 ORDER BY created_at",
1449:             )?;
1450:             let rows = stmt.query_map(params![auth.account_id], |r| {
1451:                 Ok(json!({
1452:                     "id": r.get::<_, String>(0)?,
1453:                     "label": r.get::<_, String>(1)?,
1454:                     "network": r.get::<_, String>(2)?,
1455:                     "pubkey": r.get::<_, String>(3)?,
1456:                     "daily_limit_lamports": r.get::<_, Option<i64>>(4)?,
1457:                 }))
1458:             })?;
1459:             rows.collect()
1460:         })
1461:         .unwrap_or_default();
1462: 
1463:     // Wallets conectadas del navegador (Phantom/MetaMask/…) — solo pubkeys.
1464:     let connected_wallets: Vec<Value> = state
1465:         .db
1466:         .with(|c| {
1467:             let mut stmt = c.prepare(
1468:                 "SELECT id, label, provider, chain, pubkey, is_active \
1469:                  FROM account_connected_wallets WHERE account_id = ?1 ORDER BY created_at",
1470:             )?;
1471:             let rows = stmt.query_map(params![auth.account_id], |r| {
1472:                 Ok(json!({
1473:                     "id": r.get::<_, String>(0)?,
1474:                     "label": r.get::<_, String>(1)?,
1475:                     "provider": r.get::<_, String>(2)?,
1476:                     "chain": r.get::<_, String>(3)?,
1477:                     "pubkey": r.get::<_, String>(4)?,
1478:                     "is_active": r.get::<_, i64>(5)? != 0,
1479:                 }))
1480:             })?;
1481:             rows.collect()
1482:         })
1483:         .unwrap_or_default();
1484:     let active_connected_wallet = connected_wallets
1485:         .iter()
1486:         .find(|w| w.get("is_active").map_or(false, |v| v == &json!(true)))
1487:         .cloned()
1488:         .unwrap_or(Value::Null);
1489: 
1490:     Ok(Json(json!({
1491:         "ok": true,
1492:         "account": account,
1493:         "llm": llm,        // null si no hay proveedor ACTIVO (el agente lo exige)
1494:         "llm_providers": llm_providers_list(&state, &auth.account_id),
1495:         "chain": chain,    // null si la cuenta no configuró red/wallet
1496:         "wallets": wallets,
1497:         "connected_wallets": connected_wallets,       // Phantom/MetaMask… (solo pubkeys)
1498:         "active_connected_wallet": active_connected_wallet, // la que está en uso
1499:         "x402": {
1500:             "protected_by_default": false,   // Fase 4: peaje reactivo 402
1501:             "mode": "manual",               // manual | delegated (Fase 4)
1502:         },
1503:     }))
1504:     .into_response())
1505: }
````

## File: api/src/modules/solana.rs
````rust
  1: //! [ Módulo x402 Solana ]
  2: //!
  3: //! - Sincronización del navbar: red activa, versión del nodo, slot, wallet y
  4: //!   balance en SOL (espejo de `/api/solana/status` del dapp).
  5: //! - Operaciones on-chain: transferencias SOL firmadas con ed25519-dalek y
  6: //!   envío JSON-RPC `sendTransaction` (base64) para liquidar micro-peajes.
  7: 
  8: use crate::b58;
  9: use crate::config::Config;
 10: use crate::db::{now_ms, ServiceRow};
 11: use crate::state::SharedState;
 12: use base64::Engine as _;
 13: use serde_json::{json, Value};
 14: use std::path::Path;
 15: use std::time::Duration;
 16: 
 17: #[allow(dead_code)] // documentado: 3 s de probe, igual que el dapp
 18: const TIMEOUT_SECS: u64 = 3;
 19: 
 20: // ---------------------------------------------------------------------------
 21: // Cliente JSON-RPC
 22: // ---------------------------------------------------------------------------
 23: 
 24: pub struct SolanaClient {
 25:     http: reqwest::Client,
 26:     url: String,
 27: }
 28: 
 29: impl SolanaClient {
 30:     pub fn new(http: reqwest::Client, url: impl Into<String>) -> Self {
 31:         Self { http, url: url.into() }
 32:     }
 33: 
 34:     pub async fn rpc(&self, method: &str, params: Value) -> Result<Value, String> {
 35:         let body = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
 36:         let res = self
 37:             .http
 38:             .post(&self.url)
 39:             .json(&body)
 40:             .timeout(Duration::from_secs(5))
 41:             .send()
 42:             .await
 43:             .map_err(|e| format!("rpc {method}: {e}"))?;
 44:         if !res.status().is_success() {
 45:             return Err(format!("rpc {method}: HTTP {}", res.status()));
 46:         }
 47:         let data: Value = res.json().await.map_err(|e| format!("rpc {method}: {e}"))?;
 48:         if let Some(err) = data.get("error") {
 49:             return Err(format!("rpc {method}: {err}"));
 50:         }
 51:         Ok(data.get("result").cloned().unwrap_or(Value::Null))
 52:     }
 53: 
 54:     pub async fn get_version(&self) -> Result<String, String> {
 55:         let r = self.rpc("getVersion", json!([])).await?;
 56:         Ok(r.get("solana-core")
 57:             .and_then(|v| v.as_str())
 58:             .unwrap_or("unknown")
 59:             .to_string())
 60:     }
 61: 
 62:     pub async fn get_slot(&self) -> Result<i64, String> {
 63:         let r = self
 64:             .rpc("getSlot", json!([{ "commitment": "confirmed" }]))
 65:             .await?;
 66:         r.as_i64().ok_or_else(|| "getSlot sin slot".to_string())
 67:     }
 68: 
 69:     pub async fn get_balance(&self, pubkey: &str) -> Result<i64, String> {
 70:         let r = self
 71:             .rpc("getBalance", json!([pubkey, { "commitment": "confirmed" }]))
 72:             .await?;
 73:         r.get("value")
 74:             .and_then(|v| v.as_i64())
 75:             .ok_or_else(|| "getBalance sin value".to_string())
 76:     }
 77: 
 78:     pub async fn get_latest_blockhash(&self) -> Result<String, String> {
 79:         let r = self.rpc("getLatestBlockhash", json!([{}])).await?;
 80:         r.get("value")
 81:             .and_then(|v| v.get("blockhash"))
 82:             .and_then(|v| v.as_str())
 83:             .map(|s| s.to_string())
 84:             .ok_or_else(|| "getLatestBlockhash sin blockhash".to_string())
 85:     }
 86: 
 87:     /// None = firma pendiente / desconocida.
 88:     /// Some((true, conf)) = confirmada; Some((false, err)) = rechazada on-chain.
 89:     pub async fn get_signature_status(
 90:         &self,
 91:         sig: &str,
 92:     ) -> Result<Option<(bool, Option<String>)>, String> {
 93:         let r = self
 94:             .rpc(
 95:                 "getSignatureStatuses",
 96:                 json!([[sig], { "searchTransactionHistory": false }]),
 97:             )
 98:             .await?;
 99:         let entry = r.get("value").and_then(|v| v.get(0));
100:         match entry {
101:             None | Some(Value::Null) => Ok(None),
102:             Some(v) => {
103:                 let conf = v
104:                     .get("confirmationStatus")
105:                     .and_then(|c| c.as_str())
106:                     .unwrap_or("");
107:                 let on_chain_err = v
108:                     .get("status")
109:                     .and_then(|s| s.get("Err"))
110:                     .map(|e| e.to_string());
111:                 if let Some(err) = on_chain_err {
112:                     return Ok(Some((false, Some(err))));
113:                 }
114:                 let ok = match v.get("status") {
115:                     Some(s) => s.get("Ok").is_some() || s.get("Err").is_none(),
116:                     None => matches!(conf, "confirmed" | "finalized"),
117:                 };
118:                 let conf = if conf.is_empty() { None } else { Some(conf.to_string()) };
119:                 Ok(Some((ok, conf)))
120:             }
121:         }
122:     }
123: 
124:     pub async fn send_transaction(&self, tx_b64: &str) -> Result<String, String> {
125:         let r = self
126:             .rpc(
127:                 "sendTransaction",
128:                 json!([tx_b64, { "encoding": "base64", "skipPreflight": true }]),
129:             )
130:             .await?;
131:         r.as_str()
132:             .map(|s| s.to_string())
133:             .ok_or_else(|| "sendTransaction sin firma".to_string())
134:     }
135: }
136: 
137: // ---------------------------------------------------------------------------
138: // Wallet: misma resolución que el dapp (SOLANA_WALLET → CLI config.yml → id.json)
139: // ---------------------------------------------------------------------------
140: 
141: pub fn home_dir() -> Option<String> {
142:     std::env::var("HOME").ok().filter(|v| !v.is_empty())
143: }
144: 
145: fn expand_home(p: &str) -> String {
146:     if let Some(home) = home_dir() {
147:         if p == "~" {
148:             return home;
149:         }
150:         if let Some(rest) = p.strip_prefix("~/") {
151:             return format!("{home}/{rest}");
152:         }
153:     }
154:     p.to_string()
155: }
156: 
157: /// Lee un keypair JSON de Solana: array de 64 bytes `[seed(32) || pubkey(32)]`.
158: pub fn keypair_bytes_from_json(path: &str) -> Result<[u8; 64], String> {
159:     let expanded = expand_home(path);
160:     let text = std::fs::read_to_string(&expanded)
161:         .map_err(|e| format!("keypair {expanded}: {e}"))?;
162:     let arr: Vec<u8> = serde_json::from_str(&text)
163:         .map_err(|e| format!("keypair {expanded}: JSON inválido: {e}"))?;
164:     if arr.len() < 64 {
165:         return Err(format!(
166:             "keypair {expanded}: {} bytes (se esperaban 64)",
167:             arr.len()
168:         ));
169:     }
170:     let mut kp = [0u8; 64];
171:     kp.copy_from_slice(&arr[..64]);
172:     Ok(kp)
173: }
174: 
175: /// Pubkey base58 (últimos 32 bytes del keypair).
176: pub fn pubkey_of_keypair_file(path: &str) -> Result<String, String> {
177:     let kp = keypair_bytes_from_json(path)?;
178:     Ok(b58::encode(&kp[32..]))
179: }
180: 
181: /// `keypair_path` del config.yml del CLI (parser YAML plano, sin dependencias).
182: fn keypair_path_from_cli_config() -> Option<String> {
183:     let home = home_dir()?;
184:     let path = format!("{home}/.config/solana/cli/config.yml");
185:     let text = std::fs::read_to_string(path).ok()?;
186:     for line in text.lines() {
187:         if let Some(rest) = line.strip_prefix("keypair_path:") {
188:             let v = rest.trim().trim_matches('"').trim_matches('\'').trim();
189:             if !v.is_empty() {
190:                 return Some(v.to_string());
191:             }
192:         }
193:     }
194:     None
195: }
196: 
197: /// Pubkey cuyo balance se sincroniza: `SOLANA_WALLET` (pubkey o ruta) o la
198: /// del CLI local (`~/.config/solana`).
199: pub fn resolve_wallet(cfg: &Config) -> Option<String> {
200:     if let Some(w) = cfg.solana_wallet.as_deref().map(str::trim).filter(|w| !w.is_empty()) {
201:         if w.contains('/') || w.ends_with(".json") || w.starts_with('~') {
202:             return pubkey_of_keypair_file(w).ok();
203:         }
204:         return Some(w.to_string());
205:     }
206:     let path = keypair_path_from_cli_config()
207:         .or_else(|| home_dir().map(|h| format!("{h}/.config/solana/id.json")))?;
208:     if !Path::new(&expand_home(&path)).exists() {
209:         return None;
210:     }
211:     pubkey_of_keypair_file(&path).ok()
212: }
213: 
214: // ---------------------------------------------------------------------------
215: // Sincronización a la DB (navbar: "Solana · Devnet / 2.1066 SOL")
216: // ---------------------------------------------------------------------------
217: 
218: pub async fn sync(state: &SharedState) {
219:     let network_label = state.cfg.solana_network_label();
220: 
221:     let Some(url) = state.cfg.solana_url().cloned() else {
222:         tracing::warn!("SOLANA_NETWORK «{}» no reconocida", state.cfg.solana_network);
223:         return;
224:     };
225:     let client = SolanaClient::new(state.http.clone(), url.clone());
226:     let wallet = resolve_wallet(&state.cfg);
227: 
228:     // Probe 1: el nodo responde + versión + slot.
229:     let (version, slot) = match tokio::join!(client.get_version(), client.get_slot()) {
230:         (Ok(v), Ok(s)) => (Some(v), Some(s)),
231:         (v, s) => {
232:             tracing::debug!("Solana probe: version={v:?} slot={s:?}");
233:             (v.ok(), s.ok())
234:         }
235:     };
236:     let running = version.is_some() || slot.is_some();
237: 
238:     // Probe 2: balance (solo si el nodo responde).
239:     let mut balance = None;
240:     if running {
241:         if let Some(w) = wallet.as_deref() {
242:             balance = client.get_balance(w).await.ok();
243:             if balance.is_none() {
244:                 tracing::debug!("getBalance sin resultado para {w}");
245:             }
246:         }
247:     }
248: 
249:     let detail = if running {
250:         format!("validator {version:?} · slot {:?}", slot.unwrap_or_default())
251:     } else {
252:         "sin conexión con el RPC".to_string()
253:     };
254: 
255:     let row = ServiceRow {
256:         id: "solana".into(),
257:         label: format!("Solana · {network_label}"),
258:         running,
259:         network: Some(network_label.clone()),
260:         endpoint: Some(url),
261:         version,
262:         slot,
263:         wallet: wallet.clone(),
264:         balance_lamports: balance,
265:         detail: Some(detail),
266:         updated_at: now_ms(),
267:     };
268: 
269:     match state.db.upsert_service(&row) {
270:         Ok(()) => {
271:             if running {
272:                 if let (Some(w), Some(lamports)) = (&wallet, balance) {
273:                     tracing::info!("Solana {network_label} → corriendo · {w}: {} SOL", fmt_sol(lamports));
274:                 } else {
275:                     tracing::info!("Solana {network_label} → corriendo");
276:                 }
277:             } else {
278:                 tracing::warn!("Solana {network_label} → sin conexión");
279:             }
280:         }
281:         Err(e) => tracing::warn!("sync solana db: {e}"),
282:     }
283: }
284: 
285: /// Lamports → "2.1066" (4 decimales, recorte de ceros finales).
286: pub fn fmt_sol(lamports: i64) -> String {
287:     let whole = lamports / 1_000_000_000;
288:     let frac = (lamports % 1_000_000_000) as u64 / 100_000; // 4 decimales
289:     if frac == 0 {
290:         format!("{whole} SOL")
291:     } else {
292:         let mut s = format!("{whole}.{frac:04}");
293:         while s.ends_with('0') {
294:             s.pop();
295:         }
296:         s
297:     }
298: }
299: 
300: // ---------------------------------------------------------------------------
301: // Transferencia SOL (SystemProgram::Transfer, tx legacy)
302: // ---------------------------------------------------------------------------
303: 
304: const SYSTEM_PROGRAM: [u8; 32] = [0u8; 32]; // 1111…1 = programa System
305: 
306: /// Compact-u16 (shortvec).
307: fn put_compact(out: &mut Vec<u8>, mut v: usize) {
308:     loop {
309:         let mut byte = (v & 0x7f) as u8;
310:         v >>= 7;
311:         if v != 0 {
312:             byte |= 0x80;
313:         }
314:         out.push(byte);
315:         if v == 0 {
316:             break;
317:         }
318:     }
319: }
320: 
321: /// Mensaje legacy: header [1 firmante, 0 writables firmados, 1 readonly],
322: /// cuentas [from(writ), to(writ), system(readonly)], blockhash y una
323: /// instrucción SystemProgram::Transfer (tag 2, lamports u64 LE).
324: pub fn build_transfer_message(
325:     from_pub: &[u8; 32],
326:     to: &[u8; 32],
327:     lamports: u64,
328:     blockhash: &[u8; 32],
329: ) -> Vec<u8> {
330:     let mut msg = Vec::with_capacity(160);
331:     msg.extend_from_slice(&[1u8, 0u8, 1u8]); // header
332:     put_compact(&mut msg, 3); // cuentas
333:     msg.extend_from_slice(from_pub);
334:     msg.extend_from_slice(to);
335:     msg.extend_from_slice(&SYSTEM_PROGRAM);
336:     msg.extend_from_slice(blockhash);
337:     put_compact(&mut msg, 1); // 1 instrucción
338: 
339:     msg.push(2u8); // índice del program id (system)
340:     put_compact(&mut msg, 2); // cuentas de la instrucción [0, 1]
341:     msg.push(0);
342:     msg.push(1);
343: 
344:     let data = [
345:         2u32.to_le_bytes().as_ref(),
346:         lamports.to_le_bytes().as_ref(),
347:     ]
348:     .concat();
349:     put_compact(&mut msg, data.len());
350:     msg.extend_from_slice(&data);
351:     msg
352: }
353: 
354: fn seed_of(kp: &[u8; 64]) -> [u8; 32] {
355:     let mut s = [0u8; 32];
356:     s.copy_from_slice(&kp[..32]);
357:     s
358: }
359: 
360: fn pub_of(kp: &[u8; 64]) -> [u8; 32] {
361:     let mut p = [0u8; 32];
362:     p.copy_from_slice(&kp[32..]);
363:     p
364: }
365: 
366: /// Firma ed25519 con la SEED del keypair. Verifica que la pubkey declarada
367: /// coincida con la derivada (un keypair malformado fallaría on-chain).
368: fn sign_message(seed: &[u8; 32], pubkey: &[u8; 32], message: &[u8]) -> Result<[u8; 64], String> {
369:     use ed25519_dalek::{Signer, SigningKey};
370:     let signing = SigningKey::from_bytes(seed);
371:     let verifying = signing.verifying_key();
372:     let derived = verifying.as_bytes();
373:     if derived != pubkey {
374:         return Err(format!(
375:             "keypair inválida: la pubkey no corresponde al seed ({} != {})",
376:             b58::encode(pubkey),
377:             b58::encode(derived)
378:         ));
379:     }
380:     let mut sig = [0u8; 64];
381:     sig.copy_from_slice(signing.sign(message).to_bytes().as_ref());
382:     Ok(sig)
383: }
384: 
385: /// Transfiere `lamports` de un keypair local (ruta) a `to` y devuelve la firma.
386: pub async fn transfer_lamports(
387:     client: &SolanaClient,
388:     payer_keypair_path: &str,
389:     to_pubkey: &str,
390:     lamports: u64,
391: ) -> Result<String, String> {
392:     let kp = keypair_bytes_from_json(payer_keypair_path)?;
393:     transfer_lamports_with_kp(client, &kp, to_pubkey, lamports).await
394: }
395: 
396: /// dPaaS: firma con un keypair EN MEMORIA (descifrado de la cuenta, nunca
397: /// tocando disco) y envía la transferencia. Devuelve la firma on-chain.
398: pub async fn transfer_lamports_with_kp(
399:     client: &SolanaClient,
400:     kp: &[u8; 64],
401:     to_pubkey: &str,
402:     lamports: u64,
403: ) -> Result<String, String> {
404:     let from_pub = pub_of(kp);
405: 
406:     let to_bytes = b58::decode(to_pubkey)?;
407:     if to_bytes.len() != 32 {
408:         return Err(format!("pubkey destino inválida ({})", to_bytes.len()));
409:     }
410:     let mut to = [0u8; 32];
411:     to.copy_from_slice(&to_bytes);
412: 
413:     let blockhash_b58 = client.get_latest_blockhash().await?;
414:     let bh_bytes = b58::decode(&blockhash_b58)?;
415:     if bh_bytes.len() != 32 {
416:         return Err("blockhash inválido recibido del RPC".to_string());
417:     }
418:     let mut bh = [0u8; 32];
419:     bh.copy_from_slice(&bh_bytes);
420: 
421:     let msg = build_transfer_message(&from_pub, &to, lamports, &bh);
422:     let sig = sign_message(&seed_of(kp), &from_pub, &msg)?;
423: 
424:     // Tx wire: compact(1 firmante) + firma(64) + message.
425:     let mut tx = Vec::with_capacity(1 + 64 + msg.len());
426:     tx.push(1u8);
427:     tx.extend_from_slice(&sig);
428:     tx.extend_from_slice(&msg);
429: 
430:     let tx_b64 = base64::engine::general_purpose::STANDARD.encode(&tx);
431:     client.send_transaction(&tx_b64).await
432: }
433: 
434: #[cfg(test)]
435: mod tests {
436:     use super::*;
437: 
438:     #[test]
439:     fn fmt_sol_values() {
440:         assert_eq!(fmt_sol(2_106_558_960), "2.1065");
441:         assert_eq!(fmt_sol(2_100_000_000), "2.1");
442:         assert_eq!(fmt_sol(0), "0 SOL");
443:         assert_eq!(fmt_sol(1_000_000_000), "1 SOL");
444:     }
445: 
446:     #[test]
447:     fn system_program_b58() {
448:         assert_eq!(b58::encode(&SYSTEM_PROGRAM), "1".repeat(32));
449:     }
450: 
451:     #[test]
452:     fn transfer_message_shape() {
453:         let bh = [7u8; 32];
454:         let msg = build_transfer_message(&[1; 32], &[2; 32], 1000, &bh);
455:         assert_eq!(&msg[..3], &[1, 0, 1]);
456:         assert_eq!(msg[3], 3); // 3 cuentas
457:         assert_eq!(&msg[4..36], &[1u8; 32]); // from
458:         assert_eq!(&msg[36..68], &[2u8; 32]); // to
459:         assert_eq!(&msg[68..100], &[0u8; 32]); // system
460:         assert_eq!(&msg[100..132], &bh);
461:     }
462: }
````

## File: api/src/modules/x402.rs
````rust
   1: //! [ Módulo x402 Solana ] — liquida micro-peajes en background.
   2: //!
   3: //! Facturas entrantes (`x402_invoices`): el cliente paga transferiendo SOL al
   4: //! `payee` y registra la firma; el settler comprueba la confirmación on-chain
   5: //! en background hasta agotar intentos.
   6: //!
   7: //! Liquidaciones salientes (`x402_payouts`): se encolan vía `POST
   8: //! /api/x402/pay` y el settler las firma + envía + confirma con el keypair de
   9: //! `SOLANA_PAYER_KEYPAIR`. Sin ese keypair el endpoint responde 503.
  10: 
  11: use crate::crypto;
  12: use crate::db::{new_id, now_ms};
  13: use crate::error::{AppError, AppResult};
  14: use crate::modules::solana::{self, SolanaClient};
  15: use crate::state::SharedState;
  16: use axum::extract::{Path, State};
  17: use axum::http::{HeaderMap, HeaderValue, StatusCode};
  18: use axum::response::{IntoResponse, Response};
  19: use axum::Json;
  20: use rusqlite::params;
  21: use serde::{Deserialize, Serialize};
  22: use serde_json::{json, Value};
  23: use std::time::Duration;
  24: 
  25: // ---------------------------------------------------------------------------
  26: // Filas
  27: // ---------------------------------------------------------------------------
  28: 
  29: #[derive(Debug, Clone, Serialize)]
  30: pub struct Invoice {
  31:     pub id: String,
  32:     pub resource: String,
  33:     pub amount_lamports: i64,
  34:     pub payee: String,
  35:     pub status: String, // pending | verifying | settled | failed
  36:     pub tx_signature: Option<String>,
  37:     pub confirmation_status: Option<String>,
  38:     pub created_at: i64,
  39:     pub updated_at: i64,
  40:     /// Cuenta que debe pagar (multi-tenant; "system" = global).
  41:     pub account_id: String,
  42:     /// Fase 3 — anti-replay: timestamp de consumo (X-Payment one-shot).
  43:     /// None = factura vigente; Some = ya fue usada → reintento → 409.
  44:     pub consumed_at: Option<i64>,
  45:     /// NomikOS Fase 1 — dispositivo que provocó el peaje (si el Bearer
  46:     /// era un token de dispositivo).
  47:     pub device_id: Option<String>,
  48:     /// Cómo pagar esta factura (texto).
  49:     pub pay_hint: String,
  50: }
  51: 
  52: const INVOICE_COLS: &str =
  53:     "id, resource, amount_lamports, payee, status, tx_signature, confirmation_status, \
  54:      created_at, updated_at, account_id, consumed_at, device_id";
  55: 
  56: fn row_to_invoice(r: &rusqlite::Row<'_>) -> rusqlite::Result<Invoice> {
  57:     Ok(Invoice {
  58:         id: r.get(0)?,
  59:         resource: r.get(1)?,
  60:         amount_lamports: r.get(2)?,
  61:         payee: r.get(3)?,
  62:         status: r.get(4)?,
  63:         tx_signature: r.get(5)?,
  64:         confirmation_status: r.get(6)?,
  65:         created_at: r.get(7)?,
  66:         updated_at: r.get(8)?,
  67:         account_id: r.get(9)?,
  68:         consumed_at: r.get(10)?,
  69:         device_id: r.get(11)?,
  70:         pay_hint: String::new(),
  71:     })
  72: }
  73: 
  74: fn invoice_with_hint(mut inv: Invoice, device_name: &str) -> Invoice {
  75:     inv.pay_hint = format!(
  76:         "Transfiere {} lamports a {} (memo «{device_name}»), luego \
  77:          POST /api/x402/invoices/{}/verify con la firma y repite la petición \
  78:          con header X-Payment: {}",
  79:         inv.amount_lamports, inv.payee, inv.id, inv.id
  80:     );
  81:     inv
  82: }
  83: 
  84: #[derive(Debug, Clone, Serialize)]
  85: pub struct Payout {
  86:     pub id: String,
  87:     pub to_wallet: String,
  88:     pub amount_lamports: i64,
  89:     pub memo: Option<String>,
  90:     pub status: String, // queued | sent | confirmed | failed
  91:     pub tx_signature: Option<String>,
  92:     pub attempts: i64,
  93:     pub error: Option<String>,
  94:     pub created_at: i64,
  95:     pub updated_at: i64,
  96:     /// Cuenta que firma el pago (dPaaS); "system" = keypair global.
  97:     pub account_id: String,
  98: }
  99: 
 100: const PAYOUT_COLS: &str =
 101:     "id, to_wallet, amount_lamports, memo, status, tx_signature, attempts, error, \
 102:      created_at, updated_at, account_id";
 103: 
 104: fn row_to_payout(r: &rusqlite::Row<'_>) -> rusqlite::Result<Payout> {
 105:     Ok(Payout {
 106:         id: r.get(0)?,
 107:         to_wallet: r.get(1)?,
 108:         amount_lamports: r.get(2)?,
 109:         memo: r.get(3)?,
 110:         status: r.get(4)?,
 111:         tx_signature: r.get(5)?,
 112:         attempts: r.get(6)?,
 113:         error: r.get(7)?,
 114:         created_at: r.get(8)?,
 115:         updated_at: r.get(9)?,
 116:         account_id: r.get(10)?,
 117:     })
 118: }
 119: 
 120: // ---------------------------------------------------------------------------
 121: // Helpers DB
 122: // ---------------------------------------------------------------------------
 123: 
 124: fn load_invoice(state: &SharedState, id: &str) -> AppResult<Invoice> {
 125:     let inv = state
 126:         .db
 127:         .with(|c| {
 128:             c.query_row(
 129:                 &format!("SELECT {INVOICE_COLS} FROM x402_invoices WHERE id = ?1"),
 130:                 params![id],
 131:                 row_to_invoice,
 132:             )
 133:         })
 134:         .map_err(|e| match e {
 135:             rusqlite::Error::QueryReturnedNoRows => {
 136:                 AppError::not_found(format!("invoice «{id}» no encontrada"))
 137:             }
 138:             other => AppError::internal(format!("db: {other}")),
 139:         })?;
 140:     Ok(invoice_with_hint(inv, &state.cfg.device_name))
 141: }
 142: 
 143: fn invoice_value_of(state: &SharedState, inv: Invoice) -> Value {
 144:     let with_hint = invoice_with_hint(inv, &state.cfg.device_name);
 145:     serde_json::to_value(with_hint).unwrap_or(Value::Null)
 146: }
 147: 
 148: /// (estado, firma, intentos) de una factura.
 149: fn invoice_state_of(state: &SharedState, id: &str) -> Option<(String, Option<String>, i64)> {
 150:     state
 151:         .db
 152:         .with(|c| {
 153:             c.query_row(
 154:                 "SELECT status, tx_signature, verify_attempts FROM x402_invoices WHERE id = ?1",
 155:                 params![id],
 156:                 |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, i64>(2)?)),
 157:             )
 158:         })
 159:         .ok()
 160: }
 161: 
 162: fn list_invoices(state: &SharedState, status: Option<&str>) -> Vec<Invoice> {
 163:     state
 164:         .db
 165:         .with(|c| {
 166:             let (sql, filter): (String, Vec<&str>) = match status {
 167:                 Some(s) => (
 168:                     format!("SELECT {INVOICE_COLS} FROM x402_invoices WHERE status = ?1 ORDER BY created_at DESC LIMIT 100"),
 169:                     vec![s],
 170:                 ),
 171:                 None => (
 172:                     format!("SELECT {INVOICE_COLS} FROM x402_invoices ORDER BY created_at DESC LIMIT 100"),
 173:                     vec![],
 174:                 ),
 175:             };
 176:             let mut stmt = c.prepare(&sql)?;
 177:             let rows = stmt.query_map(rusqlite::params_from_iter(filter), row_to_invoice)?;
 178:             rows.collect()
 179:         })
 180:         .unwrap_or_default()
 181: }
 182: 
 183: fn list_payouts(state: &SharedState, status: &str) -> Vec<Payout> {
 184:     state
 185:         .db
 186:         .with(|c| {
 187:             let mut stmt = c.prepare(&format!(
 188:                 "SELECT {PAYOUT_COLS} FROM x402_payouts WHERE status = ?1 ORDER BY created_at"
 189:             ))?;
 190:             let rows = stmt.query_map(params![status], row_to_payout)?;
 191:             rows.collect()
 192:         })
 193:         .unwrap_or_default()
 194: }
 195: 
 196: async fn client_for(state: &SharedState) -> AppResult<SolanaClient> {
 197:     let url = state.cfg.solana_url().cloned().ok_or_else(|| {
 198:         AppError::unavailable(format!("SOLANA_NETWORK «{}» desconocida", state.cfg.solana_network))
 199:     })?;
 200:     Ok(SolanaClient::new(state.http.clone(), url))
 201: }
 202: 
 203: fn default_payee(state: &SharedState) -> Option<String> {
 204:     if let Some(p) = state.cfg.x402_payee.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
 205:         return Some(p.to_string());
 206:     }
 207:     solana::resolve_wallet(&state.cfg)
 208: }
 209: 
 210: // ---------------------------------------------------------------------------
 211: // Facturas: crear / listar / obtener / verificar
 212: // ---------------------------------------------------------------------------
 213: 
 214: /// JSON de una factura por id (con hint), para handlers y el agente.
 215: pub async fn invoice_value(state: &SharedState, id: &str) -> AppResult<Value> {
 216:     let inv = load_invoice(state, id)?;
 217:     Ok(invoice_value_of(state, inv))
 218: }
 219: 
 220: struct NewInvoice {
 221:     resource: String,
 222:     amount_lamports: i64,
 223:     account_id: String,
 224: }
 225: 
 226: /// Crea la factura y devuelve su JSON (con hint de pago). Compatibilidad:
 227: /// cuenta implícita "system".
 228: pub async fn create_invoice_value(
 229:     state: &SharedState,
 230:     resource: &str,
 231:     amount_lamports: i64,
 232: ) -> AppResult<Value> {
 233:     create_invoice_value_for(state, resource, amount_lamports, None, None).await
 234: }
 235: 
 236: /// Versión multi-tenant: `account_id` = Some(cuenta autenticada) | None
 237: /// ("system"). La factura queda ligada a quien debe pagar; `device_id`
 238: /// (NomikOS Fase 1) registra qué dispositivo de la flota la provocó.
 239: #[allow(clippy::too_many_arguments)]
 240: pub async fn create_invoice_value_for(
 241:     state: &SharedState,
 242:     resource: &str,
 243:     amount_lamports: i64,
 244:     account_id: Option<&str>,
 245:     device_id: Option<&str>,
 246: ) -> AppResult<Value> {
 247:     let body = NewInvoice {
 248:         resource: resource.trim().to_string(),
 249:         amount_lamports,
 250:         account_id: account_id.unwrap_or("system").to_string(),
 251:     };
 252:     if body.resource.is_empty() {
 253:         return Err(AppError::bad_request("resource vacío"));
 254:     }
 255:     if body.amount_lamports <= 0 {
 256:         return Err(AppError::bad_request("amount_lamports debe ser > 0"));
 257:     }
 258:     let Some(payee) = default_payee(state) else {
 259:         return Err(AppError::unavailable(
 260:             "Sin wallet para cobrar: configura X402_PAYEE_WALLET o SOLANA_WALLET",
 261:         ));
 262:     };
 263: 
 264:     let id = new_id("x402");
 265:     let now = now_ms();
 266:     state.db.with(|c| {
 267:         c.execute(
 268:             "INSERT INTO x402_invoices (id, resource, amount_lamports, payee, status, \
 269:              account_id, device_id, created_at, updated_at) \
 270:              VALUES (?1, ?2, ?3, ?4, 'pending', ?5, ?6, ?7, ?8)",
 271:             params![id, body.resource, body.amount_lamports, payee, body.account_id, device_id, now, now],
 272:         )?;
 273:         Ok(())
 274:     })?;
 275: 
 276:     let inv = load_invoice(state, &id)?;
 277:     tracing::info!(
 278:         "x402 invoice {id}: {} lamports por «{}» (cuenta {})",
 279:         body.amount_lamports, body.resource, body.account_id
 280:     );
 281:     Ok(invoice_value_of(state, inv))
 282: }
 283: 
 284: /// Handlers HTTP ------------------------------------------------------------
 285: 
 286: pub async fn create_invoice_handler(
 287:     State(state): State<SharedState>,
 288:     Json(body): Json<CreateInvoiceBody>,
 289: ) -> AppResult<impl IntoResponse> {
 290:     let v = create_invoice_value(&state, &body.resource, body.amount_lamports).await?;
 291:     Ok(Json(v))
 292: }
 293: 
 294: #[derive(Deserialize)]
 295: pub struct CreateInvoiceBody {
 296:     pub resource: String,
 297:     pub amount_lamports: i64,
 298: }
 299: 
 300: pub async fn list_handler(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
 301:     let invoices = list_invoices(&state, None);
 302:     Ok(Json(json!({ "ok": true, "invoices": invoices })))
 303: }
 304: 
 305: pub async fn get_handler(
 306:     State(state): State<SharedState>,
 307:     Path(id): Path<String>,
 308: ) -> AppResult<impl IntoResponse> {
 309:     Ok(Json(load_invoice(&state, &id)?))
 310: }
 311: 
 312: pub async fn payouts_handler(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
 313:     let rows: Vec<Payout> = state
 314:         .db
 315:         .with(|c| {
 316:             let mut stmt = c.prepare(&format!(
 317:                 "SELECT {PAYOUT_COLS} FROM x402_payouts ORDER BY created_at DESC LIMIT 100"
 318:             ))?;
 319:             let rows = stmt.query_map([], row_to_payout)?;
 320:             rows.collect()
 321:         })
 322:         .unwrap_or_default();
 323:     Ok(Json(json!({ "ok": true, "payouts": rows })))
 324: }
 325: 
 326: #[derive(Deserialize)]
 327: pub struct VerifyBody {
 328:     pub tx_signature: String,
 329: }
 330: 
 331: /// Verificación inmediata; el settler mantiene reintentos en background.
 332: pub async fn verify_handler(
 333:     State(state): State<SharedState>,
 334:     Path(id): Path<String>,
 335:     Json(body): Json<VerifyBody>,
 336: ) -> AppResult<impl IntoResponse> {
 337:     Ok(Json(verify_invoice(&state, &id, body.tx_signature).await?))
 338: }
 339: 
 340: pub async fn verify_invoice(
 341:     state: &SharedState,
 342:     id: &str,
 343:     tx_signature: String,
 344: ) -> AppResult<Value> {
 345:     let tx_signature = tx_signature.trim().to_string();
 346:     if tx_signature.is_empty() {
 347:         return Err(AppError::bad_request("tx_signature vacío"));
 348:     }
 349:     let inv = load_invoice(state, id)?;
 350:     if inv.status == "settled" {
 351:         return Ok(invoice_value_of(state, inv));
 352:     }
 353: 
 354:     state.db.with(|c| {
 355:         c.execute(
 356:             "UPDATE x402_invoices SET tx_signature = ?1, status = 'verifying', \
 357:              verify_attempts = 0, updated_at = ?2 WHERE id = ?3",
 358:             params![tx_signature, now_ms(), id],
 359:         )?;
 360:         Ok(())
 361:     })?;
 362: 
 363:     if let Some(next) = attempt_verify(state, id).await {
 364:         return Ok(next);
 365:     }
 366:     Ok(invoice_value_of(state, load_invoice(state, id)?))
 367: }
 368: 
 369: /// Un intento de verificación on-chain. Devuelve el JSON si el estado cambió;
 370: /// `None` = seguir pendiente (el settler reintenta).
 371: async fn attempt_verify(state: &SharedState, id: &str) -> Option<Value> {
 372:     let (status, sig, attempts) = invoice_state_of(state, id)?;
 373:     if status != "verifying" {
 374:         return None;
 375:     }
 376:     let sig = sig?;
 377: 
 378:     let client = match client_for(state).await {
 379:         Ok(c) => c,
 380:         Err(e) => {
 381:             tracing::warn!("verify x402 {id}: {e}");
 382:             return None;
 383:         }
 384:     };
 385: 
 386:     match client.get_signature_status(&sig).await {
 387:         Ok(Some((true, conf))) => {
 388:             mark_invoice(state, id, "settled", conf.as_deref());
 389:             Some(invoice_value_of(state, load_invoice(state, id).ok()?))
 390:         }
 391:         Ok(Some((false, err))) => {
 392:             let err = err.unwrap_or_else(|| "tx rechazada on-chain".to_string());
 393:             tracing::warn!("x402 invoice {id} falló: {err}");
 394:             mark_invoice(state, id, "failed", Some(&err));
 395:             Some(invoice_value_of(state, load_invoice(state, id).ok()?))
 396:         }
 397:         Ok(None) => {
 398:             let n = attempts + 1;
 399:             state.db.with(|c| {
 400:                 c.execute(
 401:                     "UPDATE x402_invoices SET verify_attempts = ?1, updated_at = ?2 WHERE id = ?3",
 402:                     params![n, now_ms(), id],
 403:                 )?;
 404:                 Ok(())
 405:             }).ok()?;
 406:             if n >= state.cfg.x402_max_verify_attempts.max(1) as i64 {
 407:                 mark_invoice(state, id, "failed", Some("sin confirmación on-chain"));
 408:                 Some(invoice_value_of(state, load_invoice(state, id).ok()?))
 409:             } else {
 410:                 None
 411:             }
 412:         }
 413:         Err(e) => {
 414:             tracing::warn!("verify x402 {id}: {e}"); // RPC caído → reintenta el settler
 415:             None
 416:         }
 417:     }
 418: }
 419: 
 420: fn mark_invoice(state: &SharedState, id: &str, status: &str, conf: Option<&str>) {
 421:     let res = state.db.with(|c| {
 422:         c.execute(
 423:             "UPDATE x402_invoices SET status = ?1, confirmation_status = ?2, updated_at = ?3 \
 424:              WHERE id = ?4",
 425:             params![status, conf, now_ms(), id],
 426:         )?;
 427:         Ok(())
 428:     });
 429:     if let Err(e) = res {
 430:         tracing::warn!("mark_invoice {id}: {e}");
 431:     }
 432: }
 433: 
 434: // ---------------------------------------------------------------------------
 435: // Liquidaciones salientes
 436: // ---------------------------------------------------------------------------
 437: 
 438: // ---------------------------------------------------------------------------
 439: // dPaaS (Fase 4) — firma delegada por cuenta
 440: // ---------------------------------------------------------------------------
 441: 
 442: /// Firmante y red de un pago delegado.
 443: enum Payer {
 444:     /// keypair global (SOLANA_PAYER_KEYPAIR, cuenta "system").
 445:     System,
 446:     /// dPaaS: keypair descifrado de la cuenta + red de SU cadena.
 447:     Account { network: String, keypair: [u8; 64] },
 448: }
 449: 
 450: impl Payer {
 451:     fn account_label(&self) -> &str {
 452:         match self {
 453:             Payer::System => "system",
 454:             Payer::Account { .. } => "cuenta",
 455:         }
 456:     }
 457: }
 458: 
 459: /// Resuelve quién firma un pago: la cuenta (dPaaS, keypair descifrado en
 460: /// memoria) o el keypair global de "system". Es el paso «3. Pide firma»
 461: /// del Gestor de Wallet del diagrama.
 462: fn resolve_payer(state: &SharedState, account_id: &str) -> AppResult<Payer> {
 463:     if account_id == "system" {
 464:         if state.cfg.payer_keypair.is_none() {
 465:             return Err(AppError::unavailable(
 466:                 "x402 system: configura SOLANA_PAYER_KEYPAIR (ruta a keypair JSON con fondos)",
 467:             ));
 468:         }
 469:         return Ok(Payer::System);
 470:     }
 471: 
 472:     // Cuenta autenticada: keypair cifrado en reposo + red de la cuenta.
 473:     let row = state
 474:         .db
 475:         .with(|c| {
 476:             c.query_row(
 477:                 "SELECT payer_keypair_enc, network FROM account_chain WHERE account_id = ?1",
 478:                 params![account_id],
 479:                 |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?)),
 480:             )
 481:         })
 482:         .map_err(|_| {
 483:             AppError::bad_request("la cuenta no configuró su cadena (PUT /api/accounts/me/chain)")
 484:         })?;
 485:     let (Some(enc), network) = row else {
 486:         return Err(AppError::bad_request(
 487:             "la cuenta no importó el keypair del orquestador (POST /api/accounts/me/chain/keypair/import)",
 488:         ));
 489:     };
 490:     let mk = state
 491:         .cfg
 492:         .accounts_master_key
 493:         .ok_or_else(|| AppError::unavailable("ACCOUNTS_MASTER_KEY no configurada"))?;
 494:     let raw = crypto::open(&mk, &enc).map_err(|e| AppError::internal(format!("dPaaS: {e}")))?;
 495:     let json = String::from_utf8(raw)
 496:         .map_err(|_| AppError::internal("dPaaS: keypair no es UTF-8"))?;
 497:     let kp = crate::modules::accounts::parse_keypair_str(&json)?;
 498:     Ok(Payer::Account { network, keypair: kp })
 499: }
 500: 
 501: /// Cliente RPC para una red concreta (la de la cuenta o la global).
 502: /// Cliente RPC por nombre de red (dPaaS usa la red de la cuenta; el
 503: /// faucet de devnet la usa fija).
 504: pub async fn client_for_network(state: &SharedState, network: &str) -> AppResult<SolanaClient> {
 505:     let url = state
 506:         .cfg
 507:         .solana_urls
 508:         .get(network)
 509:         .cloned()
 510:         .ok_or_else(|| AppError::bad_request(format!("red «{network}» desconocida")))?;
 511:     Ok(SolanaClient::new(state.http.clone(), url))
 512: }
 513: 
 514: /// Cliente RPC del firmante (dPaaS usa la red de la cuenta).
 515: async fn client_for_payer(state: &SharedState, payer: &Payer) -> AppResult<SolanaClient> {
 516:     match payer {
 517:         Payer::System => client_for(state).await,
 518:         Payer::Account { network, .. } => client_for_network(state, network).await,
 519:     }
 520: }
 521: 
 522: /// Valida los límites dPaaS de la cuenta (tx_limit y daily de 24h).
 523: /// "system" no tiene límites. Sin límites configurados → permite.
 524: fn check_limits(state: &SharedState, account_id: &str, amount: i64) -> AppResult<()> {
 525:     if account_id == "system" {
 526:         return Ok(());
 527:     }
 528:     let (tx_limit, daily_limit) = state
 529:         .db
 530:         .with(|c| {
 531:             c.query_row(
 532:                 "SELECT tx_limit_lamports, daily_limit_lamports FROM account_chain WHERE account_id = ?1",
 533:                 params![account_id],
 534:                 |r| Ok((r.get::<_, Option<i64>>(0)?, r.get::<_, Option<i64>>(1)?)),
 535:             )
 536:         })
 537:         .unwrap_or((None, None));
 538: 
 539:     if let Some(tx) = tx_limit {
 540:         if amount > tx {
 541:             return Err(AppError::bad_request(format!(
 542:                 "excede tx_limit_lamports de la cuenta (max {tx}, solicitado {amount})"
 543:             )));
 544:         }
 545:     }
 546:     if let Some(daily) = daily_limit {
 547:         let used: i64 = state
 548:             .db
 549:             .with(|c| {
 550:                 c.query_row(
 551:                     "SELECT COALESCE(SUM(amount_lamports), 0) FROM x402_payouts \
 552:                      WHERE account_id = ?1 AND status != 'failed' AND created_at > ?2",
 553:                     params![account_id, now_ms() - 86_400_000],
 554:                     |r| r.get(0),
 555:                 )
 556:             })
 557:             .unwrap_or(0);
 558:         if used + amount > daily {
 559:             return Err(AppError::bad_request(format!(
 560:                 "límite diario excedido: usados {used} + {amount} > daily_limit {daily} (últimas 24h)"
 561:             )));
 562:         }
 563:     }
 564:     Ok(())
 565: }
 566: 
 567: #[derive(Deserialize)]
 568: pub struct PayBody {
 569:     pub to: String,
 570:     pub lamports: i64,
 571:     #[serde(default)]
 572:     pub memo: Option<String>,
 573: }
 574: 
 575: /// Encola una liquidación saliente (validación + límites dPaaS incluidos).
 576: /// `account_id`: "system" (keypair global) o una cuenta autenticada (dPaaS).
 577: pub async fn pay_value(state: &SharedState, body: PayBody, account_id: &str) -> AppResult<Value> {
 578:     // El firmante debe existir ANTES de encolar (fallo rápido y claro).
 579:     resolve_payer(state, account_id)?;
 580:     if body.to.trim().is_empty() {
 581:         return Err(AppError::bad_request("to vacío"));
 582:     }
 583:     if body.lamports <= 0 {
 584:         return Err(AppError::bad_request("lamports debe ser > 0"));
 585:     }
 586:     check_limits(state, account_id, body.lamports)?;
 587: 
 588:     let id = new_id("payout");
 589:     let now = now_ms();
 590:     state.db.with(|c| {
 591:         c.execute(
 592:             "INSERT INTO x402_payouts (id, to_wallet, amount_lamports, memo, status, account_id, \
 593:              created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'queued', ?5, ?6, ?6)",
 594:             params![id, body.to.trim(), body.lamports, body.memo, account_id, now],
 595:         )?;
 596:         Ok(())
 597:     })?;
 598: 
 599:     let payout: Payout = state
 600:         .db
 601:         .with(|c| {
 602:             c.query_row(
 603:                 &format!("SELECT {PAYOUT_COLS} FROM x402_payouts WHERE id = ?1"),
 604:                 params![id],
 605:                 row_to_payout,
 606:             )
 607:         })
 608:         .map_err(|e| AppError::internal(format!("payout {id} tras insertar: {e}")))?;
 609: 
 610:     tracing::info!(
 611:         "x402 payout {id} encolado (cuenta {account_id}): {} lamports → {}",
 612:         body.lamports, body.to.trim()
 613:     );
 614:     Ok(serde_json::to_value(payout)?)
 615: }
 616: 
 617: /// POST /api/x402/pay — identidad opcional: con Bearer encola el pago de ESA
 618: /// cuenta (dPaaS); sin token usa el keypair global de "system".
 619: pub async fn pay_handler(
 620:     State(state): State<SharedState>,
 621:     headers: HeaderMap,
 622:     Json(body): Json<PayBody>,
 623: ) -> AppResult<Response> {
 624:     let account = crate::modules::accounts::resolve_account_id(&state, &headers)?
 625:         .unwrap_or_else(|| "system".to_string());
 626:     Ok(Json(pay_value(&state, body, &account).await?).into_response())
 627: }
 628: 
 629: fn payout_set(
 630:     state: &SharedState,
 631:     id: &str,
 632:     status: &str,
 633:     tx: Option<&str>,
 634:     error: Option<&str>,
 635: ) {
 636:     let res = state.db.with(|c| {
 637:         c.execute(
 638:             "UPDATE x402_payouts SET status = ?1, tx_signature = COALESCE(?2, tx_signature), \
 639:              error = COALESCE(?3, CASE WHEN ?1 IN ('confirmed', 'queued') THEN NULL \
 640:              ELSE error END), updated_at = ?4 WHERE id = ?5",
 641:             params![status, tx, error, now_ms(), id],
 642:         )?;
 643:         Ok(())
 644:     });
 645:     if let Err(e) = res {
 646:         tracing::warn!("payout_set {id}: {e}");
 647:     }
 648: }
 649: 
 650: /// Suma un intento y marca `failed` si se agotan.
 651: fn payout_attempt(state: &SharedState, id: &str, phase: &str, error: &str, max: i64) {
 652:     let updated = state.db.with(|c| {
 653:         c.execute(
 654:             "UPDATE x402_payouts SET attempts = attempts + 1, error = ?1, updated_at = ?2 \
 655:              WHERE id = ?3",
 656:             params![format!("{phase}: {error}"), now_ms(), id],
 657:         )?;
 658:         let attempts: i64 = c.query_row(
 659:             "SELECT attempts FROM x402_payouts WHERE id = ?1",
 660:             params![id],
 661:             |r| r.get(0),
 662:         )?;
 663:         if attempts >= max {
 664:             c.execute(
 665:                 "UPDATE x402_payouts SET status = 'failed', updated_at = ?1 WHERE id = ?2",
 666:                 params![now_ms(), id],
 667:             )?;
 668:         }
 669:         Ok(attempts)
 670:     });
 671:     match updated {
 672:         Ok(n) if n >= max => tracing::warn!("x402 payout {id} agotó intentos: {error}"),
 673:         Ok(_) => tracing::debug!("x402 payout {id} reintento pendiente: {error}"),
 674:         Err(e) => tracing::warn!("payout_attempt {id}: {e}"),
 675:     }
 676: }
 677: 
 678: /// Dos fases: queued → firmar+enviar (dPaaS: keypair de la cuenta, SU red);
 679: /// sent → confirmar on-chain (RPC de la misma red).
 680: async fn advance_payouts(state: &SharedState) {
 681:     for p in list_payouts(state, "queued") {
 682:         // Resuelve el firmante por cuenta (paso «3. Pide firma» del diagrama).
 683:         let payer = match resolve_payer(state, &p.account_id) {
 684:             Ok(p) => p,
 685:             Err(e) => {
 686:                 payout_attempt(state, &p.id, "resolve", &e.message, 3);
 687:                 continue;
 688:             }
 689:         };
 690:         let client = match client_for_payer(state, &payer).await {
 691:             Ok(c) => c,
 692:             Err(e) => {
 693:                 payout_attempt(state, &p.id, "rpc", &e.message, 3);
 694:                 continue;
 695:             }
 696:         };
 697: 
 698:         let sent = match &payer {
 699:             Payer::System => {
 700:                 let path = state.cfg.payer_keypair.clone().unwrap_or_default();
 701:                 solana::transfer_lamports(&client, &path, &p.to_wallet, p.amount_lamports as u64)
 702:                     .await
 703:             }
 704:             Payer::Account { keypair, .. } => {
 705:                 solana::transfer_lamports_with_kp(&client, keypair, &p.to_wallet, p.amount_lamports as u64)
 706:                     .await
 707:             }
 708:         };
 709: 
 710:         match sent {
 711:             Ok(sig) => {
 712:                 payout_set(state, &p.id, "sent", Some(&sig), None);
 713:                 tracing::info!(
 714:                     "x402 payout {} enviada por {} → {sig} (esperando confirmación)",
 715:                     p.id, payer.account_label()
 716:                 );
 717:             }
 718:             Err(e) => {
 719:                 payout_attempt(state, &p.id, "send", &e, 3);
 720:             }
 721:         }
 722:     }
 723: 
 724:     for p in list_payouts(state, "sent") {
 725:         let Some(sig) = p.tx_signature.clone() else { continue };
 726:         // Confirmar en la red del firmante de esa cuenta.
 727:         let Ok(payer) = resolve_payer(state, &p.account_id) else { continue };
 728:         let Ok(client) = client_for_payer(state, &payer).await else { continue };
 729:         match client.get_signature_status(&sig).await {
 730:             Ok(Some((true, _conf))) => {
 731:                 payout_set(state, &p.id, "confirmed", None, None);
 732:                 tracing::info!("x402 payout {} confirmado on-chain ({})", p.id, payer.account_label());
 733:             }
 734:             Ok(Some((false, err))) => {
 735:                 payout_set(state, &p.id, "failed", None, err.as_deref());
 736:             }
 737:             Ok(None) => {
 738:                 payout_attempt(state, &p.id, "confirm", "sin confirmación on-chain aún", 10);
 739:             }
 740:             Err(e) => {
 741:                 tracing::warn!("x402 confirm {}: {e}", p.id); // RPC caído → reintenta
 742:             }
 743:         }
 744:     }
 745: }
 746: 
 747: // ---------------------------------------------------------------------------
 748: // Gateway 402 reactivo (Fase 3) — helpers de respuesta
 749: // ---------------------------------------------------------------------------
 750: 
 751: /// Respuesta 402 estándar del gateway: invoice + WWW-Authenticate: X402.
 752: pub fn payment_required_response(invoice: Value, message: &str) -> Response {
 753:     let id = invoice.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
 754:     let mut res = Json(json!({
 755:         "ok": false,
 756:         "error": message,
 757:         "invoice": invoice,
 758:         "how": [
 759:             "1. Transfiere invoice.amount_lamports a invoice.payee.",
 760:             "2. POST /api/x402/invoices/{id}/verify con {\"tx_signature\": …}",
 761:             "3. Repite la petición con header X-Payment: {id} (un solo uso)."
 762:         ]
 763:     }))
 764:     .into_response();
 765:     *res.status_mut() = StatusCode::PAYMENT_REQUIRED;
 766:     let _ = res
 767:         .headers_mut()
 768:         .insert("WWW-Authenticate", HeaderValue::from_static("X402"));
 769:     if let Ok(v) = HeaderValue::from_str(&id) {
 770:         res.headers_mut().insert("X-Payment-Invoice-Id", v);
 771:     }
 772:     res
 773: }
 774: 
 775: fn error_response(status: StatusCode, message: &str) -> Response {
 776:     let mut res = Json(json!({ "ok": false, "error": message })).into_response();
 777:     *res.status_mut() = status;
 778:     res
 779: }
 780: 
 781: /// Verifica un `X-Payment` y consume la factura (one-shot anti-replay).
 782: ///
 783: /// Reglas (handshake del diagrama, paso 5):
 784: ///  - la factura debe existir y pertenecer al pagador (cuenta o "system")
 785: ///  - debe estar `settled` on-chain y NO consumida
 786: ///  - al aceptarse, marca `consumed_at` → cualquier reintento → 409
 787: ///
 788: /// `Ok(())` = acceso concedido (la factura quedó consumida; el llamador decide
 789: /// qué responder: el middleware ejecuta el recurso, el demo responde JSON).
 790: /// `Err(Response)` = 402/403/404/409 con el error correspondiente.
 791: /// Verifica la factura (ownership + settled + anti-replay) **SIN consumirla**.
 792: /// Para gateways que cobran solo si el servicio se prestó (NomikOS
 793: /// app-request: la app responde → recién entonces se consume el peaje).
 794: pub fn verify_access(
 795:     state: &SharedState,
 796:     invoice_id: &str,
 797:     payer_account: Option<&str>,
 798: ) -> Result<(), Response> {
 799:     let row = state.db.with(|c| {
 800:         c.query_row(
 801:             "SELECT account_id, status, consumed_at, resource FROM x402_invoices WHERE id = ?1",
 802:             params![invoice_id],
 803:             |r| {
 804:                 Ok((
 805:                     r.get::<_, String>(0)?,
 806:                     r.get::<_, String>(1)?,
 807:                     r.get::<_, Option<i64>>(2)?,
 808:                     r.get::<_, String>(3)?,
 809:                 ))
 810:             },
 811:         )
 812:     });
 813:     let (inv_account, status, consumed, _resource) = match row {
 814:         Ok(v) => v,
 815:         Err(rusqlite::Error::QueryReturnedNoRows) => {
 816:             return Err(error_response(
 817:                 StatusCode::NOT_FOUND,
 818:                 &format!("factura X-Payment «{invoice_id}» no encontrada"),
 819:             ));
 820:         }
 821:         Err(e) => return Err(error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}"))),
 822:     };
 823: 
 824:     // Ownership: el pagador solo puede usar facturas de SU cuenta.
 825:     let expected = payer_account.unwrap_or("system");
 826:     if inv_account != expected {
 827:         return Err(error_response(
 828:             StatusCode::FORBIDDEN,
 829:             "factura de otra cuenta (X-Payment no corresponde a esta identidad)",
 830:         ));
 831:     }
 832: 
 833:     // Anti-replay: factura de un solo uso.
 834:     if consumed.is_some() {
 835:         return Err(error_response(
 836:             StatusCode::CONFLICT,
 837:             "invoice ya consumida (replay detectado) — paga un nuevo micro-peaje",
 838:         ));
 839:     }
 840: 
 841:     // Debe estar settled on-chain.
 842:     if status != "settled" {
 843:         let inv = match load_invoice(state, invoice_id) {
 844:             Ok(i) => invoice_value_of(state, i),
 845:             Err(e) => return Err(e.into_response()),
 846:         };
 847:         return Err(payment_required_response(inv, "Pago aún no confirmado on-chain"));
 848:     }
 849: 
 850:     Ok(())
 851: }
 852: 
 853: /// Consume la factura (one-shot). Llamar SOLO tras `verify_access`.
 854: pub fn consume_access(state: &SharedState, invoice_id: &str) -> Result<(), Response> {
 855:     let updated = state
 856:         .db
 857:         .with(|c| {
 858:             Ok(c.execute(
 859:                 "UPDATE x402_invoices SET consumed_at = ?1, updated_at = ?1 \
 860:                  WHERE id = ?2 AND consumed_at IS NULL",
 861:                 params![now_ms(), invoice_id],
 862:             )?)
 863:         })
 864:         .map_err(|e| error_response(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")))?;
 865:     if updated == 0 {
 866:         return Err(error_response(
 867:             StatusCode::CONFLICT,
 868:             "invoice ya consumida (replay detectado) — paga un nuevo micro-peaje",
 869:         ));
 870:     }
 871:     tracing::info!("x402 acceso concedido con {invoice_id} (consumida, one-shot)");
 872:     Ok(())
 873: }
 874: 
 875: pub fn settle_access(
 876:     state: &SharedState,
 877:     invoice_id: &str,
 878:     payer_account: Option<&str>,
 879: ) -> Result<(), Response> {
 880:     verify_access(state, invoice_id, payer_account)?;
 881:     consume_access(state, invoice_id)
 882: }
 883: 
 884: // ---------------------------------------------------------------------------
 885: // Endpoint protegido demo (literal 402 Payment Required)
 886: // ---------------------------------------------------------------------------
 887: 
 888: /// Handshake reactivo del diagrama: sin X-Payment → 402 + invoice;
 889: /// con X-Payment settled → acceso one-shot; reintento → 409.
 890: /// Con Authorization: Bearer → la factura es de ESA cuenta.
 891: pub async fn protected(State(state): State<SharedState>, headers: HeaderMap) -> Response {
 892:     // Identidad opcional (token inválido → 401, no se ignora).
 893:     let account = match crate::modules::accounts::resolve_account_id(&state, &headers) {
 894:         Ok(a) => a,
 895:         Err(e) => return e.into_response(),
 896:     };
 897: 
 898:     if let Some(v) = headers
 899:         .get("x-payment")
 900:         .and_then(|v| v.to_str().ok())
 901:         .map(str::trim)
 902:         .filter(|s| !s.is_empty())
 903:     {
 904:         return match settle_access(&state, v, account.as_deref()) {
 905:             Ok(()) => Json(json!({
 906:                 "ok": true,
 907:                 "message": "Pago verificado on-chain — acceso concedido",
 908:                 "invoice_id": v,
 909:                 "consumed": true,
 910:             }))
 911:             .into_response(),
 912:             Err(r) => r,
 913:         };
 914:     }
 915: 
 916:     // Sin pago: factura nueva del recurso demo para esta cuenta.
 917:     match create_invoice_value_for(&state, "x402/protected-demo", 1_000, account.as_deref(), None).await {
 918:         Ok(invoice) => payment_required_response(
 919:             invoice,
 920:             "Payment Required (x402): paga el micro-peaje para acceder",
 921:         ),
 922:         Err(e) => e.into_response(),
 923:     }
 924: }
 925: 
 926: // ---------------------------------------------------------------------------
 927: // Middleware del gateway — protege X402_PROTECTED_PATHS (matching exacto)
 928: // ---------------------------------------------------------------------------
 929: 
 930: /// Fase 3 — Gateway 402 reactivo del diagrama:
 931: ///  1. HTTP Request (sin X-Payment) → 402 + invoice del recurso
 932: ///  2. Orquestador paga (firma delegada) y reintenta con X-Payment
 933: ///  3. Factura settled + no consumida → acceso one-shot; reintento → 409
 934: pub async fn x402_gate(
 935:     State(state): State<SharedState>,
 936:     req: axum::extract::Request,
 937:     next: axum::middleware::Next,
 938: ) -> Response {
 939:     let path = req.uri().path().to_string();
 940:     if !state.cfg.x402_protected_paths.iter().any(|p| p == &path) {
 941:         return next.run(req).await;
 942:     }
 943: 
 944:     let headers = req.headers().clone();
 945:     // Identidad opcional: token inválido → 401 antes de emitir factura.
 946:     // Un token de DISPOSITIVO (sesión con device_id) liga la factura al
 947:     // dispositivo que la provocó (NomikOS Fase 1).
 948:     let (account, device) = match crate::modules::devices::resolve_identity(&state, &headers) {
 949:         Ok(Some((acc, dev))) => (Some(acc), dev),
 950:         Ok(None) => (None, None),
 951:         Err(e) => return e.into_response(),
 952:     };
 953: 
 954:     // ¿Viene pago? → verificar y consumir (one-shot); concedido → ejecutar el recurso.
 955:     if let Some(inv) = headers
 956:         .get("x-payment")
 957:         .and_then(|v| v.to_str().ok())
 958:         .map(str::trim)
 959:         .filter(|s| !s.is_empty())
 960:     {
 961:         return match settle_access(&state, inv, account.as_deref()) {
 962:             Ok(()) => next.run(req).await, // peaje consumido → recurso real
 963:             Err(r) => r,
 964:         };
 965:     }
 966: 
 967:     // Sin pago → 402 con factura del recurso (para esta cuenta/dispositivo).
 968:     let resource = format!("x402:path:{path}");
 969:     match create_invoice_value_for(
 970:         &state,
 971:         &resource,
 972:         state.cfg.x402_path_lamports,
 973:         account.as_deref(),
 974:         device.as_deref(),
 975:     )
 976:     .await
 977:     {
 978:         Ok(invoice) => {
 979:             tracing::info!("x402 gate: 402 para «{path}» (recurso {resource})");
 980:             payment_required_response(
 981:                 invoice,
 982:                 "Payment Required (x402): paga el micro-peaje para acceder",
 983:             )
 984:         }
 985:         Err(e) => e.into_response(),
 986:     }
 987: }
 988: 
 989: // ---------------------------------------------------------------------------
 990: // dPaaS por cuenta (Fase 4) — endpoints autenticados
 991: // ---------------------------------------------------------------------------
 992: 
 993: #[derive(Deserialize)]
 994: pub struct PayInvoiceBody {
 995:     pub invoice_id: String,
 996: }
 997: 
 998: /// Handshake dPaaS completo: factura de la cuenta → firma delegada con el
 999: /// keypair DE LA cuenta → envío a SU red → verificación on-chain (poll corto).
1000: /// Devuelve la factura lista para el reintento con X-Payment.
1001: pub async fn pay_invoice_value(
1002:     state: &SharedState,
1003:     account_id: &str,
1004:     invoice_id: &str,
1005: ) -> AppResult<Value> {
1006:     let inv = load_invoice(state, invoice_id)?;
1007:     if inv.account_id != account_id {
1008:         return Err(AppError::forbidden("factura de otra cuenta (no puedes pagarla)"));
1009:     }
1010:     if inv.status == "settled" {
1011:         return Ok(invoice_value_of(state, inv)); // ya pagada
1012:     }
1013:     if inv.status != "pending" && inv.status != "verifying" {
1014:         return Err(AppError::bad_request(format!("factura en estado no pagable: {}", inv.status)));
1015:     }
1016: 
1017:     // Límites dPaaS antes de firmar.
1018:     check_limits(state, account_id, inv.amount_lamports)?;
1019: 
1020:     if inv.status == "pending" {
1021:         // «3. Pide firma» — el Gestor de Wallet de la CUENTA firma en background.
1022:         let payer = resolve_payer(state, account_id)?;
1023:         let Payer::Account { keypair, network } = payer else {
1024:             return Err(AppError::internal("dPaaS: firmante inesperado"));
1025:         };
1026:         let client = client_for_network(state, &network).await?;
1027:         let sig = solana::transfer_lamports_with_kp(&client, &keypair, &inv.payee, inv.amount_lamports as u64)
1028:             .await
1029:             .map_err(|e| {
1030:                 AppError::bad_request(format!(
1031:                     "firma delegada falló (wallet de la cuenta sin fondos o RPC rechazó): {e}"
1032:                 ))
1033:             })?;
1034:         tracing::info!("dPaaS: factura {invoice_id} firmada por la cuenta → {sig}");
1035:         state.db.with(|c| {
1036:             c.execute(
1037:                 "UPDATE x402_invoices SET tx_signature = ?1, status = 'verifying', \
1038:                  verify_attempts = 0, updated_at = ?2 WHERE id = ?3",
1039:                 params![sig, now_ms(), invoice_id],
1040:             )?;
1041:             Ok(())
1042:         })?;
1043:     }
1044: 
1045:     // Poll corto de confirmación; el settler sigue en background si no llega.
1046:     for _ in 0..7 {
1047:         if let Some(v) = attempt_verify(state, invoice_id).await {
1048:             return Ok(v);
1049:         }
1050:         tokio::time::sleep(Duration::from_secs(2)).await;
1051:     }
1052:     Ok(invoice_value_of(state, load_invoice(state, invoice_id)?))
1053: }
1054: 
1055: /// POST /api/accounts/me/x402/pay-invoice — pagar una factura propia con la
1056: /// wallet delegada de la cuenta (el usuario nunca firma).
1057: pub async fn me_x402_pay_invoice_handler(
1058:     State(state): State<SharedState>,
1059:     auth: crate::modules::accounts::AuthedAccount,
1060:     Json(body): Json<PayInvoiceBody>,
1061: ) -> AppResult<Response> {
1062:     Ok(Json(pay_invoice_value(&state, &auth.account_id, &body.invoice_id).await?).into_response())
1063: }
1064: 
1065: /// POST /api/accounts/me/x402/pay — encolar liquidación delegada (dPaaS).
1066: pub async fn me_x402_pay_handler(
1067:     State(state): State<SharedState>,
1068:     auth: crate::modules::accounts::AuthedAccount,
1069:     Json(body): Json<PayBody>,
1070: ) -> AppResult<Response> {
1071:     Ok(Json(pay_value(&state, body, &auth.account_id).await?).into_response())
1072: }
1073: 
1074: /// GET /api/accounts/me/x402/invoices — facturas de la cuenta.
1075: pub async fn me_x402_invoices_handler(
1076:     State(state): State<SharedState>,
1077:     auth: crate::modules::accounts::AuthedAccount,
1078: ) -> AppResult<Response> {
1079:     let rows: Vec<Invoice> = state
1080:         .db
1081:         .with(|c| {
1082:             let mut stmt = c.prepare(&format!(
1083:                 "SELECT {INVOICE_COLS} FROM x402_invoices WHERE account_id = ?1 \
1084:                  ORDER BY created_at DESC LIMIT 100"
1085:             ))?;
1086:             let rows = stmt.query_map(params![auth.account_id], row_to_invoice)?;
1087:             rows.collect()
1088:         })
1089:         .unwrap_or_default();
1090:     let invoices: Vec<Value> = rows.into_iter().map(|i| invoice_value_of(&state, i)).collect();
1091:     Ok(Json(json!({ "ok": true, "invoices": invoices })).into_response())
1092: }
1093: 
1094: /// GET /api/accounts/me/x402/summary — estado dPaaS de la cuenta:
1095: /// facturas/payouts propios, límites y uso de las últimas 24h.
1096: pub async fn me_x402_summary_handler(
1097:     State(state): State<SharedState>,
1098:     auth: crate::modules::accounts::AuthedAccount,
1099: ) -> AppResult<Response> {
1100:     let invoices: Vec<Invoice> = state
1101:         .db
1102:         .with(|c| {
1103:             let mut stmt = c.prepare(&format!(
1104:                 "SELECT {INVOICE_COLS} FROM x402_invoices WHERE account_id = ?1"
1105:             ))?;
1106:             let rows = stmt.query_map(params![auth.account_id], row_to_invoice)?;
1107:             rows.collect()
1108:         })
1109:         .unwrap_or_default();
1110: 
1111:     let mut by_status: std::collections::BTreeMap<String, u64> = Default::default();
1112:     let mut settled_lamports = 0i64;
1113:     for inv in &invoices {
1114:         *by_status.entry(inv.status.clone()).or_insert(0) += 1;
1115:         if inv.status == "settled" {
1116:             settled_lamports += inv.amount_lamports;
1117:         }
1118:     }
1119: 
1120:     let payouts: Value = state
1121:         .db
1122:         .with(|c| {
1123:             let mut stmt = c.prepare(
1124:                 "SELECT status, COUNT(*), COALESCE(SUM(amount_lamports), 0) \
1125:                  FROM x402_payouts WHERE account_id = ?1 GROUP BY status",
1126:             )?;
1127:             let mut rows = stmt.query_map(params![auth.account_id], |r| {
1128:                 Ok(json!({ "status": r.get::<_, String>(0)?, "count": r.get::<_, i64>(1)?,
1129:                            "lamports": r.get::<_, i64>(2)? }))
1130:             })?;
1131:             let mut out = Vec::new();
1132:             while let Some(row) = rows.next() {
1133:                 out.push(row?);
1134:             }
1135:             Ok(Value::Array(out))
1136:         })
1137:         .unwrap_or(json!([]));
1138: 
1139:     let (tx_limit, daily_limit, wallet, payee): (Option<i64>, Option<i64>, Option<String>, Option<String>) =
1140:         state
1141:             .db
1142:             .with(|c| {
1143:                 c.query_row(
1144:                     "SELECT tx_limit_lamports, daily_limit_lamports, wallet_pubkey, payee \
1145:                      FROM account_chain WHERE account_id = ?1",
1146:                     params![auth.account_id],
1147:                     |r| {
1148:                         Ok((
1149:                             r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?,
1150:                         ))
1151:                     },
1152:                 )
1153:             })
1154:             .unwrap_or((None, None, None, None));
1155: 
1156:     let daily_used: i64 = state
1157:         .db
1158:         .with(|c| {
1159:             c.query_row(
1160:                 "SELECT COALESCE(SUM(amount_lamports), 0) FROM x402_payouts \
1161:                  WHERE account_id = ?1 AND status != 'failed' AND created_at > ?2",
1162:                 params![auth.account_id, now_ms() - 86_400_000],
1163:                 |r| r.get(0),
1164:             )
1165:         })
1166:         .unwrap_or(0);
1167: 
1168:     Ok(Json(json!({
1169:         "ok": true,
1170:         "dpaas": {
1171:             "wallet": wallet,
1172:             "payee": payee,
1173:             "tx_limit_lamports": tx_limit,
1174:             "daily_limit_lamports": daily_limit,
1175:             "daily_used_lamports": daily_used,
1176:         },
1177:         "invoices_total": invoices.len(),
1178:         "invoices_by_status": by_status,
1179:         "settled_lamports": settled_lamports,
1180:         "payouts_by_status": payouts,
1181:     }))
1182:     .into_response())
1183: }
1184: 
1185: // ---------------------------------------------------------------------------
1186: // Resumen para /api/modules y /api/agent/state
1187: // ---------------------------------------------------------------------------
1188: 
1189: pub async fn summary_value(state: &SharedState) -> AppResult<Value> {
1190:     let invoices = list_invoices(state, None);
1191:     let mut by_status: std::collections::BTreeMap<String, u64> = Default::default();
1192:     let mut settled_lamports = 0i64;
1193:     for inv in &invoices {
1194:         *by_status.entry(inv.status.clone()).or_insert(0) += 1;
1195:         if inv.status == "settled" {
1196:             settled_lamports += inv.amount_lamports;
1197:         }
1198:     }
1199:     let payout_counts: Value = state
1200:         .db
1201:         .with(|c| {
1202:             let mut stmt =
1203:                 c.prepare("SELECT status, COUNT(*) FROM x402_payouts GROUP BY status")?;
1204:             let mut rows = stmt.query_map([], |r| {
1205:                 Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
1206:             })?;
1207:             let mut m = serde_json::Map::new();
1208:             while let Some(row) = rows.next() {
1209:                 let (status, n): (String, i64) = row?;
1210:                 m.insert(status, json!(n));
1211:             }
1212:             Ok(Value::Object(m))
1213:         })
1214:         .unwrap_or(json!({}));
1215: 
1216:     Ok(json!({
1217:         "enabled": true,
1218:         "module": "Módulo x402 Solana (liquida micro-peajes en background)",
1219:         "network": state.cfg.solana_network_label(),
1220:         "invoices_total": invoices.len(),
1221:         "invoices_by_status": by_status,
1222:         "settled_lamports": settled_lamports,
1223:         "payouts_by_status": payout_counts,
1224:         "payer_configured": state.cfg.payer_keypair.is_some(),
1225:         "payee": default_payee(state),
1226:     }))
1227: }
1228: 
1229: // ---------------------------------------------------------------------------
1230: // Settler (loop en background)
1231: // ---------------------------------------------------------------------------
1232: 
1233: pub async fn settler_loop(state: SharedState) {
1234:     let secs = state.cfg.x402_settle_interval_secs.max(1);
1235:     tracing::info!("x402 settler activo (cada {secs}s)");
1236:     loop {
1237:         tokio::time::sleep(Duration::from_secs(secs)).await;
1238:         let verifying: Vec<String> = state
1239:             .db
1240:             .with(|c| {
1241:                 let mut stmt = c.prepare("SELECT id FROM x402_invoices WHERE status = 'verifying'")?;
1242:                 let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
1243:                 rows.collect()
1244:             })
1245:             .unwrap_or_default();
1246:         for id in verifying {
1247:             let _ = attempt_verify(&state, &id).await;
1248:         }
1249:         advance_payouts(&state).await;
1250:     }
1251: }
````

## File: api/src/api.rs
````rust
  1: //! Endpoints HTTP (axum). La DB es la fuente de verdad; los loops en
  2: //! background la mantienen sincronizada con Medusa.js y Solana.
  3: 
  4: use crate::db::now_ms;
  5: use crate::error::{AppError, AppResult};
  6: use crate::modules::{accounts, app, apps, calls, device, devices, faucet, mcp, simulation, solana, voice, x402};
  7: use crate::state::SharedState;
  8: use axum::extract::State;
  9: use axum::response::IntoResponse;
 10: use axum::routing::{get, post, put};
 11: use axum::{Json, Router};
 12: use serde::Deserialize;
 13: use serde_json::{json, Value};
 14: 
 15: pub fn router(state: SharedState) -> Router {
 16:     Router::new()
 17:         // Estado general
 18:         .route("/api/health", get(health))
 19:         .route("/api/navbar", get(navbar))
 20:         .route("/api/modules", get(modules))
 21:         // Agente
 22:         .route("/api/agent/state", get(agent_state))
 23:         .route("/api/agent/tools", get(agent_tools))
 24:         .route("/api/agent/call", post(agent_call))
 25:         // [ Dispositivo + R2 ]
 26:         .route("/api/device", get(device::get_device_handler))
 27:         .route("/api/device/model", get(device::get_model))
 28:         .route("/api/device/model/head", get(device::model_head))
 29:         .route("/api/device/model/upload", post(device::upload_model))
 30:         // [ Módulo ERP / Kodetap → Medusa.js ]
 31:         .route("/api/erp/status", get(erp_status))
 32:         // [ Módulo x402 Solana ]
 33:         .route("/api/solana/status", get(solana_status))
 34:         // URLs RPC de Solana por red (fuente única de verdad para agent-dapp).
 35:         .route("/api/config/solana/urls", get(solana_urls))
 36:         // [ Gestión de Cuentas — IdP email+password (OpenID Provider) ]
 37:         .route("/api/auth/register", post(accounts::register_handler))
 38:         .route("/api/auth/login", post(accounts::login_handler))
 39:         .route("/api/auth/logout", post(accounts::logout_handler))
 40:         .route("/api/auth/me", get(accounts::me_handler))
 41:         // [ Config por cuenta — proveedor LLM, red/wallet, sub-wallets ]
 42:         .route(
 43:             "/api/accounts/me/llm",
 44:             put(accounts::put_llm_handler).delete(accounts::delete_llm_handler),
 45:         )
 46:         .route(
 47:             "/api/accounts/me/llm/active",
 48:             post(accounts::activate_llm_handler),
 49:         )
 50:         .route("/api/accounts/me/chain", put(accounts::put_chain_handler))
 51:         .route(
 52:             "/api/accounts/me/chain/keypair/import",
 53:             post(accounts::import_keypair_handler),
 54:         )
 55:         // [ NomikOS W6 — faucet Devnet: settlement x402 REAL on-chain ]
 56:         .route(
 57:             "/api/dev/faucet",
 58:             get(faucet::faucet_status_handler).post(faucet::faucet_drip_handler),
 59:         )
 60:         // [ Simulador NomikOS — el OS simulado con progreso por cuenta ]
 61:         .route(
 62:             "/api/accounts/me/simulation",
 63:             get(simulation::get_handler),
 64:         )
 65:         .route(
 66:             "/api/accounts/me/simulation/step",
 67:             post(simulation::step_handler),
 68:         )
 69:         .route(
 70:             "/api/accounts/me/context",
 71:             get(accounts::context_handler),
 72:         )
 73:         .route(
 74:             "/api/accounts/me/wallets",
 75:             get(accounts::list_wallets_handler).post(accounts::create_wallet_handler),
 76:         )
 77:         // [ Wallets conectadas del navegador — Phantom/MetaMask/… (solo pubkeys) ]
 78:         .route(
 79:             "/api/accounts/me/connected-wallets",
 80:             get(accounts::list_connected_wallets_handler).post(accounts::connect_wallet_handler),
 81:         )
 82:         .route(
 83:             "/api/accounts/me/connected-wallets/activate",
 84:             put(accounts::activate_connected_wallet_handler),
 85:         )
 86:         // [ Servicios del agente — dapps con flujo x402 ]
 87:         .route(
 88:             "/api/accounts/me/services",
 89:             get(accounts::list_services_handler).post(accounts::add_service_handler),
 90:         )
 91:         // [ NomikOS Fase 1 — flota de dispositivos ]
 92:         .route("/api/devices/enroll", post(devices::enroll_handler))
 93:         .route("/api/devices/claim", post(devices::claim_handler))
 94:         .route("/api/devices/token", post(devices::device_token_handler))
 95:         .route("/api/devices", get(devices::list_fleet_handler))
 96:         .route("/api/devices/me", get(devices::me_handler))
 97:         .route("/api/devices/me/heartbeat", post(devices::heartbeat_handler))
 98:         // [ Dispositivo: elegir proveedor/modelo LLM de SU cuenta (sin secretos) ]
 99:         .route("/api/devices/me/llm", get(devices::me_llm_handler))
100:         .route(
101:             "/api/devices/me/llm/active",
102:             post(devices::me_llm_activate_handler),
103:         )
104:         .route("/api/devices/{id}/limits", put(devices::limits_handler))
105:         // [ NomikOS F5 — llamadas con peaje x402 por minuto ]
106:         .route("/api/calls", post(calls::create_call_handler))
107:         .route("/api/calls/{id}", get(calls::get_call_handler))
108:         .route("/api/calls/{id}/end", post(calls::end_call_handler))
109:         // [ NomikOS W4 — puente baresip: la Pi consulta SU llamada ]
110:         .route("/api/calls/for-device", get(calls::for_device_handler))
111:         // [ NomikOS F5 — voz + MCP Gateway peajizado hacia la app (diagram.d2) ]
112:         .route("/api/voice", post(voice::voice_turn_handler))
113:         .route("/api/app/request", post(app::app_request_handler))
114:         // [ Tienda de dapps — el worker lista e instala apps del registro ]
115:         .route("/api/apps", get(apps::list_handler))
116:         .route("/api/apps/{slug}", get(apps::get_handler))
117:         .route("/api/apps/{slug}/install", post(apps::install_handler))
118:         // [ Módulo Medusa MCP ] — puente hacia cloud.medusajs.com/mcp
119:         .route("/api/mcp/status", get(mcp::status_handler))
120:         .route("/api/mcp/tools", get(mcp::tools_handler))
121:         .route("/api/mcp/call", post(mcp::call_handler))
122:         .route(
123:             "/api/x402/invoices",
124:             post(x402::create_invoice_handler).get(x402::list_handler),
125:         )
126:         .route("/api/x402/invoices/{id}", get(x402::get_handler))
127:         .route("/api/x402/invoices/{id}/verify", post(x402::verify_handler))
128:         .route("/api/x402/payouts", get(x402::payouts_handler))
129:         .route("/api/x402/pay", post(x402::pay_handler))
130:         .route("/api/x402/protected", get(x402::protected))
131:         // [ Fase 4 — dPaaS por cuenta (pagos delegados autenticados) ]
132:         .route(
133:             "/api/accounts/me/x402/summary",
134:             get(x402::me_x402_summary_handler),
135:         )
136:         .route(
137:             "/api/accounts/me/x402/invoices",
138:             get(x402::me_x402_invoices_handler),
139:         )
140:         .route(
141:             "/api/accounts/me/x402/pay",
142:             post(x402::me_x402_pay_handler),
143:         )
144:         .route(
145:             "/api/accounts/me/x402/pay-invoice",
146:             post(x402::me_x402_pay_invoice_handler),
147:         )
148:         // Fase 3 — gateway 402 reactivo sobre X402_PROTECTED_PATHS
149:         // (matching exacto de path; el resto de la API pasa sin peaje).
150:         .layer(axum::middleware::from_fn_with_state(state.clone(), x402::x402_gate))
151:         .with_state(state)
152: }
153: 
154: // ---------------------------------------------------------------------------
155: // Estado general
156: // ---------------------------------------------------------------------------
157: 
158: async fn health(State(state): State<SharedState>) -> impl IntoResponse {
159:     let uptime_ms = now_ms() - state.started_at;
160:     Json(json!({
161:         "ok": true,
162:         "service": "agent-os-api",
163:         "version": env!("CARGO_PKG_VERSION"),
164:         "uptime_secs": uptime_ms / 1000,
165:         "device": state.cfg.device_name,
166:         "modules": {
167:             "erp_medusa": state.cfg.payload_url,
168:             "x402_solana": state.cfg.solana_network_label(),
169:             "multimedia_spotify_mpd": null, // omitido por diseño
170:             "cloudflare_r2": state.r2.is_some(),
171:         }
172:     }))
173: }
174: 
175: /// Datos del navbar: dispositivo + ERP (rojo/verde) + Solana (red/balance).
176: pub async fn navbar_value(state: &SharedState) -> AppResult<Value> {
177:     let dev = state.db.get_device()?;
178:     let erp = state.db.get_service("erp")?;
179:     let sol = state.db.get_service("solana")?;
180: 
181:     let erp_json = erp.map(|s| {
182:         json!({
183:             "label": s.label,              // "ERP · Medusa.js"
184:             "running": s.running,
185:             "state": if s.running { "Corriendo" } else { "Detenido" },
186:             "endpoint": s.endpoint,
187:             "detail": s.detail,
188:             "updated_at": s.updated_at,
189:         })
190:     });
191: 
192:     let sol_json = sol.map(|s| {
193:         json!({
194:             "label": s.label,              // "Solana · Devnet"
195:             "running": s.running,
196:             "state": if s.running { "Corriendo" } else { "Sin conexión" },
197:             "network": s.network,           // "Devnet"
198:             "balance_sol": s.balance_lamports.map(solana::fmt_sol),
199:             "balance_lamports": s.balance_lamports,
200:             "wallet": s.wallet,
201:             "slot": s.slot,
202:             "version": s.version,
203:             "endpoint": s.endpoint,
204:             "detail": s.detail,
205:             "updated_at": s.updated_at,
206:         })
207:     });
208: 
209:     Ok(json!({
210:         "ok": true,
211:         "device": { "name": dev.name },
212:         "erp": erp_json,
213:         "solana": sol_json,
214:     }))
215: }
216: 
217: async fn navbar(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
218:     Ok(Json(navbar_value(&state).await?))
219: }
220: 
221: /// Índice de módulos del Agente OS (el multimedia se omitió por diseño).
222: async fn modules_value(state: &SharedState) -> AppResult<Value> {
223:     let erp = state.db.get_service("erp")?;
224:     let x402_summary = x402::summary_value(state).await?;
225:     let mcp_summary = mcp::summary_value(state, false).await;
226: 
227:     let list = vec![
228:         json!({
229:             "id": "erp-salud-kodetap",
230:             "title": "Módulo Salud / ERP Avanzado (Kodetap API → Medusa.js)",
231:             "running": erp.as_ref().map(|s| s.running).unwrap_or(false),
232:             "endpoint": erp.as_ref().and_then(|s| s.endpoint.clone()),
233:             "detail": erp.as_ref().and_then(|s| s.detail.clone()),
234:         }),
235:         json!({
236:             "id": "x402-solana",
237:             "title": "Módulo x402 Solana (liquida micro-peajes en background)",
238:             "running": state
239:                 .db
240:                 .get_service("solana")?
241:                 .map(|s| s.running)
242:                 .unwrap_or(false),
243:             "network": state.cfg.solana_network_label(),
244:             "payer_configured": state.cfg.payer_keypair.is_some(),
245:             "summary": x402_summary,
246:         }),
247:         json!({
248:             "id": "multimedia-spotify-mpd",
249:             "title": "Módulo Multimedia (Spotify / MPD API)",
250:             "running": false,
251:             "detail": "omitido por diseño",
252:             "omitted": true,
253:         }),
254:         json!({
255:             "id": "medusa-mcp",
256:             "title": "Medusa MCP (cloud.medusajs.com/mcp)",
257:             "running": mcp_summary.get("connected").and_then(|v| v.as_bool()).unwrap_or(false),
258:             "url": mcp_summary.get("url").cloned().unwrap_or(Value::Null),
259:             "auth": mcp_summary.get("auth").cloned().unwrap_or(Value::Null),
260:             "summary": mcp_summary,
261:         }),
262:     ];
263: 
264:     Ok(json!({ "ok": true, "modules": list }))
265: }
266: 
267: async fn modules(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
268:     Ok(Json(modules_value(&state).await?))
269: }
270: 
271: // ---------------------------------------------------------------------------
272: // Estatus de ERP y Solana (filas de service_status)
273: // ---------------------------------------------------------------------------
274: 
275: async fn service_value(state: &SharedState, id: &str) -> AppResult<Value> {
276:     let row = state.db.get_service(id)?;
277:     match row {
278:         Some(row) => Ok(serde_json::to_value(row)?),
279:         None => Err(AppError::unavailable(format!(
280:             "módulo «{id}» aún no sincronizado (espera unos segundos)"
281:         ))),
282:     }
283: }
284: 
285: async fn erp_status(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
286:     Ok(Json(service_value(&state, "erp").await?))
287: }
288: 
289: async fn solana_status(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
290:     Ok(Json(service_value(&state, "solana").await?))
291: }
292: 
293: /// URLs RPC de Solana por red (local/devnet/testnet/mainnet).
294: /// Es la fuente única de verdad: agent-dapp las consume desde aquí
295: /// en lugar de leerlas de su propio .env.
296: async fn solana_urls(State(state): State<SharedState>) -> impl IntoResponse {
297:     Json(json!({
298:         "ok": true,
299:         "urls": state.cfg.solana_urls,
300:     }))
301: }
302: 
303: // ---------------------------------------------------------------------------
304: // Agente (MCP / Muse): estado agregado + herramientas + llamada
305: // ---------------------------------------------------------------------------
306: 
307: async fn agent_state(State(state): State<SharedState>) -> AppResult<impl IntoResponse> {
308:     let mut value = navbar_value(&state).await?;
309:     let obj = value.as_object_mut().ok_or_else(|| AppError::internal("navbar: objeto"))?;
310: 
311:     obj.insert("device_full".into(), device::device_value(&state).await?);
312:     obj.insert("ficha_tecnica".into(), device::specs_value(&state).await?);
313:     obj.insert("x402".into(), x402::summary_value(&state).await?);
314:     // Medusa MCP sin probe de red (solo config + sesión cacheada).
315:     obj.insert("medusa_mcp".into(), mcp::summary_value(&state, false).await);
316:     obj.insert(
317:         "modules".into(),
318:         modules_value(&state).await?.get("modules").cloned().unwrap_or(json!([])),
319:     );
320:     obj.insert(
321:         "agent".into(),
322:         json!({
323:             "runtime": "Muse (MCP)",
324:             "tools": "GET /api/agent/tools",
325:             "call": "POST /api/agent/call {\"tool\": …, \"args\": …}"
326:         }),
327:     );
328: 
329:     Ok(Json(value))
330: }
331: 
332: #[derive(Deserialize)]
333: struct AgentCall {
334:     tool: String,
335:     #[serde(default)]
336:     args: Value,
337: }
338: 
339: fn arg_str(args: &Value, key: &str) -> AppResult<String> {
340:     args.get(key)
341:         .and_then(|v| v.as_str())
342:         .map(str::to_string)
343:         .ok_or_else(|| AppError::bad_request(format!("falta la cadena «{key}» en args")))
344: }
345: 
346: fn arg_i64(args: &Value, key: &str) -> AppResult<i64> {
347:     args.get(key)
348:         .and_then(|v| v.as_i64())
349:         .ok_or_else(|| AppError::bad_request(format!("falta el entero «{key}» en args")))
350: }
351: 
352: async fn agent_call(
353:     State(state): State<SharedState>,
354:     Json(call): Json<AgentCall>,
355: ) -> AppResult<impl IntoResponse> {
356:     let args = if call.args.is_null() { json!({}) } else { call.args.clone() };
357: 
358:     let result = match call.tool.as_str() {
359:         "navbar_status" => navbar_value(&state).await?,
360:         "device_specs" => device::specs_value(&state).await?,
361:         "erp_status" => service_value(&state, "erp").await?,
362:         "solana_status" => service_value(&state, "solana").await?,
363:         "x402_summary" => x402::summary_value(&state).await?,
364:         "medusa_mcp_status" => mcp::summary_value(&state, true).await,
365:         "medusa_mcp_list_tools" => {
366:             let result = state
367:                 .mcp
368:                 .tools_list(&state.http)
369:                 .await
370:                 .map_err(|e| mcp::map_mcp_error_pub(&e))?;
371:             result.get("tools").cloned().unwrap_or(json!([]))
372:         }
373:         "medusa_mcp_call" => {
374:             let tool = arg_str(&args, "tool")?;
375:             let tool_args = args.get("arguments").cloned().unwrap_or(json!({}));
376:             let result = state
377:                 .mcp
378:                 .tools_call(&state.http, &tool, tool_args)
379:                 .await
380:                 .map_err(|e| mcp::map_mcp_error_pub(&e))?;
381:             json!({
382:                 "is_error": result.get("isError").and_then(|v| v.as_bool()).unwrap_or(false),
383:                 "content": result.get("content"),
384:             })
385:         }
386:         "create_invoice" => {
387:             let resource = arg_str(&args, "resource")?;
388:             let lamports = arg_i64(&args, "amount_lamports")?;
389:             x402::create_invoice_value(&state, &resource, lamports).await?
390:         }
391:         "invoice_status" => {
392:             let id = arg_str(&args, "id")?;
393:             x402::invoice_value(&state, &id).await?
394:         }
395:         "pay_toll" => {
396:             let to = arg_str(&args, "to")?;
397:             let lamports = arg_i64(&args, "lamports")?;
398:             let memo = args.get("memo").and_then(|v| v.as_str()).map(str::to_string);
399:             x402::pay_value(&state, x402::PayBody { to, lamports, memo }, "system").await?
400:         }
401:         other => {
402:             // tools de las dapps INSTALADAS (MCP manager dinámico:
403:             // POST /api/apps/{slug}/install las registra)
404:             if let Some(res) = apps::call_dynamic_tool(&state, other, &args).await {
405:                 res?
406:             } else {
407:                 return Err(AppError::not_found(format!(
408:                     "tool «{other}» no existe — GET /api/agent/tools"
409:                 )));
410:             }
411:         }
412:     };
413: 
414:     Ok(Json(json!({ "ok": true, "tool": call.tool, "result": result })))
415: }
416: 
417: async fn agent_tools(State(state): State<SharedState>) -> impl IntoResponse {
418:     let mut tools = vec![
419:         json!({
420:             "name": "navbar_status",
421:             "description": "Estado del dispositivo + ERP (Medusa.js) + Solana (red, wallet, balance)"
422:         }),
423:         json!({
424:             "name": "device_specs",
425:             "description": "Ficha técnica del ESP32-S3-Touch-AMOLED-1.43 (desde la DB)"
426:         }),
427:         json!({
428:             "name": "erp_status",
429:             "description": "Salud del ERP Medusa.js (Kodetap API): ¿corriendo o detenido?"
430:         }),
431:         json!({
432:             "name": "solana_status",
433:             "description": "Red Solana activa, versión del validador, slot y balance en SOL"
434:         }),
435:         json!({
436:             "name": "x402_summary",
437:             "description": "Resumen de micro-peajes x402 (facturas y liquidaciones)"
438:         }),
439:         json!({
440:             "name": "create_invoice",
441:             "description": "Crea una factura de micro-peaje x402",
442:             "args": { "resource": "string", "amount_lamports": "integer > 0" }
443:         }),
444:         json!({
445:             "name": "invoice_status",
446:             "description": "Estado on-chain de una factura x402",
447:             "args": { "id": "string" }
448:         }),
449:         json!({
450:             "name": "pay_toll",
451:             "description": "Encola una liquidación SOL en background (requiere SOLANA_PAYER_KEYPAIR)",
452:             "args": { "to": "pubkey base58", "lamports": "integer > 0", "memo": "opcional" }
453:         }),
454:     ];
455:     // + las tools de las dapps INSTALADAS (tienda de apps → MCP manager)
456:     tools.extend(apps::installed_tools_value(&state));
457:     Json(tools)
458: }
````

## File: api/src/db.rs
````rust
  1: //! SQLite (rusqlite, bundled): único origen de verdad del estado expuesto.
  2: //!
  3: //! Tablas:
  4: //! - `device`          → nombre + metadatos del modelo 3D (R2)
  5: //! - `device_specs`    → ficha técnica (seeds)
  6: //! - `service_status`  → ERP (Medusa.js) y Solana sincronizados en background
  7: //! - `x402_invoices`   → micro-peajes entrantes
  8: //! - `x402_payouts`    → liquidaciones salientes en background
  9: 
 10: use rusqlite::params;
 11: use serde::Serialize;
 12: use std::sync::Mutex;
 13: 
 14: pub struct Db(pub Mutex<rusqlite::Connection>);
 15: 
 16: impl Db {
 17:     pub fn open(path: &str, device_name: &str) -> rusqlite::Result<Self> {
 18:         if let Some(parent) = std::path::Path::new(path).parent() {
 19:             if !parent.as_os_str().is_empty() {
 20:                 let _ = std::fs::create_dir_all(parent);
 21:             }
 22:         }
 23:         let conn = rusqlite::Connection::open(path)?;
 24:         Self::schema(&conn)?;
 25:         Self::seed(&conn, device_name);
 26:         Ok(Self(Mutex::new(conn)))
 27:     }
 28: 
 29:     /// Ejecuta un cierre con la conexión bloqueada (sin awaits dentro).
 30:     pub fn with<T>(
 31:         &self,
 32:         f: impl FnOnce(&rusqlite::Connection) -> rusqlite::Result<T>,
 33:     ) -> rusqlite::Result<T> {
 34:         let conn = self.0.lock().expect("db lock envenenado");
 35:         f(&conn)
 36:     }
 37: 
 38:     fn schema(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
 39:         conn.execute_batch(
 40:             "PRAGMA journal_mode = WAL;
 41:              PRAGMA foreign_keys = ON;
 42: 
 43:              CREATE TABLE IF NOT EXISTS device (
 44:                  id                INTEGER PRIMARY KEY CHECK (id = 1),
 45:                  name              TEXT NOT NULL,
 46:                  model_r2_key      TEXT,
 47:                  model_size        INTEGER,
 48:                  model_etag        TEXT,
 49:                  model_public_url  TEXT,
 50:                  updated_at        INTEGER NOT NULL
 51:              );
 52: 
 53:              CREATE TABLE IF NOT EXISTS device_specs (
 54:                  id        INTEGER PRIMARY KEY AUTOINCREMENT,
 55:                  device_id INTEGER NOT NULL REFERENCES device(id),
 56:                  slot      TEXT NOT NULL,
 57:                  value     TEXT NOT NULL,
 58:                  position  INTEGER NOT NULL,
 59:                  UNIQUE (device_id, slot)
 60:              );
 61: 
 62:              CREATE TABLE IF NOT EXISTS service_status (
 63:                  id               TEXT PRIMARY KEY,        -- 'erp' | 'solana'
 64:                  label            TEXT NOT NULL,
 65:                  running          INTEGER NOT NULL DEFAULT 0,
 66:                  network          TEXT,
 67:                  endpoint         TEXT,
 68:                  version          TEXT,
 69:                  slot             INTEGER,
 70:                  wallet           TEXT,
 71:                  balance_lamports INTEGER,
 72:                  detail           TEXT,
 73:                  updated_at       INTEGER NOT NULL
 74:              );
 75: 
 76:              CREATE TABLE IF NOT EXISTS x402_invoices (
 77:                  id                  TEXT PRIMARY KEY,
 78:                  resource            TEXT NOT NULL,
 79:                  amount_lamports     INTEGER NOT NULL,
 80:                  payee               TEXT NOT NULL,
 81:                  status              TEXT NOT NULL,       -- pending|verifying|settled|failed
 82:                  tx_signature        TEXT,
 83:                  confirmation_status TEXT,
 84:                  verify_attempts     INTEGER NOT NULL DEFAULT 0,
 85:                  created_at          INTEGER NOT NULL,
 86:                  updated_at          INTEGER NOT NULL
 87:              );
 88:              CREATE INDEX IF NOT EXISTS idx_invoices_status ON x402_invoices(status);
 89: 
 90:              CREATE TABLE IF NOT EXISTS x402_payouts (
 91:                  id              TEXT PRIMARY KEY,
 92:                  to_wallet       TEXT NOT NULL,
 93:                  amount_lamports INTEGER NOT NULL,
 94:                  memo            TEXT,
 95:                  status          TEXT NOT NULL,           -- queued|sent|confirmed|failed
 96:                  tx_signature    TEXT,
 97:                  attempts        INTEGER NOT NULL DEFAULT 0,
 98:                  error           TEXT,
 99:                  created_at      INTEGER NOT NULL,
100:                  updated_at      INTEGER NOT NULL
101:              );
102:              CREATE INDEX IF NOT EXISTS idx_payouts_status ON x402_payouts(status);
103: 
104:              -- ── Gestión de cuentas (IdP email+password, dPaaS) ──
105:              CREATE TABLE IF NOT EXISTS accounts (
106:                  id            TEXT PRIMARY KEY,
107:                  email         TEXT UNIQUE NOT NULL,
108:                  password_hash TEXT NOT NULL,
109:                  display_name  TEXT,
110:                  is_active     INTEGER NOT NULL DEFAULT 1,
111:                  created_at    INTEGER NOT NULL,
112:                  updated_at    INTEGER NOT NULL
113:              );
114: 
115:              CREATE TABLE IF NOT EXISTS sessions (
116:                  token_hash TEXT PRIMARY KEY,
117:                  account_id TEXT NOT NULL REFERENCES accounts(id),
118:                  created_at INTEGER NOT NULL,
119:                  expires_at INTEGER NOT NULL
120:              );
121:              CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
122: 
123:              -- LEGACY (fuente de migración — ver abajo): una sola fila LLM
124:              -- por cuenta. El esquema vivo es account_llm_providers.
125:              CREATE TABLE IF NOT EXISTS account_llm (
126:                  account_id    TEXT PRIMARY KEY REFERENCES accounts(id),
127:                  provider      TEXT NOT NULL,
128:                  base_url      TEXT NOT NULL,
129:                  api_key_enc   TEXT,
130:                  models        TEXT NOT NULL DEFAULT '[]',
131:                  default_model TEXT,
132:                  updated_at    INTEGER NOT NULL
133:              );
134: 
135:              CREATE TABLE IF NOT EXISTS account_chain (
136:                  account_id            TEXT PRIMARY KEY REFERENCES accounts(id),
137:                  network               TEXT NOT NULL DEFAULT 'devnet',
138:                  wallet_pubkey         TEXT,
139:                  payer_keypair_enc     TEXT,
140:                  payee                 TEXT,
141:                  daily_limit_lamports  INTEGER,
142:                  tx_limit_lamports     INTEGER,
143:                  updated_at            INTEGER NOT NULL
144:              );
145: 
146:              CREATE TABLE IF NOT EXISTS account_wallets (
147:                  id                   TEXT PRIMARY KEY,
148:                  account_id           TEXT NOT NULL REFERENCES accounts(id),
149:                  label                TEXT NOT NULL,
150:                  network              TEXT NOT NULL DEFAULT 'devnet',
151:                  pubkey               TEXT NOT NULL,
152:                  keypair_enc          TEXT NOT NULL,
153:                  daily_limit_lamports INTEGER,
154:                  created_at           INTEGER NOT NULL,
155:                  UNIQUE(account_id, label)
156:              );
157: 
158:              CREATE TABLE IF NOT EXISTS login_attempts (
159:                  id    INTEGER PRIMARY KEY AUTOINCREMENT,
160:                  email TEXT NOT NULL,
161:                  at    INTEGER NOT NULL,
162:                  ok    INTEGER NOT NULL
163:              );
164:              CREATE INDEX IF NOT EXISTS idx_login_attempts_email_at ON login_attempts(email, at);
165: 
166:              CREATE TABLE IF NOT EXISTS account_services (
167:                  id           TEXT PRIMARY KEY,
168:                  account_id   TEXT NOT NULL REFERENCES accounts(id),
169:                  service      TEXT NOT NULL,          -- 'medusa' (id del catálogo)
170:                  display_name TEXT NOT NULL,
171:                  via_x402     INTEGER NOT NULL DEFAULT 1,  -- TODO el flujo de la dapp usa x402
172:                  resource     TEXT NOT NULL,          -- patrón del peaje (x402:path:…)
173:                  payer_pubkey TEXT,                    -- snapshot del payer dPaaS al agregar
174:                  network      TEXT,                    -- snapshot de la red del agente
175:                  status       TEXT NOT NULL DEFAULT 'active',
176:                  created_at   INTEGER NOT NULL,
177:                  UNIQUE(account_id, service)
178:              );
179: 
180:              CREATE TABLE IF NOT EXISTS account_connected_wallets (
181:                  id         TEXT PRIMARY KEY,
182:                  account_id TEXT NOT NULL REFERENCES accounts(id),
183:                  label      TEXT NOT NULL,          -- 'Phantom · 1' (visible)
184:                  provider   TEXT NOT NULL,          -- phantom|solflare|backpack|metamask…
185:                  chain      TEXT NOT NULL,          -- solana | evm
186:                  pubkey     TEXT NOT NULL,          -- SOLO la pubkey: la clave privada nunca sale de la wallet
187:                  is_active  INTEGER NOT NULL DEFAULT 0,  -- la wallet en uso (una por cuenta)
188:                  created_at INTEGER NOT NULL,
189:                  UNIQUE(account_id, label)
190:              );
191: 
192:              CREATE TABLE IF NOT EXISTS devices (
193:                  id            TEXT PRIMARY KEY,          -- 'dev-…'
194:                  account_id    TEXT REFERENCES accounts(id), -- NULL hasta el claim (pareja con la cuenta)
195:                  name          TEXT NOT NULL,
196:                  board         TEXT NOT NULL,              -- esp32-s3-amoled-143 | rpi4 | …
197:                  pubkey        TEXT NOT NULL,              -- identidad ed25519 del dispositivo
198:                  claim_code    TEXT,                       -- código de emparejado (NULL tras claim)
199:                  claim_expires_at INTEGER,
200:                  enroll_secret_hash TEXT NOT NULL,        -- sha256: el dispositivo lo presenta para pedir su token
201:                  status        TEXT NOT NULL DEFAULT 'offline',
202:                  last_seen_at  INTEGER,
203:                  agent_version TEXT,
204:                  daily_limit_lamports INTEGER,             -- dPaaS por dispositivo
205:                  tx_limit_lamports INTEGER,
206:                  created_at    INTEGER NOT NULL
207:              );
208:              CREATE INDEX IF NOT EXISTS idx_devices_account ON devices(account_id);
209: 
210:              CREATE TABLE IF NOT EXISTS calls (
211:                  id              TEXT PRIMARY KEY,          -- 'call-…'
212:                  account_id      TEXT NOT NULL,
213:                  device_id       TEXT,                      -- origen: dispositivo de la flota (opcional)
214:                  destination     TEXT NOT NULL,             -- número / SIP URI
215:                  status          TEXT NOT NULL DEFAULT 'ringing',  -- ringing|active|ended
216:                  minutes_paid    INTEGER NOT NULL DEFAULT 0,
217:                  started_at      INTEGER,
218:                  ended_at        INTEGER,
219:                  created_at       INTEGER NOT NULL,
220:                  updated_at       INTEGER NOT NULL
221:              );
222:              CREATE INDEX IF NOT EXISTS idx_calls_account ON calls(account_id);
223: 
224:              CREATE TABLE IF NOT EXISTS apps (
225:                  slug            TEXT PRIMARY KEY,
226:                  name            TEXT NOT NULL,
227:                  description     TEXT,
228:                  version         TEXT,
229:                  status          TEXT NOT NULL DEFAULT 'available',
230:                  base_url        TEXT,
231:                  auth_enc        TEXT,
232:                  tools           TEXT NOT NULL DEFAULT '[]',
233:                  install_log     TEXT,
234:                  installed_at    INTEGER,
235:                  created_at      INTEGER NOT NULL,
236:                  updated_at      INTEGER NOT NULL
237:              );
238: 
239:              CREATE TABLE IF NOT EXISTS simulation_states (
240:                  account_id      TEXT PRIMARY KEY,
241:                  state           TEXT NOT NULL,
242:                  updated_at      INTEGER NOT NULL
243:              );",
244:         )?;
245: 
246:         // Migraciones para DBs ya existentes (idempotentes):
247:         // x402 pasa a ser multi-tenant con cuenta implícita "system".
248:         Self::add_column_if_missing(conn, "x402_invoices", "account_id", "TEXT DEFAULT 'system'")?;
249:         Self::add_column_if_missing(conn, "x402_payouts", "account_id", "TEXT DEFAULT 'system'")?;
250:         // Fase 3 — anti-replay del X-Payment: factura de un solo uso.
251:         Self::add_column_if_missing(conn, "x402_invoices", "consumed_at", "INTEGER")?;
252:         // Wallet operativa del agente: label de la sub-wallet seleccionada
253:         // (NULL → wallet principal del dPaaS). Modal del panel del dapp.
254:         Self::add_column_if_missing(conn, "account_chain", "active_wallet_label", "TEXT")?;
255:         // NomikOS Fase 1 — flota: facturas ligadas al dispositivo que las
256:         // provocó, y tokens de dispositivo (= sesiones con device_id).
257:         Self::add_column_if_missing(conn, "x402_invoices", "device_id", "TEXT")?;
258:         Self::add_column_if_missing(conn, "sessions", "device_id", "TEXT")?;
259:         // Multi-proveedor LLM por cuenta (un solo activo): la tabla vieja
260:         // account_llm (una fila por cuenta) migra a account_llm_providers.
261:         conn.execute(
262:             "CREATE TABLE IF NOT EXISTS account_llm_providers (
263:                  account_id    TEXT NOT NULL REFERENCES accounts(id),
264:                  provider      TEXT NOT NULL,
265:                  base_url      TEXT NOT NULL,
266:                  api_key_enc   TEXT,
267:                  models        TEXT NOT NULL DEFAULT '[]',
268:                  default_model TEXT,
269:                  is_active     INTEGER NOT NULL DEFAULT 0,
270:                  updated_at    INTEGER NOT NULL,
271:                  PRIMARY KEY (account_id, provider)
272:              )",
273:             [],
274:         )?;
275:         conn.execute(
276:             "INSERT OR IGNORE INTO account_llm_providers \
277:              (account_id, provider, base_url, api_key_enc, models, default_model, is_active, updated_at) \
278:              SELECT account_id, provider, base_url, api_key_enc, models, default_model, 1, updated_at \
279:              FROM account_llm",
280:             [],
281:         )?;
282:         conn.execute("DROP TABLE IF EXISTS account_llm", [])?;
283:         Ok(())
284:     }
285: 
286:     /// Migración idempotente: añade una columna si no existe (DBs ya creadas).
287:     fn add_column_if_missing(
288:         conn: &rusqlite::Connection,
289:         table: &str,
290:         column: &str,
291:         ddl: &str,
292:     ) -> rusqlite::Result<()> {
293:         let exists = conn
294:             .prepare(&format!("PRAGMA table_info({table})"))?
295:             .query_map([], |r| r.get::<_, String>(1))?
296:             .filter_map(Result::ok)
297:             .any(|name| name == column);
298:         if !exists {
299:             conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {column} {ddl}"), [])?;
300:         }
301:         Ok(())
302:     }
303: 
304:     /// Semillas: dispositivo + ficha técnica.
305:     fn seed(conn: &rusqlite::Connection, device_name: &str) {
306:         let now = now_ms();
307:         let _ = conn.execute(
308:             "INSERT OR IGNORE INTO device (id, name, updated_at) VALUES (1, ?1, ?2)",
309:             params![device_name, now],
310:         );
311: 
312:         const SPECS: &[(&str, &str)] = &[
313:             ("Controlador", "ESP32-S3R8 · dual-core 240 MHz"),
314:             ("Pantalla", "AMOLED redonda 1.43\" · 466 × 466 px"),
315:             ("Táctil", "Capacitivo de 5 puntos"),
316:             ("Memoria", "16 MB Flash · 8 MB PSRAM"),
317:             ("Inalámbrico", "Wi\u{2011}Fi 2.4 GHz · BLE 5"),
318:             ("Extras", "microSD · SPI · I2C · RGB LED"),
319:         ];
320:         for (i, (slot, value)) in SPECS.iter().enumerate() {
321:             let _ = conn.execute(
322:                 "INSERT OR IGNORE INTO device_specs (device_id, slot, value, position)
323:                  VALUES (1, ?1, ?2, ?3)",
324:                 params![slot, value, i as i64],
325:             );
326:         }
327:     }
328: }
329: 
330: // ---------------------------------------------------------------------------
331: // service_status
332: // ---------------------------------------------------------------------------
333: 
334: #[derive(Debug, Clone, Serialize)]
335: pub struct ServiceRow {
336:     pub id: String,
337:     pub label: String,
338:     pub running: bool,
339:     pub network: Option<String>,
340:     pub endpoint: Option<String>,
341:     pub version: Option<String>,
342:     pub slot: Option<i64>,
343:     pub wallet: Option<String>,
344:     pub balance_lamports: Option<i64>,
345:     pub detail: Option<String>,
346:     pub updated_at: i64,
347: }
348: 
349: const SERVICE_COLS: &str = "id, label, running, network, endpoint, version, slot, wallet, \
350:                             balance_lamports, detail, updated_at";
351: 
352: fn row_to_service(r: &rusqlite::Row<'_>) -> rusqlite::Result<ServiceRow> {
353:     Ok(ServiceRow {
354:         id: r.get(0)?,
355:         label: r.get(1)?,
356:         running: r.get::<_, i64>(2)? != 0,
357:         network: r.get(3)?,
358:         endpoint: r.get(4)?,
359:         version: r.get(5)?,
360:         slot: r.get(6)?,
361:         wallet: r.get(7)?,
362:         balance_lamports: r.get(8)?,
363:         detail: r.get(9)?,
364:         updated_at: r.get(10)?,
365:     })
366: }
367: 
368: impl Db {
369:     pub fn upsert_service(&self, s: &ServiceRow) -> rusqlite::Result<()> {
370:         self.with(|c| {
371:             c.execute(
372:                 "INSERT INTO service_status (id, label, running, network, endpoint, version, slot, \
373:                  wallet, balance_lamports, detail, updated_at)
374:                  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
375:                  ON CONFLICT(id) DO UPDATE SET
376:                     label = ?2, running = ?3, network = ?4, endpoint = ?5, version = ?6,
377:                     slot = ?7, wallet = ?8, balance_lamports = ?9, detail = ?10, updated_at = ?11",
378:                 params![
379:                     s.id,
380:                     s.label,
381:                     s.running as i64,
382:                     s.network,
383:                     s.endpoint,
384:                     s.version,
385:                     s.slot,
386:                     s.wallet,
387:                     s.balance_lamports,
388:                     s.detail,
389:                     s.updated_at,
390:                 ],
391:             )?;
392:             Ok(())
393:         })
394:     }
395: 
396:     pub fn get_service(&self, id: &str) -> rusqlite::Result<Option<ServiceRow>> {
397:         self.with(|c| {
398:             let sql = format!("SELECT {SERVICE_COLS} FROM service_status WHERE id = ?1");
399:             match c.query_row(&sql, params![id], row_to_service) {
400:                 Ok(row) => Ok(Some(row)),
401:                 Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
402:                 Err(e) => Err(e),
403:             }
404:         })
405:     }
406: }
407: 
408: // ---------------------------------------------------------------------------
409: // device
410: // ---------------------------------------------------------------------------
411: 
412: #[derive(Debug, Clone, Serialize)]
413: pub struct DeviceRow {
414:     pub name: String,
415:     pub model_r2_key: Option<String>,
416:     pub model_size: Option<i64>,
417:     pub model_etag: Option<String>,
418:     pub model_public_url: Option<String>,
419:     pub updated_at: i64,
420: }
421: 
422: #[derive(Debug, Clone, Serialize)]
423: pub struct SpecRow {
424:     pub slot: String,
425:     pub value: String,
426: }
427: 
428: impl Db {
429:     pub fn get_device(&self) -> rusqlite::Result<DeviceRow> {
430:         self.with(|c| {
431:             c.query_row(
432:                 "SELECT name, model_r2_key, model_size, model_etag, model_public_url, updated_at
433:                  FROM device WHERE id = 1",
434:                 [],
435:                 |r| {
436:                     Ok(DeviceRow {
437:                         name: r.get(0)?,
438:                         model_r2_key: r.get(1)?,
439:                         model_size: r.get(2)?,
440:                         model_etag: r.get(3)?,
441:                         model_public_url: r.get(4)?,
442:                         updated_at: r.get(5)?,
443:                     })
444:                 },
445:             )
446:         })
447:     }
448: 
449:     pub fn update_model(
450:         &self,
451:         r2_key: &str,
452:         size: i64,
453:         etag: Option<&str>,
454:         public_url: Option<&str>,
455:     ) -> rusqlite::Result<()> {
456:         self.with(|c| {
457:             c.execute(
458:                 "UPDATE device SET model_r2_key = ?1, model_size = ?2, model_etag = ?3, \
459:                  model_public_url = ?4, updated_at = ?5 WHERE id = 1",
460:                 params![r2_key, size, etag, public_url, now_ms()],
461:             )?;
462:             Ok(())
463:         })
464:     }
465: 
466:     pub fn list_specs(&self) -> rusqlite::Result<Vec<SpecRow>> {
467:         self.with(|c| {
468:             let mut stmt =
469:                 c.prepare("SELECT slot, value FROM device_specs WHERE device_id = 1 ORDER BY position")?;
470:             let rows = stmt.query_map([], |r| Ok(SpecRow { slot: r.get(0)?, value: r.get(1)? }))?;
471:             rows.collect()
472:         })
473:     }
474: }
475: 
476: // ---------------------------------------------------------------------------
477: // helpers
478: // ---------------------------------------------------------------------------
479: 
480: pub fn now_ms() -> i64 {
481:     std::time::SystemTime::now()
482:         .duration_since(std::time::UNIX_EPOCH)
483:         .map(|d| d.as_millis() as i64)
484:         .unwrap_or(0)
485: }
486: 
487: /// ID corto legible: `x402-1731234567890-7`
488: pub fn new_id(prefix: &str) -> String {
489:     static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
490:     let n = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
491:     format!("{prefix}-{}-{n:x}", now_ms())
492: }
````

## File: api/AGENTS.md
````markdown
 1: # AGENTS.md — api/ (Rust)
 2: 
 3: Reglas de agente para la API Rust (fuente única de verdad). Complemento
 4: imprescindible: [`context.md`](context.md).
 5: 
 6: ## Reglas duras
 7: 
 8: 1. **axum 0.8**: rutas con parámetros `{id}` (NO `:id`). Extractores: `State`,
 9:    `Path`, `HeaderMap`, `Json`. Middleware con `axum::middleware::from_fn_with_state`.
10: 2. **Errores SIEMPRE con `AppError`** (`src/error.rs`) → respuestas JSON
11:    `{"ok": false, "error": …}`. Variantes: `bad_request`, `not_found`,
12:    `unauthorized` (401), `forbidden` (403), `conflict` (409), `too_many_requests`
13:    (429), `unavailable` (503), `internal`. No inventar StatusCodes sueltos.
14: 3. **Acceso a SQLite**: `state.db.with(|c| { … })` (bloquea la conexión; sin
15:    awaits dentro). Tablas nuevas/migraciones → `src/db.rs::schema()` con
16:    `Self::add_column_if_missing()` — idempotentes, nunca `ALTER TABLE` directos.
17: 4. **IDs**: `db::new_id("<prefijo>")` (ej. `acc_`, `wlt`, `x402`, `payout`).
18:    Timestamps en ms: `db::now_ms()`.
19: 5. **Secretos en reposo** (api_keys, keypairs): SOLO con `crypto::seal/open`
20:    (XChaCha20-Poly1305, `ACCOUNTS_MASTER_KEY`). NUNCA en plaintext, logs ni
21:    respuestas. Passwords: `crypto::hash_password`/`verify_password` (argon2id).
22: 6. **Identidad**: extractor `AuthedAccount` (obligatorio) o
23:    `accounts::resolve_account_id(&state, &headers)` (opcional: `Ok(None)` =
24:    system, `Err(401)` = token inválido — NO se ignora).
25: 7. **x402**: crear facturas con `x402::create_invoice_value_for(state,
26:    resource, amount, account_id_opt)`. Verificar X-Payment SOLO con
27:    `x402::settle_access()` (one-shot: consume `consumed_at`; replay → 409;
28:    ownership → 403). El middleware `x402_gate` tras validar hace
29:    `next.run(req)` — el recurso DEBE ejecutarse.
30: 8. **dPaaS**: firmar con `solana::transfer_lamports_with_kp(client, &kp, …)`
31:    (keypair en memoria). `x402::resolve_payer` decide system vs cuenta
32:    (descifra + red de la cuenta). Validar SIEMPRE `check_limits` antes de firmar.
33: 9. **SOLANA SIN SDK**: RPC JSON-RPC a mano (`SolanaClient`), firma ed25519 con
34:    `ed25519-dalek`, base58 en `b58.rs`, tx legacy en
35:    `solana::build_transfer_message`. No agregar crates de Solana.
36: 10. **R2 SIN SDK**: firma SigV4 a mano en `r2.rs`. OJO: hashes hex **minúsculas**
37:     (`hex_string`), `x-amz-content-sha256` SIEMPRE presente, host con región
38:     opcional (`R2_REGION`). `device::get_model` es 100 % desde R2 — NO
39:     reintroducir fallback a archivo local.
40: 11. **Logging**: `tracing` (`tracing::info/warn/error`). Sin `println!`.
41:     Nombres de módulo en el logger: `agent_os_api::<módulo>`.
42: 12. **Compilar y probar antes de dar por buena una tarea**:
43:     `cargo build && cargo test` (12 tests deben pasar).
44: 
45: ## Qué NO hacer
46: 
47: - No duplicar estado de negocio en brain/dapp: la verdad vive aquí.
48: - No commitear `.env` con credenciales reales (`.env.example` es la plantilla).
49: - No cambiar el nombre del binario (`Cargo.toml name = "agent-os-api"`) —
50:   rompe `Dockerfile` y scripts; el nombre de CARPETA es `api/`.
51: - No tocar `dapps/payload-cms/` desde aquí: el ERP se consulta vía HTTP
52:   (`PAYLOAD_URL`), módulo `modules/erp.rs`.
````

## File: api/context.md
````markdown
  1: # context.md — api/ (Rust)
  2: 
  3: API del Agente OS: **fuente única de verdad** (axum 0.8 + SQLite + tokio).
  4: Puerto `:8080`. Binario `agent-os-api` (el nombre de paquete NO cambia aunque
  5: la carpeta sea `api/`).
  6: 
  7: ## Mapa del código
  8: 
  9: ```
 10: api/src/
 11: ├── main.rs          — bootstrap: config, DB, spawns (sync_loop, settler), servidor
 12: ├── config.rs        — Config::load() lee .env (dotenv a mano); R2Config; master key
 13: ├── api.rs           — router (TODAS las rutas) + handlers generales + middleware gate
 14: ├── db.rs            — SQLite (WAL): schema + migraciones idempotentes + helpers
 15: ├── crypto.rs        — argon2id + XChaCha20-Poly1305 (seal/open) + tokens de sesión
 16: ├── state.rs         — SharedState = Arc<AppState{cfg, db, http, r2, mcp, started_at}>
 17: ├── error.rs         — AppError → JSON {"ok":false,"error":…}
 18: ├── b58.rs / r2.rs   — base58 a mano / cliente R2 SigV4 (PUT/GET)
 19: └── modules/
 20:     ├── accounts.rs  — IdP (register/login/logout/me), config por cuenta,
 21:     │                  keypair import (cifra + deriva pubkey), sub-wallets,
 22:     │                  resolve_account_id (identidad opcional), /me/context
 23:     ├── x402.rs      — facturas, verify on-chain, payouts, settler_loop,
 24:     │                  middleware x402_gate (402 reactivo), settle_access
 25:     │                  (one-shot), dPaaS (resolve_payer, check_limits,
 26:     │                  pay_invoice delegado, handlers /me/x402/*)
 27:     ├── solana.rs    — SolanaClient (JSON-RPC), wallets CLI, transferencia
 28:     │                  firmada (ed25519, transfer_lamports_with_kp)
 29:     ├── device.rs    — ficha técnica + modelo 3D 100% desde R2 (sin fallback)
 30:     └── erp.rs       — salud del ERP (Payload CMS: {PAYLOAD_URL}/api/users)
 31: ```
 32: 
 33: ## Modelo de datos (SQLite, `api/data/agent-os.db`)
 34: 
 35: | Tabla | Contenido |
 36: |---|---|
 37: | `accounts` | email único, `password_hash` (argon2id PHC), display_name, is_active |
 38: | `account_llm_providers` | N proveedores por cuenta (PK account+provider): base_url, api_key_enc (AEAD), models JSON, default_model, is_active (uno solo) |
 39: | `account_chain` | network, wallet_pubkey, payer_keypair_enc (AEAD), payee, daily/tx_limit, **active_wallet_label** (wallet operativa del agente: label de sub-wallet o NULL = principal dPaaS) |
 40: | `account_wallets` | sub-wallets por cuenta: label, network, pubkey, keypair_enc, daily_limit |
 41: | `account_connected_wallets` | **wallets del navegador (Phantom/MetaMask/…)**: label, provider, chain (solana\|evm), **solo pubkey** (la clave privada nunca sale de la wallet), is_active (una por cuenta), UNIQUE(account_id, label) |
 42: | `account_services` | **dapps que el agente usará con x402**: service, display_name, via_x402=1, resource del peaje (`x402:path:…`), snapshot payer_pubkey/network, status, UNIQUE(account_id, service) |
 43: | `devices` | **NomikOS Fase 1 — flota**: pubkey ed25519 de la placa, board, claim_code (15 min, NULL tras claim), enroll_secret_hash (sha256), status/last_seen_at, límites dPaaS por dispositivo, account_id (NULL hasta el claim) |
 44: | `calls` | **NomikOS Fase 5 — llamadas con peaje x402/min**: destination, status (ringing/active/ended), minutes_paid, device_id (si la origina un dispositivo), started_at/ended_at |
 45: | `sessions` | `token_hash` (sha256 del token opaco), account_id, expires_at · **columna `device_id`**: un token de DISPOSITIVO es una sesión ligada a un device (TTL 30 días) |
 46: | `login_attempts` | email, at, ok (anti-bruteforce 5/min) |
 47: | `x402_invoices` | id, resource, amount, payee, status(pending/verifying/settled/failed), tx_signature, **account_id**, **consumed_at** (one-shot) |
 48: | `x402_payouts` | id, to, amount, status(queued/sent/confirmed/failed), **account_id**, attempts, error |
 49: | `service_status` / `device` / `device_specs` | navbar (ERP/Solana), ficha técnica |
 50: 
 51: ## Flujo x402 (handshake del `diagram.d2`)
 52: 
 53: 1. `x402_gate` (middleware sobre TODO el router; solo actúa en
 54:    `X402_PROTECTED_PATHS`, matching exacto): sin `X-Payment` →
 55:    `payment_required_response()` = **402 + invoice de la cuenta** +
 56:    `WWW-Authenticate: X402` + `X-Payment-Invoice-Id`.
 57: 2. Con `X-Payment: <id>` → `settle_access(state, id, account)`:
 58:    404 inexistente · 403 de otra cuenta · 409 consumida (replay) ·
 59:    402 pending/verifying · **Ok(()) = consume one-shot y el middleware ejecuta
 60:    el recurso real** (`next.run(req)`).
 61: 3. dPaaS: `POST /api/accounts/me/x402/pay-invoice` → `pay_invoice_value()`:
 62:    ownership + `check_limits` → `resolve_payer` (descifra keypair de la cuenta)
 63:    → `transfer_lamports_with_kp` (SU red) → registra tx → poll corto de
 64:    `attempt_verify`; el `settler_loop` (15 s) confirma en background.
 65: 4. Payouts encolados: `advance_payouts` firma por CUENTA con SU keypair y SU red;
 66:    `system` usa `SOLANA_PAYER_KEYPAIR` global.
 67: 
 68: ## Endpoints (`:8080/api`)
 69: 
 70: | Grupo | Rutas |
 71: |---|---|
 72: | Auth | `POST /auth/register` (201/409/400) · `POST /auth/login` (token Bearer; 401; 429 tras 5 fallos) · `POST /auth/logout` · `GET /auth/me` |
 73: | Cuenta | `PUT /accounts/me/llm` (upsert UN proveedor: api_key AEAD, base_url, models, default_model; el primero auto-activa) · `POST /accounts/me/llm/active {provider?, model?}` (elige el ÚNICO activo) · `DELETE /accounts/me/llm?provider=X` (borra ese; sin activo el agente exige configurar — sin fallback global) · `GET/POST /devices/me/llm[/active]` (el device SOLO lista/elige de su cuenta, sin secretos) · `PUT /accounts/me/chain` (network + **active_wallet_label** tri-state: label/null/ausente) · `POST /accounts/me/chain/keypair/import` (cifra; acepta array o string) · `GET /accounts/me/context` (resolución completa para brain, incluye active_wallet_pubkey) · `GET/POST /accounts/me/wallets` · `GET/POST /accounts/me/connected-wallets` (Phantom/MetaMask/… — solo pubkeys; conectar la marca como en uso, `PUT …/connected-wallets/activate {label}` cambia cuál) · `GET/POST /accounts/me/services` (catálogo de dapps x402 + alta que persiste cuenta→servicio→x402 con snapshot dPaaS; 201/409/400) |
 74: | dPaaS | `GET /accounts/me/x402/summary` · `GET /accounts/me/x402/invoices` · `POST /accounts/me/x402/pay` · `POST /accounts/me/x402/pay-invoice` |
 75: | Flota (NomikOS) | `POST /devices/enroll` (placa sin auth → claim_code 15 min + enroll_secret) · `POST /devices/claim {code}` (Bearer cuenta, atómico) · `POST /devices/token` (la placa sondea con enroll_secret → Bearer de dispositivo, 202 antes del claim) · `GET /devices/me` + `POST /devices/me/heartbeat` (token de dispositivo) · `GET /devices` (flota de la cuenta) · `PUT /devices/{id}/limits` (dPaaS por device) · facturas x402 con `device_id` |
 76: | Llamadas (NomikOS F5) | `POST /calls` (sin X-Payment → crea ringing + peaje del min 0 → **402**; con X-Payment settled → consume el minuto one-shot, pasa a `active` y emite el peaje del SIGUIENTE en la respuesta — cadencia un POST/min, precio `X402_CALL_LAMPORTS`) · `GET /calls/{id}` · `POST /calls/{id}/end` · brain tools `place_call`/`end_call` (guarded_call paga y reintenta solo) |
 77: | Voz (diagram.d2: User→Worker "Voz/texto") | `POST /voice {text}` (Bearer cuenta o **device**) → el worker pasa el turno al orquestador (`BRAIN_URL/v1/agentic-gateway`) con la MISMA identidad; la respuesta vuelve a la placa para el TTS. El turno es gratis: los peajes están en lo que el AGENTE pide (ver abajo). En la Pi: mic→whisper.cpp→aquí; respuesta→piper→altavoz |
 78: | Faucet Devnet (W6 — settlement real) | `GET /api/dev/faucet` → estado del treasury `{network, treasury_pubkey, treasury_balance_lamports, lamports_per_drip}` · `POST /api/dev/faucet` (Bearer cuenta, chain **devnet**) → transfiere `FAUCET_LAMPORTS` (default 0.05 SOL) del treasury a la wallet dPaaS de la cuenta — tx real; cooldown 10 s; `FAUCET_ENABLED=0` → 404 oculto. Treasury: `scripts/faucet/nomikos-treasury.json` (SOLO devnet) + `faucet.sh {status\|pubkey\|balance\|fund [N]\|drip <pub>}` |
 79: | Puente baresip (W4) | `GET /api/calls/for-device` (Bearer de **dispositivo**) → la llamada en curso de la placa, respuesta PLANA para el firmware no_std: `{has_call:"true"/"false", call_id, call_status, call_destination, minutes_paid}`. La Pi marca con `active` y cuelga cuando desaparece (`AGENTD_SIP=1` en agentd → baresip pipe mode) |
 80: | App peajizada (paso 1-7 del diagrama) | `POST /app/request {path, method?, body?}` — el MCP Gateway: **402 + `x402:app:payload:{METHOD}:{path}`** por petición → X-Payment → PROXY a `{PAYLOAD_URL}{path}` (Payload CMS) con auth automática (`PAYLOAD_TOKEN` o login email/password con JWT cacheado) → el peaje se CONSUME solo si la app respondió; replay 409 · ajeno 403 · app caída no cobra. `X402_APP_LAMPORTS` por petición · brain tool `app_request` |
 81: | x402 | `POST /x402/invoices` · `GET /x402/invoices[/{id}]` · `POST /x402/invoices/{id}/verify` · `POST /x402/pay` (Bearer opcional) · `GET /x402/payouts` · `GET /x402/protected` (demo) |
 82: | Sistema | `GET /health` · `/navbar` · `/modules` · `/device` (protegida por peaje) · `/device/model` (GLB desde R2, LIBRE) · `/config/solana/urls` · `/solana/status` |
 83: | Agente | `GET /agent/tools` · `POST /agent/call` · `GET /agent/state` |
 84: | MCP | `GET /mcp/status|tools` · `POST /mcp/call` (puente Streamable HTTP) |
 85: 
 86: ## Variables de entorno (`api/.env`)
 87: 
 88: Servidor (`AGENT_OS_API_HOST/PORT`, `AGENT_OS_API_DB_PATH`, `SYNC_INTERVAL_SECS`)
 89: · ERP (`PAYLOAD_URL`) · Solana (`SOLANA_NETWORK`, `SOLANA_{LOCAL,DEVNET,TESTNET,MAINNET}_URL`,
 90: `SOLANA_WALLET`, `SOLANA_PAYER_KEYPAIR`) · x402 (`X402_PAYEE_WALLET`,
 91: `X402_SETTLE_INTERVAL_SECS`, `X402_MAX_VERIFY_ATTEMPTS`, `X402_PROTECTED_PATHS`,
 92: `X402_PATH_LAMPORTS`) · Cuentas (`ACCOUNTS_MASTER_KEY` = base64 de 32 B, obligatoria
 93: para cifrar; sin ella las ops de cifrado fallan con 503 claro) · R2 (`R2_ACCOUNT_ID`,
 94: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_MODEL_KEY`,
 95: `R2_PUBLIC_URL_BASE`, `R2_REGION?`) · MCP (`MEDUSA_MCP_URL/TOKEN`).
 96: 
 97: ## Verificado en pruebas (no romper)
 98: 
 99: - Registro→login→me→logout (revocación inmediata: reuso → 401).
100: - keypair import: cifrado AEAD en DB + pubkey derivada; array o string JSON.
101: - 402 → settled → reintento X-Payment → 200 → **recurso ejecutado** → replay 409.
102: - Settler por cuenta: usa el keypair y la red DE LA CUENTA (no el global).
103: - Límites: tx_limit y daily (24 h, excluye `failed`).
104: - `cargo test`: 12 tests (fmt_sol, base58, tx shape, crypto round-trip).
````

## File: brain/app/context.py
````python
  1: """Contexto de cuenta — identidad del orquestador (paso «Identidad» del diagrama).
  2: 
  3: El gateway agéntico recibe `Authorization: Bearer <session_token>` y
  4: resuelve TODO el contexto de la cuenta contra la API (OpenID Provider):
  5:   - llm:   proveedor + modelos + api_key de la cuenta
  6:   - chain: red + wallet del orquestador + límites dPaaS
  7:   - wallets: sub-wallets
  8: 
  9: Sin Bearer → None → la petición opera como "system" (config global de brain).
 10: Token inválido → la API responde 401 y se propaga.
 11: """
 12: 
 13: from __future__ import annotations
 14: 
 15: import logging
 16: from dataclasses import dataclass, field
 17: 
 18: import httpx
 19: 
 20: from .config import settings
 21: 
 22: log = logging.getLogger("agent-brain.account")
 23: 
 24: 
 25: @dataclass
 26: class AccountContext:
 27:     bearer: str
 28:     account: dict
 29:     llm: dict | None = None
 30:     chain: dict | None = None
 31:     wallets: list = field(default_factory=list)
 32: 
 33:     @property
 34:     def account_id(self) -> str:
 35:         return str(self.account.get("id", "system"))
 36: 
 37:     @property
 38:     def email(self) -> str:
 39:         return str(self.account.get("email", ""))
 40: 
 41:     @property
 42:     def llm_base_url(self) -> str | None:
 43:         return (self.llm or {}).get("base_url")
 44: 
 45:     @property
 46:     def llm_api_key(self) -> str:
 47:         return (self.llm or {}).get("api_key") or "fake"
 48: 
 49:     @property
 50:     def llm_model(self) -> str | None:
 51:         llm = self.llm or {}
 52:         return llm.get("default_model") or (llm.get("models") or [None])[0]
 53: 
 54:     @property
 55:     def llm_provider(self) -> str | None:
 56:         return (self.llm or {}).get("provider")
 57: 
 58:     @property
 59:     def network(self) -> str | None:
 60:         return (self.chain or {}).get("network")
 61: 
 62:     @property
 63:     def wallet(self) -> str | None:
 64:         return (self.chain or {}).get("wallet_pubkey")
 65: 
 66: 
 67: async def fetch_account_context(bearer: str) -> AccountContext | None:
 68:     """Resuelve el contexto de la cuenta contra la API.
 69: 
 70:     Devuelve None si no hay token; propaga 401 si el token es inválido
 71:     (el orquestador NO opera con una identidad rota).
 72:     """
 73:     if not bearer:
 74:         return None
 75:     async with httpx.AsyncClient(timeout=10) as client:
 76:         res = await client.get(
 77:             f"{settings.agent_os_api_url}/accounts/me/context",
 78:             headers={"Authorization": f"Bearer {bearer}"},
 79:         )
 80:     if res.status_code == 404:
 81:         return None  # API sin módulo de cuentas (versión vieja) → system
 82:     if res.status_code == 401:
 83:         raise PermissionError("Bearer inválido o expirado (API: " + res.text[:120] + ")")
 84:     res.raise_for_status()
 85:     data = res.json()
 86:     ctx = AccountContext(
 87:         bearer=bearer,
 88:         account=data.get("account") or {},
 89:         llm=data.get("llm"),
 90:         chain=data.get("chain"),
 91:         wallets=data.get("wallets") or [],
 92:     )
 93:     log.info(
 94:         "contexto de cuenta %s (%s): llm=%s model=%s red=%s wallet=%s",
 95:         ctx.account_id, ctx.email, ctx.llm_provider, ctx.llm_model, ctx.network, ctx.wallet,
 96:     )
 97:     return ctx
 98: 
 99: 
100: def bearer_from_headers(headers) -> str:
101:     """Extrae `Authorization: Bearer <token>` de los headers de la request."""
102:     raw = headers.get("authorization") or headers.get("Authorization") or ""
103:     if raw.lower().startswith("bearer "):
104:         return raw[7:].strip()
105:     return ""
````

## File: brain/app/llm.py
````python
  1: """Cliente LLM — SIEMPRE el proveedor DE LA CUENTA (multi-tenant).
  2: 
  3: Sin fallback global: la cuenta es 100% responsable de cargar sus api_keys
  4: (modal Modelos del panel). Sin Bearer o sin proveedor activo, el gateway
  5: responde error explícito en vez de razonar.
  6: 
  7: Loop del orquestador (tool-calling):
  8:   1. El modelo razona la intención y emite ``tool_calls``.
  9:   2. El orquestador ejecuta cada tool contra agent-os-api (guard x402
 10:      reactivo: 402 → pago delegado de la cuenta → reintento con X-Payment).
 11:   3. Los resultados vuelven al modelo como mensajes ``role=tool``.
 12:   4. Se repite hasta respuesta final o ``MAX_TOOL_ITERATIONS``.
 13: """
 14: 
 15: from __future__ import annotations
 16: 
 17: import json
 18: import logging
 19: from dataclasses import dataclass, field
 20: 
 21: from openai import AsyncOpenAI
 22: 
 23: from .config import settings
 24: from .context import AccountContext
 25: from .tools import RunEvents, ToolResult, execute_tool, tools_openai_schemas
 26: 
 27: log = logging.getLogger("agent-brain.llm")
 28: 
 29: SYSTEM_PROMPT = (
 30:     "Eres Muse, el agente operativo del dispositivo ESP32-S3-Touch-AMOLED-1.43. "
 31:     "Razonas la intención del usuario en español y orquestas las herramientas "
 32:     "disponibles (estado del dispositivo, Solana, micro-peajes x402, modelo 3D en R2) "
 33:     "de forma autónoma. Usa las herramientas cuando aporten datos reales en vez de "
 34:     "inventar la respuesta. Responde de forma breve, concreta y en español. "
 35:     "Cuando menciones cifras (balance en SOL, lamports, slots), cita el dato exacto "
 36:     "que te devolvieron las herramientas."
 37: )
 38: 
 39: 
 40: def _account_prompt(ctx: AccountContext) -> str:
 41:     """Contexto de identidad para el LLM (paso «Identidad» del diagrama)."""
 42:     parts = [
 43:         f"Operas como orquestador de la cuenta «{ctx.email}» ({ctx.account_id})."
 44:     ]
 45:     if ctx.network:
 46:         parts.append(f"Red activa de la cuenta: {ctx.network}.")
 47:     if ctx.wallet:
 48:         parts.append(f"Wallet del orquestador: {ctx.wallet}.")
 49:     if ctx.chain and ctx.chain.get("daily_limit_lamports"):
 50:         parts.append(f"Límite diario dPaaS: {ctx.chain['daily_limit_lamports']} lamports.")
 51:     parts.append(
 52:         "Los micro-peajes x402 de los recursos protegidos se pagan automáticamente "
 53:         "con la wallet delegada de la cuenta; si una tool reporta que el pago está "
 54:         "en verificación on-chain, dilo al usuario con la firma de la transacción."
 55:     )
 56:     return " ".join(parts)
 57: 
 58: 
 59: @dataclass
 60: class AgentRun:
 61:     reply: str
 62:     tools_used: list[str] = field(default_factory=list)
 63:     iterations: int = 0
 64:     backend: str = ""  # "account:<provider>" (sin fallback global)
 65:     model: str = ""
 66:     error: str = ""
 67:     x402_events: list[dict] = field(default_factory=list)
 68: 
 69: 
 70: class LLMNotConfigured(Exception):
 71:     """La cuenta no tiene proveedor LLM activo (o no hay cuenta)."""
 72: 
 73: 
 74: async def _resolve_backend(ctx: AccountContext | None) -> tuple[AsyncOpenAI, str, str]:
 75:     """Devuelve (cliente, backend, modelo).
 76: 
 77:     Solo existe el LLM DE LA CUENTA: sin contexto o sin proveedor activo
 78:     se lanza LLMNotConfigured (el gateway lo convierte en error claro).
 79:     """
 80:     if not (ctx and ctx.llm_base_url and ctx.llm_model):
 81:         raise LLMNotConfigured(
 82:             "sin proveedor LLM: configura tu key en Modelos del agente"
 83:         )
 84:     if not ctx.llm_api_key or ctx.llm_api_key == "fake":
 85:         raise LLMNotConfigured(
 86:             f"el proveedor «{ctx.llm_provider}» no tiene api_key: cárgala en Modelos del agente"
 87:         )
 88:     client = AsyncOpenAI(
 89:         base_url=ctx.llm_base_url,
 90:         api_key=ctx.llm_api_key,
 91:         timeout=120,
 92:     )
 93:     return client, f"account:{ctx.llm_provider}", ctx.llm_model
 94: 
 95: 
 96: async def run_agent(
 97:     user_text: str,
 98:     *,
 99:     extra_instructions: str = "",
100:     ctx: AccountContext | None = None,
101: ) -> AgentRun:
102:     """Ejecuta el ciclo agéntico completo: razonar → tool-calls → responder."""
103:     events = RunEvents()
104:     client, backend, model = await _resolve_backend(ctx)
105:     run = AgentRun(reply="", backend=backend, model=model)
106: 
107:     # Tienda de dapps: incorpora las tools de las apps INSTALADAS al
108:     # catálogo (TTL 60 s; best-effort — sin worker el agente sigue).
109:     from . import mcp
110:     await mcp.refresh()
111: 
112:     system = SYSTEM_PROMPT
113:     if ctx:
114:         system += "\n" + _account_prompt(ctx)
115:     if extra_instructions:
116:         system += f"\n{extra_instructions}"
117: 
118:     messages: list[dict] = [
119:         {"role": "system", "content": system},
120:         {"role": "user", "content": user_text},
121:     ]
122:     schemas = tools_openai_schemas()
123: 
124:     try:
125:         for iteration in range(1, settings.max_tool_iterations + 1):
126:             run.iterations = iteration
127:             completion = await client.chat.completions.create(
128:                 model=model,
129:                 messages=messages,
130:                 tools=schemas,
131:                 temperature=0.3,
132:             )
133:             choice = completion.choices[0]
134:             msg = choice.message
135: 
136:             if not msg.tool_calls:
137:                 run.reply = (msg.content or "").strip()
138:                 run.x402_events = events.x402
139:                 return run
140: 
141:             messages.append(
142:                 {
143:                     "role": "assistant",
144:                     "content": msg.content or "",
145:                     "tool_calls": [
146:                         {
147:                             "id": tc.id,
148:                             "type": "function",
149:                             "function": {
150:                                 "name": tc.function.name,
151:                                 "arguments": tc.function.arguments or "{}",
152:                             },
153:                         }
154:                         for tc in msg.tool_calls
155:                     ],
156:                 }
157:             )
158: 
159:             for tc in msg.tool_calls:
160:                 run.tools_used.append(tc.function.name)
161:                 try:
162:                     args = json.loads(tc.function.arguments or "{}")
163:                 except json.JSONDecodeError:
164:                     args = {}
165: 
166:                 log.info("tool-call #%d: %s(%s)", iteration, tc.function.name, args)
167:                 try:
168:                     result = await execute_tool(tc.function.name, args, ctx=ctx, events=events)
169:                 except Exception as e:  # noqa: BLE001 — robustez: un LLM que
170:                     # llama la tool con args inválidos no debe tumbar la corrida
171:                     log.warning("tool «%s» falló (¿args inválidos del LLM?): %s", tc.function.name, e)
172:                     result = ToolResult(
173:                         False, None,
174:                         f"error ejecutando {tc.function.name}: {e}",
175:                     )
176:                 messages.append(
177:                     {
178:                         "role": "tool",
179:                         "tool_call_id": tc.id,
180:                         "content": result.as_tool_message(),
181:                     }
182:                 )
183: 
184:         messages.append(
185:             {
186:                 "role": "user",
187:                 "content": "Resume ahora mismo lo que tienes, sin llamar más herramientas.",
188:             }
189:         )
190:         completion = await client.chat.completions.create(
191:             model=model, messages=messages, temperature=0.3
192:         )
193:         run.reply = (completion.choices[0].message.content or "").strip()
194:         run.x402_events = events.x402
195:         return run
196: 
197:     except Exception as e:  # noqa: BLE001
198:         log.error("run_agent error: %s", e)
199:         run.error = str(e)
200:         run.x402_events = events.x402
201:         return run
````

## File: brain/app/main.py
````python
  1: """agent-brain — Gateway agéntico de la capa cognitiva.
  2: 
  3: ``POST /v1/agentic-gateway`` orquesta el flujo Zero-UI completo:
  4: 
  5:   ① Identidad — Bearer → contexto de la cuenta (llm/chain/wallet) en la API.
  6:   ② Shield entrada — Llama Guard 3 clasifica el texto del dispositivo.
  7:   ③ Razonamiento — LLM de la cuenta (o global) con tool-calling.
  8:   ④ x402 reactivo — cada tool pasa el guard: 402 → pago delegado (dPaaS)
  9:      de la cuenta → reintento con X-Payment (el usuario nunca firma).
 10:   ⑤ Shield salida — Llama Guard 3 valida la respuesta antes de emitirla.
 11: """
 12: 
 13: from __future__ import annotations
 14: 
 15: import logging
 16: from typing import Optional
 17: 
 18: import httpx
 19: from fastapi import FastAPI, Request
 20: from fastapi.responses import JSONResponse
 21: from pydantic import BaseModel, Field
 22: 
 23: from .config import settings
 24: from .context import AccountContext, bearer_from_headers, fetch_account_context
 25: from .llm import LLMNotConfigured, run_agent
 26: from .shields import GuardVerdict, run_llama_guard
 27: from .tools import TOOLS
 28: 
 29: logging.basicConfig(
 30:     level=logging.INFO,
 31:     format="%(asctime)s %(levelname)s %(name)s: %(message)s",
 32: )
 33: log = logging.getLogger("agent-brain")
 34: 
 35: app = FastAPI(title="agent-brain — Capa Cognitiva", version="2.0.0")
 36: 
 37: 
 38: # ─────────────────────────────────────────────────────────────────────────────
 39: # Modelos
 40: # ─────────────────────────────────────────────────────────────────────────────
 41: 
 42: class AgenticRequest(BaseModel):
 43:     device_id: str = Field(default="ESP32-S3-Touch-AMOLED-1.43")
 44:     text: str = Field(min_length=1, max_length=4000)
 45:     solana_tx_signature: Optional[str] = None  # pago previo (modo manual)
 46: 
 47: 
 48: class AgenticResponse(BaseModel):
 49:     ok: bool
 50:     reply: str = ""
 51:     tools_used: list[str] = []
 52:     shield_in: dict = {}
 53:     shield_out: dict = {}
 54:     x402: list[dict] = []
 55:     account: dict = {}
 56:     backend: str = ""
 57:     model: str = ""
 58:     iterations: int = 0
 59: 
 60: 
 61: def _verdict_dict(v: GuardVerdict) -> dict:
 62:     return {"verdict": v.verdict, "categories": v.categories, "backend": v.backend}
 63: 
 64: 
 65: # ─────────────────────────────────────────────────────────────────────────────
 66: # Endpoints
 67: # ─────────────────────────────────────────────────────────────────────────────
 68: 
 69: @app.post("/v1/agentic-gateway", response_model=AgenticResponse)
 70: async def agentic_gateway(req: AgenticRequest, request: Request) -> AgenticResponse | JSONResponse:
 71:     log.info("◀ dispositivo «%s»: %s", req.device_id, req.text[:120])
 72: 
 73:     # ① Identidad — Bearer OBLIGATORIO: sin cuenta no hay LLM (la cuenta
 74:     # es 100% responsable de sus keys; no existe backend global).
 75:     bearer = bearer_from_headers(request.headers)
 76:     if not bearer:
 77:         return JSONResponse(
 78:             {"ok": False, "code": "AUTH_REQUIRED",
 79:              "error": "se requiere sesión de cuenta (Bearer) con proveedor LLM configurado"},
 80:             status_code=401,
 81:         )
 82:     try:
 83:         ctx = await fetch_account_context(bearer)
 84:     except PermissionError as e:
 85:         return JSONResponse({"ok": False, "error": str(e)}, status_code=401)
 86:     except Exception as e:  # noqa: BLE001
 87:         log.warning("contexto de cuenta falló: %s", e)
 88:         return JSONResponse(
 89:             {"ok": False, "error": f"no pude resolver tu cuenta: {e}"},
 90:             status_code=401,
 91:         )
 92: 
 93:     # ② Shield entrada: Llama Guard
 94:     shield_in = await run_llama_guard(req.text, output=False)
 95:     if shield_in.verdict == "unsafe":
 96:         log.warning("⛔ Llama Guard bloqueó el input: %s", shield_in.categories)
 97:         return AgenticResponse(
 98:             ok=False,
 99:             reply=(
100:                 "Tu mensaje fue bloqueado por la política de seguridad "
101:                 f"(categorías: {', '.join(shield_in.categories) or 'desconocidas'})."
102:             ),
103:             shield_in=_verdict_dict(shield_in),
104:         )
105: 
106:     # ③ + ④ Ciclo agéntico con tool-calls y x402 reactivo (dPaaS de la cuenta)
107:     extra = ""
108:     if req.solana_tx_signature:
109:         extra = (
110:             f"El dispositivo adjunta esta firma Solana de un pago x402 previo: "
111:             f"{req.solana_tx_signature}. Si necesitas verificar un pago, úsala."
112:         )
113:     try:
114:         run = await run_agent(req.text, extra_instructions=extra, ctx=ctx)
115:     except LLMNotConfigured as e:
116:         return JSONResponse(
117:             {"ok": False, "code": "LLM_NOT_CONFIGURED", "error": str(e)},
118:             status_code=400,
119:         )
120: 
121:     if not run.reply:
122:         log.error("run_agent sin respuesta: %s", run.error)
123:         return AgenticResponse(
124:             ok=False,
125:             reply="No pude razonar la petición: tu proveedor LLM falló. "
126:                   "Revisa tu api_key y modelo en Modelos del agente.",
127:             backend=run.backend,
128:             model=run.model,
129:             x402=run.x402_events,
130:         )
131: 
132:     # ⑤ Shield salida: Llama Guard valida la respuesta del agente
133:     shield_out = await run_llama_guard(run.reply, output=True, original_user_text=req.text)
134:     if shield_out.verdict == "unsafe":
135:         log.warning("⛔ Llama Guard bloqueó el output: %s", shield_out.categories)
136:         return AgenticResponse(
137:             ok=False,
138:             reply="La respuesta generada fue retenida por la política de seguridad.",
139:             tools_used=run.tools_used,
140:             shield_in=_verdict_dict(shield_in),
141:             shield_out=_verdict_dict(shield_out),
142:             backend=run.backend,
143:             model=run.model,
144:             iterations=run.iterations,
145:             x402=run.x402_events,
146:         )
147: 
148:     log.info(
149:         "▶ respuesta (%d tools, %d iter, %s, x402: %s): %s",
150:         len(run.tools_used), run.iterations, run.backend,
151:         [e.get("status") for e in run.x402_events] or "—",
152:         run.reply[:120],
153:     )
154: 
155:     return AgenticResponse(
156:         ok=True,
157:         reply=run.reply,
158:         tools_used=run.tools_used,
159:         shield_in=_verdict_dict(shield_in),
160:         shield_out=_verdict_dict(shield_out),
161:         x402=run.x402_events,
162:         account={"id": ctx.account_id, "email": ctx.email} if ctx else {},
163:         backend=run.backend,
164:         model=run.model,
165:         iterations=run.iterations,
166:     )
167: 
168: 
169: @app.get("/v1/health")
170: async def health() -> dict:
171:     """Salud del orquestador y conectividad con el ecosistema."""
172:     out: dict = {"ok": True, "service": "agent-brain", "version": app.version}
173: 
174:     # agent-os-api
175:     try:
176:         async with httpx.AsyncClient(timeout=5) as client:
177:             res = await client.get(f"{settings.agent_os_api_url}/health")
178:         out["api"] = {"ok": res.status_code == 200, "url": settings.agent_os_api_url}
179:     except Exception as e:  # noqa: BLE001
180:         out["api"] = {"ok": False, "error": str(e)[:120]}
181: 
182:     # Llama Stack
183:     try:
184:         async with httpx.AsyncClient(timeout=3) as client:
185:             res = await client.get(
186:                 f"{settings.llama_stack_url}/models",
187:                 headers={"Authorization": f"Bearer {settings.llama_stack_api_key}"},
188:             )
189:         out["llama_stack"] = {"ok": res.status_code == 200, "url": settings.llama_stack_url}
190:     except Exception:  # noqa: BLE001
191:         out["llama_stack"] = {"ok": False, "url": settings.llama_stack_url}
192: 
193:     # Ollama (Llama Guard + fallback)
194:     try:
195:         async with httpx.AsyncClient(timeout=3) as client:
196:             res = await client.get(f"{settings.ollama_url}/api/tags")
197:         models = [m.get("name") for m in res.json().get("models", [])] if res.status_code == 200 else []
198:         out["ollama"] = {"ok": res.status_code == 200, "models": models}
199:     except Exception:  # noqa: BLE001
200:         out["ollama"] = {"ok": False}
201: 
202:     out["guard"] = {
203:         "enabled": settings.guard_enabled,
204:         "model": settings.llama_guard_model,
205:         "excluded": settings.guard_excluded_categories,
206:     }
207:     return out
208: 
209: 
210: @app.get("/v1/tools")
211: async def list_tools() -> dict:
212:     """Herramientas disponibles para el LLM (metadata).
213: 
214:     Incluye las tools de las dapps INSTALADAS (tienda de apps): el
215:     refresh trae el catálogo del worker (TTL 60 s).
216:     """
217:     from . import mcp
218:     await mcp.refresh()
219:     return {
220:         "ok": True,
221:         "tools": [
222:             {
223:                 "name": t.name,
224:                 "description": t.description,
225:                 "parameters": t.parameters,
226:             }
227:             for t in TOOLS.values()
228:         ],
229:     }
````

## File: brain/app/shields.py
````python
  1: """Llama Guard 3 — shields de entrada y salida.
  2: 
  3: Dos backends:
  4:   1. Llama Stack moderation API (OpenAI-compatible ``/v1/moderations``),
  5:      cuando el shield está registrado en la distribución.
  6:   2. Ollama directo con el modelo ``llama-guard3:1b`` (fallback autónomo,
  7:      corre en CPU).
  8: 
  9: Protocolo: prompt oficial de Llama Guard 3 → el modelo responde ``safe`` o
 10: ``unsafe`` + categorías violadas (S1..S14).
 11: 
 12: Falsos positivos (lección documentada por Red Hat con estos shields): el
 13: modelo 1B a veces flaggea categorías que no aplican al dominio (p.ej. S9
 14: "Indiscriminate Weapons" ante texto de micro-peajes/blockchain). La práctica
 15: recomendada es una lista de exclusión por categoría
 16: (``GUARD_EXCLUDED_CATEGORIES``): si todas las categorías violadas están en
 17: la lista, el contenido se considera seguro para este dominio.
 18: """
 19: 
 20: from __future__ import annotations
 21: 
 22: import asyncio
 23: import logging
 24: import re
 25: from dataclasses import dataclass, field
 26: 
 27: import httpx
 28: 
 29: from .config import settings
 30: 
 31: log = logging.getLogger("agent-brain.guard")
 32: 
 33: # Categorías oficiales de Llama Guard 3 (unsafe content categories)
 34: _GUARD_CATEGORIES = """S1: Violent Crimes.
 35: S2: Non-Violent Crimes.
 36: S3: Sex Crimes.
 37: S4: Child Sexual Exploitation.
 38: S5: Defamation.
 39: S6: Specialized Advice.
 40: S7: Privacy.
 41: S8: Intellectual Property.
 42: S9: Indiscriminate Weapons.
 43: S10: Hate.
 44: S11: Self-Harm.
 45: S12: Sexual Content.
 46: S13: Elections.
 47: S14: Code Interpreter Abuse."""
 48: 
 49: 
 50: @dataclass
 51: class GuardVerdict:
 52:     verdict: str  # "safe" | "unsafe" | "unknown" | "disabled"
 53:     categories: list[str]
 54:     backend: str  # "llama-stack" | "ollama" | "disabled" | "error"
 55:     raw: str = ""
 56:     excluded_applied: bool = False
 57: 
 58:     @property
 59:     def is_safe(self) -> bool:
 60:         return self.verdict != "unsafe"
 61: 
 62: 
 63: def _prompt(user_text: str, output: bool, original_user_text: str = "") -> str:
 64:     """Prompt oficial del protocolo Llama Guard 3.
 65: 
 66:     Para el shield de salida, la conversación debe incluir la pregunta del
 67:     usuario Y la respuesta del agente (`Agent: …`), que es lo que se evalúa.
 68:     """
 69:     role = "the Agent messages" if output else "the user messages"
 70:     if output:
 71:         conversation = f"User: {original_user_text or '(pregunta del usuario)'}\nAgent: {user_text}"
 72:     else:
 73:         conversation = f"User: {user_text}"
 74:     return (
 75:         f"Task: Check if there is unsafe content in {role} in the "
 76:         f"conversation according our safety policy with the below categories.\n\n"
 77:         f"<BEGIN UNSAFE CONTENT CATEGORIES>\n{_GUARD_CATEGORIES}\n"
 78:         f"<END UNSAFE CONTENT CATEGORIES>\n\n"
 79:         f"<BEGIN CONVERSATION>\n{conversation}\n<END CONVERSATION>\n\n"
 80:         f"Provide your safety assessment for ONLY {role} in the above "
 81:         f"conversation:\n"
 82:         f"- First line must read 'safe' or 'unsafe'.\n"
 83:         f"- If unsafe, a second line must include a comma-separated list of "
 84:         f"violated categories.\n"
 85:     )
 86: 
 87: 
 88: def _parse_guard_reply(text: str) -> GuardVerdict:
 89:     m = re.match(r"\s*(safe|unsafe)\b", text, re.IGNORECASE)
 90:     if not m:
 91:         return GuardVerdict("unknown", [], "parse", raw=text[:200])
 92:     verdict = m.group(1).lower()
 93:     cats = sorted(set(re.findall(r"S\d{1,2}", text)))
 94:     return GuardVerdict(verdict, cats, "parse", raw=text[:200])
 95: 
 96: 
 97: def _apply_exclusions(v: GuardVerdict, backend: str) -> GuardVerdict:
 98:     """Política de exclusiones (defensa contra falsos positivos del 1B):
 99:     si TODAS las categorías violadas están en GUARD_EXCLUDED_CATEGORIES,
100:     el contenido se considera seguro para este dominio."""
101:     v.backend = backend
102:     if v.verdict == "unsafe" and v.categories:
103:         excluded = set(settings.guard_excluded_categories)
104:         if excluded and set(v.categories) <= excluded:
105:             log.warning(
106:                 "Llama Guard flaggeó %s pero están en la exclusion list → permitido",
107:                 v.categories,
108:             )
109:             v.excluded_applied = True
110:             v.verdict = "safe"
111:     return v
112: 
113: 
114: def _sanitize_for_guard(text: str) -> str:
115:     """Limpieza ligera antes del shield: el modelo 1B se atasca con
116:     markdown (``**``, ``#``, backticks) y emite respuestas vacías."""
117:     import re as _re
118: 
119:     text = _re.sub(r"[*_#>`~\[\]|]+", " ", text)
120:     text = _re.sub(r"\s{2,}", " ", text)
121:     return text.strip()
122: 
123: 
124: async def _via_ollama(text: str, output: bool, original_user_text: str = "") -> GuardVerdict:
125:     """Llama Guard 3 corriendo en Ollama (CPU-friendly), con 1 reintento
126:     ante respuesta vacía (el 1B es inestable con texto en español).
127:     El input se trunca y sanitiza (práctica Red Hat: limitar tamaño para
128:     inferencia rápida del shield)."""
129:     # Truncar + sanitizar: el shield evalúa intención, no formato.
130:     text = _sanitize_for_guard(text[:1500])
131:     payload = {
132:         "model": settings.llama_guard_model,
133:         "messages": [{"role": "user", "content": _prompt(text, output, original_user_text)}],
134:         "stream": False,
135:         "options": {"temperature": 0, "num_predict": 40, "num_ctx": 1024},
136:     }
137:     reply = ""
138:     for attempt in (1, 2):
139:         async with httpx.AsyncClient(timeout=90) as client:
140:             res = await client.post(f"{settings.ollama_url}/api/chat", json=payload)
141:             res.raise_for_status()
142:             reply = res.json().get("message", {}).get("content", "")
143:         if reply.strip():
144:             break
145:         log.warning("Llama Guard respondió vacío (intento %d), reintentando", attempt)
146:         await asyncio.sleep(1)
147: 
148:     if not reply.strip():
149:         return GuardVerdict("unknown", [], "ollama")
150:     return _apply_exclusions(_parse_guard_reply(reply), "ollama")
151: 
152: 
153: async def _via_llama_stack(text: str) -> GuardVerdict:
154:     """Moderation API OpenAI-compatible expuesta por Llama Stack."""
155:     async with httpx.AsyncClient(timeout=15) as client:
156:         res = await client.post(
157:             f"{settings.llama_stack_url}/moderations",
158:             headers={"Authorization": f"Bearer {settings.llama_stack_api_key}"},
159:             json={"input": text},
160:         )
161:         res.raise_for_status()
162:         data = res.json()
163:     results = data.get("results") or data.get("data") or []
164:     if not results:
165:         return GuardVerdict("unknown", [], "llama-stack")
166:     r = results[0]
167:     flagged = bool(r.get("flagged"))
168:     cats = [k for k, v in (r.get("categories") or {}).items() if v]
169:     v = GuardVerdict("unsafe" if flagged else "safe", cats, "llama-stack")
170:     return _apply_exclusions(v, "llama-stack")
171: 
172: 
173: async def run_llama_guard(
174:     text: str, *, output: bool = False, original_user_text: str = ""
175: ) -> GuardVerdict:
176:     """Corre Llama Guard sobre un texto. Devuelve el veredicto.
177: 
178:     ``original_user_text`` se usa en el shield de salida para reconstruir la
179:     conversación (User + Agent) según el protocolo.
180: 
181:     Orden de intentos: Llama Stack (si está habilitado) → Ollama →
182:     ``unknown`` (fail-open con warning; en producción usar fail-closed).
183:     """
184:     if not settings.guard_enabled:
185:         return GuardVerdict("disabled", [], "disabled")
186: 
187:     # 1) Llama Stack moderation API
188:     if settings.guard_via_llama_stack:
189:         try:
190:             return await _via_llama_stack(text)
191:         except Exception as e:  # noqa: BLE001
192:             log.warning("Llama Stack moderation falló (%s); cae a Ollama", e)
193: 
194:     # 2) Ollama directo con llama-guard3
195:     try:
196:         return await _via_ollama(text, output, original_user_text)
197:     except Exception as e:  # noqa: BLE001
198:         log.warning("Llama Guard vía Ollama falló: %s — continue (fail-open)", e)
199:         return GuardVerdict("unknown", [], "error")
````

## File: brain/app/tools.py
````python
  1: """Herramientas del agente — puente HTTP hacia agent-os-api (api).
  2: 
  3: Fase 5: TODAS las llamadas a la API pasan por el guard x402 reactivo:
  4: si un recurso responde 402, el handshake delegado (dPaaS de la cuenta)
  5: paga y reintenta con X-Payment. Sin cuenta autenticada → modo manual.
  6: """
  7: 
  8: from __future__ import annotations
  9: 
 10: import json
 11: import logging
 12: from dataclasses import dataclass, field
 13: from pathlib import Path
 14: from typing import Any
 15: 
 16: from .config import settings
 17: from .context import AccountContext
 18: from .x402 import GuardedResult, X402Outcome, guarded_call
 19: 
 20: log = logging.getLogger("agent-brain.tools")
 21: 
 22: 
 23: @dataclass
 24: class ToolResult:
 25:     ok: bool
 26:     data: Any
 27:     error: str = ""
 28:     x402: dict | None = None  # outcome del handshake (si hubo 402)
 29: 
 30:     def as_tool_message(self) -> str:
 31:         payload = {"ok": self.ok}
 32:         if self.ok:
 33:             payload["data"] = self.data
 34:         else:
 35:             payload["error"] = self.error
 36:         if self.x402:
 37:             payload["x402"] = self.x402
 38:         return json.dumps(payload, ensure_ascii=False, default=str)[:4000]
 39: 
 40: 
 41: @dataclass
 42: class RunEvents:
 43:     """Outcomes x402 de la corrida (para la respuesta del gateway)."""
 44:     x402: list[dict] = field(default_factory=list)
 45: 
 46: 
 47: # ---------------------------------------------------------------------------
 48: # Llamada base: guard x402 reactivo en TODAS las rutas de la API
 49: # ---------------------------------------------------------------------------
 50: 
 51: def _from_guarded(g: GuardedResult, events: RunEvents | None = None) -> ToolResult:
 52:     """Convierte el resultado del guard en ToolResult, registrando el outcome."""
 53:     if g.x402.status != "skipped" and events is not None:
 54:         events.x402.append(g.x402.as_dict())
 55:     if g.status_code >= 400:
 56:         detail = ""
 57:         if g.x402.status in ("manual", "verifying"):
 58:             # El handshake dejó mensaje útil (pay_hint o estado del pago delegado).
 59:             return ToolResult(False, None, g.x402.detail, x402=g.x402.as_dict())
 60:         if isinstance(g.data, dict):
 61:             detail = str(g.data.get("error", g.data))[:300]
 62:         else:
 63:             detail = str(g.data)[:300] if g.data else ""
 64:         return ToolResult(False, None, f"HTTP {g.status_code}: {detail}", x402=g.x402.as_dict() or None)
 65:     return ToolResult(True, g.data, x402=g.x402.as_dict() if g.x402.status != "skipped" else None)
 66: 
 67: 
 68: async def _call_api(
 69:     path: str,
 70:     *,
 71:     method: str = "GET",
 72:     body: dict | None = None,
 73:     ctx: AccountContext | None = None,
 74:     events: RunEvents | None = None,
 75: ) -> ToolResult:
 76:     """HTTP a agent-os-api con handshake x402 reactivo."""
 77:     try:
 78:         g = await guarded_call(path, method=method, body=body, ctx=ctx)
 79:     except Exception as e:  # noqa: BLE001
 80:         return ToolResult(False, None, str(e))
 81:     return _from_guarded(g, events)
 82: 
 83: 
 84: # ---------------------------------------------------------------------------
 85: # Implementaciones (cada una habla con un endpoint real de agent-os-api)
 86: # ---------------------------------------------------------------------------
 87: 
 88: async def _get_navbar_status(ctx, ev, **_: Any) -> ToolResult:
 89:     return await _call_api("/navbar", ctx=ctx, events=ev)
 90: 
 91: 
 92: async def _get_device(ctx, ev, **_: Any) -> ToolResult:
 93:     return await _call_api("/device", ctx=ctx, events=ev)
 94: 
 95: 
 96: async def _get_health(ctx, ev, **_: Any) -> ToolResult:
 97:     return await _call_api("/health", ctx=ctx, events=ev)
 98: 
 99: 
100: async def _solana_status(network: str | None = None, ctx=None, ev=None, **_: Any) -> ToolResult:
101:     qs = f"?network={network}" if network else ""
102:     return await _call_api(f"/solana/status{qs}", ctx=ctx, events=ev)
103: 
104: 
105: async def _solana_urls(ctx, ev, **_: Any) -> ToolResult:
106:     return await _call_api("/config/solana/urls", ctx=ctx, events=ev)
107: 
108: 
109: async def _x402_summary(ctx, ev, **_: Any) -> ToolResult:
110:     return await _call_api(
111:         "/agent/call", method="POST", body={"tool": "x402_summary", "args": {}},
112:         ctx=ctx, events=ev,
113:     )
114: 
115: 
116: async def _fleet_status(ctx, ev, **_: Any) -> ToolResult:
117:     """Flota de dispositivos de la cuenta (NomikOS Fase 1): estado
118:     online/offline, board, versión del agentd y límites por dispositivo."""
119:     return await _call_api("/devices", ctx=ctx, events=ev)
120: 
121: 
122: async def _place_call(destination: str, ctx=None, ev=None, **_: Any) -> ToolResult:
123:     """NomikOS Fase 5: inicia una llamada al destino. Cada minuto es un
124:     peaje x402 que la cuenta paga por dPaaS (402 → pago delegado →
125:     reintento automático); la respuesta trae el peaje del minuto siguiente."""
126:     return await _call_api(
127:         "/calls", method="POST", body={"destination": destination},
128:         ctx=ctx, events=ev,
129:     )
130: 
131: 
132: async def _end_call(id: str, ctx=None, ev=None, **_: Any) -> ToolResult:
133:     from urllib.parse import quote
134: 
135:     return await _call_api(
136:         f"/calls/{quote(id)}/end", method="POST", body={},
137:         ctx=ctx, events=ev,
138:     )
139: 
140: 
141: async def _app_request(path: str, method: str = "GET", body: dict | None = None, ctx=None, ev=None, **_: Any) -> ToolResult:
142:     """NomikOS F5 (diagram.d2 paso 6): tool call a la APP del ecosistema
143:     — Payload CMS (colecciones: /api/users, /api/media, …). CADA petición
144:     cobra un micro-peaje x402 que la cuenta paga por dPaaS (402 → pago
145:     delegado → reintento automático con X-Payment)."""
146:     return await _call_api(
147:         "/app/request", method="POST",
148:         body={"path": path, "method": method, "body": body},
149:         ctx=ctx, events=ev,
150:     )
151: 
152: 
153: async def _x402_create_invoice(resource: str, amount_lamports: int, ctx=None, ev=None, **_: Any) -> ToolResult:
154:     return await _call_api(
155:         "/x402/invoices", method="POST",
156:         body={"resource": resource, "amount_lamports": amount_lamports},
157:         ctx=ctx, events=ev,
158:     )
159: 
160: 
161: async def _x402_invoice_status(id: str, ctx=None, ev=None, **_: Any) -> ToolResult:
162:     from urllib.parse import quote
163: 
164:     return await _call_api(f"/x402/invoices/{quote(id)}", ctx=ctx, events=ev)
165: 
166: 
167: async def _x402_pay_toll(to: str, lamports: int, memo: str | None = None, ctx=None, ev=None, **_: Any) -> ToolResult:
168:     return await _call_api(
169:         "/x402/pay", method="POST",
170:         body={"to": to, "lamports": lamports, "memo": memo},
171:         ctx=ctx, events=ev,
172:     )
173: 
174: 
175: async def _x402_payouts(ctx, ev, **_: Any) -> ToolResult:
176:     return await _call_api("/x402/payouts", ctx=ctx, events=ev)
177: 
178: 
179: # ---------------------------------------------------------------------------
180: # Muse CLI — proveedor local de razonamiento (agente MSP, `muse exec`)
181: # ---------------------------------------------------------------------------
182: 
183: async def _ask_muse(question: str, **_: Any) -> ToolResult:
184:     import asyncio
185: 
186:     if not settings.muse_bin or not Path(settings.muse_bin).exists():
187:         return ToolResult(False, None, "Muse CLI no configurado (MUSE_BIN)")
188: 
189:     try:
190:         proc = await asyncio.create_subprocess_exec(
191:             settings.muse_bin, "exec", question,
192:             stdout=asyncio.subprocess.PIPE,
193:             stderr=asyncio.subprocess.PIPE,
194:         )
195:         out_b, err_b = await asyncio.wait_for(proc.communicate(), timeout=90)
196:         out = out_b.decode(errors="replace").strip()
197:         err = err_b.decode(errors="replace").strip()
198:         if proc.returncode == 0 and out:
199:             return ToolResult(True, {"reply": out[-2000:]})
200:         detail = err.strip().splitlines()[-1] if err else f"exit {proc.returncode}"
201:         return ToolResult(False, None, f"muse exec falló: {detail[:200]}")
202:     except asyncio.TimeoutError:
203:         return ToolResult(False, None, "muse exec: timeout (90s)")
204:     except Exception as e:  # noqa: BLE001
205:         return ToolResult(False, None, f"muse exec: {e}")
206: 
207: 
208: # ---------------------------------------------------------------------------
209: # Registro de herramientas: schema (LLM) + implementación
210: # ---------------------------------------------------------------------------
211: 
212: @dataclass
213: class Tool:
214:     name: str
215:     description: str
216:     parameters: dict
217:     handler: Any
218: 
219:     def openai_schema(self) -> dict:
220:         return {
221:             "type": "function",
222:             "function": {
223:                 "name": self.name,
224:                 "description": self.description,
225:                 "parameters": self.parameters,
226:             },
227:         }
228: 
229: 
230: def _p(props: dict, required: list[str]) -> dict:
231:     return {"type": "object", "properties": props, "required": required}
232: 
233: 
234: TOOLS: dict[str, Tool] = {
235:     "get_navbar_status": Tool(
236:         name="get_navbar_status",
237:         description=(
238:             "Estado agregado del Agente OS: dispositivo, ERP (semáforo) y Solana "
239:             "(red, wallet, balance). Puede requerir micro-peaje x402 (se paga solo)."
240:         ),
241:         parameters=_p({}, []),
242:         handler=_get_navbar_status,
243:     ),
244:     "get_device": Tool(
245:         name="get_device",
246:         description=(
247:             "Ficha técnica del dispositivo ESP32-S3-Touch-AMOLED-1.43 y metadatos "
248:             "del modelo 3D en Cloudflare R2. Protegida por micro-peaje x402."
249:         ),
250:         parameters=_p({}, []),
251:         handler=_get_device,
252:     ),
253:     "get_health": Tool(
254:         name="get_health",
255:         description="Salud general de la API: uptime, módulos activos y versión.",
256:         parameters=_p({}, []),
257:         handler=_get_health,
258:     ),
259:     "solana_status": Tool(
260:         name="solana_status",
261:         description="Estado de la red Solana: running, validador, slot y balance de la wallet.",
262:         parameters=_p(
263:             {
264:                 "network": {
265:                     "type": "string",
266:                     "enum": ["local", "devnet", "testnet", "mainnet"],
267:                     "description": "Red a consultar (opcional)",
268:                 }
269:             },
270:             [],
271:         ),
272:         handler=_solana_status,
273:     ),
274:     "solana_urls": Tool(
275:         name="solana_urls",
276:         description="URLs RPC de Solana por red (fuente única de verdad).",
277:         parameters=_p({}, []),
278:         handler=_solana_urls,
279:     ),
280:     "x402_summary": Tool(
281:         name="x402_summary",
282:         description="Resumen del módulo x402: facturas de micro-peajes, liquidaciones y wallet cobradora.",
283:         parameters=_p({}, []),
284:         handler=_x402_summary,
285:     ),
286:     "fleet_status": Tool(
287:         name="fleet_status",
288:         description=(
289:             "Flota de dispositivos IoT de la cuenta (NomikOS): estado online/offline, "
290:             "placa, versión del agentd y límites x402 por dispositivo."
291:         ),
292:         parameters=_p({}, []),
293:         handler=_fleet_status,
294:     ),
295:     "place_call": Tool(
296:         name="place_call",
297:         description=(
298:             "Inicia una llamada (voz) a un destino (número E.164 o URI SIP). "
299:             "Cada minuto se cobra como micro-peaje x402 que la cuenta paga por dPaaS; "
300:             "la llamada avanza cuando el peaje se liquida y el siguiente llega en la respuesta."
301:         ),
302:         parameters=_p(
303:             {"destination": {"type": "string", "description": "Destino: +573001234567 o sip:usuario@dominio"}},
304:             ["destination"],
305:         ),
306:         handler=_place_call,
307:     ),
308:     "end_call": Tool(
309:         name="end_call",
310:         description="Finaliza (cuelga) una llamada en curso por su id.",
311:         parameters=_p(
312:             {"id": {"type": "string", "description": "Id de la llamada (call-…)"}},
313:             ["id"],
314:         ),
315:         handler=_end_call,
316:     ),
317:     "app_request": Tool(
318:         name="app_request",
319:         description=(
320:             "Hace una petición a la APP del ecosistema (Payload CMS, el ERP): "
321:             "colecciones REST como /api/users, /api/media, /api/patients… "
322:             "Cada petición se cobra como micro-peaje x402 que la cuenta paga por dPaaS."
323:         ),
324:         parameters=_p(
325:             {
326:                 "path": {"type": "string", "description": "Ruta interna de la app (ej: /api/users?limit=5)"},
327:                 "method": {"type": "string", "description": "GET | POST | PUT (default GET)"},
328:                 "body": {"type": "object", "description": "Cuerpo JSON para POST/PUT (opcional)"},
329:             },
330:             ["path"],
331:         ),
332:         handler=_app_request,
333:     ),
334:     "x402_create_invoice": Tool(
335:         name="x402_create_invoice",
336:         description="Crea una factura de micro-peaje x402 para un recurso.",
337:         parameters=_p(
338:             {
339:                 "resource": {"type": "string", "description": "Identificador del recurso"},
340:                 "amount_lamports": {"type": "integer", "description": "Monto en lamports (> 0)"},
341:             },
342:             ["resource", "amount_lamports"],
343:         ),
344:         handler=_x402_create_invoice,
345:     ),
346:     "x402_invoice_status": Tool(
347:         name="x402_invoice_status",
348:         description="Consulta el estado on-chain de una factura x402.",
349:         parameters=_p({"id": {"type": "string", "description": "ID de la factura"}}, ["id"]),
350:         handler=_x402_invoice_status,
351:     ),
352:     "x402_pay_toll": Tool(
353:         name="x402_pay_toll",
354:         description="Encola una liquidación SOL saliente firmada en background (dPaaS de la cuenta).",
355:         parameters=_p(
356:             {
357:                 "to": {"type": "string", "description": "Pubkey base58 del destinatario"},
358:                 "lamports": {"type": "integer", "description": "Monto en lamports (> 0)"},
359:                 "memo": {"type": "string", "description": "Memo opcional"},
360:             },
361:             ["to", "lamports"],
362:         ),
363:         handler=_x402_pay_toll,
364:     ),
365:     "x402_payouts": Tool(
366:         name="x402_payouts",
367:         description="Lista las liquidaciones salientes (payouts) del módulo x402.",
368:         parameters=_p({}, []),
369:         handler=_x402_payouts,
370:     ),
371:     "ask_muse": Tool(
372:         name="ask_muse",
373:         description=(
374:             "Consulta al agente Muse local (proveedor MSP) una pregunta directa. "
375:             "Úsala solo si el usuario pide explícitamente la opinión de Muse."
376:         ),
377:         parameters=_p(
378:             {"question": {"type": "string", "description": "Pregunta concreta para Muse"}},
379:             ["question"],
380:         ),
381:         handler=_ask_muse,
382:     ),
383: }
384: 
385: 
386: async def execute_tool(
387:     name: str,
388:     arguments: dict,
389:     *,
390:     ctx: AccountContext | None = None,
391:     events: RunEvents | None = None,
392: ) -> ToolResult:
393:     """Ejecuta una herramienta con el contexto de la cuenta (handshake x402
394:     reactivo incluido en cada llamada a la API)."""
395:     tool = TOOLS.get(name)
396:     if not tool:
397:         return ToolResult(False, None, f"herramienta «{name}» no registrada")
398: 
399:     args = dict(arguments or {})
400:     # El contexto/eventos se inyectan como kwargs; el handler los acepta.
401:     try:
402:         result = await tool.handler(ctx=ctx, ev=events, **args)
403:     except TypeError:
404:         # Handlers sin firma ctx/ev (p.ej. ask_muse): llamar sin inyección.
405:         clean = {k: v for k, v in args.items() if v is not None}
406:         result = await tool.handler(**clean)
407:     if not result.ok:
408:         log.info("tool «%s» → %s", name, (result.error or "")[:120])
409:     return result
410: 
411: 
412: def tools_openai_schemas() -> list[dict]:
413:     return [t.openai_schema() for t in TOOLS.values()]
````

## File: brain/app/x402.py
````python
  1: """x402 — Handshake reactivo (Fase 5): 402 → pago delegado → reintento firmado.
  2: 
  3: Implementa los pasos 1-7 del diagrama en el lado del orquestador:
  4:   1. HTTP Request normal al recurso (MCP Gateway)
  5:   2. El gateway responde 402 + invoice
  6:   3. «Pide firma»: dPaaS de la CUENTA paga (POST /me/x402/pay-invoice)
  7:   4. X-Payment: reintento con header X-Payment (one-shot en la API)
  8:   5. Tool call ejecutada con el peaje liquidado
  9: 
 10: Sin cuenta autenticada (system) el guard devuelve modo manual (pay_hint).
 11: """
 12: 
 13: from __future__ import annotations
 14: 
 15: import asyncio
 16: import logging
 17: from dataclasses import dataclass, field
 18: 
 19: import httpx
 20: 
 21: from .config import settings
 22: from .context import AccountContext
 23: 
 24: log = logging.getLogger("agent-brain.x402")
 25: 
 26: VERIFY_POLLS = 4  # reintentos del acceso mientras la tx confirma on-chain
 27: POLL_SECS = 3
 28: 
 29: 
 30: @dataclass
 31: class X402Outcome:
 32:     """Resultado del handshake para una tool (expuesto en la respuesta)."""
 33: 
 34:     status: str = "skipped"  # skipped | settled | verifying | manual | failed | replay
 35:     invoice_id: str | None = None
 36:     tx_signature: str | None = None
 37:     detail: str = ""
 38:     resource: str = ""
 39: 
 40:     def as_dict(self) -> dict:
 41:         return {
 42:             "status": self.status,
 43:             "invoice_id": self.invoice_id,
 44:             "tx_signature": self.tx_signature,
 45:             "resource": self.resource,
 46:             "detail": self.detail,
 47:         }
 48: 
 49: 
 50: @dataclass
 51: class GuardedResult:
 52:     status_code: int
 53:     data: dict | str | None = None
 54:     x402: X402Outcome = field(default_factory=X402Outcome)
 55: 
 56: 
 57: def _headers(ctx: AccountContext | None, x_payment: str | None = None) -> dict:
 58:     h = {"Content-Type": "application/json"}
 59:     if ctx:
 60:         h["Authorization"] = f"Bearer {ctx.bearer}"
 61:     if x_payment:
 62:         h["X-Payment"] = x_payment
 63:     return h
 64: 
 65: 
 66: async def _fetch(path: str, method: str, body: dict | None, ctx: AccountContext | None, x_payment: str | None):
 67:     async with httpx.AsyncClient(timeout=45) as client:
 68:         res = await client.request(
 69:             method,
 70:             f"{settings.agent_os_api_url}{path}",
 71:             json=body,
 72:             headers=_headers(ctx, x_payment),
 73:         )
 74:     try:
 75:         data = res.json()
 76:     except Exception:  # noqa: BLE001
 77:         data = res.text[:500]
 78:     return res.status_code, data
 79: 
 80: 
 81: async def delegated_pay_invoice(invoice_id: str, ctx: AccountContext) -> tuple[dict | None, X402Outcome]:
 82:     """«3. Pide firma» — el dPaaS de la cuenta paga la factura con SU wallet."""
 83:     code, data = await _fetch(
 84:         "/accounts/me/x402/pay-invoice",
 85:         "POST",
 86:         {"invoice_id": invoice_id},
 87:         ctx,
 88:         None,
 89:     )
 90:     if code != 200:
 91:         return None, X402Outcome(
 92:             status="failed",
 93:             invoice_id=invoice_id,
 94:             detail=f"pay-invoice HTTP {code}: {str(data)[:200]}",
 95:         )
 96:     invoice = data.get("invoice", data)
 97:     out = X402Outcome(
 98:         status=invoice.get("status", "verifying"),
 99:         invoice_id=invoice.get("id", invoice_id),
100:         tx_signature=invoice.get("tx_signature"),
101:     )
102:     if out.status == "settled":
103:         out.detail = "micro-peaje liquidado on-chain"
104:     else:
105:         out.detail = f"pago delegado enviado ({out.status}), tx {out.tx_signature or '—'}"
106:     return invoice, out
107: 
108: 
109: async def guarded_call(
110:     path: str,
111:     *,
112:     method: str = "GET",
113:     body: dict | None = None,
114:     ctx: AccountContext | None = None,
115: ) -> GuardedResult:
116:     """Llama un recurso de la API ejecutando el handshake x402 si responde 402.
117: 
118:     - 402 + cuenta autenticada → pago delegado (dPaaS) → reintento con X-Payment
119:     - 402 sin cuenta → modo manual: devuelve el pay_hint para el usuario
120:     - X-Payment verificando → poll corto hasta settled o agotar intentos
121:     """
122:     outcome = X402Outcome()
123: 
124:     code, data = await _fetch(path, method, body, ctx, None)
125: 
126:     if code != 402:
127:         return GuardedResult(code, data, outcome)
128: 
129:     # ── Handshake: la API exige micro-peaje ──
130:     invoice = (data or {}).get("invoice") or {}
131:     outcome.invoice_id = invoice.get("id")
132:     outcome.resource = invoice.get("resource", "")
133:     log.info("402 en %s → invoice %s (recurso %s)", path, outcome.invoice_id, outcome.resource)
134: 
135:     if not ctx:
136:         outcome.status = "manual"
137:         outcome.detail = "sin cuenta autenticada: pago manual requerido — " + str(
138:             invoice.get("pay_hint", "")
139:         )[:300]
140:         return GuardedResult(code, data, outcome)
141: 
142:     # 3-4) Firma delegada de la CUENTA.
143:     inv, outcome = await delegated_pay_invoice(outcome.invoice_id, ctx)
144:     if outcome.status == "failed":
145:         return GuardedResult(402, data, outcome)
146: 
147:     # 5) Reintento con X-Payment (poll mientras confirma on-chain).
148:     #    Siempre reintentamos: aunque pay-invoice ya haya devuelto settled,
149:     #    el acceso al recurso solo se concede con el reintento firmado.
150:     for attempt in range(1, VERIFY_POLLS + 1):
151:         if attempt > 1:
152:             await asyncio.sleep(POLL_SECS)
153:         code2, data2 = await _fetch(path, method, body, ctx, outcome.invoice_id)
154:         if code2 == 200:
155:             outcome.status = "settled"
156:             outcome.detail = "micro-peaje liquidado on-chain — acceso concedido"
157:             return GuardedResult(200, data2, outcome)
158:         if code2 == 402:
159:             # sigue sin confirmar: actualizar estado desde la invoice devuelta
160:             inv2 = (data2 or {}).get("invoice") or {}
161:             if inv2.get("status") == "failed":
162:                 outcome.status = "failed"
163:                 outcome.detail = "la tx delegada fue rechazada on-chain"
164:                 return GuardedResult(402, data2, outcome)
165:             continue
166:         if code2 == 409:
167:             outcome.status = "replay"
168:             outcome.detail = "X-Payment ya consumido (replay)"
169:             return GuardedResult(409, data2, outcome)
170:         # otro error → propagar
171:         return GuardedResult(code2, data2, outcome)
172: 
173:     if outcome.status != "settled":
174:         outcome.status = "verifying"
175:         outcome.detail = (
176:             f"pago delegado enviado (tx {outcome.tx_signature or '—'}); "
177:             "confirmación on-chain en curso — reintenta en segundos"
178:         )
179:     return GuardedResult(402, data, outcome)
````

## File: brain/AGENTS.md
````markdown
 1: # AGENTS.md — brain/ (Python)
 2: 
 3: Reglas de agente para la capa cognitiva (gateway agéntico). Complemento
 4: imprescindible: [`context.md`](context.md).
 5: 
 6: ## Reglas duras
 7: 
 8: 1. **Python 3.13 + venv propio** (`.venv` para brain, `.venv-stack` para el
 9:    servidor Llama Stack). Los venv se rompen al mover la carpeta → recrear
10:    (ver AGENTS.md de la raíz). Ejecutar SIEMPRE con `.venv/bin/python -m uvicorn …`.
11: 2. **Arquitectura** (no romper):
12:    - TODO el estado de negocio vive en `api` — brain solo orquesta.
13:    - Identidad: `context.fetch_account_context(bearer)` → `AccountContext`
14:      (llm/chain/wallets). Token inválido → `PermissionError` → **401** (no
15:      se opera con identidad rota).
16:    - LLM: por cuenta si `ctx.llm` existe (`backend: "account:<provider>"`),
17:      si no Llama Stack (`:8321/v1`) con fallback Ollama (`:11434/v1`).
18:    - x402: **TODAS** las llamadas a `api` pasan por `x402.guarded_call()`
19:      (handshake reactivo: 402 → `pay-invoice` delegado → poll → reintento
20:      con `X-Payment`). NO reintroducir el flujo proactivo viejo.
21: 3. **Shields Llama Guard 3** (`shields.py`): prompt OFICIAL con conversación
22:    completa `User:/Agent:` (output=True requiere el texto original del
23:    usuario — sin eso el 1B responde vacío). Sanitizar markdown antes
24:    (`_sanitize_for_guard`), truncar a 1500 chars, `num_ctx: 1024` (sin eso,
25:    Ollama+Vulkan da ErrorOutOfDeviceMemory). Exclusiones de categorías por
26:    `GUARD_EXCLUDED_CATEGORIES` (falsos positivos del 1B, práctica Red Hat).
27:    Fail-open documentado (en producción, fail-closed).
28: 4. **Loop de tools** (`llm.py::run_agent`): máx `MAX_TOOL_ITERATIONS` (8).
29:    Los tool messages van serializados con `ToolResult.as_tool_message()`
30:    (incluye `x402` outcome si hubo handshake). Nunca inventar datos: si una
31:    tool falla, el error se pasa tal cual al LLM.
32: 5. **Respuesta del gateway**: SIEMPRE incluir `account`, `backend`, `model`,
33:    `tools_used`, `shield_in/out` y `x402[]` events — son el contrato del
34:    contrato del flujo del diagrama.
35: 6. **`docs.json` del MCP worker NO va aquí**: el worker MCP vive en
36:    `dapps/payload-cms/templates/with-cloudflare-d1/src/mcp/` (workers-mcp).
37:    Brain no es un servidor MCP stdio.
38: 7. **Sin pancies de estado global**: settings solo de `.env` (config.py);
39:    nada de credenciales LLM en brain cuando hay cuenta — vienen del contexto.
40: 
41: ## Qué NO hacer
42: 
43: - No llamar a `api` con `httpx` directo saltándose `guarded_call` (perderías
44:   el handshake x402).
45: - No loguear api_keys ni tokens de sesión (el contexto trae el api_key del
46:   proveedor de la cuenta: solo se usa en el cliente OpenAI).
47: - No cachear `AccountContext` entre requests: se resuelve por petición.
48: - No cambiar `OLLAMA`/`num_ctx` del guard sin probar el caso de texto
49:   largo (markdown) — es la causa conocida de respuestas vacías del 1B.
50: 
51: ## Prueba de humo
52: 
53: ```bash
54: curl -s -X POST http://localhost:8322/v1/agentic-gateway \
55:   -H "Content-Type: application/json" -d '{"text":"estado de salud de la API"}'
56: # con cuenta: -H "Authorization: Bearer <token de login de :8080/api/auth/login>"
57: ```
````

## File: brain/context.md
````markdown
  1: # context.md — brain/ (Python)
  2: 
  3: Capa cognitiva del Agente OS: **gateway agéntico** (FastAPI `:8322`) que
  4: implementa el flujo del `diagram.d2` — identidad, shields, razonamiento con
  5: tool-calls y handshake x402 reactivo. Orquesta; NO guarda estado de negocio
  6: (la verdad vive en `api/`).
  7: 
  8: ## Mapa del código
  9: 
 10: ```
 11: brain/
 12: ├── app/
 13: │   ├── main.py      — POST /v1/agentic-gateway (flujo ①-⑤) · GET /v1/health · /v1/tools
 14: │   ├── context.py   — AccountContext + fetch_account_context(bearer) + bearer_from_headers
 15: │   ├── config.py    — settings de .env (AGENT_OS_API_URL, LLAMA_STACK_URL, LLM_MODEL,
 16: │   │                  OLLAMA_URL, GUARD_*, MUSE_BIN, MAX_TOOL_ITERATIONS)
 17: │   ├── llm.py       — run_agent(): SOLO cliente de cuenta (account:<provider>);
 18: │   │                  sin Bearer → 401, sin LLM activo → 400 LLM_NOT_CONFIGURED
 19: │   ├── tools.py     — 11 tools → TODAS vía guarded_call(ctx); ToolResult; RunEvents
 20: │   ├── x402.py      — guarded_call: 402 → delegated_pay_invoice (dPaaS de la cuenta)
 21: │   │                  → poll (4×3 s) → reintento con X-Payment → 200 recurso
 22: │   └── shields.py   — Llama Guard 3 (Ollama :11434, llama-guard3:1b) in/out;
 23: │                      exclusiones S8/S9/S14; retry ante respuesta vacía
 24: ├── run-stack.yaml   — distribución Llama Stack 0.7.3 (providers: nvidia-nim vía
 25: │                      NVIDIA_API_KEY + openai opcional; responses builtin; sqlite-vec)
 26: ├── .venv            — runtime del brain (fastapi, httpx, openai)
 27: ├── .venv-stack      — servidor Llama Stack (llama-stack, openai, mcp==1.23.0,
 28: │                      chardet, pypdf)
 29: └── mcp-servers/     — (ver README) referencia al worker MCP real:
 30:                        dapps/payload-cms/templates/with-cloudflare-d1/src/mcp/
 31: ```
 32: 
 33: ## Flujo del gateway (`POST /v1/agentic-gateway`)
 34: 
 35: ```
 36: {device_id, text, solana_tx_signature?} + Authorization: Bearer (OBLIGATORIO)
 37:   ① ctx = fetch_account_context(bearer)   → 401 si falta token o es inválido
 38:   ② shield_in = run_llama_guard(text)     → 400-policy si unsafe
 39:   ③ run = run_agent(text, ctx)            → SOLO LLM de la cuenta;
 40:      sin proveedor activo → 400 LLM_NOT_CONFIGURED (sin fallback global:
 41:      la cuenta trae sus keys en Modelos del agente)
 42:   ④   por cada tool_call → execute_tool(ctx) → guarded_call → api
 43:         (402 → pay-invoice delegado → reintento X-Payment → recurso)
 44:   ⑤ shield_out = run_llama_guard(reply, output=True, original_user_text)
 45:   → {ok, reply, tools_used, shield_in, shield_out, x402[], account, backend, model}
 46: ```
 47: 
 48: Backend observable en `backend`: `account:<provider>` (LLM ACTIVO de la
 49: cuenta, api_key de `account_llm_providers` desencriptada en `/me/context`).
 50: Ollama queda SOLO para shields Llama Guard (`GUARD_VIA_LLAMA_STACK=false`);
 51: ya no razona nada. Llama Stack fuera del arranque (`make up` ya no lo
 52: levanta; `scripts/stack-up.sh` + `llm-health.sh` quedan para self-host).
 53: 
 54: ## Las 15 tools (tools.py)
 55: 
 56: Con F5 el agente opera la APP del ecosistema (Payload CMS) pagando un
 57: peaje x402 POR PETICIÓN (app_request) y recibe turnos de VOZ del worker
 58: (api /voice → aquí). La corrida es robusta a LLMs débiles: una tool mal
 59: llamada devuelve un ToolResult de error y la conversación continúa.
 60: 
 61: `get_navbar_status` · `get_device` (protegida por peaje en api) ·
 62: `get_health` · `solana_status([network])` · `solana_urls` · `x402_summary` ·
 63: `x402_create_invoice(resource, amount_lamports)` · `x402_invoice_status(id)` ·
 64: `x402_pay_toll(to, lamports, [memo])` · `x402_payouts` · `ask_muse(question)`
 65: (CLI MSP local; hoy 402 billing de la cuenta Meta — se reporta como error).
 66: 
 67: ## Handshake x402 del guard (x402.py) — pasos del diagrama
 68: 
 69: 1. `_fetch(path, method, body, ctx)` con Bearer de la cuenta.
 70: 2. Si **402**: invoice del body → con cuenta: `delegated_pay_invoice`
 71:    (`POST /api/accounts/me/x402/pay-invoice`) → firma el dPaaS con la wallet
 72:    cifrada de la cuenta (valida límites) → `settled|verifying|failed`.
 73: 3. Reintento con `X-Payment: <invoice_id>` (SIEMPRE, incluso si pay-invoice
 74:    devolvió settled — bug corregido: no hacer `break` sin reintentar).
 75:    Poll 4 intentos × 3 s. 200 → recurso. 402-pending → seguir. 409 → replay.
 76: 4. Sin cuenta (system): modo **manual** → el resultado lleva el `pay_hint`
 77:    para el usuario.
 78: 5. `X402Outcome` queda en `RunEvents` → `x402[]` de la respuesta.
 79: 
 80: ## Shields (shields.py) — lecciones ya aprendidas
 81: 
 82: - Prompt oficial Llama Guard 3 (S1..S14); para output reconstruir
 83:   `User: <original> / Agent: <reply>` o el 1B responde vacío.
 84: - Sanitizar markdown (`*_#>` etc.) y truncar a 1500 chars antes del guard.
 85: - Ollama options: `temperature 0, num_predict 40, num_ctx 1024` (Vulkan OOM
 86:   con prompts ≥ ~400 tokens si num_ctx es alto).
 87: - `GUARD_EXCLUDED_CATEGORIES=S8,S9,S14` (IP software / "peajes" / code abuse
 88:   = falsos positivos del 1B en este dominio). S11 (self-harm) y demás siguen
 89:   bloqueando (verificado).
 90: 
 91: ## Variables de entorno (brain/.env)
 92: 
 93: `AGENT_OS_API_URL` (http://localhost:8080/api) · `LLAMA_STACK_URL`
 94: (http://localhost:8321/v1) + `LLAMA_STACK_API_KEY=fake` · `LLM_MODEL`
 95: (nvidia/meta/muse-glimmer-30b — el router exige prefijo de provider) ·
 96: `OLLAMA_URL` · `GUARD_ENABLED/LLAMA_GUARD_MODEL/GUARD_VIA_LLAMA_STACK/
 97: GUARD_EXCLUDED_CATEGORIES` · `MUSE_BIN` (~/.local/bin/muse) ·
 98: `MAX_TOOL_ITERATIONS=8`. x402 sin config local: el gateway de `api` manda.
 99: 
100: ## Servicios de los que depende
101: 
102: | Puerto | Qué | Uso en brain |
103: |---|---|---|
104: | 8080 | api (Rust) | contexto de cuenta, tools, x402, dPaaS |
105: | 8321 | Llama Stack | inference global (NIM: muse-glimmer-30b — **key viva 2026-10-26**, arrancar con `scripts/stack-up.sh`; ollama queda de respaldo) |
106: | 11434 | Ollama | Llama Guard 3 (llama-guard3:1b) + fallback LLM (llama3.2:1b) |
107: 
108: ## Verificado end-to-end (no romper)
109: 
110: - Sin Bearer: tools funcionan; `get_device` → 402 → manual con pay_hint.
111: - Con Bearer de cuenta: `backend: account:nvidia-nim`, 1 tool call,
112:   handshake delegado settled → la ficha técnica REAL llega al reply.
113: - Token inválido → 401 antes de razonar. Input inseguro (S11) → bloqueado.
````

## File: dapp/context.md
````markdown
  1: # context.md — dapp/ (Next.js 16)
  2: 
  3: Simulador **Zero-UI** del dispositivo `ESP32-S3-Touch-AMOLED-1.43` + consola
  4: del agente. **No guarda estado de negocio**: TODO pasa por `api` (Rust :8080)
  5: a través de `API_GATEWAY_URL`.
  6: 
  7: > `AGENTS.md` de este directorio es autogenerado por `next dev` (reglas de
  8: > Next.js 16 — APIS rompientes vs training data). No editarlo a mano: se
  9: > re-escribe solo. Este `context.md` es el contexto estable del proyecto.
 10: 
 11: ## Gestión de sesión (Auth.js v5 + proxy.ts)
 12: 
 13: - **`/`** = login + registro (sin sesión). **`/panel`** = shell del simulador
 14:   (autenticado). El enrutamiento vive en `proxy.ts` (Next.js 16 renombró
 15:   `middleware.ts` → `proxy.ts`): `/` autenticado → `/panel`; `/panel/*` sin
 16:   sesión → `/`.
 17: - El IdP real es `api` (`/api/auth/register|login|logout|me`, tokens opacos
 18:   con TTL 7 días, anti-bruteforce 5 fallos/min). **Auth.js no crea sesiones
 19:   paralelas**: el Credentials provider (`auth.ts`) hace login contra
 20:   `POST {API_GATEWAY_URL}/auth/login` y guarda el Bearer como claim del JWT
 21:   cifrado en la cookie HTTP-Only (`strategy: "jwt"`, `maxAge` 7 días = TTL
 22:   del token de api).
 23: - Los proxies del dapp reenvían ese Bearer como `Authorization: Bearer` para
 24:   operar como la cuenta (`app/api/agent/gateway` → brain `/v1/agentic-gateway`
 25:   resuelve el contexto de la cuenta: LLM, red, wallet dPaaS — flujo de
 26:   `tests/06`).
 27: - Errores del IdP mapeados con `CredentialsSignin.code`: `credentials`
 28:   (401) y `rate_limited` (429 tras 5 fallos). `logoutAction` revoca el token
 29:   en api ANTES de destruir la cookie (semántica one-shot del test E2E 02).
 30: - Contrato validado por `tests/tests/08.dapp.session.e2e.ts` (login →
 31:   cookie → /panel → gateway con Bearer → logout → redirect).
 32: 
 33: ## Mapa del código
 34: 
 35: ```
 36: dapp/
 37: ├── auth.ts                       — Auth.js v5: Credentials → api /auth/login,
 38: │                                   Bearer como claim del JWT (cookie cifrada)
 39: ├── next-auth.d.ts                — augmentación de tipos (Session/JWT/User)
 40: ├── proxy.ts                      — enrutador de sesión Next.js 16: / ⇄ /panel
 41: ├── app/
 42: │   ├── page.tsx                  — login + registro ("/", sin sesión)
 43: │   ├── panel/page.tsx            — shell autenticado: navbar + visor 3D +
 44: │   │                               consola gateway + ficha técnica + logout
 45: │   ├── actions/auth.ts           — server actions: login/register/logout
 46: │   │                               (logout revoca el token en api)
 47: │   └── api/
 48: │       ├── auth/[...nextauth]/route.ts — handlers de Auth.js v5
 49: │       ├── account/context|chain|llm|services|connected-wallets/route.ts — proxies del panel
 50: │       ├── account/devices/route.ts — flota de la cuenta (GET /devices)
 51: │       ├── account/devices/claim/route.ts — emparejado del modal Flota
 52: │       │                               (wallet operativa, red, LLM, dapps x402)
 53: │       ├── agent/gateway/route.ts — proxy → brain /v1/agentic-gateway
 54: │       │                            adjuntando el Bearer de la sesión
 55: │       ├── agent/chat/route.ts   — chat directo (nvidia|meta|custom|simulado)
 56: │       ├── erp/status/route.ts   — proxy → {API}/erp/status
 57: │       ├── device/model/route.ts — proxy → {API}/device/model (GLB desde R2)
 58: │       ├── device/state|tap|reset/route.ts — estado del OS simulado
 59: │       ├── solana/status/route.ts— URLs RPC desde {API}/config/solana/urls
 60: │       └── ai/models/route.ts    — catálogo models.dev + validación de key
 61: ├── components/
 62: │   ├── AuthForm.tsx              — tabs login/registro (useActionState)
 63: │   ├── panel/TopbarTools.tsx     — botones "Wallet · Red", "Modelos",
 64: │   │                               "Servicios" y "Flota" + modales de cuenta
 65: │   ├── panel/FleetModal.tsx      — NomikOS Fase 2: flota, emparejado (claim
 66: │   │                               code) e instalador (Web Serial + consola
 67: │   │                               con autodetección de claim codes; flash
 68: │   │                               esp-web-tools al publicar manifiesto F3)
 69: │   ├── panel/ModalShell.tsx      — overlay/tarjeta compartidos por los modales
 70: │   ├── DeviceViewer.tsx          — Three.js; MODEL_URL = "/api/device/model"
 71: │   │                              (loader = DOM plano con useProgress, NO <Html>
 72: │   │                              de drei: su root.unmount en useLayoutEffect
 73: │   │                              crashea el commit de React 19 al navegar)
 74: │   ├── DeviceScreen.tsx          — pantalla AMOLED simulada (home ⇄ agente)
 75: │   ├── AgentConsole.tsx          — componente de consola (direct/gateway);
 76: │   │                              NO se renderiza en el panel (el chat con
 77: │   │                              el agente se hace tocando la pantalla 3D
 78: │   │                              o vía gateway). Queda disponible a nivel
 79: │   │                              de librería.
 80: │   ├── AIProviderPanel.tsx / ErpStatusSelect / SolanaNetworkSelect
 81: │   │                              (huérfanos: su función vive en los modales
 82: │   │                              del panel — Modelos reemplazó a AIProviderPanel)
 83: ├── lib/
 84: │   ├── account-proxy.ts           — forward al panel hacia api con el Bearer
 85: │   ├── os/ (device-os, store, types, d1) — singleton server-side del "device OS"
 86: │   ├── ai/providers.ts           — NVIDIA NIM / Meta Llama / custom (OpenAI-compat)
 87: │   └── screen/draw.ts
 88: └── scripts/d1-schema.sql         — esquema del ledger D1 (referencia)
 89: ```
 90: 
 91: ## Contratos clave
 92: 
 93: - **`.env`**:
 94:   - `API_GATEWAY_URL=http://localhost:8080/api` — única variable de
 95:     **negocio** (en Docker: `http://api:8080/api`). Nada de MEDUSA_URL ni
 96:     URLs de Solana: viven en `api`.
 97:   - `AUTH_SECRET=<openssl rand -base64 32>` — cifra la cookie de sesión de
 98:     Auth.js (requerida; en Docker se pasa por `docker-compose.yml`).
 99:   - `BRAIN_URL=http://localhost:8322` — gateway agéntico para operar como
100:     cuenta desde el panel (en Docker: `http://brain:8322`).
101: - `DeviceViewer` carga el GLB con `useGLTF("/api/device/model", false, true)`
102:   (compresión meshopt, decodificador local). NO volver a `NEXT_PUBLIC_MODEL_URL`.
103: - `solana/status` resuelve las URLs RPC desde `api` (`/config/solana/urls`)
104:   y la wallet local vía CLI (~/.config/solana) o `SOLANA_WALLET`.
105: - Docker: `output: "standalone"`, puerto `3123`, contexto `./dapp`.
106: 
107: ## Servicios que consume
108: 
109: | Puerto | Servicio | Uso |
110: |---|---|---|
111: | 8080 | api (Rust) | IdP (login/registro/revocación) + navbar, ERP, modelo 3D (R2), URLs Solana |
112: | 8322 | brain (FastAPI) | Gateway agéntico con Bearer de la cuenta (panel) |
113: | 3000 | dapp (dev) | `npm run dev` (Docker: :3123) |
114: 
115: ## Notas de integración con el ecosistema
116: 
117: - El flujo agéntico conversacional completo (shields + tool-calls + x402
118:   delegado) vive en `brain` (`:8322/v1/agentic-gateway`); el dapp lo expone
119:   como API con el Bearer de la sesión (`app/api/agent/gateway` — contrato de
120:   la suite 08). El panel no renderiza consola de chat: la interacción con
121:   el agente es táctil (pantalla 3D del dispositivo) o por API. El LLM que
122:   usa brain se configura por cuenta desde el modal **Modelos**
123:   (`account_llm`).
124: - La revocación del logout es la semántica del IdP: token reusado → 401
125:   (test E2E 02); la cookie del dapp muere junto al token.
126: 
127: ## Panel: wallet operativa y servicios x402 de la cuenta
128: 
129: El topbar del panel tiene dos botones (reemplazan a los antiguos selects
130: de ERP/Solana) que abren modales operando como la cuenta vía
131: `lib/account-proxy.ts` (forward con el Bearer de la sesión — el navegador
132: nunca ve el token):
133: 
134: - **⛓️ Wallet · Red** (`components/panel/TopbarTools.tsx` → WalletModal):
135:   - **Wallet firmante · Solana (dPaaS)**: wallet operativa del agente
136:     (principal dPaaS o sub-wallets de `GET /accounts/me/wallets`) →
137:     `PUT /api/account/chain` → `account_chain.active_wallet_label`
138:     (tri-state en api: label / null=principal / ausente=no toca). El
139:     contexto (`/accounts/me/context`) resuelve `active_wallet_pubkey`.
140:   - **Wallets del navegador**: conectar **Phantom / Solflare / Backpack /
141:     MetaMask** desde la extensión (`window.phantom.solana`, `solflare`,
142:     `backpack`, `ethereum`). Se guarda **solo la pubkey** en
143:     `account_connected_wallets` (la clave privada nunca sale de la
144:     wallet — no se recibe ni se guarda; proxy
145:     `/api/account/connected-wallets`). Se pueden agregar **varias; solo
146:     una queda en uso** (`is_active`, invariante server-side) con botón
147:     "Usar" para cambiarla.
148: - **🤖 Modelos** (ModelsModal): proveedor LLM de la cuenta (NVIDIA NIM /
149:   OpenAI / Meta Llama API / Llama Stack local / personalizado OpenAI-compat),
150:   API key y modelo. "Cargar modelos" valida la key en vivo
151:   (`POST /api/ai/models` — listado real del proveedor + ping con timeout
152:   30 s) y al guardar persiste en `account_llm` vía
153:   `PUT /api/account/llm` (api_key sellada AEAD; sin key nueva conserva la
154:   guardada). **Desconectar** (`DELETE /api/account/llm`) borra el config y
155:   el agente vuelve al backend global. Es el LLM con el que `brain` razona
156:   como la cuenta. Reemplaza al antiguo `AIProviderPanel` (config local
157:   del chat directo), ya fuera del panel.
158: - **🧩 Servicios** (ServicesModal): catálogo de dapps del agente
159:   (`GET/POST /api/account/services` → api). Agregar **Medusa** persiste
160:   en `account_services` el registro cuenta→servicio→**x402**: `via_x402=1`,
161:   resource del peaje (`x402:path:/api/erp/*`) y snapshot del payer dPaaS
162:   + red en el momento del alta. Contrato congelado en la suite E2E 09.
163: - **📡 Flota** (FleetModal — NomikOS Fase 2): tres pestañas —
164:   **Mi flota** (`GET /api/account/devices` → api `/devices`: online/offline,
165:   versión, dPaaS por device), **Emparejar** (canje del claim_code de la
166:   placa → `POST /api/account/devices/claim` → api `/devices/claim`) e
167:   **Instalador** (detección de placa por USB con Web Serial — VID/PID
168:   Espressif/CP210x/CH340 — y **consola serial en vivo** a 115200 con
169:   autodetección de claim codes «usar como código»; el flasheo web con
170:   esp-web-tools se activa solo cuando exista
171:   `/public/installer/manifests/{board}.json` — lo publica la Fase 3).
````

## File: .env.example
````
 1: # ═══════════════════════════════════════════════════════════════════
 2: # NomikOS — .env.example (plantilla del .env CENTRAL del monorepo)
 3: #
 4: #   cp .env.example .env      # y llena lo que uses
 5: #   make secrets              # genera los secretos que falten (openssl)
 6: #   make up                   # sincroniza a api/brain/dapp y prende todo
 7: #
 8: # Reglas del sync (`make env`):
 9: #   · cada proyecto recibe SU .env.example como base
10: #   · las claves de aquí que estén VACÍAS no se escriben → el proyecto
11: #     usa el default de su propio */.env.example
12: #   · las claves con valor pisan el default del proyecto
13: #   · claves nuevas de un proyecto: agrégalas también a su */.env.example
14: #
15: # NUNCA pongas valores reales en ESTE archivo (se versiona).
16: # ═══════════════════════════════════════════════════════════════════
17: 
18: # ── SECRETOS (genéralos: `make secrets`) ─────────────────────────────
19: # Cifra keypairs/api_keys de cuentas en reposo (32 B base64)
20: ACCOUNTS_MASTER_KEY=
21: # Cookie de sesión Auth.js del dapp (32 B base64)
22: AUTH_SECRET=
23: # JWT secret del Payload CMS local (hex 32)
24: PAYLOAD_SECRET=
25: # Key de NVIDIA NIM: LLM de las CUENTAS + Llama Stack (:8321)
26: NVIDIA_API_KEY=
27: 
28: # ── api (:8080 — fuente única de verdad) ─────────────────────────────
29: #AGENT_OS_API_HOST=127.0.0.1
30: #AGENT_OS_API_PORT=8080
31: #AGENT_OS_API_DB_PATH=data/agent-os.db
32: #SYNC_INTERVAL_SECS=10
33: # La APP del ecosistema (a la que el agente paga peaje por petición)
34: #PAYLOAD_URL=http://localhost:3100
35: # Login automático de la app (o PAYLOAD_TOKEN fijo)
36: PAYLOAD_EMAIL=
37: PAYLOAD_PASSWORD=
38: #PAYLOAD_TOKEN=
39: # Orquestador (POST /api/voice → {BRAIN_URL}/v1/agentic-gateway)
40: #BRAIN_URL=http://localhost:8322
41: # ── x402 ── (peajes en lamports; rutas protegidas por matching exacto)
42: #X402_PROTECTED_PATHS=
43: #X402_PATH_LAMPORTS=1000
44: #X402_APP_LAMPORTS=1000
45: #X402_CALL_LAMPORTS=
46: #X402_PAYEE_WALLET=
47: #X402_SETTLE_INTERVAL_SECS=15
48: #X402_MAX_VERIFY_ATTEMPTS=10
49: # ── faucet Devnet (W6 — settlement real) ──
50: #FAUCET_ENABLED=1
51: #FAUCET_KEYPAIR=scripts/faucet/nomikos-treasury.json
52: #FAUCET_LAMPORTS=50000000
53: # ── Solana ──
54: #SOLANA_NETWORK=devnet
55: #SOLANA_LOCAL_URL=http://localhost:8899
56: #SOLANA_DEVNET_URL=https://api.devnet.solana.com
57: #SOLANA_TESTNET_URL=https://api.testnet.solana.com
58: #SOLANA_MAINNET_URL=https://api.mainnet.solana.com
59: # Wallet cuyo balance se sincroniza (pubkey base58 o ruta al keypair JSON)
60: SOLANA_WALLET=
61: # Keypair global para pagos salientes del sistema (vacío = solo verificación)
62: SOLANA_PAYER_KEYPAIR=
63: # ── Dispositivo + Cloudflare R2 (modelo 3D del simulador) ──
64: #DEVICE_NAME=ESP32-S3-Touch-AMOLED-1.43
65: #DEVICE_MODEL_FILE=../dapp/public/models/ESP32-S3-Touch-AMOLED-1.43.glb
66: #R2_ACCOUNT_ID=
67: R2_ACCESS_KEY_ID=
68: R2_SECRET_ACCESS_KEY=
69: #R2_BUCKET=
70: #R2_MODEL_KEY=models/ESP32-S3-Touch-AMOLED-1.43.glb
71: #R2_PUBLIC_URL_BASE=
72: #CLOUDFLARE_ACCOUNT_ID=
73: CLOUDFLARE_API_KEY=
74: CLOUDFLARE_API_TOKEN=
75: # ── Medusa MCP (opcional — ERP externo por MCP) ──
76: #MEDUSA_MCP_URL=https://cloud.medusajs.com/mcp
77: MEDUSA_MCP_TOKEN=
78: 
79: # ── brain (:8322 — orquestador) ──────────────────────────────────────
80: #AGENT_OS_API_URL=http://localhost:8080/api
81: # Llama Stack (:8321). Con key NIM viva: LLM_MODEL=nvidia/meta/muse-glimmer-30b
82: # y arráncalo con `make up` (o brain/scripts/stack-up.sh).
83: #LLAMA_STACK_URL=http://localhost:8321/v1
84: #LLAMA_STACK_API_KEY=fake
85: #LLM_MODEL=nvidia/meta/muse-glimmer-30b
86: #OLLAMA_URL=http://localhost:11434
87: # ── shields Llama Guard 3 ──
88: #GUARD_ENABLED=true
89: #LLAMA_GUARD_MODEL=llama-guard3:1b
90: #GUARD_VIA_LLAMA_STACK=false
91: #GUARD_EXCLUDED_CATEGORIES=S6,S7,S8,S9,S14
92: #MAX_TOOL_ITERATIONS=8
93: # Muse CLI opcional (tool ask_muse)
94: MUSE_BIN=
95: 
96: # ── dapp (:3000 — panel local; NUNCA va a la placa) ──────────────────
97: #API_GATEWAY_URL=http://localhost:8080/api
98: #BRAIN_URL=http://localhost:8322
````

## File: AGENTS.md
````markdown
 1: # AGENTS.md — Monorepo Hackaton (raíz)
 2: 
 3: Este archivo es el punto de entrada para agentes de código (opencode, Muse,
 4: Claude Code, Cursor, etc.). **Antes de tocar código de un proyecto, lee su
 5: `AGENTS.md` y su `context.md`:**
 6: 
 7: | Proyecto | Leer SIEMPRE | Stack |
 8: |---|---|---|
 9: | `api/` | [`api/AGENTS.md`](api/AGENTS.md) + [`api/context.md`](api/context.md) | Rust (axum 0.8, rusqlite) |
10: | `brain/` | [`brain/AGENTS.md`](brain/AGENTS.md) + [`brain/context.md`](brain/context.md) | Python (FastAPI, Llama Stack) |
11: | `dapp/` | [`dapp/AGENTS.md`](dapp/AGENTS.md) + [`dapp/context.md`](dapp/context.md) | TypeScript (Next.js 16) |
12: | `firmware/` | [`firmware/context.md`](firmware/context.md) | Rust (agentd-core no_std + simulador host + scaffold esp32) |
13: | `os/` | [`os/context.md`](os/context.md) | Buildroot (BR2_EXTERNAL + agente systemd, nivel SBC) |
14: | `dapps/payload-cms/` | [`dapps/payload-cms/AGENTS.md`](dapps/payload-cms/AGENTS.md) | Payload CMS 3 (monorepo upstream) |
15: 
16: # El front door del workspace es el `Makefile` de la raíz: `make up`
17: # prende el ecosistema desde el `.env` central (ver README.md).
18: 
19: ## Reglas del workspace
20: 
21: 1. **La ruta del workspace termina en ESPACIO**: `/home/foultrip/Documentos/Hackaton `.
22:    Cítala SIEMPRE con comillas (`"…/Hackaton "`). Los paths sin comillas fallan.
23: 2. **Nombres renombrados** — usa estos, nunca los antiguos:
24:    - `api/` (antes `agent-os-api`) — API Rust, fuente única de verdad
25:    - `brain/` (antes `agent-brain`) — capa cognitiva / gateway agéntico
26:    - `dapp/` (antes `agent-dapp`) — frontend Next.js (simulador Zero-UI)
27:    - `dapps/payload-cms/` (antes `payload-cloudflare/`) — clon del monorepo de Payload
28: 3. **El venv de `brain/` se rompe al mover la carpeta** (paths absolutos en
29:    shebangs). Si `uvicorn` falla con `python3: not found`, recrear:
30:    `rm -rf brain/.venv && python3 -m venv brain/.venv && brain/.venv/bin/pip install -r brain/requirements.txt`
31:    (igual para `brain/.venv-stack` con `llama-stack openai "mcp==1.23.0" chardet pypdf`).
32: 4. **Arquitectura de verdad única**: `brain` y `dapp` NO guardan estado propio
33:    de negocio; TODO pasa por `api` (Bearer → contexto de cuenta). Las URLs RPC
34:    de Solana, credenciales LLM y wallets viven en `api` — no duplicarlas.
35: 5. **Migraciones SQLite idempotentes** en `api/src/db.rs`: usar
36:    `Self::add_column_if_missing(...)`; nunca `ALTER TABLE` sueltos.
37: 6. **x402 es reactivo**: los recursos protegidos responden `402 + invoice`
38:    (`X402_PROTECTED_PATHS` en `api/.env`, matching exacto). El pago delegado
39:    (dPaaS) lo firma la wallet cifrada de la cuenta — el usuario nunca firma.
40: 7. **Secretos**: `api` cifra api_keys y keypairs con `ACCOUNTS_MASTER_KEY`
41:    (XChaCha20-Poly1305). Nunca loguear keypairs ni api_keys.
42: 8. **El peaje es one-shot**: facturas `settled` se consumen con `consumed_at`;
43:    replay → `409`. Mantener esa semántica en cualquier cambio.
44: 
45: ## Puertos y servicios
46: 
47: | Puerto | Servicio | Cómo arrancar |
48: |---|---|---|
49: | 8080 | `api` (Rust) | `cd api && cargo run` |
50: | 8322 | `brain` (FastAPI, exige Bearer + LLM de cuenta) | `cd brain && .venv/bin/python -m uvicorn app.main:app --port 8322` |
51: | 11434 | Ollama (SOLO shields Llama Guard) | `~/.local/bin/ollama serve` |
52: | 3123 | `dapp` (Next.js) | `cd dapp && npm run dev` |
53: 
54: ## Prueba de humo rápida (todo el flujo)
55: 
56: ```bash
57: # gateway agéntico sin cuenta (system):
58: curl -s -X POST http://localhost:8322/v1/agentic-gateway \
59:   -H "Content-Type: application/json" -d '{"text":"estado de salud de la API"}'
60: # con cuenta (register → login → Bearer):
61: curl -s -X POST http://localhost:8080/api/auth/register -H "Content-Type: application/json" \
62:   -d '{"email":"demo@tripkode.dev","password":"demo-segura-123"}'
63: ```
````

## File: diagram.d2
````
  1: vars: {
  2:   d2-config: {
  3:     layout-engine: elk
  4:     theme-id: 0
  5:     pad: 56
  6:   }
  7: }
  8: 
  9: direction: down
 10: 
 11: # ───────── Estilos ─────────
 12: classes: {
 13:   capa_slate: {
 14:     style: {
 15:       fill: "#F1F5F9"
 16:       stroke: "#CBD5E1"
 17:       border-radius: 12
 18:       font-size: 20
 19:       bold: true
 20:       font-color: "#0F172A"
 21:       shadow: false
 22:     }
 23:   }
 24:   capa_azul: {
 25:     style: {
 26:       fill: "#EFF6FF"
 27:       stroke: "#BFDBFE"
 28:       border-radius: 12
 29:       font-size: 20
 30:       bold: true
 31:       font-color: "#1E3A8A"
 32:       shadow: false
 33:     }
 34:   }
 35:   capa_teal: {
 36:     style: {
 37:       fill: "#F0FDFA"
 38:       stroke: "#99F6E4"
 39:       border-radius: 12
 40:       font-size: 20
 41:       bold: true
 42:       font-color: "#115E59"
 43:       shadow: false
 44:     }
 45:   }
 46:   capa_ambar: {
 47:     style: {
 48:       fill: "#FFFBEB"
 49:       stroke: "#FDE68A"
 50:       border-radius: 12
 51:       font-size: 20
 52:       bold: true
 53:       font-color: "#92400E"
 54:       shadow: false
 55:     }
 56:   }
 57:   capa_violeta: {
 58:     style: {
 59:       fill: "#F5F3FF"
 60:       stroke: "#DDD6FE"
 61:       border-radius: 12
 62:       font-size: 20
 63:       bold: true
 64:       font-color: "#4C1D95"
 65:       shadow: false
 66:     }
 67:   }
 68: 
 69:   nodo: {
 70:     shape: rectangle
 71:     width: 220
 72:     height: 90
 73:     style: {
 74:       fill: "#FFFFFF"
 75:       stroke: "#475569"
 76:       stroke-width: 2
 77:       border-radius: 8
 78:       font-size: 15
 79:       font-color: "#0F172A"
 80:       shadow: false
 81:     }
 82:   }
 83:   nodo_azul: {
 84:     shape: rectangle
 85:     width: 220
 86:     height: 90
 87:     style: {
 88:       fill: "#FFFFFF"
 89:       stroke: "#1E40AF"
 90:       stroke-width: 2
 91:       border-radius: 8
 92:       font-size: 15
 93:       font-color: "#0F172A"
 94:       shadow: false
 95:     }
 96:   }
 97:   nodo_teal: {
 98:     shape: rectangle
 99:     width: 220
100:     height: 90
101:     style: {
102:       fill: "#FFFFFF"
103:       stroke: "#0F766E"
104:       stroke-width: 2
105:       border-radius: 8
106:       font-size: 15
107:       font-color: "#0F172A"
108:       shadow: false
109:     }
110:   }
111:   nodo_ambar: {
112:     shape: rectangle
113:     width: 220
114:     height: 90
115:     style: {
116:       fill: "#FFFFFF"
117:       stroke: "#B45309"
118:       stroke-width: 2
119:       border-radius: 8
120:       font-size: 15
121:       font-color: "#0F172A"
122:       shadow: false
123:     }
124:   }
125:   nodo_violeta: {
126:     shape: rectangle
127:     width: 220
128:     height: 90
129:     style: {
130:       fill: "#FFFFFF"
131:       stroke: "#5B21B6"
132:       stroke-width: 2
133:       border-radius: 8
134:       font-size: 15
135:       font-color: "#0F172A"
136:       shadow: false
137:     }
138:   }
139: 
140:   f_voz: {
141:     style: {
142:       stroke: "#475569"
143:       stroke-width: 2
144:       font-size: 13
145:       font-color: "#334155"
146:       bold: true
147:     }
148:   }
149:   f_pago: {
150:     style: {
151:       stroke: "#1E40AF"
152:       stroke-width: 2
153:       font-size: 13
154:       font-color: "#1E3A8A"
155:       bold: true
156:     }
157:   }
158:   f_flota: {
159:     style: {
160:       stroke: "#0F766E"
161:       stroke-width: 2
162:       font-size: 13
163:       font-color: "#115E59"
164:       bold: true
165:     }
166:   }
167:   f_call: {
168:     style: {
169:       stroke: "#B45309"
170:       stroke-width: 2
171:       font-size: 13
172:       font-color: "#92400E"
173:       bold: true
174:     }
175:   }
176:   f_dapp: {
177:     style: {
178:       stroke: "#5B21B6"
179:       stroke-width: 2
180:       stroke-dash: 3
181:       font-size: 13
182:       font-color: "#4C1D95"
183:       bold: true
184:     }
185:   }
186:   f_base: {
187:     style: {
188:       stroke: "#94A3B8"
189:       stroke-width: 1
190:       font-size: 12
191:       font-color: "#64748B"
192:     }
193:   }
194: }
195: 
196: # ───────── 1 · Personas y dispositivos ─────────
197: Personas: "👥 1 · Personas y dispositivos" {
198:   class: capa_slate
199: 
200:   Usuario: "👤 Usuario\nHabla y gestiona" { class: nodo }
201:   Dispositivo: "📟 Dispositivo NomikOS\nMicrófono y altavoz" { class: nodo }
202:   Panel: "🖥️ Panel web\nCuenta y dispositivos" { class: nodo }
203: }
204: 
205: # ───────── 2 · Plataforma ─────────
206: Plataforma: "☁️ 2 · Plataforma TripKode" {
207:   class: capa_azul
208: 
209:   Cuentas: "🔑 Cuentas\nLogin e identidad" { class: nodo_azul }
210:   Voz: "🎙️ Voz\nRecibe y responde" { class: nodo_azul }
211:   Flota: "📡 Flota\nRegistro y estado" { class: nodo_azul }
212: }
213: 
214: # ───────── 3 · Asistente IA ─────────
215: IA: "🤖 3 · Asistente IA" {
216:   class: capa_teal
217: 
218:   Asistente: "🤖 Asistente\nDecide y ejecuta" { class: nodo_teal }
219:   Modelo: "🧠 Modelo de lenguaje\nEntiende y razona" { class: nodo_teal }
220:   Filtro: "🛡️ Filtro de seguridad\nRevisa mensajes" { class: nodo_teal }
221: }
222: 
223: # ───────── 4 · Acceso y pagos ─────────
224: Pagos: "💳 4 · Acceso y pagos" {
225:   class: capa_ambar
226: 
227:   Acceso: "🔒 Control de acceso\nExige y verifica el pago" { class: nodo_ambar }
228:   Billetera: "👛 Billetera\nFirma los pagos" { class: nodo_ambar }
229:   Blockchain: "⛓️ Blockchain Solana\nConfirma el pago" { class: nodo_ambar }
230:   Historial: "🗄️ Historial\nPagos y movimientos" { class: nodo_ambar }
231: }
232: 
233: # ───────── 5 · Ecosistema de dApps ─────────
234: Dapps: "🧩 5 · Ecosistema de dApps" {
235:   class: capa_violeta
236: 
237:   Payload: "🗂️ Payload CMS\nGestión de contenido" { class: nodo_violeta }
238:   Llamadas: "📞 Llamadas\nCobro por minuto" { class: nodo_violeta }
239:   Nuevas: "➕ Nuevas dApps\nSe conectan al mismo acceso" { class: nodo_violeta }
240: }
241: 
242: # ───────── Relaciones internas ─────────
243: IA.Asistente <-> IA.Modelo: "razona" { class: f_base }
244: IA.Asistente <-> IA.Filtro: "revisa" { class: f_base }
245: Pagos.Blockchain -> Pagos.Historial: "guarda" { class: f_base }
246: 
247: # ───────── A · Voz ─────────
248: Personas.Usuario -> Personas.Dispositivo: "A1 · habla" { class: f_voz }
249: Personas.Dispositivo <-> Plataforma.Voz: "A2 · envía\nA5 · responde" { class: f_voz }
250: Plataforma.Voz <-> IA.Asistente: "A3 · consulta\nA4 · respuesta" { class: f_voz }
251: 
252: # ───────── B · Servicio con pago ─────────
253: IA.Asistente <-> Pagos.Acceso: "B1 · pide servicio\nB2 · exige pago" { class: f_pago }
254: IA.Asistente <-> Pagos.Billetera: "B3 · firma pago" { class: f_pago }
255: Pagos.Acceso -> Dapps.Payload: "B4 · verifica y entrega" { class: f_pago }
256: Pagos.Acceso -> Pagos.Blockchain: "B5 · registra pago" { class: f_pago }
257: 
258: # ───────── C · Registro de dispositivo ─────────
259: Personas.Dispositivo <-> Plataforma.Flota: "C1 · pide registro\nC3 · queda activo" { class: f_flota }
260: Personas.Panel -> Plataforma.Flota: "C2 · confirma código" { class: f_flota }
261: 
262: # ───────── D · Llamadas ─────────
263: Pagos.Acceso -> Dapps.Llamadas: "D1 · inicia llamada" { class: f_call }
264: 
265: # ───────── Futuro ─────────
266: Pagos.Acceso -> Dapps.Nuevas: "mismo acceso" { class: f_dapp }
267: 
268: # ───────── E · Panel ─────────
269: Personas.Panel -> Plataforma.Cuentas: "E1 · inicia sesión" { class: f_base }
270: IA.Asistente -> Plataforma.Cuentas: "verifica identidad" { class: f_base }
````

## File: Makefile
````makefile
  1: # ═══════════════════════════════════════════════════════════════════
  2: # NomikOS — Makefile del monorepo (el front door)
  3: #
  4: #   make help      — todo lo que se puede hacer
  5: #   make up        — prende el ecosistema completo (desde el .env raíz)
  6: #   make image     — construye la imagen NomikOS para la placa (sdcard.img)
  7: #   make flash     — la escribe a la microSD (make flash DISK=/dev/sdX)
  8: #
  9: # La placa NO lleva dapp/ ni brain/: esos viven en la PC. En la placa
 10: # corren agentd (Rust), whisper/piper (voz) y el puente SIP.
 11: # ═══════════════════════════════════════════════════════════════════
 12: 
 13: SHELL := /bin/bash
 14: ROOT  := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
 15: LOGS  := /tmp/nomikos
 16: .DEFAULT_GOAL := help
 17: .PHONY: help env secrets install up down status logs test test-smoke app-init \
 18:         image flash esp32 esp32-flash clean
 19: 
 20: # ── puertos del ecosistema ──
 21: P_API := 8080
 22: P_BRAIN := 8322
 23: P_STACK := 8321
 24: P_OLLAMA := 11434
 25: P_DAPP := 3000
 26: P_APP := 3100
 27: 
 28: ## ── CONFIGURACIÓN ─────────────────────────────────────────────────────
 29: 
 30: ## env: sincroniza el .env central (raíz) a api/, brain/, dapp/ y la app local
 31: env:
 32: 	@chmod +x "$(ROOT)/scripts/env-sync.sh" 2>/dev/null || true
 33: 	@"$(ROOT)/scripts/env-sync.sh"
 34: 
 35: ## secrets: genera en .env los secretos que falten (openssl)
 36: secrets:
 37: 	@cd "$(ROOT)" && for k in ACCOUNTS_MASTER_KEY AUTH_SECRET; do \
 38: 		grep -qE "^$$k=.+" .env || { V=$$(openssl rand -base64 32); \
 39: 			printf '%s=%s\n' "$$k" "$$V" >> .env; echo "  ✓ $$k generado"; }; \
 40: 	done; \
 41: 	grep -qE '^PAYLOAD_SECRET=.+' .env || { V=$$(openssl rand -hex 32); \
 42: 		printf 'PAYLOAD_SECRET=%s\n' "$$V" >> .env; echo "  ✓ PAYLOAD_SECRET generado"; }
 43: 
 44: ## app-init: crea el primer usuario de la app local (EMAIL=… PASSWORD=…) y lo guarda en .env
 45: app-init:
 46: 	@test -n "$(EMAIL)" && test -n "$(PASSWORD)" || { echo "uso: make app-init EMAIL=tucorreo@x.dev PASSWORD=secreto"; exit 2; }
 47: 	@curl -s -X POST http://localhost:$(P_APP)/api/users/first-register \
 48: 		-H 'Content-Type: application/json' \
 49: 		-d '{"email":"$(EMAIL)","password":"$(PASSWORD)"}' \
 50: 		-w '\nfirst-register → %{http_code}\n' | tail -2
 51: 	@cd "$(ROOT)" && { grep -qE '^PAYLOAD_EMAIL=.+' .env || \
 52: 		printf 'PAYLOAD_EMAIL=%s\nPAYLOAD_PASSWORD=%s\n' "$(EMAIL)" "$(PASSWORD)" >> .env; }
 53: 	@$(MAKE) --no-print-directory env
 54: 
 55: ## ── INSTALACIÓN (una vez por máquina) ─────────────────────────────────
 56: 
 57: ## install: dependencias + builds (api, venvs de brain, dapp, tests, ollama)
 58: install:
 59: 	@cd "$(ROOT)/api" && cargo build
 60: 	@cd "$(ROOT)/brain" && [ -x .venv/bin/python ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; }
 61: 	@cd "$(ROOT)/brain" && [ -x .venv-stack/bin/llama ] || { echo "  (stack opcional: make install-stack)"; }
 62: 	@cd "$(ROOT)/dapp" && [ -d node_modules ] || npm install
 63: 	@cd "$(ROOT)/tests" && [ -d node_modules ] || npm install
 64: 	@command -v ollama >/dev/null || { echo "⚠ instala ollama: curl -fsSL https://ollama.com/install.sh | sh"; exit 1; }
 65: 	@for m in llama-guard3:1b llama3.2:1b; do ollama list 2>/dev/null | grep -q "$$m" || ollama pull "$$m"; done
 66: 	@echo "install listo — make up"
 67: 
 68: ## install-stack: venv de Llama Stack (opcional — solo si self-hosteas
 69: ## tu propio stack y lo apuntas como provider custom de tu cuenta)
 70: install-stack:
 71: 	@cd "$(ROOT)/brain" && { [ -x .venv-stack/bin/llama ] || \
 72: 		{ python3 -m venv .venv-stack && .venv-stack/bin/pip install -q llama-stack openai "mcp==1.23.0" chardet pypdf; }; }
 73: 	@echo "stack listo — pon NVIDIA_API_KEY en .env y make up"
 74: 
 75: ## ── ECOSISTEMA LOCAL (la PC) ──────────────────────────────────────────
 76: 
 77: ## up: sincroniza .env y prende TODO (api, brain, ollama, dapp, la app local)
 78: up:
 79: 	@mkdir -p "$(LOGS)"
 80: 	@cd "$(ROOT)" && test -f .env || { echo "falta .env — cp .env.example .env && make secrets"; exit 1; }
 81: 	@$(MAKE) --no-print-directory env
 82: 	@echo "── arrancando (logs en $(LOGS)/):"
 83: 	@# ollama (shields Llama Guard — el razonamiento es 100% de la cuenta).
 84: 	@# CPU a propósito: la iGPU compartida se queda sin VRAM con el prompt
 85: 	@# largo del guard (ErrorOutOfDeviceMemory → 500s intermitentes) y esta
 86: 	@# build ignora OLLAMA_NUM_GPU; VK_ICD_FILENAMES=/dev/null oculta las
 87: 	@# GPUs a Vulkan y llama.cpp cae a CPU (el 1B tarda segundos).
 88: 	@bash -c '(echo > /dev/tcp/localhost/$(P_OLLAMA)) 2>/dev/null || \
 89: 		{ VK_ICD_FILENAMES=/dev/null OLLAMA_NUM_GPU=0 nohup ollama serve > "$(LOGS)/ollama.log" 2>&1 & echo "  ↑ ollama :$(P_OLLAMA) (CPU)"; }'
 90: 	@# api (binario ya compilado por make install)
 91: 	@test -x "$(ROOT)/api/target/debug/agent-os-api" || { $(MAKE) --no-print-directory install; }
 92: 	@bash -c '(echo > /dev/tcp/localhost/$(P_API)) 2>/dev/null || \
 93: 		{ cd "$(ROOT)/api" && nohup ./target/debug/agent-os-api > "$(LOGS)/api.log" 2>&1 & echo "  ↑ api :$(P_API)"; }'
 94: 	@# brain
 95: 	@bash -c '(echo > /dev/tcp/localhost/$(P_BRAIN)) 2>/dev/null || \
 96: 		{ cd "$(ROOT)/brain" && nohup .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port $(P_BRAIN) > "$(LOGS)/brain.log" 2>&1 & echo "  ↑ brain :$(P_BRAIN)"; }'
 97: 	@# llama stack: YA NO SE USA (sin backend global — cada cuenta trae sus
 98: 	@# keys; ver Modelos del agente). Se deja el venv por si alguien
 99: 	@# self-hostea (provider custom apuntando a su propio stack).
100: 	@# la app local (Payload CMS u otra; ver dapps/README.md)
101: 	@bash -c '[ -d "$(ROOT)/dapps/payload-cms/templates/with-cloudflare-d1" ] && \
102: 		{ (echo > /dev/tcp/localhost/$(P_APP)) 2>/dev/null || \
103: 		{ cd "$(ROOT)/dapps/payload-cms/templates/with-cloudflare-d1" && nohup pnpm dev --port $(P_APP) > "$(LOGS)/app.log" 2>&1 & echo "  ↑ app :$(P_APP)"; }; } || echo "  · app: dapps/ sin app local clonada"'
104: 	@# dapp (SOLO local — en la placa no existe)
105: 	@bash -c '(echo > /dev/tcp/localhost/$(P_DAPP)) 2>/dev/null || \
106: 		{ cd "$(ROOT)/dapp" && nohup npm run dev > "$(LOGS)/dapp.log" 2>&1 & echo "  ↑ dapp :$(P_DAPP)"; }'
107: 	@echo "── esperando salud de los servicios…"
108: 	@bash -c 'ok=0; for p in $(P_OLLAMA) $(P_API) $(P_BRAIN) $(P_DAPP) $(P_APP); do \
109: 		for i in $$(seq 1 60); do (echo > /dev/tcp/localhost/$$p) 2>/dev/null && { ok=1; break; }; sleep 1.5; done; \
110: 		if [ $$ok -eq 1 ]; then echo "  ✓ :$$p listo"; else echo "  ✗ :$$p no respondió (revisa make logs svc=<api|brain|app|dapp>)"; fi; ok=0; done'
111: 	@$(MAKE) --no-print-directory status
112: 
113: ## down: apaga todo el ecosistema local
114: down:
115: 	@for p in $(P_DAPP) $(P_APP) $(P_BRAIN) $(P_STACK) $(P_API); do fuser -k $$p/tcp 2>/dev/null && echo "  ↓ :$$p" || true; done
116: 	@pkill -x agent-os-api 2>/dev/null || true; pkill -x ollama 2>/dev/null || true
117: 	@echo "ecosistema apagado"
118: 
119: ## status: salud de los servicios
120: status:
121: 	@echo "── NomikOS:"
122: 	@for p in "$(P_API)=api" "$(P_BRAIN)=brain" "$(P_OLLAMA)=ollama(shields)" "$(P_DAPP)=dapp" "$(P_APP)=app"; do \
123: 		port="$${p%%=*}"; name="$${p##*=}"; \
124: 		if (echo > /dev/tcp/localhost/$$port) 2>/dev/null; then printf "  ✓ :%-5s %s\n" "$$port" "$$name"; \
125: 		else printf "  ✗ :%-5s %s (DOWN)\n" "$$port" "$$name"; fi; done
126: 	@curl -sm3 http://localhost:$(P_API)/api/health -o /dev/null 2>/dev/null && echo "  ✓ api /health 200" || true
127: 	@curl -sm3 http://localhost:$(P_BRAIN)/v1/health -o /dev/null 2>/dev/null && echo "  ✓ brain /v1/health 200" || true
128: 
129: ## logs: tail de los logs del ecosistema (logs svc=api)
130: logs:
131: 	@if [ -z "$(svc)" ]; then ls "$(LOGS)" 2>/dev/null; else tail -f "$(LOGS)/$(svc).log"; fi
132: 
133: ## ── PRUEBAS ───────────────────────────────────────────────────────────
134: 
135: ## test: batería rápida (contratos duros). make test suite=tests/13… para una sola
136: test:
137: 	@cd "$(ROOT)/tests" && npm run test:e2e -- \
138: 		tests/01.ecosystem.health.e2e.ts tests/02.api.idp.e2e.ts tests/03.api.cuenta.e2e.ts \
139: 		tests/04.api.x402-gateway.e2e.ts tests/09.api.services-wallet.e2e.ts \
140: 		tests/13.settlement.real-chain.e2e.ts tests/14.calls.sip-bridge.e2e.ts \
141: 		$(suite)
142: 
143: ## test-smoke: salud + guardarraíles del gateway (401 sin Bearer)
144: test-smoke:
145: 	@curl -sm3 http://localhost:$(P_API)/api/health -o /dev/null -w "api /health → %{http_code}\n"
146: 	@curl -sm3 http://localhost:$(P_BRAIN)/v1/health -o /dev/null -w "brain /v1/health → %{http_code}\n"
147: 	@curl -s --max-time 30 -X POST http://localhost:$(P_BRAIN)/v1/agentic-gateway \
148: 		-H 'Content-Type: application/json' -d '{"text":"hola"}' -o /dev/null -w "gateway sin Bearer → %{http_code} (401 esperado: la cuenta trae sus keys)\n"
149: 
150: ## ── LA PLACA (NomikOS en la Raspberry Pi 4) ────────────────────────────
151: 
152: BUILDROOT ?= $(HOME)/buildroot
153: OS_BUILD ?= $(HOME)/os-build
154: 
155: ## image: construye la imagen NomikOS (sdcard.img) para la Pi4 — SIN dapp/brain (la placa no los lleva)
156: image:
157: 	@test -d "$(BUILDROOT)/.git" || git clone --depth 1 https://gitlab.com/buildroot.org/buildroot.git "$(BUILDROOT)"
158: 	@ln -sfn "$(ROOT)" "$(HOME)/os-ws"
159: 	@cd "$(BUILDROOT)" && umask 0022 && \
160: 		BR2_EXTERNAL="$(HOME)/os-ws/os/buildroot-external" \
161: 		make O="$(OS_BUILD)" nomikos_rpi4_defconfig
162: 	@cd "$(BUILDROOT)" && umask 0022 && \
163: 		BR2_EXTERNAL="$(HOME)/os-ws/os/buildroot-external" \
164: 		make O="$(OS_BUILD)" -j$$(nproc)
165: 	@echo "═══ imagen lista: $(OS_BUILD)/images/sdcard.img ═══"
166: 	@echo "flashea con: make flash DISK=/dev/sdX"
167: 
168: ## flash: escribe sdcard.img a la microSD (¡BORRA EL DISCO!)
169: flash:
170: 	@test -e "$(DISK)" || { echo "uso: make flash DISK=/dev/sdX (la microSD)"; exit 2; }
171: 	@test -f "$(OS_BUILD)/images/sdcard.img" || { echo "primero: make image"; exit 2; }
172: 	@echo "¡SE BORRARÁ $(DISK) COMPLETO! Continúa tú mismo:"; \
173: 	echo "  sudo dd if=$(OS_BUILD)/images/sdcard.img of=$(DISK) bs=4M conv=fsync status=progress"
174: 
175: ## ── ESP32-S3 (el AMOLED de la flota) ──────────────────────────────────
176: 
177: ## esp32: compila el firmware del ESP32-S3 (SSID=… PASSWORD=… del WiFi)
178: esp32:
179: 	@. "$(HOME)/export-esp.sh" 2>/dev/null || { echo "instala el toolchain: espup install --targets esp32s3"; exit 1; }; \
180: 	cd "$(ROOT)/firmware/agentd-esp32" && SSID="$${SSID:-Nomikos}" PASSWORD="$${PASSWORD:-nomikos1234}" \
181: 	cargo build --release
182: 	@ls -lh "$(ROOT)/firmware/agentd-esp32/target/xtensa-esp32s3-none-elf/release/agentd-esp32" | awk '{print "binario:", $$5}'
183: 
184: ## esp32-flash: flashea el ESP32 por USB (SSID=… PASSWORD=…)
185: esp32-flash:
186: 	@. "$(HOME)/export-esp.sh" 2>/dev/null || { echo "instala el toolchain: espup install --targets esp32s3"; exit 1; }; \
187: 	cd "$(ROOT)/firmware/agentd-esp32" && SSID="$${SSID:-Nomikos}" PASSWORD="$${PASSWORD:-nomikos1234}" \
188: 	cargo flash
189: 
190: ## ── LIMPIEZA ───────────────────────────────────────────────────────────
191: 
192: ## clean: apaga el ecosistema y borra logs (no toca builds ni datos)
193: clean:
194: 	@$(MAKE) --no-print-directory down || true
195: 	@rm -rf "$(LOGS)" && echo "logs limpiados"
196: 
197: ## help: esta lista
198: help:
199: 	@awk '/^## / { d = substr($$0, 4); if (d ~ /^──/) { printf "\n%s\n", d } else { pend = d; sub(/^[a-zA-Z0-9-]+: /, "", pend) } next } /^[a-zA-Z0-9_-]+:/ { if (pend != "") { split($$0, a, ":"); printf "  make %-13s %s\n", a[1], pend; pend = "" } }' $(MAKEFILE_LIST)
````

## File: README.md
````markdown
  1: # NomikOS — ecosistema agéntico de dispositivos con peajes x402
  2: 
  3: Cada cuenta (email + password) tiene su orquestador: razona con **su**
  4: proveedor LLM (NVIDIA NIM / OpenAI / custom), opera en **su** red Solana
  5: con **su** wallet delegada (dPaaS) y paga micro-peajes x402 de forma
  6: invisible — **el usuario nunca firma nada**. Los dispositivos (Raspberry
  7: Pi 4 con NomikOS · ESP32-S3 AMOLED) hablan por voz con el agente y la
  8: flota se empareja desde el panel del navegador.
  9: 
 10: El flujo autoritativo está en [`diagram.d2`](diagram.d2) (render:
 11: `diagram.svg`) y el diseño por fases en
 12: [`docs/nomikos-design.md`](docs/nomikos-design.md).
 13: 
 14: ```
 15:  Usuario habla por el mic de la Pi4
 16:     │ (NomikOS: whisper.cpp local → texto)
 17:     ▼
 18:  api :8080 (Rust — fuente única de verdad)
 19:     ├─ POST /api/voice  → brain :8322 (orquestador, 15 tools,
 20:     │                        shields Llama Guard in/out, LLM de la cuenta)
 21:     │        │ tool app_request
 22:     │        ▼
 23:     │   POST /api/app/request → 402 + peaje → dPaaS firma (tx real)
 24:     │        → reintento X-Payment → PROXY a la app
 25:     │                     ▼
 26:     │            Payload CMS :3100 (la app del ecosistema)
 27:     ├─ Flota: enroll → claim code → token de dispositivo → heartbeat
 28:     ├─ Llamadas: sesión + peaje x402 por minuto (baresip en la placa)
 29:     └─ Faucet Devnet: treasury → wallet dPaaS de la cuenta (💧 en el panel)
 30:  dapp :3000 (Next.js 16) — sesión Auth.js + panel con modales:
 31:     Wallet·Red (faucet 💧, sub-wallets, Phantom/MetaMask) · Modelos ·
 32:     Servicios · 📡 Flota (emparejar por claim code + instalador web serial)
 33: ```
 34: 
 35: ## El handshake x402 (el corazón de todo)
 36: 
 37: ```
 38: 1. HTTP Request ──► recurso protegido (app, llamada, minuto, device…)
 39: 2. HTTP 402  ◄── invoice {id, payee, amount} (uno por petición)
 40: 3. Pide firma ──► dPaaS: descifra el keypair de la cuenta, valida límites,
 41:                     firma ed25519 en memoria, envía a SU red (Devnet)
 42: 4. X-Payment ◄── tx_signature on-chain
 43: 5. Reintento firmado ──► verify (settled + one-shot) → consume
 44: 6. Tool call ──► EL RECURSO SE EJECUTA (proxy a la app real)
 45: 7. Ledger ──► SQLite: consumed_at → replay = 409
 46: ```
 47: 
 48: ## Componentes
 49: 
 50: | Directorio | Stack | Rol |
 51: |---|---|---|
 52: | [`api/`](api/) | Rust · axum 0.8 · rusqlite · argon2 · XChaCha20-Poly1305 · ed25519 (sin SDK) | Fuente única de verdad: IdP, gateway 402, dPaaS, flota, voz, llamadas, faucet Devnet, x402 |
 53: | [`brain/`](brain/) | Python 3.13 · FastAPI · Ollama (shields Llama Guard) | Orquestador: exige Bearer + LLM de la cuenta (sin fallback global), shields in/out, 15 tools, guard x402 reactivo |
 54: | [`dapp/`](dapp/) | Next.js 16 · Auth.js v5 · React 19 | Panel del navegador: sesión, wallet/red, modelos, servicios, flota + instalador web (Web Serial) |
 55: | [`firmware/`](firmware/) | Rust no_std | `agentd-core` (máquina de estados), `agentd-host` (simulador: voz + puente SIP), `agentd-esp32` (AMOLED 466×466, compila para xtensa) |
 56: | [`os/`](os/) | Buildroot (BR2_EXTERNAL) + shell | Imagen Linux de la Pi4: `sdcard.img` con agentd, whisper, piper y systemd · bucle de voz `os/voice/` |
 57: | `dapps/payload-cms/` (clon upstream, no versionado) | Payload CMS 3 · D1 | LA APP del ecosistema (a la que el agente paga peaje por petición) — ver [`dapps/CONTEXT-payload-cms-local.md`](dapps/CONTEXT-payload-cms-local.md) |
 58: | [`tests/`](tests/) | tester-army e2e (Node) | 16 suites / 70 tests E2E de punta a punta |
 59: | [`docs/`](docs/) | — | `nomikos-design.md`: fases, auditorías, decisiones |
 60: 
 61: ## Puertos y arranque
 62: 
 63: **La forma es `make`** (el `.env` de la raíz es la única configuración):
 64: 
 65: ```bash
 66: cp .env.example .env      # y llena lo que uses (key NIM, etc.)
 67: make secrets              # genera ACCOUNTS_MASTER_KEY / AUTH_SECRET / PAYLOAD_SECRET
 68: make install              # una vez por máquina: builds, venvs, modelos de ollama
 69: make up                   # prende TODO: api, brain, stack NIM, ollama, dapp y la app
 70: make status               # salud
 71: make test                 # batería E2E rápida (39 tests)
 72: make image                # la imagen NomikOS para la Pi (sdcard.img)
 73: make flash DISK=/dev/sdX  # (tú lo ejecutas) escribe la microSD
 74: make help                 # todo lo demás
 75: ```
 76: 
 77: **O en docker** (`api` + `dapp` en contenedores; brain/ollama/la app en
 78: el host vía `host.docker.internal`): `make down && docker compose up
 79: --build` → panel en `http://localhost:3000` — el panel detecta la
 80: ejecución local/docker, simula la placa con NomikOS adentro y el
 81: progreso del OS vive en la DB de la cuenta.
 82: 
 83: Para la placa: `make image` produce `~/os-build/images/sdcard.img`
 84: (lleva agentd + voz + puente SIP — **sin** dapp/brain, esos viven en la
 85: PC). El ESP32 de la flota: `make esp32-flash SSID=… PASSWORD=…`.
 86: 
 87: Arranque manual (equivalente, por servicio):
 88: 
 89: | Puerto | Servicio | Comando |
 90: |---|---|---|
 91: | 8080 | api | `cd api && cargo run` |
 92: | 8322 | brain (exige Bearer + LLM de cuenta) | `cd brain && .venv/bin/python -m uvicorn app.main:app --port 8322` |
 93: | 11434 | Ollama (SOLO shields Llama Guard) | `ollama serve` |
 94: | 3000 | dapp | `cd dapp && npm run dev` |
 95: | 3100 | app (Payload CMS) | `cd dapps/payload-cms/templates/with-cloudflare-d1 && pnpm dev --port 3100` |
 96: 
 97: La configuración vive en el **`.env` central de la raíz** (plantilla:
 98: `.env.example`); `make env` la sincroniza a cada proyecto. Para integrar
 99: una app nueva al ecosistema (que el orquestador pague por peaje):
100: [`dapps/README.md`](dapps/README.md).
101: 
102: Prueba de humo (`make test-smoke` hace esto):
103: 
104: ```bash
105: curl -s http://localhost:8080/api/health -o /dev/null -w "api → %{http_code}\n"
106: curl -s http://localhost:8322/v1/health -o /dev/null -w "brain → %{http_code}\n"
107: # gateway sin Bearer → 401: el agente exige cuenta con LLM propio
108: curl -s -X POST http://localhost:8322/v1/agentic-gateway \
109:   -H "Content-Type: application/json" -d '{"text":"hola"}' -o /dev/null -w "gateway → %{http_code}\n"
110: ```
111: 
112: ## Flota, voz y hardware
113: 
114: - **Tienda de apps**: `nomikos apps` lista las dapps del worker,
115:   `nomikos apps add <slug>` las instala (script probado, idempotente) y
116:   sus tools entran al MCP manager del agente. En la placa el mismo CLI
117:   corre en la consola (viene en la imagen). Ver [`dapps/README.md`](dapps/README.md).
118: - **Pi4**: flashea `~/os-build/images/sdcard.img` (se genera con
119:   `os/README.md`) → ethernet → el claim code sale por consola →
120:   canjear en el panel 📡 Flota. Con micrófono USB, el bucle de voz
121:   (`agentd-voice.service`) arranca solo tras el emparejado.
122: - **ESP32-S3-AMOLED-1.43**: `cd firmware/agentd-esp32 &&
123:   SSID=… PASSWORD=… cargo flash` — claim code en el AMOLED (las 4
124:   verificaciones de hardware están en su README).
125: - **Settlement real**: el treasury Devnet gotea SOL a las wallets dPaaS
126:   (botón 💧 del panel o `POST /api/dev/faucet`) y cada peaje liquida
127:   on-chain (`api/scripts/faucet/`).
128: 
129: ## Pruebas
130: 
131: ```bash
132: cd tests && npm run test:e2e -- tests/13.settlement.real-chain.e2e.ts
133: ```
134: 
135: 16 suites (01–16): salud, IdP, cuenta, x402, brain (auth + LLM de cuenta),
136: escalabilidad, dapp sesión, servicios/wallets, flota, llamadas,
137: voz+app peajizada, **settlement real on-chain**, **puente SIP**,
138: **tienda de apps** y **simulador NomikOS**. Los servicios deben estar
139: arriba; `workers: 1`.
140: 
141: ## Seguridad
142: 
143: - Passwords argon2id; tokens opacos (solo hash en DB); sesiones revocables.
144: - Secretos en reposo (api_keys, keypairs) cifrados con
145:   `ACCOUNTS_MASTER_KEY` (XChaCha20-Poly1305) — **nunca en logs**.
146: - Peajes one-shot (`consumed_at`) con ownership por cuenta (403 ajeno).
147: - Shields Llama Guard 3 a la entrada y salida del razonamiento.
148: - **No se sube al repo** (`.gitignore`): `.env` reales,
149:   `dapp/credentials.json`, el ledger `api/data/`, el keypair del faucet.
150:   Plantillas: `*/.env.example` de cada proyecto.
151: 
152: ## Estado
153: 
154: Fases 1–5 del diseño **✅ completas** (ver
155: [`docs/nomikos-design.md`](docs/nomikos-design.md), tabla W incluida) y
156: 16/16 suites verdes. Pendientes de mundo físico (documentados, sin
157: código detrás): flashear la microSD, conectar el ESP32, micrófono/altavoz
158: en la Pi y (opcional) credenciales de trunk SIP.
````
