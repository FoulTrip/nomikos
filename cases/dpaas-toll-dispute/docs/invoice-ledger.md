# Invoice ledger — app requests (billing day)

Export of the toll ledger for the disputed day. Every row is one settled,
one-shot invoice consumed on first use.

x402-demo-0001 | x402:app:payload:GET:/api/users | 1000 lamports | settled | consumed
x402-demo-0002 | x402:app:payload:GET:/api/media | 1000 lamports | settled | consumed
x402-demo-0003 | x402:app:payload:POST:/api/users | 1000 lamports | settled | consumed

Total settled: 3000 lamports across 3 invoices. No pending rows exist.

Canonical cite: `invoice-ledger.md:x402-demo-0001`
