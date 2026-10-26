#!/usr/bin/env bash
# Faucet Devnet de NomikOS — wallet «treasury» que financia las cuentas
# para que el settlement x402 sea REAL on-chain (pay-invoice confirma).
#
#   ./faucet.sh status       — pubkey del treasury + balance
#   ./faucet.sh fund [N]     — retry-loop de airdrop (el faucet público es
#                              rate-limited; 1 SOL ≈ 1M de peajes + fees)
#   ./faucet.sh drip <pub> [lamports]  — transfer manual a una wallet
#
# La treasury es SOLO devnet (sin valor). La API la gasta por
# POST /api/dev/faucet (FAUCET_ENABLED=1). NUNCA uses esta wallet en mainnet.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$(cd "$HERE/../.." && pwd)"
TREASURY="$HERE/nomikos-treasury.json"
RPC="$(grep '^SOLANA_DEVNET_URL=' "$API_DIR/.env" | cut -d= -f2- | tr -d '\r')"
[ -n "$RPC" ] || RPC="https://api.devnet.solana.org"

cmd="${1:-status}"
case "$cmd" in
  pubkey)
    solana-keygen pubkey "$TREASURY" ;;

  balance)
    solana balance "$TREASURY" --url "$RPC" ;;

  fund)
    N="${2:-40}"
    for i in $(seq 1 "$N"); do
      echo "── airdrop intento $i/$N (faucet público rate-limited):"
      if solana airdrop 1 "$TREASURY" --url "$RPC" 2>&1 | tail -1; then
        if solana balance "$TREASURY" --url "$RPC"; then exit 0; fi
      fi
      sleep 45
    done
    echo
    echo "El faucet público no cedió. Plan B (30 segundos):"
    echo "  1. Copia este pubkey:"
    echo "     $(solana-keygen pubkey "$TREASURY")"
    echo "  2. Pégalo en https://faucet.solana.com y pide 1 SOL."
    exit 1 ;;

  drip)
    PUB="${2:?uso: faucet.sh drip <pubkey> [lamports]}"
    LAM="${3:-50000000}"
    solana transfer "$PUB" "$LAM" --keypair "$TREASURY" --url "$RPC" --allow-unfunded-recipient ;;

  status)
    echo "treasury: $(solana-keygen pubkey "$TREASURY")"
    solana balance "$TREASURY" --url "$RPC" ;;

  *)
    echo "uso: $0 {status|pubkey|balance|fund [N]|drip <pubkey> [lamports]}" >&2
    exit 2 ;;
esac
