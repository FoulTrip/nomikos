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
 *   "Servicios"    — dapps que el agente usará con x402 (account_services).
 */
import { useEffect, useRef, useState } from "react";
import {
  Backpack,
  Blocks,
  Bot,
  Check,
  CircleCheck,
  Droplets,
  Ghost,
  LoaderCircle,
  PlugZap,
  Plus,
  Radio,
  Sun,
  TriangleAlert,
  Unplug,
  Wallet,
  WalletMinimal,
} from "lucide-react";
import Modal from "./ModalShell";
import FleetModal from "./FleetModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const NETWORKS = ["local", "devnet", "testnet", "mainnet"] as const;
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
interface ServiceRow {
  service: string;
  display_name: string;
  resource: string;
  via_x402: boolean;
  added: boolean;
  status?: string | null;
  added_at?: number | null;
  payer_pubkey?: string | null;
  network?: string | null;
}
interface LlmConfig {
  provider?: string;
  base_url?: string;
  models?: string[];
  default_model?: string | null;
  api_key?: string | null;
}

/**
 * Proveedores del modal Modelos. `apiProvider` es el que acepta la api
 * (PROVIDERS de account_llm — lo usará brain para razonar como la cuenta);
 * `modelsProvider` es el del validador en vivo del dapp (/api/ai/models).
 */
interface ProviderOption {
  label: string;
  apiProvider: string;
  modelsProvider: "nvidia" | "meta" | "custom";
  baseUrl?: string;
  keyOptional?: boolean;
  keyHint?: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { label: "NVIDIA NIM", apiProvider: "nvidia-nim", modelsProvider: "nvidia", keyHint: "nvapi-…" },
  { label: "OpenAI", apiProvider: "openai", modelsProvider: "custom", baseUrl: "https://api.openai.com/v1", keyHint: "sk-…" },
  { label: "Meta Llama API", apiProvider: "custom", modelsProvider: "meta", baseUrl: "https://api.llama.com/compat/v1", keyHint: "llama-…" },
  { label: "Llama Stack (local :8321)", apiProvider: "llama-stack", modelsProvider: "custom", baseUrl: "http://localhost:8321/v1", keyOptional: true },
  { label: "Personalizado (OpenAI-compat)", apiProvider: "custom", modelsProvider: "custom", keyHint: "según proveedor" },
];

function shortKey(pubkey?: string | null): string {
  if (!pubkey) return "sin configurar";
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-5)}`;
}

interface ConnectedWallet {
  id: string;
  label: string;
  provider: string;
  chain: string; // 'solana' | 'evm'
  pubkey: string;
  is_active: boolean;
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
async function connectBrowserWallet(id: string): Promise<string> {
  const w = window as unknown as Record<string, any>;

  if (id === "metamask") {
    const eth = w.ethereum;
    if (!eth?.request) throw new Error("MetaMask no detectado — instala la extensión");
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    if (!accounts?.[0]) throw new Error("MetaMask no devolvió cuenta");
    return accounts[0];
  }

  const inj =
    id === "phantom"
      ? (w.phantom?.solana ?? w.solana)
      : id === "solflare"
        ? w.solflare
        : w.backpack;
  if (!inj?.connect) throw new Error("Wallet no detectada — instala la extensión");
  const res = (await inj.connect()) ?? {};
  const pk = res?.publicKey?.toString?.() ?? inj.publicKey?.toString?.();
  if (!pk) throw new Error("La wallet no devolvió su pubkey");
  return pk;
}

/** Modal Wallet · Red — wallet firmante (dPaaS), wallets del navegador
 *  (Phantom/MetaMask — varias, una en uso) y red blockchain del agente. */
function WalletModal({ onClose }: { onClose: () => void }) {
  const [ctx, setCtx] = useState<AccountContext | null>(null);
  const [walletLabel, setWalletLabel] = useState(""); // "" = wallet principal (dPaaS)
  const [network, setNetwork] = useState<Network>("devnet");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState<ConnectedWallet[] | null>(null);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

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
        setError(e instanceof Error ? e.message : "Error de red");
      }
    })();
    loadConnected();
  }, []);

  /** Conectar wallet del navegador → pubkey → guardada en la cuenta (en uso). */
  const onConnect = async (id: string) => {
    setConnectingWallet(id);
    setError(null);
    try {
      const pubkey = await connectBrowserWallet(id);
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
      setError(e instanceof Error ? e.message : "Error al conectar la wallet");
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
      setError(e instanceof Error ? e.message : "Error de red");
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
          `${data.lamports} lamports → ${shortKey(data.wallet_pubkey)}`,
      );
      // refrescar contexto de la cuenta
      const ctxRes = await fetch("/api/account/context", { cache: "no-store" });
      const ctxData: AccountContext = await ctxRes.json();
      if (ctxRes.ok && ctxData.ok) setCtx(ctxData);
    } catch (e) {
      setFaucetMsg(e instanceof Error ? e.message : "Error de red");
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
        body: JSON.stringify({ network, active_wallet_label: walletLabel }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(true);
      setTimeout(onClose, 1100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSaving(false);
    }
  };

  const wallets = ctx?.wallets ?? [];

  return (
    <Modal
      title={
        <>
          <Wallet className="size-5 text-primary" />
          Wallet y red del agente
        </>
      }
      onClose={onClose}
    >
      {!ctx && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Cargando contexto de la cuenta…
        </p>
      )}

      {ctx && (
        <>
          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Wallet firmante · Solana (dPaaS)
            </h4>
            <button
              type="button"
              onClick={() => setWalletLabel("")}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                walletLabel === ""
                  ? "border-primary bg-primary/10"
                  : "hover:border-muted-foreground/40",
              )}
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <b className="text-[13px] font-semibold">Wallet principal (dPaaS)</b>
                <small className="text-xs text-muted-foreground">
                  {shortKey(ctx.chain?.wallet_pubkey)} · firma los peajes x402
                </small>
              </span>
              {walletLabel === "" && <Check className="size-4 shrink-0 text-primary" />}
            </button>
            {wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWalletLabel(w.label)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  walletLabel === w.label
                    ? "border-primary bg-primary/10"
                    : "hover:border-muted-foreground/40",
                )}
              >
                <span className="flex flex-1 flex-col gap-0.5">
                  <b className="text-[13px] font-semibold">{w.label}</b>
                  <small className="text-xs text-muted-foreground">
                    {shortKey(w.pubkey)} · {w.network}
                  </small>
                </span>
                {walletLabel === w.label && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            ))}
            {wallets.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sin sub-wallets dPaaS: la cuenta firma con la wallet principal.
              </p>
            )}
          </section>

          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">Devnet</h4>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onFaucet}
                disabled={faucetBusy || network !== "devnet"}
              >
                {faucetBusy ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Droplets />
                )}
                {faucetBusy ? "Goteando…" : "Faucet Devnet"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {faucetMsg ??
                "Transfiere SOL del treasury del ecosistema a TU wallet dPaaS: los peajes x402 quedan con settlement on-chain real (solo devnet)."}
            </p>
          </section>

          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Wallets del navegador
            </h4>
            <div className="flex flex-wrap gap-2">
              {BROWSER_WALLETS.map((bw) => (
                <Button
                  key={bw.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onConnect(bw.id)}
                  disabled={connectingWallet !== null}
                >
                  {connectingWallet === bw.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <bw.icon />
                  )}
                  {connectingWallet === bw.id ? "Conectando…" : bw.label}
                </Button>
              ))}
            </div>
            {connected && connected.length > 0 ? (
              <div className="grid gap-2">
                {connected.map((cw) => (
                  <div
                    key={cw.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3",
                      cw.is_active && "border-primary bg-primary/10",
                    )}
                  >
                    <span className="flex flex-1 flex-col gap-0.5">
                      <b className="flex items-center gap-2 text-[13px] font-semibold">
                        {cw.label}
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {cw.chain}
                        </Badge>
                      </b>
                      <small className="text-xs text-muted-foreground">
                        {shortKey(cw.pubkey)}
                      </small>
                    </span>
                    {cw.is_active ? (
                      <Badge>En uso</Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => useWallet(cw.label)}
                      >
                        Usar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Conecta Phantom, Solflare, Backpack o MetaMask: la clave
                privada nunca sale de tu wallet — la cuenta guarda solo la
                pubkey en su DB (puedes agregar varias; solo una en uso).
              </p>
            )}
          </section>

          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Red blockchain · Solana
            </h4>
            <div className="flex flex-wrap gap-2">
              {NETWORKS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNetwork(n)}
                  className={cn(
                    "cursor-pointer rounded-full border px-4 py-1.5 text-xs capitalize transition-colors",
                    network === n
                      ? "border-transparent bg-primary font-semibold text-primary-foreground"
                      : "text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <p className="flex items-center gap-2 text-[13px] text-emerald-400">
              <CircleCheck className="size-4" />
              Guardado — el agente operará con esta wallet y red.
            </p>
          )}

          <footer className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving && <LoaderCircle className="animate-spin" />}
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </footer>
        </>
      )}
    </Modal>
  );
}

/**
 * Modal Modelos — proveedor LLM del agente, con el mismo flujo que la
 * antigua sección "Configurar proveedor de IA" pero persistiendo en la
 * CUENTA (account_llm en api; api_key sellada AEAD) en vez de en
 * localStorage:
 *
 *  · Sin conexión: proveedor + API key → "Conectar" (valida la key en
 *    vivo contra el proveedor y lista los modelos de chat) → guarda.
 *  · Conectado: "Modelo (N gratis)" (select Gratis/Otros) + Desconectar.
 *    Cambiar de modelo guarda al vuelo; Desconectar borra el LLM de la
 *    cuenta (el agente vuelve al backend global del ecosistema).
 *  · Al abrir: si la cuenta ya tiene proveedor + key guardados,
 *    auto-conecta y muestra directamente el estado conectado.
 */
function ModelsModal({ onClose }: { onClose: () => void }) {
  const [providerIdx, setProviderIdx] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [keyExists, setKeyExists] = useState(false);
  const [models, setModels] = useState<{ id: string; free: boolean }[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const autoConnected = useRef(false);

  const opt = PROVIDER_OPTIONS[providerIdx];
  const freeModels = models.filter((m) => m.free);
  const otherModels = models.filter((m) => !m.free);

  /** Guarda el LLM en la cuenta (sin api_key → conserva la guardada). */
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
    setKeyExists(true);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1600);
    return true;
  };

  /** Conectar: valida la key en vivo + lista modelos + guarda en la cuenta. */
  async function doConnect(params: {
    idx: number;
    key: string;
    baseUrl?: string;
    persistKey?: string; // solo si el usuario escribió una key nueva
    currentModel?: string;
  }) {
    const o = PROVIDER_OPTIONS[params.idx];
    const cur = params.currentModel ?? selectedModel;
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
          model: cur || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setConnected(false);
        setModels([]);
        setStatus({ ok: false, text: data.error ?? `HTTP ${res.status}` });
        return;
      }
      const list: { id: string; free: boolean }[] = data.models ?? [];
      // conserva el modelo actual si sigue disponible; si no, el 1º gratis
      const pick = list.some((m) => m.id === cur)
        ? cur
        : (list.find((m) => m.free) ?? list[0])?.id ?? cur;
      setModels(list);
      setConnected(true);
      setSelectedModel(pick);
      if (data.warning) setStatus({ ok: true, text: `Aviso: ${data.warning}` });

      // conectar = guardar (la key solo si el usuario la escribió ahora)
      const body: Record<string, unknown> = {
        provider: o.apiProvider,
        models: [pick],
        default_model: pick,
      };
      const baseUrl = o.baseUrl ?? params.baseUrl?.trim();
      if (baseUrl) body.base_url = baseUrl;
      if (params.persistKey?.trim()) body.api_key = params.persistKey.trim();
      await saveToAccount(body);
    } catch (e) {
      setConnected(false);
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Error de conexión" });
    } finally {
      setConnecting(false);
    }
  }

  // Al montar: config guardada en la cuenta → preselección + auto-conexión
  useEffect(() => {
    if (autoConnected.current) return; // guard contra StrictMode
    autoConnected.current = true;
    (async () => {
      try {
        const res = await fetch("/api/account/context", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setStatus({ ok: false, text: data.error ?? `HTTP ${res.status}` });
          return;
        }
        const llm: LlmConfig | null = data.llm;
        if (!llm) return;
        setKeyExists(!!llm.api_key);
        // emparejar la config guardada con una opción del modal:
        //  1) match exacto (provider + base_url propios de la opción), y si no
        //  2) la opción genérica del provider (sin baseUrl: NIM/Personalizado —
        //     el validador resuelve el base_url por su cuenta)
        const exact = llm.base_url
          ? PROVIDER_OPTIONS.findIndex(
              (o) => o.apiProvider === llm.provider && o.baseUrl === llm.base_url,
            )
          : -1;
        const idx =
          exact >= 0
            ? exact
            : PROVIDER_OPTIONS.findIndex(
                (o) => o.apiProvider === llm.provider && !o.baseUrl,
              );
        if (idx >= 0) {
          const o = PROVIDER_OPTIONS[idx];
          setProviderIdx(idx);
          // Personalizado: prefill del base_url guardado en la cuenta
          if (!o.baseUrl && llm.base_url) setCustomBaseUrl(llm.base_url);
          if (llm.default_model) setSelectedModel(llm.default_model);
          // auto-conexión con la key guardada → estado conectado directo
          if (llm.api_key || o.keyOptional)
            doConnect({
              idx,
              key: llm.api_key ?? "",
              baseUrl: llm.base_url,
              currentModel: llm.default_model ?? "",
            });
        }
      } catch (e) {
        setStatus({ ok: false, text: e instanceof Error ? e.message : "Error de red" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProvider = (i: number) => {
    setProviderIdx(i);
    setApiKey("");
    setModels([]);
    setConnected(false);
    setStatus(null);
  };

  const conectar = () => {
    // como la sección original: la key es obligatoria salvo proveedores
    // locales (Llama Stack). Sin ella no se conecta ni se guarda nada.
    if (!apiKey.trim() && !opt.keyOptional) {
      setStatus({ ok: false, text: "Pega tu API key primero" });
      return;
    }
    doConnect({
      idx: providerIdx,
      key: apiKey,
      baseUrl: customBaseUrl,
      persistKey: apiKey, // key nueva escrita por el usuario
      currentModel: selectedModel,
    });
  };

  // cambiar de modelo → guarda al vuelo (como la sección original)
  const handleModel = async (id: string) => {
    setSelectedModel(id);
    setStatus(null);
    const body: Record<string, unknown> = {
      provider: opt.apiProvider,
      models: [id],
      default_model: id,
    };
    const baseUrl = opt.baseUrl ?? customBaseUrl.trim();
    if (baseUrl) body.base_url = baseUrl;
    await saveToAccount(body);
  };

  // Desconectar: borra el LLM de la cuenta → backend global
  const desconectar = async () => {
    try {
      const res = await fetch("/api/account/llm", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus({ ok: false, text: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setConnected(false);
      setModels([]);
      setApiKey("");
      setKeyExists(false);
      setStatus(null);
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : "Error de red" });
    }
  };

  return (
    <Modal
      title={
        <>
          <Bot className="size-5 text-primary" />
          Modelos del agente
        </>
      }
      onClose={onClose}
    >
      <section className="grid gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">Proveedor</h4>
        <Select
          value={String(providerIdx)}
          onValueChange={(v) => handleProvider(Number(v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((o, i) => (
              <SelectItem key={o.label} value={String(i)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!connected && opt.apiProvider === "custom" && !opt.baseUrl && (
          <Input
            value={customBaseUrl}
            onChange={(e) => setCustomBaseUrl(e.target.value)}
            placeholder="Base URL OpenAI-compat (https://…/v1)"
          />
        )}
      </section>

      {!connected ? (
        <>
          <section className="grid gap-2">
            <Label>
              API key{" "}
              {keyExists && (
                <span className="text-[11px] font-normal text-emerald-400">
                  ••••• guardada en la cuenta
                </span>
              )}
            </Label>
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
              placeholder={
                opt.keyOptional
                  ? "opcional — pégala y pulsa Enter"
                  : "Pega tu API key y pulsa Enter"
              }
            />
          </section>
          <footer className="flex justify-end">
            <Button type="button" onClick={conectar} disabled={connecting}>
              {connecting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <PlugZap />
              )}
              {connecting ? "Conectando…" : "Conectar"}
            </Button>
          </footer>
        </>
      ) : (
        <>
          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              Modelo {freeModels.length > 0 && `(${freeModels.length} gratis)`}
            </h4>
            <Select value={selectedModel} onValueChange={handleModel}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {freeModels.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Gratis</SelectLabel>
                    {freeModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {otherModels.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Otros</SelectLabel>
                    {otherModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </section>
          <footer className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={desconectar}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Unplug />
              Desconectar
            </Button>
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={onClose}>
              Listo
            </Button>
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
        <p className="flex items-center gap-2 text-[13px] text-emerald-400">
          <CircleCheck className="size-4" />
          Guardado en la cuenta
        </p>
      )}
    </Modal>
  );
}

/** Modal Servicios — dapps del agente; el alta registra el flujo x402 en DB. */
function ServicesModal({ onClose }: { onClose: () => void }) {
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/account/services", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setServices(data.services);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (service: string) => {
    setAdding(service);
    setError(null);
    try {
      const res = await fetch("/api/account/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      await load(); // refresca estado added + snapshot
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setAdding(null);
    }
  };

  return (
    <Modal
      title={
        <>
          <Blocks className="size-5 text-primary" />
          Servicios del agente
        </>
      }
      onClose={onClose}
    >
      {!services && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Cargando catálogo…
        </p>
      )}

      {services?.map((s) => (
        <div
          key={s.service}
          className="flex flex-col items-start gap-2 rounded-xl border p-4"
        >
          <header className="flex items-center gap-2 text-sm">
            <b className="font-semibold">{s.display_name}</b>
            <Badge variant="secondary">x402</Badge>
          </header>
          <small className="text-xs leading-relaxed text-muted-foreground">
            Todo el flujo de esta dapp viaja por el gateway x402 (peaje 402
            firmado por la wallet dPaaS de la cuenta).
          </small>
          <code className="rounded-md border bg-muted px-2 py-1 font-mono text-xs text-primary">
            {s.resource}
          </code>
          {s.added ? (
            <p className="flex items-center gap-2 text-[13px] text-emerald-400">
              <CircleCheck className="size-4" />
              Agregada a la cuenta{s.network ? ` · red ${s.network}` : ""}
              {s.added_at ? ` · ${new Date(s.added_at).toLocaleString()}` : ""}
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => add(s.service)}
              disabled={adding === s.service}
            >
              {adding === s.service ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              {adding === s.service ? "Agregando…" : "Agregar a la cuenta"}
            </Button>
          )}
        </div>
      ))}

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
  const [modal, setModal] = useState<"wallet" | "models" | "services" | "fleet" | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModal("wallet")}
        title="Wallet operativa y red blockchain del agente"
      >
        <Wallet />
        Wallet · Red
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModal("models")}
        title="Proveedor, API key y modelo del agente"
      >
        <Bot />
        Modelos
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModal("services")}
        title="Dapps que el agente usará con x402"
      >
        <Blocks />
        Servicios
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setModal("fleet")}
        title="Flota de dispositivos: emparejar, instalar y monitorear"
      >
        <Radio />
        Flota
      </Button>

      {modal === "wallet" && <WalletModal onClose={() => setModal(null)} />}
      {modal === "models" && <ModelsModal onClose={() => setModal(null)} />}
      {modal === "services" && <ServicesModal onClose={() => setModal(null)} />}
      {modal === "fleet" && <FleetModal onClose={() => setModal(null)} />}
    </>
  );
}
