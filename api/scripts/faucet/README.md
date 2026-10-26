# Faucet Devnet (W6 — settlement x402 real)

La wallet **treasury** (`nomikos-treasury.json`, SOLO devnet) financia las
wallets dPaaS de las cuentas para que `pay-invoice` firme transfers que
**confirman on-chain** (sin el settler de ledger de los tests).

| Pieza | Detalle |
|---|---|
| `nomikos-treasury.json` | Keypair devnet (formato id.json). **NUNCA mainnet.** |
| `faucet.sh fund` | Retry-loop de airdrop al treasury (rate-limited; 1 SOL ≈ 1M de peajes) |
| Plan B (30 s) | Copiar el pubkey del treasury y pedir 1 SOL en https://faucet.solana.com |
| `faucet.sh drip <pub> [lamports]` | Transfer manual desde el treasury |
| API | `POST /api/dev/faucet` gotea `FAUCET_LAMPORTS` a la wallet de la cuenta autenticada (requiere `FAUCET_ENABLED=1` y chain devnet configurada) |

El goteo por API es un transfer devnet→devnet: sin rate-limits de faucet.
Mientras el treasury tenga SOL, todo el ecosistema settlea real.
