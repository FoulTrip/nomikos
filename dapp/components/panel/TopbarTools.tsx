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
  Blocks,
  Bot,
  Check,
  CircleCheck,
  Copy,
  Droplets,
  ArrowLeft,
  LoaderCircle,
  PlugZap,
  Plus,
  RotateCw,
  Search,
  Trash2,
  TriangleAlert,
  Wallet,
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
interface McpManifestLegal {
  terms_url: string;
  terms_sha256: string;
  privacy_url: string;
  privacy_sha256: string;
}
interface McpToolPrice {
  scheme: string;
  network: string;
  asset: string;
  amount_atomic: number;
  pay_to: string;
}
interface McpManifestTool {
  name: string;
  description: string;
  risk_class: string;
  permissions: string[];
  price: McpToolPrice;
}
interface McpDirectoryApp {
  namespace: string;
  status: string;
  health_status: string;
  manifest_hash: string;
  manifest: {
    name: string;
    version: string;
    description: string;
    publisher_pubkey: string;
    legal: McpManifestLegal;
    tools: McpManifestTool[];
  };
}
interface McpInstalledApp {
  namespace: string;
  mode: "all" | "selected";
  device_ids: string[];
  version: string;
  legal_consent: boolean;
  tools: { name: string; enabled: boolean | number }[];
}
interface McpApproval {
  id: string;
  namespace: string;
  version: string;
  tool: string;
  arguments: unknown;
  amount_lamports: number;
  expires_at: number;
}
interface ControlDevice {
  id: string;
  name: string;
  board: string;
  status: string;
  online: boolean;
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

interface DpaasSummary {
  wallet: string | null;
  network?: string | null;
  balance_lamports?: number | null;
  wallets?: { network: string; wallet_pubkey: string; balance_lamports?: number | null }[];
}

function fmtSol(lamports: number | null | undefined): string {
  if (lamports == null) return "…";
  return `${(lamports / 1_000_000_000).toFixed(4)} SOL`;
}

/** Modal Wallet · Red — wallet firmante dPaaS y red blockchain del agente. */
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
  const [dpaas, setDpaas] = useState<DpaasSummary | null>(null);
  const [generating, setGenerating] = useState(false);
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
    loadSummary();
  }, []);
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
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <a href="https://faucet.solana.com/" target="_blank" rel="noopener noreferrer">
                    {t("faucet")}
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          {!sandbox && (
            <Card className="gap-0 py-0 shadow-none">
              <CardHeader className="gap-1 px-4 py-3">
                <CardTitle className="text-sm">Solana Mainnet</CardTitle>
                <CardDescription>{t("mainnetFundingInfo")}</CardDescription>
              </CardHeader>
            </Card>
          )}

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

function DAppControlModal({
  app,
  onBack,
  onClose,
}: {
  app: DAppRow;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("dapps");
  const [devices, setDevices] = useState<ControlDevice[] | null>(null);
  const [mode, setMode] = useState<"all" | "selected">("all");
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const path = `/api/account/apps/${encodeURIComponent(app.slug)}/visibility`;
      const [fleetRes, visibilityRes] = await Promise.all([
        fetch("/api/account/devices", { cache: "no-store" }),
        fetch(path, { cache: "no-store" }),
      ]);
      const [fleetData, visibilityData] = await Promise.all([
        fleetRes.json(),
        visibilityRes.json(),
      ]);
      if (!fleetRes.ok || !fleetData.ok) {
        throw new Error(fleetData.error ?? t("controlLoadError"));
      }
      if (!visibilityRes.ok || !visibilityData.ok) {
        throw new Error(visibilityData.error ?? t("controlLoadError"));
      }
      setDevices(fleetData.devices ?? []);
      setMode(visibilityData.mode === "selected" ? "selected" : "all");
      setDeviceIds(Array.isArray(visibilityData.device_ids) ? visibilityData.device_ids : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("controlLoadError"));
    } finally {
      setLoading(false);
    }
  }, [app.slug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/account/apps/${encodeURIComponent(app.slug)}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          device_ids: mode === "selected" ? deviceIds : [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("controlSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const toggleDevice = (id: string, checked: boolean) => {
    setDeviceIds((current) => checked
      ? [...new Set([...current, id])]
      : current.filter((deviceId) => deviceId !== id));
    setSaved(false);
  };

  return (
    <Modal
      title={<><Blocks className="size-5 text-primary" />{t("controlTitle", { app: app.name })}</>}
      onClose={onClose}
    >
      <Button type="button" variant="ghost" size="sm" className="-mt-2 w-fit" onClick={onBack}>
        <ArrowLeft />{t("backToCatalog")}
      </Button>
      <p className="-mt-2 text-sm text-muted-foreground">{app.name}</p>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />{t("controlLoading")}
        </p>
      )}

      {!loading && (
        <fieldset className="grid gap-3" disabled={saving}>
          <legend className="mb-1 text-sm font-medium">{t("visibilityScope")}</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
            <input
              type="radio"
              name={`visibility-${app.slug}`}
              checked={mode === "all"}
              onChange={() => { setMode("all"); setSaved(false); }}
              className="mt-1 accent-zinc-900"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{t("allDevices")}</span>
              <span className="text-xs text-muted-foreground">{t("allDevicesHint")}</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
            <input
              type="radio"
              name={`visibility-${app.slug}`}
              checked={mode === "selected"}
              onChange={() => { setMode("selected"); setSaved(false); }}
              className="mt-1 accent-zinc-900"
            />
            <span className="grid gap-0.5">
              <span className="font-medium">{t("selectedDevices")}</span>
              <span className="text-xs text-muted-foreground">{t("selectedDevicesHint")}</span>
            </span>
          </label>

          {mode === "selected" && (
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2">
              {devices?.length ? devices.map((device) => (
                <label key={device.id} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60">
                  <input
                    type="checkbox"
                    checked={deviceIds.includes(device.id)}
                    onChange={(event) => toggleDevice(device.id, event.target.checked)}
                    className="mt-1 accent-zinc-900"
                  />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium">{device.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {device.board} · {device.online ? t("deviceOnline") : t("deviceOffline")}
                    </span>
                  </span>
                </label>
              )) : (
                <p className="p-3 text-sm text-muted-foreground">{t("noFleetDevices")}</p>
              )}
            </div>
          )}
        </fieldset>
      )}

      {error && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <p role="status" className="text-sm font-medium text-emerald-700">{t("controlSaved")}</p>
      )}
      <div className="flex justify-end border-t pt-3">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={loading || saving || devices === null || (mode === "selected" && deviceIds.length === 0)}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : null}
          {saving ? t("controlSaving") : t("saveControl")}
        </Button>
      </div>
    </Modal>
  );
}

/** Catálogo de DApps disponible en la API del ecosistema. */
function DAppsModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("dapps");
  const tc = useTranslations("common");
  const [apps, setApps] = useState<DAppRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [controlApp, setControlApp] = useState<DAppRow | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [catalog, setCatalog] = useState<"hosted" | "mcp">("hosted");

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
  if (controlApp) {
    return (
      <DAppControlModal
        app={controlApp}
        onBack={() => setControlApp(null)}
        onClose={onClose}
      />
    );
  }
  return (
    <Modal
      title={
        <><Blocks className="size-5 text-primary" />{t("title")}</>
      }
      onClose={onClose}
    >
      <div className="flex w-fit rounded-lg bg-muted p-1" role="tablist" aria-label={t("title")}>
        <button
          type="button"
          role="tab"
          aria-selected={catalog === "hosted"}
          onClick={() => setCatalog("hosted")}
          className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", catalog === "hosted" && "bg-white text-foreground shadow-sm")}
        >{t("tabHosted")}</button>
        <button
          type="button"
          role="tab"
          aria-selected={catalog === "mcp"}
          onClick={() => setCatalog("mcp")}
          className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", catalog === "mcp" && "bg-white text-foreground shadow-sm")}
        >{t("tabMcp")}</button>
      </div>
      {catalog === "mcp" ? (
        <McpMarketplace />
      ) : (
        <>
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
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void install(app.slug)}
                    disabled={pending || installed}
                  >
                    {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
                    {pending ? t("installing") : t("install")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setControlApp(app)}
                  >
                    {t("control")}
                  </Button>
                </div>
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
        </>
      )}
    </Modal>
  );
}

function McpMarketplace() {
  const t = useTranslations("dapps");
  const tc = useTranslations("common");
  const [apps, setApps] = useState<McpDirectoryApp[] | null>(null);
  const [installed, setInstalled] = useState<McpInstalledApp[]>([]);
  const [approvals, setApprovals] = useState<McpApproval[]>([]);
  const [devices, setDevices] = useState<ControlDevice[]>([]);
  const [scope, setScope] = useState<Record<string, "all" | "selected">>({});
  const [deviceIds, setDeviceIds] = useState<Record<string, string[]>>({});
  const [enabledTools, setEnabledTools] = useState<Record<string, Record<string, boolean>>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [catalogRes, installedRes, devicesRes, approvalsRes] = await Promise.all([
        fetch("/api/marketplace/apps", { cache: "no-store" }),
        fetch("/api/account/marketplace/apps", { cache: "no-store" }),
        fetch("/api/account/devices", { cache: "no-store" }),
        fetch("/api/account/marketplace/approvals", { cache: "no-store" }),
      ]);
      const [catalogData, installedData, devicesData, approvalsData] = await Promise.all([
        catalogRes.json(), installedRes.json(), devicesRes.json(), approvalsRes.json(),
      ]);
      if (!catalogRes.ok || !catalogData.ok) throw new Error(catalogData.error ?? `HTTP ${catalogRes.status}`);
      if (!installedRes.ok || !installedData.ok) throw new Error(installedData.error ?? `HTTP ${installedRes.status}`);
      if (!devicesRes.ok || !devicesData.ok) throw new Error(devicesData.error ?? `HTTP ${devicesRes.status}`);
      if (!approvalsRes.ok || !approvalsData.ok) throw new Error(approvalsData.error ?? `HTTP ${approvalsRes.status}`);
      const directoryApps: McpDirectoryApp[] = catalogData.apps ?? [];
      const installedApps: McpInstalledApp[] = installedData.apps ?? [];
      setApps(directoryApps);
      setInstalled(installedApps);
      setDevices(devicesData.devices ?? []);
      setApprovals(approvalsData.approvals ?? []);
      setScope((current) => {
        const next = { ...current };
        for (const app of directoryApps) {
          const prior = installedApps.find((row) => row.namespace === app.namespace);
          next[app.namespace] ??= prior?.mode ?? "all";
        }
        return next;
      });
      setDeviceIds((current) => {
        const next = { ...current };
        for (const app of directoryApps) {
          const prior = installedApps.find((row) => row.namespace === app.namespace);
          next[app.namespace] ??= prior?.device_ids ?? [];
        }
        return next;
      });
      setEnabledTools((current) => {
        const next = { ...current };
        for (const app of directoryApps) {
          const prior = installedApps.find((row) => row.namespace === app.namespace);
          const configured = new Map((prior?.legal_consent ? prior.tools : []).map((row) => [row.name, Boolean(row.enabled)]));
          next[app.namespace] ??= Object.fromEntries(app.manifest.tools.map((tool) => [tool.name, configured.get(tool.name) ?? false]));
        }
        return next;
      });
      setAccepted((current) => {
        const next = { ...current };
        for (const app of directoryApps) {
          const prior = installedApps.find((row) => row.namespace === app.namespace);
          const key = `${app.namespace}:${app.manifest_hash}`;
          if (prior?.legal_consent && prior.version === app.manifest.version) next[key] ??= true;
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("networkError"));
    }
  }, [tc]);

  useEffect(() => { void load(); }, [load]);

  const install = async (app: McpDirectoryApp) => {
    setBusy(app.namespace);
    setError(null);
    const selectedMode = scope[app.namespace] ?? "all";
    const consentKey = `${app.namespace}:${app.manifest_hash}`;
    try {
      const res = await fetch("/api/marketplace/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespace: app.namespace,
          mode: selectedMode,
          device_ids: selectedMode === "selected" ? (deviceIds[app.namespace] ?? []) : [],
          legal_consent: {
            accepted: Boolean(accepted[consentKey] ?? (installed.find((row) => row.namespace === app.namespace)?.legal_consent && installed.find((row) => row.namespace === app.namespace)?.version === app.manifest.version)),
            manifest_hash: app.manifest_hash,
            terms_sha256: app.manifest.legal.terms_sha256,
            privacy_sha256: app.manifest.legal.privacy_sha256,
          },
          tools: app.manifest.tools.map((tool) => ({
            name: tool.name,
            enabled: Boolean(enabledTools[app.namespace]?.[tool.name]),
            max_amount_lamports: tool.price.amount_atomic,
            require_confirmation: true,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? (data?.code === "LEGAL_CONSENT_REQUIRED" ? t("mcpNeedsConsent") : `HTTP ${res.status}`));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mcpInstallError"));
    } finally {
      setBusy(null);
    }
  };

  const decideApproval = async (approval: McpApproval, approved: boolean) => {
    setBusy(approval.id);
    setError(null);
    try {
      const res = await fetch("/api/account/marketplace/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: approval.id, approved }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mcpInstallError"));
    } finally {
      setBusy(null);
    }
  };

  if (!apps && !error) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("mcpLoading")}</p>;
  }

  return (
    <div className="grid gap-3">
      <section className="grid gap-2 rounded-xl border p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("mcpApprovalsTitle")}</h3>
          <Badge variant="secondary" className="text-[10px]">{approvals.length}</Badge>
        </div>
        {approvals.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("mcpApprovalsEmpty")}</p>
        ) : approvals.map((approval) => (
          <article key={approval.id} className="grid gap-2 border-t pt-2 text-xs">
            <p className="font-medium">{approval.namespace} · {approval.tool} · v{approval.version}</p>
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/60 p-2 font-mono text-[10px]">{JSON.stringify(approval.arguments, null, 2)}</pre>
            <p className="text-muted-foreground">{approval.amount_lamports / 1_000_000_000} SOL · {new Date(approval.expires_at).toLocaleTimeString()}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decideApproval(approval, false)}>
                {busy === approval.id ? <LoaderCircle className="animate-spin" /> : null}{t("mcpReject")}
              </Button>
              <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decideApproval(approval, true)}>
                {busy === approval.id ? <LoaderCircle className="animate-spin" /> : null}{t("mcpApprove")}
              </Button>
            </div>
          </article>
        ))}
      </section>
      {apps?.length === 0 && !error && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("mcpEmpty")}</p>
      )}
      {apps?.map((app) => {
        const prior = installed.find((row) => row.namespace === app.namespace);
        const selectedMode = scope[app.namespace] ?? "all";
        const selectedDevices = deviceIds[app.namespace] ?? [];
        const consentKey = `${app.namespace}:${app.manifest_hash}`;
        const currentConsent = accepted[consentKey] ?? (prior?.version === app.manifest.version && prior.legal_consent) ?? false;
        return (
          <Card key={app.namespace} className="gap-0 rounded-xl py-0 shadow-none">
            <CardContent className="grid gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{app.manifest.name}</h3>
                    <Badge variant="outline" className="font-mono text-[10px]">{app.namespace}</Badge>
                    <Badge variant="secondary" className="font-mono text-[10px]">v{app.manifest.version}</Badge>
                    {prior && <Badge className="text-[10px]">{t("mcpInstalled")}</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{app.manifest.description}</p>
                  <p className="mt-1 break-all text-[10px] text-muted-foreground">{t("mcpPublisher")}: {app.manifest.publisher_pubkey}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{app.health_status}</Badge>
              </div>

              <section className="grid gap-2 rounded-lg bg-muted/50 p-3 text-xs">
                <p className="font-medium">{t("mcpTools")}</p>
                {app.manifest.tools.map((tool) => (
                  <label key={tool.name} className="flex cursor-pointer items-start gap-2 border-t pt-2">
                    <input
                      type="checkbox"
                      checked={Boolean(enabledTools[app.namespace]?.[tool.name])}
                      onChange={(event) => setEnabledTools((current) => ({
                        ...current,
                        [app.namespace]: { ...current[app.namespace], [tool.name]: event.target.checked },
                      }))}
                      className="mt-0.5 accent-zinc-900"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        <span>{tool.name}</span>
                        <Badge variant="outline" className="text-[9px]">{t("mcpRisk")}: {tool.risk_class}</Badge>
                      </span>
                      <span className="block text-muted-foreground">{tool.description}</span>
                      <span className="mt-0.5 block font-mono text-[10px]">
                        {tool.price.amount_atomic / 1_000_000_000} SOL · {tool.price.network} · pay_to {tool.price.pay_to}
                      </span>
                      {!!tool.permissions.length && <span className="mt-1 block text-[10px] text-muted-foreground">{tool.permissions.join(" · ")}</span>}
                    </span>
                  </label>
                ))}
              </section>

              <section className="grid gap-1 rounded-lg border p-3 text-[10px] text-muted-foreground">
                <p className="font-medium text-foreground">{t("mcpTerms")} / {t("mcpPrivacy")}</p>
                {[{ kind: "terms", label: t("mcpTerms"), url: app.manifest.legal.terms_url, hash: app.manifest.legal.terms_sha256 },
                  { kind: "privacy", label: t("mcpPrivacy"), url: app.manifest.legal.privacy_url, hash: app.manifest.legal.privacy_sha256 }].map((document) => (
                  <p key={document.label} className="break-all">
                    {document.label}: <a className="underline underline-offset-2" href={`/api/marketplace/legal?namespace=${encodeURIComponent(app.namespace)}&document=${document.kind}`} target="_blank" rel="noopener noreferrer">{t("mcpVerifiedCopy")}</a>
                    <span className="block">{document.url}</span>
                    <span className="block">{t("mcpHash")}: {document.hash}</span>
                  </p>
                ))}
              </section>

              <fieldset className="grid gap-2 text-xs">
                <legend className="mb-1 font-medium">{t("mcpScope")}</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2"><input type="radio" name={`scope-${app.namespace}`} checked={selectedMode === "all"} onChange={() => setScope((current) => ({ ...current, [app.namespace]: "all" }))} />{t("mcpAllDevices")}</label>
                  <label className="flex items-center gap-2"><input type="radio" name={`scope-${app.namespace}`} checked={selectedMode === "selected"} onChange={() => setScope((current) => ({ ...current, [app.namespace]: "selected" }))} />{t("mcpSelectedDevices")}</label>
                </div>
                {selectedMode === "selected" && (devices.length ? (
                  <div className="grid max-h-28 gap-1 overflow-y-auto rounded-md border p-2">
                    {devices.map((device) => (
                      <label key={device.id} className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedDevices.includes(device.id)} onChange={(event) => setDeviceIds((current) => ({
                          ...current,
                          [app.namespace]: event.target.checked
                            ? [...new Set([...selectedDevices, device.id])]
                            : selectedDevices.filter((id) => id !== device.id),
                        }))} />
                        <span>{device.name} <span className="text-muted-foreground">· {device.board}</span></span>
                      </label>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground">{t("mcpNoDevices")}</p>)}
              </fieldset>

              <label className="flex cursor-pointer items-start gap-2 border-t pt-3 text-xs leading-relaxed">
                <input type="checkbox" checked={Boolean(currentConsent)} onChange={(event) => setAccepted((current) => ({ ...current, [consentKey]: event.target.checked }))} className="mt-0.5 accent-zinc-900" />
                <span>{t("mcpAccept")}</span>
              </label>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void install(app)}
                  disabled={busy !== null || !currentConsent || (selectedMode === "selected" && selectedDevices.length === 0)}
                >
                  {busy === app.namespace ? <LoaderCircle className="animate-spin" /> : <Plus />}
                  {prior ? t("mcpUpdate") : t("mcpInstall")}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {error && <Alert variant="destructive"><TriangleAlert /><AlertDescription>{error}</AlertDescription></Alert>}
    </div>
  );
}

export default function TopbarTools() {
  const t = useTranslations("panel.nav");
  const [modal, setModal] = useState<"wallet" | "models" | "dapps" | "fleet" | null>(null);

  return (
    <>
      <div
        role="group"
        aria-label="Herramientas del panel"
        className="flex shrink-0 items-center gap-0.5 sm:gap-1"
      >
        <button
          type="button"
          onClick={() => setModal("wallet")}
          title={t("walletTitle")}
          aria-haspopup="dialog"
          className="inline-flex min-h-8 items-center rounded-lg pl-0 pr-1.5 text-xs font-medium tracking-[-0.01em] text-zinc-600 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 sm:pr-2 sm:text-[13px]"
        >
          {t("wallet")}
        </button>
        <button
          type="button"
          onClick={() => setModal("models")}
          title={t("modelsTitle")}
          aria-haspopup="dialog"
          className="inline-flex min-h-8 items-center rounded-lg px-1.5 text-xs font-medium tracking-[-0.01em] text-zinc-600 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 sm:px-2 sm:text-[13px]"
        >
          {t("models")}
        </button>
        <button
          type="button"
          onClick={() => setModal("dapps")}
          title={t("dappsTitle")}
          aria-haspopup="dialog"
          className="inline-flex min-h-8 items-center rounded-lg px-1.5 text-xs font-medium tracking-[-0.01em] text-zinc-600 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 sm:px-2 sm:text-[13px]"
        >
          {t("dapps")}
        </button>
        <button
          type="button"
          onClick={() => setModal("fleet")}
          title={t("fleetTitle")}
          aria-haspopup="dialog"
          className="inline-flex min-h-8 items-center rounded-lg px-1.5 text-xs font-medium tracking-[-0.01em] text-zinc-600 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 sm:px-2 sm:text-[13px]"
        >
          {t("fleet")}
        </button>
      </div>
      <SandboxIndicator />

      {modal === "wallet" && <WalletModal onClose={() => setModal(null)} />}
      {modal === "models" && <ModelsModal onClose={() => setModal(null)} />}
      {modal === "dapps" && <DAppsModal onClose={() => setModal(null)} />}
      {modal === "fleet" && <FleetModal onClose={() => setModal(null)} />}
    </>
  );
}
