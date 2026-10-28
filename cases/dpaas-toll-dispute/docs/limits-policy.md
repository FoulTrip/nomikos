# Spending limits policy (dPaaS)

§1 tx_limit_lamports: 5000 — any single invoice above this amount is
rejected before signing; it never reaches the signer.

§2 daily_limit_lamports: 100000 — rolling 24h window, failed invoices
excluded from the tally. The disputed day used 3000 of 100000.

§3 Over-limit requests fail closed: no signature, no settlement, no charge.

Canonical cite: `limits-policy.md:§2`
