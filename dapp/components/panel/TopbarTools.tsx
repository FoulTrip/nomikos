"use client";
/**
 * TopbarTools — botones del panel del dapp que abren los modales de la
 * cuenta (todo pasa por api con el Bearer de la sesión; sin estado local):
 *
 *   "Wallet · Red" — wallet operativa + red blockchain del agente
 *        (PUT /api/account/chain → account_chain de api).
 *   "Modelos"      — proveedor LLM del agente (igual que la antigua
 *        sección "Configurar proveedor de IA": Conectar → "Modelo (N
 *        gratis)" → Desconectar, pero persistiendo en la cuenta
 *        `account_llm` — api_key sellada AEAD — en vez de localStorage).
 *   "DApps"        — catálogo real de aplicaciones de la API e instalación
 *                     disponible para la cuenta y sus dispositivos.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Backpack,
  Blocks,
  Bot,
  Check,
  CircleCheck,
  Copy,
  Droplets,
  Ghost,
  LoaderCircle,
  PlugZap,
  Plus,
  Radio,
  RotateCw,
  Search,
  Sun,
  Trash2,
  TriangleAlert,
  Wallet,
  WalletMinimal,
} from "lucide-react";
import Modal from "./ModalShell";
import FleetModal from "./FleetModal";
import SandboxIndicator from "./SandboxIndicator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import { useSandbox } from "@/lib/viewer/sandbox";

const NETWORKS = ["local", "devnet", "testnet", "mainnet"] as const;
const SANDBOX_NETWORKS = ["local", "devnet", "testnet"] as const;
type Network = (typeof NETWORKS)[number];

interface Chain {
  network?: string;
  wallet_pubkey?: string | null;
  active_wallet_label?: string | null;
  active_wallet_pubkey?: string | null;
  payer_configured?: boolean;
}
interface WalletRow {
  id: string;
  label: string;
  network: string;
  pubkey: string;
}
interface AccountContext {
  ok: boolean;
  chain?: Chain | null;
  wallets?: WalletRow[];
  error?: string;
}
interface DAppRow {
  slug: string;
  name: string;
  description: string;
  version: string;
  status: string;
  tools_count: number;
}
interface LlmConfig {
  provider?: string;
  base_url?: string;
  models?: string[];
  default_model?: string | null;
  api_key?: string | null;
}

/** Fila de proveedor del contexto (sin secretos — la key nunca baja). */
interface LlmProviderRow {
  provider: string;
  base_url?: string;
  models?: string[];
  default_model?: string | null;
  has_key?: boolean;
  is_active?: boolean;
}

/**
 * Proveedores del modal Modelos. `apiProvider` es el que acepta la api
 * (PROVIDERS de account_llm — lo usará brain para razonar como la cuenta);
 * `modelsProvider` es el del validador en vivo del dapp (/api/ai/models).
 */
interface ProviderOption {
  label: string;
  labelKey?: string;
  apiProvider: string;
  modelsProvider: string; // ABIERTO: cualquier proveedor OpenAI-compatible
  baseUrl?: string;
  keyOptional?: boolean;
  keyHint?: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { label: "NVIDIA NIM", apiProvider: "nvidia-nim", modelsProvider: "nvidia", keyHint: "nvapi-…" },
  { label: "OpenAI", apiProvider: "openai", modelsProvider: "custom", baseUrl: "https://api.openai.com/v1", keyHint: "sk-…" },
  { label: "Meta Llama API", apiProvider: "meta", modelsProvider: "meta", baseUrl: "https://api.llama.com/compat/v1", keyHint: "llama-…" },
  { label: "Baseten", apiProvider: "baseten", modelsProvider: "baseten", baseUrl: "https://inference.baseten.co/v1", keyHint: "b10_…" },
  { label: "Personalizado (OpenAI-compat)", labelKey: "customProvider", apiProvider: "custom", modelsProvider: "custom", keyHint: "según proveedor" },
];

function shortKey(pubkey: string | null | undefined, unset: string): string {
  if (!pubkey) return unset;
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-5)}`;
}

interface ConnectedWallet {
  id: string;
  label: string;
  provider: string;
  chain: string; // 'solana' | 'evm'
  pubkey: string;
  is_active: boolean;
  balance_lamports?: number | null; // solo chain=solana (vía RPC del api)
}

interface DpaasSummary {
  wallet: string | null;
  network?: string | null;
  balance_lamports?: number | null;
  wallets?: { network: string; wallet_pubkey: string; balance_lamports?: number | null }[];
}

/** Nombres legibles de chains EVM habituales (eth_chainId → nombre). */
const EVM_CHAINS: Record<string, string> = {
  "0x1": "Ethereum",
  "0x2105": "Base",
  "0x89": "Polygon",
  "0xa": "Optimism",
  "0x38": "BSC",
  "0xaa36a7": "Sepolia",
  "0x14a34": "Base Sepolia",
  "0x66eee": "Arbitrum Sepolia",
  "0xa4b1": "Arbitrum",
};

function fmtSol(lamports: number | null | undefined): string {
  if (lamports == null) return "…";
  return `${(lamports / 1_000_000_000).toFixed(4)} SOL`;
}

function fmtEth(weiHex: string, chainId: string): string {
  const wei = BigInt(weiHex);
  const int = wei / 10n ** 18n;
  const frac = ((wei % 10n ** 18n) / 10n ** 14n).toString().padStart(4, "0");
  const name = EVM_CHAINS[chainId.toLowerCase()] ?? `chain ${chainId}`;
  return `${int}.${frac} ETH · ${name}`;
}

/** Wallets del navegador detectables (extensión instalada). */
const BROWSER_WALLETS = [
  { id: "phantom", label: "Phantom", icon: Ghost },
  { id: "solflare", label: "Solflare", icon: Sun },
  { id: "backpack", label: "Backpack", icon: Backpack },
  { id: "metamask", label: "MetaMask", icon: WalletMinimal },
] as const;

/** Conecta una wallet del navegador y devuelve SOLO su pubkey (base58 o 0x…).
 *  La clave privada nunca sale de la wallet — no se solicita ni se guarda. */
async function connectBrowserWallet(id: string, t: (key: string) => string): Promise<string> {
  const w = window as unknown as Record<string, any>;

  if (id === "metamask") {
    const eth = w.ethereum;
    if (!eth?.request) throw new Error(t("mmMissing"));
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    if (!accounts?.[0]) throw new Error(t("mmNoAccount"));
    return accounts[0];
  }

  const inj =
    id === "phantom"
      ? (w.phantom?.solana ?? w.solana)
      : id === "solflare"
        ? w.solflare
        : w.backpack;
  if (!inj?.connect) throw new Error(t("wMissing"));
  const res = (await inj.connect()) ?? {};
  const pk = res?.publicKey?.toString?.() ?? inj.publicKey?.toString?.();
  if (!pk) throw new Error(t("wNoPubkey"));
  return pk;
}

/** Modal Wallet · Red — wallet firmante (dPaaS), wallets del navegador
 *  (Phantom/MetaMask — varias, una en uso) y red blockchain del agente. */
function WalletModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("wallet");
  const tc = useTranslations("common");
  const sandbox = useSandbox();
  const [ctx, setCtx] = useState<AccountContext | null>(null);
  const [walletLabel, setWalletLabel] = useState(""); // "" = wallet principal (dPaaS)
  const [network, setNetwork] = useState<Network>("devnet");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState<ConnectedWallet[] | null>(null);
  const [connectWallet, setConnectWallet] = useState("");
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const [dpaas, setDpaas] = useState<DpaasSummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [evmBalance, setEvmBalance] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const selectedNetwork: Network = sandbox
    ? SANDBOX_NETWORKS.includes(network as (typeof SANDBOX_NETWORKS)[number])
      ? network
      : "devnet"
    : "mainnet";
  const visibleDpaasWallets = (dpaas?.wallets ?? []).filter((dw) =>
    sandbox ? dw.network !== "mainnet" : dw.network === "mainnet",
  );
  const wallets = (ctx?.wallets ?? []).filter((w) => w.network === selectedNetwork);
  const selectedWalletLabel = wallets.some((w) => w.label === walletLabel) ? walletLabel : "";
  const primaryWallet = visibleDpaasWallets.find((dw) => dw.network === selectedNetwork);
  const primaryPubkey =
    primaryWallet?.wallet_pubkey ??
    (dpaas?.network === selectedNetwork ? dpaas.wallet : null);
  const primaryBalance =
    primaryWallet?.balance_lamports ??
    (dpaas?.network === selectedNetwork ? dpaas.balance_lamports : null);

  /** Copiar dirección dPaaS para fondearla (portapapeles). */
  const copyAddr = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(addr);
      setTimeout(() => setCopied((c) => (c === addr ? null : c)), 1600);
    } catch {
      /* sin portapapeles: silencioso */
    }
  };

  const loadSummary = async () => {
    try {
      const res = await fetch("/api/account/x402/summary", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && data.dpaas) setDpaas(data.dpaas as DpaasSummary);
    } catch {
      /* silencioso: el balance es informativo */
    }
  };

  const loadConnected = async () => {
    try {
      const res = await fetch("/api/account/connected-wallets", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setConnected(data.wallets ?? []);
    } catch {
      /* silencioso: la lista principal es la del contexto */
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account/context", { cache: "no-store" });
        const data: AccountContext = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        setCtx(data);
        setWalletLabel(data.chain?.active_wallet_label ?? "");
        setNetwork((data.chain?.network as Network) ?? "devnet");
      } catch (e) {
        setError(e instanceof Error ? e.message : tc("networkError"));
      }
    })();
    loadConnected();
    loadSummary();
  }, []);

  // Balance EVM de la wallet ACTIVA con su propia extensión: ella sabe en
  // qué red está (el api no puede saberlo). Solo si la pubkey coincide con
  // la cuenta actual de la extensión.
  useEffect(() => {
    (async () => {
      setEvmBalance(null);
      try {
        const w = window as unknown as Record<string, any>;
        const eth = w.ethereum;
        const activeEvm = connected?.find((c) => c.is_active && c.chain === "evm");
        if (!eth?.request || !activeEvm) return;
        const [accounts, chainId] = await Promise.all([
          eth.request({ method: "eth_accounts" }) as Promise<string[]>,
          eth.request({ method: "eth_chainId" }) as Promise<string>,
        ]);
        if (!accounts?.[0] || accounts[0].toLowerCase() !== activeEvm.pubkey.toLowerCase()) return;
        const bal = (await eth.request({
          method: "eth_getBalance",
          params: [accounts[0], "latest"],
        })) as string;
        setEvmBalance(fmtEth(bal, chainId));
      } catch {
        /* sin extensión o sin permiso: sin balance EVM */
      }
    })();
  }, [connected]);

  /** Conectar wallet del navegador → pubkey → guardada en la cuenta (en uso). */
  const onConnect = async (id: string) => {
    setConnectingWallet(id);
    setError(null);
    try {
      const pubkey = await connectBrowserWallet(id, t);
      const res = await fetch("/api/account/connected-wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: id,
          chain: id === "metamask" ? "evm" : "solana",
          pubkey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      await loadConnected(); // nueva wallet → queda EN USO (solo una activa)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errConnect"));
    } finally {
      setConnectingWallet(null);
    }
  };

  /** Marcar una wallet conectada como la en uso (desactiva las demás). */
  const useWallet = async (label: string) => {
    setError(null);
    try {
      const res = await fetch("/api/account/connected-wallets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      await loadConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("networkError"));
    }
  };

  /** Crear wallet dPaaS (ed25519, sellada AEAD) — un clic y listo. */
  const onGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/account/chain/keypair/generate", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const ctxRes = await fetch("/api/account/context", { cache: "no-store" });
      const ctxData: AccountContext = await ctxRes.json();
      if (ctxRes.ok && ctxData.ok) setCtx(ctxData);
      await loadSummary();
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("networkError"));
    } finally {
      setGenerating(false);
    }
  };

  /** Faucet Devnet (W6): treasury del ecosistema → wallet dPaaS. */
  const onFaucet = async () => {
    setFaucetBusy(true);
    setError(null);
    setFaucetMsg(null);
    try {
      const res = await fetch("/api/account/faucet", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFaucetMsg(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setFaucetMsg(
        `tx ${String(data.tx_signature).slice(0, 18)}… · ` +
          `${data.lamports} lamports → ${shortKey(data.wallet_pubkey, t("unset"))}`,
      );
      // refrescar contexto de la cuenta + balance
      const ctxRes = await fetch("/api/account/context", { cache: "no-store" });
      const ctxData: AccountContext = await ctxRes.json();
      if (ctxRes.ok && ctxData.ok) setCtx(ctxData);
      await loadSummary();
    } catch (e) {
      setFaucetMsg(e instanceof Error ? e.message : tc("networkError"));
    } finally {
      setFaucetBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/chain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: selectedNetwork, active_wallet_label: selectedWalletLabel }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      setTimeout(onClose, 1100);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("networkError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        <>
          <Wallet className="size-5 text-primary" />
          {t("title")}
        </>
      }
      onClose={onClose}
    >
      {!ctx && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t("loading")}
        </p>
      )}

      {ctx && (
        <>
          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="gap-1 px-4 py-3">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                {t("signer")}
                <Badge variant={sandbox ? "secondary" : "outline"}>
                  {sandbox ? t("sandboxMode") : t("productionMode")}
                </Badge>
              </CardTitle>
              <CardDescription>{t("signerHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 px-4 pb-4">
              {visibleDpaasWallets.map((dw) => {
                const isActiveNet = dw.network === selectedNetwork;
                return (
                  <div
                    key={dw.network}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-3 transition-colors",
                      isActiveNet && selectedWalletLabel === "" && "border-primary bg-primary/10",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setWalletLabel("")}
                      disabled={!isActiveNet}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <b className="flex items-center gap-2 text-[13px] font-semibold">
                          {t("dpaasWallet")}
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {dw.network}
                          </Badge>
                        </b>
                        <small className="truncate text-xs text-muted-foreground">
                          {shortKey(dw.wallet_pubkey, t("unset"))} · {fmtSol(dw.balance_lamports)}
                        </small>
                      </span>
                      {isActiveNet && selectedWalletLabel === "" && (
                        <Check className="size-4 shrink-0 text-primary" />
                      )}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title={t("copyAddr", { network: dw.network })}
                      onClick={() => void copyAddr(dw.wallet_pubkey)}
                      className="size-8 shrink-0"
                    >
                      {copied === dw.wallet_pubkey ? (
                        <Check className="size-3.5 text-emerald-700" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </div>
                );
              })}
              {!primaryWallet && (
                <button
                  type="button"
                  onClick={() => setWalletLabel("")}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    selectedWalletLabel === ""
                      ? "border-primary bg-primary/10"
                      : "hover:border-muted-foreground/40",
                  )}
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <b className="text-[13px] font-semibold">{t("principal")}</b>
                    <small className="text-xs text-muted-foreground">
                      {primaryPubkey
                        ? `${shortKey(primaryPubkey, t("unset"))} · ${fmtSol(primaryBalance)} · ${t("signsTolls")}`
                        : `${t("unset")} · ${t("signsTolls")}`}
                    </small>
                  </span>
                  {selectedWalletLabel === "" && primaryPubkey && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              )}
              {!dpaas?.wallets?.length && !dpaas?.wallet && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onGenerate}
                  disabled={generating}
                  className="w-fit"
                >
                  {generating ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                  {generating ? t("creating") : t("create")}
                </Button>
              )}
              {wallets.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWalletLabel(w.label)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    selectedWalletLabel === w.label
                      ? "border-primary bg-primary/10"
                      : "hover:border-muted-foreground/40",
                  )}
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <b className="text-[13px] font-semibold">{w.label}</b>
                    <small className="text-xs text-muted-foreground">
                      {shortKey(w.pubkey, t("unset"))} · {w.network}
                    </small>
                  </span>
                  {selectedWalletLabel === w.label && (
                    <Check className="size-4 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </CardContent>
          </Card>

          {sandbox && (
            <Card className="gap-0 py-0 shadow-none">
              <CardHeader className="gap-1 px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Droplets className="size-4 text-muted-foreground" />
                  {t("devnet")}
                  <Badge variant="secondary">Sandbox</Badge>
                </CardTitle>
                <CardDescription>{t("faucetInfo")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 px-4 pb-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onFaucet}
                  disabled={faucetBusy || selectedNetwork !== "devnet"}
                >
                  {faucetBusy ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Droplets />
                  )}
                  {faucetBusy ? t("dripping") : t("faucet")}
                </Button>
                {faucetMsg && (
                  <p className="text-xs text-muted-foreground">
                    {faucetMsg}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="gap-1 px-4 py-3">
              <CardTitle className="text-sm">{t("browser")}</CardTitle>
              <CardDescription>{t("browserHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 pb-4">
              <Select
                value={connectWallet}
                onValueChange={(provider) => {
                  setConnectWallet("");
                  void onConnect(provider);
                }}
              >
                <SelectTrigger className="w-full sm:w-fit" disabled={connectingWallet !== null}>
                  {connectingWallet ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                  <SelectValue placeholder={connectingWallet ? t("connecting") : t("connectBrowserWallet")} />
                </SelectTrigger>
                <SelectContent className="theme-light bg-white text-[#343433]">
                  {BROWSER_WALLETS.map((bw) => (
                    <SelectItem key={bw.id} value={bw.id}>
                      <span className="flex items-center gap-2">
                        <bw.icon className="size-4" />
                        {bw.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {connected && connected.length > 0 ? (
                <div className="grid gap-2">
                  {connected.map((cw) => {
                    const provider = BROWSER_WALLETS.find((bw) => bw.id === cw.provider);
                    const WalletIcon = provider?.icon ?? WalletMinimal;
                    return (
                      <div
                        key={cw.id}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3",
                          cw.is_active && "border-primary bg-primary/10",
                        )}
                      >
                        <span className="flex flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="gap-1.5 text-[10px]">
                              <WalletIcon className="size-3" aria-hidden="true" />
                              {provider?.label ?? cw.label}
                            </Badge>
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {cw.chain}
                            </Badge>
                          </span>
                          <small className="text-xs text-muted-foreground">
                            {shortKey(cw.pubkey, t("unset"))}
                            {cw.chain === "solana" &&
                              ` · ${fmtSol(cw.balance_lamports)}`}
                            {cw.chain === "evm" &&
                              cw.is_active &&
                              evmBalance != null &&
                              ` · ${evmBalance}`}
                          </small>
                        </span>
                        {cw.is_active ? (
                          <Badge>{t("inUse")}</Badge>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => useWallet(cw.label)}
                          >{t("use")}</Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="gap-1 px-4 py-3">
              <CardTitle className="text-sm">{t("chain")}</CardTitle>
              <CardDescription>
                {sandbox ? t("sandboxNetworkHint") : t("productionNetworkHint")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Select
                value={selectedNetwork}
                onValueChange={(value) => setNetwork(value as Network)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="theme-light bg-white text-[#343433]">
                  {(sandbox ? SANDBOX_NETWORKS : ["mainnet"] as const).map((n) => (
                    <SelectItem key={n} value={n} className="capitalize">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <p className="flex items-center gap-2 text-[13px] text-emerald-700">
              <CircleCheck className="size-4" />
              {t("saved")}
            </p>
          )}

          <footer className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>{t("cancel")}</Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving && <LoaderCircle className="animate-spin" />}
              {saving ? t("saving") : t("save")}
            </Button>
          </footer>
        </>
      )}
    </Modal>
  );
}

/**
 * Modal Modelos — LLM DE LA CUENTA (multi-proveedor, uno solo ACTIVO).
 *
 * La cuenta carga sus api_keys (selladas AEAD en api) y elige UN proveedor
 * activo + su modelo; brain razona SOLO con ese (sin fallback global).
 *
 *  · "Tus proveedores": radio por fila (el activo), nº de modelos, key ●/○
 *    y 🗑 por proveedor. Sin activo → el agente exige configurar.
 *  · "Modelo": modelos del proveedor ACTIVO (guarda al vuelo).
 *  · "Agregar key": proveedor + base_url (custom) + api_key → Conectar
 *    valida en vivo, lista modelos (Gratis/Otros) y guarda.
 */
function ModelsModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("models");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<LlmProviderRow[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [providerIdx, setProviderIdx] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [live, setLive] = useState<{ provider: string; models: { id: string; free: boolean }[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshed = useRef(false);
  const mounted = useRef(true);

  const opt = PROVIDER_OPTIONS[providerIdx];
  const activeRow = rows.find((r) => r.provider === active) ?? null;
  // modelos del activo: en vivo si se acaban de listar, si no los guardados
  const activeModels: { id: string; free: boolean }[] =
    live && live.provider === active
      ? live.models
      : (activeRow?.models ?? []).map((id) => ({ id, free: false }));
  const freeModels = activeModels.filter((m) => m.free);
  const otherModels = activeModels.filter((m) => !m.free);
  const showGroups = live?.provider === active && freeModels.length > 0;

  /** Recarga la lista desde el contexto de la cuenta. Devuelve las filas. */
  const refresh = async (): Promise<LlmProviderRow[] | null> => {
    try {
      const res = await fetch("/api/account/context", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (mounted.current) setStatus({ ok: false, text: data.error ?? `HTTP ${res.status}` });
        return null;
      }
      if (!mounted.current) return null;
      const list: LlmProviderRow[] = data.llm_providers ?? [];
      setRows(list);
      const act: string | null = list.find((r) => r.is_active)?.provider ?? data.llm?.provider ?? null;
      setActive(act);
      setLoaded(true);
      return list;
    } catch (e) {
      if (mounted.current) setStatus({ ok: false, text: e instanceof Error ? e.message : tc("networkError") });
      return null;
    }
  };

  /** Re-lista los modelos del activo desde el servidor (key sellada).
   *  Auto al abrir (manual=false: fallo silencioso con aviso tenue);
   *  manual=true: el error se muestra en rojo. */
  const refreshModels = async (manual: boolean) => {
    if (refreshing) return;
    setRefreshing(true);
    if (manual) setStatus(null);
    try {
      const res = await fetch("/api/account/llm/refresh-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const text = data?.error ?? `HTTP ${res.status}`;
        if (mounted.current) {
          setStatus(
            manual
              ? { ok: false, text }
              : { ok: true, text: t("warnRefresh", { text }) },
          );
        }
        return;
      }
      setLive(null);
      flashSaved();
      await refresh();
    } catch (e) {
      if (mounted.current) {
        const text = e instanceof Error ? e.message : tc("networkError");
        setStatus(
          manual
            ? { ok: false, text }
            : { ok: true, text: t("warnRefresh", { text }) },
        );
      }
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      const list = await refresh();
      // auto-refresh una vez por apertura: si el activo tiene key, la lista
      // guardada puede estar vieja (ej: un solo modelo) y el servidor la
      // re-lista sin pedir la key de nuevo
      if (!autoRefreshed.current && list?.some((r) => r.is_active && r.has_key)) {
        autoRefreshed.current = true;
        await refreshModels(false);
      }
    })();
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flashSaved = () => {
    setSavedNotice(true);
    setTimeout(() => mounted.current && setSavedNotice(false), 1600);
  };

  /** Guarda (upsert) la config de UN proveedor en la cuenta. */
  const saveToAccount = async (body: Record<string, unknown>): Promise<boolean> => {
    const put = await fetch("/api/account/llm", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const saved = await put.json().catch(() => null);
    if (!put.ok || !saved?.ok) {
      setStatus({ ok: false, text: saved?.error ?? `HTTP ${put.status}` });
      return false;
    }
    return true;
  };

  /** Conectar: valida la key en vivo + lista modelos + guarda en la cuenta. */
  async function doConnect(params: { idx: number; key: string; baseUrl?: string }) {
    const o = PROVIDER_OPTIONS[params.idx];
    setConnecting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: o.modelsProvider,
          apiKey: params.key.trim() || undefined,
          baseUrl:
            o.modelsProvider === "custom"
              ? (params.baseUrl?.trim() || o.baseUrl)
              : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      const validated = res.ok && data?.ok;
      let list: { id: string; free: boolean }[] = validated
        ? (data?.models ?? [])
        : [];
      let pick = (list.find((m) => m.free) ?? list[0])?.id;

      if (!validated) {
        // validación en vivo no disponible (proveedor sin /models, ping falló, …):
        // guardamos directamente sin validación estricta, al estilo opencode.
        const known = AI_PROVIDERS[o.modelsProvider]?.models ?? [];
        list = known.map((id) => ({ id, free: false }));
        pick = list[0]?.id;
        if (data?.warning) {
          setStatus({ ok: true, text: t("warn", { warning: String(data.warning) }) });
        } else {
          setStatus({ ok: true, text: t("warnNoValidate") });
        }
      } else {
        if (!pick) {
          setStatus({ ok: false, text: t("errNoModels") });
          return;
        }
        if (data.warning) {
          setStatus({ ok: true, text: t("warn", { warning: String(data.warning) }) });
        }
      }

      if (!pick) {
        setStatus({ ok: false, text: t("errNoModels") });
        return;
      }

      // conectar = guardar (PUT a la cuenta) lista + default; la key solo si el usuario la escribió ahora
      const body: Record<string, unknown> = {
        provider: o.apiProvider,
        models: list.map((m) => m.id),
        default_model: pick,
      };
      const baseUrl = o.baseUrl ?? params.baseUrl?.trim();
      if (baseUrl) body.base_url = baseUrl;
      if (params.key.trim()) body.api_key = params.key.trim();
      if (!(await saveToAccount(body))) return;
      setLive({ provider: o.apiProvider, models: list });
      setApiKey("");
      flashSaved();
      await refresh();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : t("errConn") });
    } finally {
      if (mounted.current) setConnecting(false);
    }
  }

  const conectar = () => {
    if (!apiKey.trim()) {
      setStatus({ ok: false, text: t("errKeyFirst") });
      return;
    }
    if (apiKey.trim().length < 20) {
      setStatus({
        ok: false,
        text: t("errKeyShort"),
      });
      return;
    }
    if (/[^\x21-\x7E]/.test(apiKey.trim())) {
      setStatus({
        ok: false,
        text: t("errKeyChars"),
      });
      return;
    }
    void doConnect({ idx: providerIdx, key: apiKey, baseUrl: customBaseUrl });
  };

  /** Elegir proveedor activo (radio). */
  const activate = async (provider: string) => {
    setBusy(`active:${provider}`);
    setStatus(null);
    try {
      const res = await fetch("/api/account/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus({ ok: false, text: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setLive(null);
      flashSaved();
      await refresh();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : tc("networkError") });
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  /** Cambiar modelo del activo (guarda al vuelo). */
  const handleModel = async (id: string) => {
    if (!active) return;
    setBusy("model");
    setStatus(null);
    try {
      const res = await fetch("/api/account/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus({ ok: false, text: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      flashSaved();
      await refresh();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : tc("networkError") });
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  /** Desconectar UN proveedor (🗑 por fila). */
  const desconectar = async (provider: string) => {
    setBusy(`del:${provider}`);
    setStatus(null);
    try {
      const res = await fetch(`/api/account/llm?provider=${encodeURIComponent(provider)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setStatus({ ok: false, text: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setLive((l) => (l?.provider === provider ? null : l));
      await refresh();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : tc("networkError") });
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const labelFor = (provider: string): string => {
    const o = PROVIDER_OPTIONS.find((x) => x.apiProvider === provider);
    return o?.labelKey ? t(o.labelKey) : (o?.label ?? provider);
  };

  return (
    <Modal
      title={
        <>
          <Bot className="size-5 text-primary" />{t("title")}</>
      }
      onClose={onClose}
    >
      {!loaded ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : (
        <>
          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">{t("active")}</h4>
            {rows.length === 0 && (
              <p className="text-[13px] text-amber-700">{t("none")}</p>
            )}
            {rows.map((r) => (
              <label
                key={r.provider}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm",
                  r.provider === active
                    ? "border-primary/60 bg-primary/5"
                    : "border-border hover:border-primary/30",
                )}
              >
                <input
                  type="radio"
                  name="llm-provider"
                  checked={r.provider === active}
                  disabled={busy !== null}
                  onChange={() => void activate(r.provider)}
                  className="size-4 accent-primary"
                />
                <span className="flex-1">
                  <span className="font-medium">{labelFor(r.provider)}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    · {t("modelsCount", { count: (r.models ?? []).length })}
                    {r.has_key ? t("hasKey") : t("noKey")}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={t("disconnect", { provider: labelFor(r.provider) })}
                  disabled={busy !== null}
                  onClick={(e) => {
                    e.preventDefault();
                    void desconectar(r.provider);
                  }}
                  className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </label>
            ))}
          </section>

          {activeRow && (
            <section className="grid gap-2">
              <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="flex-1">
                  {t("modelOf", { provider: labelFor(activeRow.provider) })}{" "}
                  {showGroups && t("freeCount", { count: freeModels.length })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={t("refresh")}
                  disabled={busy !== null || refreshing}
                  onClick={() => void refreshModels(true)}
                  className="size-6"
                >
                  <RotateCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
                </Button>
              </h4>
              <Select
                value={activeRow.default_model ?? ""}
                onValueChange={(v) => void handleModel(v)}
                disabled={busy !== null || refreshing}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                {/* item-aligned: lista alta (70 modelos), no el popper corto */}
                <SelectContent position="item-aligned" className="theme-light bg-white text-[#343433]">
                  {showGroups ? (
                    <>
                      {freeModels.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>{t("free")}</SelectLabel>
                          {freeModels.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.id}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {otherModels.length > 0 && (
                        <SelectGroup>
                          <SelectLabel>{t("others")}</SelectLabel>
                          {otherModels.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.id}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </>
                  ) : (
                    (activeRow.models ?? []).map((id) => (
                      <SelectItem key={id} value={id}>
                        {id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </section>
          )}

          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">{t("addKey")}</h4>
            <Select
              value={String(providerIdx)}
              onValueChange={(v) => {
                setProviderIdx(Number(v));
                setApiKey("");
                setStatus(null);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="theme-light bg-white text-[#343433]">
                {PROVIDER_OPTIONS.map((o, i) => (
                  <SelectItem key={o.label} value={String(i)}>
                    {o.labelKey ? t(o.labelKey) : o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {opt.apiProvider === "custom" && !opt.baseUrl && (
              <Input
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder={t("baseUrlPh")}
              />
            )}
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setStatus(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    conectar();
                  }
                }}
                placeholder={t("keyPh")}
                className="flex-1"
              />
              <Button type="button" onClick={conectar} disabled={connecting}>
                {connecting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <PlugZap />
                )}
                {connecting ? t("connecting") : t("connect")}
              </Button>
            </div>
          </section>

          <footer className="flex justify-end">
            <Button type="button" variant="ghost" onClick={onClose}>{t("done")}</Button>
          </footer>
        </>
      )}

      {status && !status.ok && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{status.text}</AlertDescription>
        </Alert>
      )}
      {status?.ok && status.text && (
        <p className="text-xs text-muted-foreground">{status.text}</p>
      )}
      {savedNotice && (
        <p className="flex items-center gap-2 text-[13px] text-emerald-700">
          <CircleCheck className="size-4" />{t("saved")}</p>
      )}
    </Modal>
  );
}

const DAPP_LOGOS: Record<string, string> = {
  "payload-cms": "/apps/payload-cms.svg",
};

function DAppLogo({ app }: { app: DAppRow }) {
  const logo = DAPP_LOGOS[app.slug];
  return (
    <div className="flex h-12 w-36 shrink-0 items-center justify-center rounded-lg border bg-white px-3">
      {logo ? (
        <Image
          src={logo}
          alt={`${app.name} logo`}
          width={132}
          height={34}
          className="h-auto max-h-8 w-full object-contain"
        />
      ) : (
        <Blocks className="size-6 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}

/** Catálogo de DApps disponible en la API del ecosistema. */
function DAppsModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("dapps");
  const tc = useTranslations("common");
  const [apps, setApps] = useState<DAppRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async (query: string) => {
    try {
      const trimmedQuery = query.trim();
      const url = trimmedQuery
        ? `/api/apps?q=${encodeURIComponent(trimmedQuery)}`
        : "/api/apps";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setApps(data.apps ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("networkError"));
    }
  }, [tc]);

  useEffect(() => {
    void load("");
  }, [load]);

  useEffect(() => {
    if (!apps?.some((app) => app.status === "installing")) return;
    const timer = window.setInterval(() => void load(searchQuery), 2500);
    return () => window.clearInterval(timer);
  }, [apps, load, searchQuery]);

  const install = async (slug: string) => {
    setInstallingSlug(slug);
    setError(null);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      await load(searchQuery);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("networkError"));
    } finally {
      setInstallingSlug(null);
    }
  };

  const statusLabel = (status: string) => {
    if (status === "installed") return t("statusInstalled");
    if (status === "installing") return t("statusInstalling");
    if (status === "failed") return t("statusFailed");
    return t("statusAvailable");
  };
  return (
    <Modal
      title={
        <><Blocks className="size-5 text-primary" />{t("title")}</>
      }
      onClose={onClose}
    >
      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          const query = searchInput.trim();
          setSearchQuery(query);
          void load(query);
        }}
      >
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="pr-11"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          title={t("search")}
          aria-label={t("search")}
          className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
        >
          <Search className="size-4" />
        </Button>
      </form>

      {!apps && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />{t("loading")}
        </p>
      )}

      {apps?.length === 0 && !error && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {searchQuery ? t("notFound", { query: searchQuery }) : t("empty")}
        </p>
      )}

      {apps?.map((app) => {
        const pending = app.status === "installing" || installingSlug === app.slug;
        const installed = app.status === "installed";
        return (
          <Card key={app.slug} className="gap-0 rounded-xl py-0 shadow-none">
            <CardContent className="grid gap-4 p-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
                <DAppLogo app={app} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{app.name}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {statusLabel(app.status)}
                    </Badge>
                    {app.version && (
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        v{app.version}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {t("toolsCount", { count: app.tools_count })}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {app.description || t("noDescription")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t pt-3">
                {!installed && (
                  <span className="text-xs text-muted-foreground">{t("connectHint")}</span>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void install(app.slug)}
                  disabled={pending || installed}
                >
                  {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
                  {pending ? t("installing") : t("install")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </Modal>
  );
}

export default function TopbarTools() {
  const t = useTranslations("panel.nav");
  const [modal, setModal] = useState<"wallet" | "models" | "dapps" | "fleet" | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModal("wallet")}
        title={t("walletTitle")}
        className="h-8 px-2 sm:h-9 sm:px-3"
      >
        <Wallet />
        <span className="hidden min-[480px]:inline">{t("wallet")}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModal("models")}
        title={t("modelsTitle")}
        className="h-8 px-2 sm:h-9 sm:px-3"
      >
        <Bot />
        <span className="hidden min-[480px]:inline">{t("models")}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModal("dapps")}
        title={t("dappsTitle")}
        className="h-8 px-2 sm:h-9 sm:px-3"
      >
        <Blocks />
        <span className="hidden min-[480px]:inline">{t("dapps")}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModal("fleet")}
        title={t("fleetTitle")}
        className="h-8 px-2 sm:h-9 sm:px-3"
      >
        <Radio />
        <span className="hidden min-[480px]:inline">{t("fleet")}</span>
      </Button>
      <SandboxIndicator />

      {modal === "wallet" && <WalletModal onClose={() => setModal(null)} />}
      {modal === "models" && <ModelsModal onClose={() => setModal(null)} />}
      {modal === "dapps" && <DAppsModal onClose={() => setModal(null)} />}
      {modal === "fleet" && <FleetModal onClose={() => setModal(null)} />}
    </>
  );
}
