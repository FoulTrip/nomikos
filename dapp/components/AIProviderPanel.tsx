"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AI_PROVIDERS } from "@/lib/ai/providers";
import {
  useAIClientConfig,
  setAIClientConfig,
  type AIClientConfig,
} from "@/lib/os/store";

type Provider = string; // ABIERTO: cualquier proveedor OpenAI-compatible
type Status = { ok: boolean; text: string } | null;
type ModelEntry = { id: string; free: boolean };

const DEFAULT_DRAFT: AIClientConfig = {
  provider: "nvidia",
  baseUrl: "",
  model: "meta/llama-3.1-8b-instruct",
  apiKey: "",
};

export default function AIProviderPanel() {
  const [draft, setDraft] = useState<AIClientConfig>(DEFAULT_DRAFT);
  const [status, setStatus] = useState<Status>(null);
  const [connecting, setConnecting] = useState(false);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const autoConnected = useRef(false);

  // Al montar: cargar la config guardada y reconectar si ya hay key
  useEffect(() => {
    if (autoConnected.current) return; // guard contra StrictMode
    autoConnected.current = true;
    const stored = useAIClientConfig();
    setDraft(stored);
    if (stored.apiKey?.trim()) conectar(stored);
  }, []);

  const providersOptions = (Object.keys(AI_PROVIDERS) as Provider[]).map((k) => ({
    value: k,
    label: AI_PROVIDERS[k].label,
  }));

  const patch = (changes: Partial<AIClientConfig>, resetConn = false) => {
    setDraft((d) => ({ ...d, ...changes }));
    setStatus(null);
    if (resetConn) {
      setConnected(false);
      setModels([]);
    }
  };

  const handleProvider = (p: Provider) => {
    const info = AI_PROVIDERS[p];
    setDraft({
      ...draft,
      provider: p,
      baseUrl: info.baseUrl,
      model: info.models[0] || "",
      apiKey: "",
    });
    setStatus(null);
    setConnected(false);
    setModels([]);
  };

  // ---------- Conectar: valida la key y lista los modelos ----------
  async function conectar(cfgOverride?: AIClientConfig) {
    const cfg = cfgOverride ?? draft;
    if (!cfg.apiKey.trim()) {
      setStatus({ ok: false, text: "Pega tu API key primero" });
      return;
    }
    setConnecting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ai/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: cfg.provider,
          baseUrl: cfg.provider === "custom" ? cfg.baseUrl : undefined,
          apiKey: cfg.apiKey,
          model: cfg.model || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      const validated = data?.ok;
      let list: ModelEntry[] = validated ? (data.models || []) : [];
      if (!validated) {
        // validación en vivo no disponible (proveedor sin /models, ping falló, …):
        // guardamos sin validación estricta, al estilo opencode.
        list = (AI_PROVIDERS[cfg.provider]?.models.map((id) => ({ id, free: false })) ?? []);
        setStatus({
          ok: true,
          text: "Saved without live validation — the key will be tested on the first chat.",
        });
      }
      setModels(list);
      if (validated) setConnected(true);

      // mantener el modelo actual si sigue en la lista; si no, el 1º gratis
      const keep = list.some((m) => m.id === cfg.model);
      const pick =
        keep ? cfg.model : (list.find((m) => m.free) ?? list[0])?.id || cfg.model;
      const next = { ...cfg, model: pick };
      setDraft(next);
      await setAIClientConfig(next); // persistir al conectar
    } catch (e: any) {
      setConnected(false);
      setStatus({ ok: false, text: e?.message || "Error de conexión" });
    } finally {
      setConnecting(false);
    }
  }

  // ---------- Desconectar: quita la key y vuelve al estado inicial ----------
  const desconectar = async () => {
    const next = { ...draft, apiKey: "" };
    setDraft(next);
    setModels([]);
    setConnected(false);
    setStatus(null);
    await setAIClientConfig(next); // sin key guardada no auto-reconecta
  };

  // elegir modelo del select → guardar al vuelo
  const handleModel = async (id: string) => {
    const next = { ...draft, model: id };
    setDraft(next);
    setStatus(null);
    await setAIClientConfig(next);
  };

  const freeModels = models.filter((m) => m.free);
  const otherModels = models.filter((m) => !m.free);

  return (
    <div className="specs ai-config">
      <h2>Configurar proveedor de IA</h2>

      <label className="field">
        <span>Proveedor</span>
        <select
          value={draft.provider}
          onChange={(e) => handleProvider(e.target.value as Provider)}
        >
          {providersOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {!connected && (
        <>
          {draft.provider === "custom" && (
            <label className="field">
              <span>Base URL</span>
              <input
                type="text"
                value={draft.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value }, true)}
                placeholder="https://api.ejemplo.com/v1"
              />
            </label>
          )}

          <label className="field">
            <span>API Key</span>
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => patch({ apiKey: e.target.value }, true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  conectar();
                }
              }}
              placeholder="Pega tu API key y pulsa Enter"
            />
          </label>

          <div className="ai-config-actions">
            <button
              className="primary"
              onClick={() => conectar()}
              disabled={connecting}
            >
              {connecting ? "Conectando…" : "Conectar"}
            </button>
          </div>
        </>
      )}

      {connected && models.length > 0 && (
        <>
          <label className="field">
            <span>
              Modelo {freeModels.length > 0 && `(${freeModels.length} gratis)`}
            </span>
            <select
              value={draft.model}
              onChange={(e) => handleModel(e.target.value)}
            >
              {freeModels.length > 0 && (
                <optgroup label="Gratis">
                  {freeModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherModels.length > 0 && (
                <optgroup label="Otros">
                  {otherModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <div className="ai-config-actions">
            <button onClick={desconectar}>Desconectar</button>
          </div>
        </>
      )}

      {/* solo se muestran errores (y solo cuando no está conectado) */}
      {!connected && status && !status.ok && (
        <p className="ai-config-result err"><X size={12} style={{verticalAlign:"middle",display:"inline"}} /> {status.text}</p>
      )}
    </div>
  );
}
