# Treasury Devnet para pruebas x402

La API crea una wallet treasury solo para Devnet al arrancar y cifra su
keypair en la base SQLite persistente usando `ACCOUNTS_MASTER_KEY`. No requiere
archivo JSON ni variables `FAUCET_*`. El saldo inicial es cero.

| Ruta | Uso |
|---|---|
| `GET /api/dev/faucet` | Muestra pubkey pública, balance y tamaño fijo del goteo (requiere Bearer de cuenta). |
| Fondeo | Si hace falta, solicita fondos Devnet legítimos para esa pubkey. No se solicita airdrop automáticamente. |
| `POST /api/dev/faucet` | Gotea 0.005 SOL a la wallet dPaaS de la cuenta autenticada, solo si su red es Devnet. |

La treasury no es la wallet dPaaS de una cuenta ni el cobrador x402. Es una
wallet global que distribuye SOL Devnet de pruebas. La pubkey puede mostrarse;
el keypair permanece cifrado. Nunca se fondea desde mainnet.
