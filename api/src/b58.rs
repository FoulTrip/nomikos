//! Base58 (Bitcoin alphabet) a mano — evita una dependencia más.
//! Se usa para pubkeys, blockhashes y firmas de Solana.

const ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

pub fn encode(data: &[u8]) -> String {
    // Contar ceros iniciales → '1's.
    let mut zeros: usize = 0;
    while zeros < data.len() && data[zeros] == 0 {
        zeros += 1;
    }

    // Big-num breve: cada dígito base58 en un byte.
    let mut digits: Vec<u8> = Vec::new();
    for &byte in &data[zeros..] {
        let mut carry = byte as u32;
        for d in digits.iter_mut() {
            carry += (*d as u32) << 8;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }

    let mut out = String::with_capacity(zeros + digits.len());
    for _ in 0..zeros {
        out.push('1');
    }
    for &d in digits.iter().rev() {
        out.push(ALPHABET[d as usize] as char);
    }
    out
}

pub fn decode(input: &str) -> Result<Vec<u8>, String> {
    let mut out: Vec<u8> = Vec::with_capacity(input.len());
    for (i, &c) in input.as_bytes().iter().enumerate() {
        let val = ALPHABET
            .iter()
            .position(|&a| a == c)
            .ok_or_else(|| format!("base58: byte inválido '{c}' en la posición {i}"))?
            as u32;
        let mut carry = val;
        for b in out.iter_mut() {
            carry += (*b as u32) * 58;
            *b = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            out.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    // Los '1' iniciailes son ceros; el resto de `out` viene invertido (big-endian).
    let zeros = input.as_bytes().iter().take_while(|&&b| b == b'1').count();
    let mut result: Vec<u8> = vec![0u8; zeros];
    result.extend(out.iter().rev().copied());
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_single_zero() {
        assert_eq!(encode(&[0]), "1");
        assert_eq!(encode(&[1]), "2");
        assert_eq!(encode(&[0, 1]), "12");
    }

    #[test]
    fn system_program_is_32_ones() {
        let ones = "1".repeat(32);
        assert_eq!(encode(&[0u8; 32]), ones);
        assert_eq!(decode(&ones).unwrap(), vec![0u8; 32]);
    }

    #[test]
    fn roundtrip() {
        let data: Vec<u8> = (0..=255u8).collect();
        assert_eq!(decode(&encode(&data)).unwrap(), data);
    }

    #[test]
    fn decode_error() {
        assert!(decode("0OIl").is_err());
    }
}
