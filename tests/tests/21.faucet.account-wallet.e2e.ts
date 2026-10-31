/**
 * 21.faucet.account-wallet.e2e.ts — el faucet opera directamente sobre
 * la wallet Devnet automática de cada cuenta, sin treasury prefinanciada.
 */
import { test, expect, api, auth } from './_helpers';

interface FaucetStatus {
  ok: boolean;
  network: string;
  wallet_pubkey: string;
  balance_lamports: number | null;
  lamports_per_drip: number;
  cooldown_seconds: number;
}

test('el estado del faucet usa la wallet Devnet automática de la cuenta', async ({ account }) => {
  const firstResponse = await api('/dev/faucet', auth(account.token));
  expect(firstResponse.status).toBe(200);
  const first = (await firstResponse.json()) as FaucetStatus;

  expect(first.ok).toBe(true);
  expect(first.network).toBe('devnet');
  expect(first.wallet_pubkey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  expect(first.balance_lamports === null || first.balance_lamports >= 0).toBe(true);
  expect(first.lamports_per_drip).toBe(5_000_000);
  expect(first.cooldown_seconds).toBe(60);

  const secondResponse = await api('/dev/faucet', auth(account.token));
  expect(secondResponse.status).toBe(200);
  const second = (await secondResponse.json()) as FaucetStatus;
  expect(second.wallet_pubkey).toBe(first.wallet_pubkey);
});

test('el estado separa wallet global y wallet dPaaS de la cuenta', async ({ account }) => {
  const globalResponse = await api('/solana/status?network=devnet');
  expect(globalResponse.status).toBe(200);
  const global = (await globalResponse.json()) as {
    wallet_scope: string;
    wallet_role: string;
  };
  expect(global.wallet_scope).toBe('global');
  expect(['x402_payee', 'observer']).toContain(global.wallet_role);

  const accountResponse = await api('/accounts/me/x402/summary', auth(account.token));
  expect(accountResponse.status).toBe(200);
  const summary = (await accountResponse.json()) as {
    dpaas: {
      wallet: string;
      network: string;
      balance_lamports: number | null;
      wallets: { network: string; wallet_pubkey: string; balance_lamports: number | null }[];
    };
  };
  expect(summary.dpaas.network).toBe('devnet');
  expect(summary.dpaas.wallet).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  expect(summary.dpaas.wallets.find((wallet) => wallet.network === 'devnet')?.wallet_pubkey)
    .toBe(summary.dpaas.wallet);
  const faucetResponse = await api('/dev/faucet', auth(account.token));
  const faucet = (await faucetResponse.json()) as FaucetStatus;
  expect(faucet.wallet_pubkey).toBe(summary.dpaas.wallet);
});
