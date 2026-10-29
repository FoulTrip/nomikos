//! Criptografía para la gestión de cuentas (IdP + dPaaS).
//!
//! - **Passwords**: argon2id (PHC string con salt aleatorio, verificación
//!   constant-time).
//! - **Secretos en reposo**: XChaCha20-Poly1305 (AEAD) con la master key
//!   `ACCOUNTS_MASTER_KEY`. Formato almacenado: `base64(nonce(24) ‖ ct ‖ tag)`.
//!   Se cifra el api_key de los proveedores LLM y el keypair del orquestador.
//! - **Sesiones**: token opaco de 32 bytes (base64url sin padding); en la DB
//!   solo se guarda `sha256(token)`.

use crate::error::AppError;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use base64::Engine;
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use rand::RngCore;
use sha2::{Digest, Sha256};

// ---------------------------------------------------------------------------
// Passwords (argon2id)
// ---------------------------------------------------------------------------

/// Hashea un password → PHC string (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`).
pub fn hash_password(plain: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::internal(format!("argon2 hash: {e}")))
}

/// Verifica un password contra su PHC string (constant-time). Nunca pánico.
pub fn verify_password(plain: &str, phc: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(phc) else {
        return false;
    };
    Argon2::default()
        .verify_password(plain.as_bytes(), &parsed)
        .is_ok()
}

// ---------------------------------------------------------------------------
// Secretos en reposo (XChaCha20-Poly1305)
// ---------------------------------------------------------------------------

/// Cifra un secreto con la master key. Devuelve base64(nonce ‖ ciphertext).
pub fn seal(key: &[u8; 32], plaintext: &str) -> Result<String, AppError> {
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| AppError::internal(format!("aead init: {e}")))?;
    let mut nonce_bytes = [0u8; 24];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let ct = cipher
        .encrypt(XNonce::from_slice(&nonce_bytes), plaintext.as_bytes())
        .map_err(|e| AppError::internal(format!("aead seal: {e}")))?;
    let mut out = nonce_bytes.to_vec();
    out.extend_from_slice(&ct);
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

/// Descifra un secreto sellado por `seal`.
pub fn open(key: &[u8; 32], sealed: &str) -> Result<Vec<u8>, AppError> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(sealed.trim())
        .map_err(|e| AppError::internal(format!("aead base64: {e}")))?;
    if raw.len() < 24 + 16 {
        return Err(AppError::internal("aead open: payload demasiado corto"));
    }
    let (nonce, ct) = raw.split_at(24);
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| AppError::internal(format!("aead init: {e}")))?;
    cipher
        .decrypt(XNonce::from_slice(nonce), ct)
        .map_err(|e| AppError::internal(format!("aead open: {e}")))
}

// ---------------------------------------------------------------------------
// Sesiones y hashes
// ---------------------------------------------------------------------------

/// Genera un token de sesión: devuelve (token_plano, sha256(token)).
/// El cliente recibe el token plano; la DB guarda solo el hash.
pub fn new_session_token() -> (String, String) {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let hash = sha256_hex(token.as_bytes());
    (token, hash)
}

/// sha256 → hex minúsculas (hash de tokens, consistencia).
pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_roundtrip() {
        let phc = hash_password("s3cr3t!").unwrap();
        assert!(phc.starts_with("$argon2id$"));
        assert!(verify_password("s3cr3t!", &phc));
        assert!(!verify_password("otro", &phc));
        assert!(!verify_password("s3cr3t!", "no-es-phc"));
    }

    #[test]
    fn seal_open_roundtrip() {
        let key = [7u8; 32];
        let sealed = seal(&key, "{\"seed\":[1,2,3]}").unwrap();
        let opened = open(&key, &sealed).unwrap();
        assert_eq!(opened, b"{\"seed\":[1,2,3]}");
        // Con otra key falla (AEAD).
        assert!(open(&[8u8; 32], &sealed).is_err());
    }

    #[test]
    fn token_format() {
        let (token, hash) = new_session_token();
        assert_eq!(token.len(), 43); // 32 bytes → base64url sin padding
        assert_eq!(hash.len(), 64); // sha256 hex
        let (token2, _) = new_session_token();
        assert_ne!(token, token2);
    }
}
