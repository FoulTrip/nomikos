export interface AIProviderInfo {
  id: "nvidia" | "meta" | "custom";
  label: string;
  baseUrl: string;
  models: string[];
  envKey: string;
  docs: string;
}

export const AI_PROVIDERS: Record<string, AIProviderInfo> = {
  nvidia: {
    id: "nvidia",
    label: "NVIDIA NIM",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    models: [
      "meta/llama-3.1-8b-instruct",
      "meta/llama-3.3-70b-instruct",
      "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      "deepseek-ai/deepseek-r1-distill-llama-8b",
    ],
    envKey: "NVIDIA_API_KEY",
    docs: "https://build.nvidia.com",
  },
  meta: {
    id: "meta",
    label: "Meta Llama API",
    baseUrl: "https://api.llama.com/compat/v1",
    models: [
      "Llama-3.3-70B-Instruct",
      "Llama-4-Scout-17B-16E-Instruct",
      "Llama-4-Maverick-17B-128E-Instruct-FP8",
    ],
    envKey: "META_LLAMA_API_KEY",
    docs: "https://www.llama.com/llama-api",
  },
  custom: {
    id: "custom",
    label: "Personalizado (OpenAI-compatible)",
    baseUrl: "",
    models: [],
    envKey: "CUSTOM_API_KEY",
    docs: "",
  },
};

export interface ResolvedAIConfig {
  provider: "nvidia" | "meta" | "custom";
  baseUrl: string;
  model: string;
  apiKey: string;
}

// Resolve from env (server) — si la key está puesta, retorna la config; si no, null.
export function resolveFromEnv(provider: "nvidia" | "meta" | "custom"): ResolvedAIConfig | null {
  const info = AI_PROVIDERS[provider];
  if (!info) return null;
  const key = process.env[info.envKey];
  if (!key) return null;
  return {
    provider,
    baseUrl: info.baseUrl,
    model: info.models[0] || "meta/llama-3.1-8b-instruct",
    apiKey: key,
  };
}

// Resolve from client-provided config (localStorage; used when UI sets custom values)
export function resolveFromClient(raw: {
  provider?: "nvidia" | "meta" | "custom";
  baseUrl?: string;
  model?: string;
  apiKey?: string;
} | undefined): ResolvedAIConfig | null {
  if (!raw) return null;
  const p = raw.provider ?? "nvidia";
  const info = AI_PROVIDERS[p];
  if (!info) return null;
  const baseUrl = (raw.baseUrl && raw.baseUrl.trim()) || info.baseUrl;
  const model = (raw.model && raw.model.trim()) || info.models[0] || "";
  const apiKey = (raw.apiKey && raw.apiKey.trim()) || process.env[info.envKey] || "";
  if (!baseUrl || !model || !apiKey) return null;
  return { provider: p, baseUrl: baseUrl.replace(/\/+$/, ""), model, apiKey };
}

// -----------------------------------------------------------------
// llamada al proveedor (usando fetch, isomorphic)
export async function chatWithProvider(cfg: ResolvedAIConfig, messages: any[]): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: 140,
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "error sin cuerpo");
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Sin respuesta del proveedor.";
}

// -----------------------------------------------------------------
// utils de selección para el panel UI
export function listProviderModels(provider: "nvidia" | "meta" | "custom"): string[] {
  return (AI_PROVIDERS[provider]?.models ?? []);
}