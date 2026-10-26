"use client";
import { useState, useEffect, useRef } from "react";
import { LoaderCircle, Settings, ShieldCheck } from "lucide-react";
import { useOS, sendClientChat, resetOS, useAIClientConfig, setAIClientConfig } from "@/lib/os/store";
import { AI_PROVIDERS, resolveFromClient, listProviderModels } from "@/lib/ai/providers";

type ConsoleMode = "direct" | "gateway";

/** Metadatos del gateway agéntico (brain) para la línea de estado. */
interface GatewayMeta {
  backend?: string;
  model?: string;
  tools?: string;
  shield?: string;
  account?: string;
}

export default function AgentConsole({ mode = "direct" }: { mode?: ConsoleMode }) {
  const [input, setInput] = useState("");
  const [messagesLocal, setMessagesLocal] = useState<{role:string; text:string}[]>([]);
  const cfg = useAIClientConfig();
  const [panelOpen, setPanelOpen] = useState(false);
  const [sendDisabled, setSendDisabled] = useState(false);
  const [result, setResult] = useState<{ok?:boolean; reply?:string; mode?:string; error?:string}|null>(null);
  const [gwMeta, setGwMeta] = useState<GatewayMeta | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // sincronizar messages locales con el store cada vez que cambia
  const os = useOS();
  useEffect(() => {
    // gateway: la conversación es de la cuenta (no del OS simulado) — sin
    // bienvenida ni historial del dispositivo.
    if (mode === "gateway" || !os?.messages) return;
    const arr: {role:string; text:string}[] = os.messages.map(m => ({role: m.role, text: m.text || ""}));
    setMessagesLocal(arr);
  }, [os?.messages, mode]);

  // cuando el result llega del servidor, lo mostramos un momento y luego limpiamos
  useEffect(() => {
    if (!result) return;
    if (result.ok) {
      // añadimos la respuesta del agente a los messages locales para reflejar al instante
      setMessagesLocal(prev => {
        const nuevo = prev.concat({role: "agent", text: result.reply || ""});
        return nuevo;
      });
      setResult(null);
      // limpiar input
      setInput("");
      inputRef.current?.focus();
      return;
    }
    // errores: visibles en ambos modos (antes se descartaban en silencio)
    if (result.error) {
      setMessagesLocal(prev =>
        prev.concat({role: "agent", text: `Error: ${result.error}`}),
      );
      setResult(null);
      setInput("");
    }
  }, [result]);

  // handler enviar
  const handleSend = async () => {
    const t = input.trim();
    if (!t || sendDisabled) return;
    setSendDisabled(true);

    // Modo gateway: el Bearer de la sesión viaja server-side hacia brain,
    // que resuelve el contexto de la cuenta (LLM, wallet dPaaS, shields).
    if (mode === "gateway") {
      try {
        const res = await fetch("/api/agent/gateway", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: t }),
        });
        const data = await res.json().catch(() => null);
        if (!data) {
          setResult({ok: false, error: `HTTP ${res.status}`});
        } else {
          setGwMeta({
            backend: data.backend,
            model: data.model,
            tools: Array.isArray(data.tools_used) ? data.tools_used.join(", ") : undefined,
            shield: data.shield_in?.verdict,
            account: data.account?.email,
          });
          setResult(
            data.ok
              ? {ok: true, reply: data.reply}
              : {ok: false, error: data.error || `HTTP ${res.status}`},
          );
        }
      } catch (e: any) {
        setResult({ok: false, error: e.message || "Error de red"});
      } finally {
        setSendDisabled(false);
      }
      return;
    }

    try {
      const data = await sendClientChat(t, cfg.provider === "custom" && cfg.apiKey ? {provider:"custom", baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey} : undefined);
      setResult(data);
    } catch (e: any) {
      setResult({ok: false, error: e.message || "Error desconocido"});
    } finally {
      setSendDisabled(false);
    }
  };

  // abrir/cerrar panel de configuración
  const togglePanel = () => setPanelOpen(!panelOpen);

  // cuando el usuario selecciona un proveedor en el panel, actualizar config local
  const onProviderChange = (provider: "nvidia" | "meta" | "custom") => {
    setAIClientConfig({provider});
    setPanelOpen(false);
  };

  // ayuda: ejemplo de mensajes rápidos
  const quickAnswers =
    mode === "gateway"
      ? [
          "Dame el estado de salud de la API",
          "Muéstrame la ficha técnica del dispositivo",
          "Resumen de pagos x402",
        ]
      : [
          "¿Qué sabes hacer?",
          "Cuéntame un dato del ESP32-S3",
          "Modo avión ON",
        ];

  return (
    <div className="console-panel">
      {mode === "direct" && (
        <header>
          <span>Muse Console</span>
          <button
            onClick={togglePanel}
            title="Configurar proveedor de IA"
            style={{float:"right",background:"none",border:"1px solid var(--border)",padding:"4px 8px",borderRadius:"6px",color:"var(--muted)"}}
          >
            <Settings size={14} style={{verticalAlign:"middle"}} />
          </button>
        </header>
      )}

      {mode === "gateway" && gwMeta && (
        <div style={{fontSize:"11px",color:"var(--muted)",padding:"2px 12px 6px",borderBottom:"1px solid var(--border)"}}>
          {gwMeta.backend ?? "—"}
          {gwMeta.model ? ` · ${gwMeta.model}` : ""}
          {gwMeta.shield ? <> · <ShieldCheck size={12} style={{verticalAlign:"middle",display:"inline"}} /> {gwMeta.shield}</> : ""}
          {gwMeta.tools ? ` · tools: ${gwMeta.tools}` : ""}
          {gwMeta.account ? ` · ${gwMeta.account}` : ""}
        </div>
      )}

      <section className="bubble-list" style={{maxHeight:"40vh",overflowY:"auto",padding:"12px",gap:"8px"}}>
        {messagesLocal.map((m,i) => (
          <div
            key={i}
            style={{
              display:"flex",
              justifyContent:m.role==="agent"?"flex-end":"flex-start",
              alignItems:m.role==="agent"?"flex-end":"flex-start",
            }}
          >
            <div
              style={{
                maxWidth:m.role==="agent"?260:240,
                padding:m.role==="agent"?12:10,
                borderRadius:m.role==="agent"?14:8,
                background:m.role==="agent"?"#121f2a":"#1a2332",
                color:"#e8eaf0",
                fontSize:"13px",
                lineHeight:"1.4",
                wordBreak:"break-word",
                margin:m.role==="agent"?`0 0 0 8px`:`0 8px 0 0`,
              }}
            >
              <b>{m.role==="agent"?"Muse":"Tú"}:</b> {m.text}
            </div>
          </div>
        ))}
        {/* typing dots while sending (gateway: fetch agéntico real en curso) */}
        {(mode === "gateway" && sendDisabled) || (result?.ok && !result.reply) ? (
          <div style={{alignSelf:"flex-end",marginTop:4}}>
            <span style={{marginRight:4}}>Muse:</span>
            <LoaderCircle size={14} className="animate-spin" style={{color:"#64ffda"}} />
          </div>
        ) : null}
      </section>

      {/* quick-answers solo en modo directo (gateway: consola limpia) */}
      {mode === "direct" && (
        <section className="quick-answers" style={{marginTop:8}}>
          {quickAnswers.map((q,i)=>(
            <button
              key={i}
              onClick={() => {
                setInput(q);
                handleSend();
              }}
              style={{
                marginRight:6,marginBottom:6,background:"#1a2332",border:"1px solid var(--border)",color:"#e8eaf0",padding:"6px 10px",borderRadius:"6px",fontSize:"12px",cursor:"pointer"
              }}
            >
              {q}
            </button>
          ))}
        </section>
      )}

      <footer style={{display:"flex",gap:8,marginTop:8}}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e)=>setInput(e.target.value)}
          onKeyDown={(e)=>{if(e.key==="Enter"){handleSend();}}}
          placeholder="Escribe un mensaje…"
          style={{
            flex:1,background:"#1a2332",border:"1px solid var(--border)",color:"#e8eaf0",
            padding:"8px 10px",borderRadius:"6px",fontSize:"13px",resize:"none",minHeight:40,maxHeight:120
          }}
          disabled={sendDisabled}
          aria-label="Mensaje para Muse"
        />
        <button
          onClick={handleSend}
          disabled={sendDisabled}
          style={{
            background:"#5ea1ff",color:"#0b0d12",padding:"8px 14px",borderRadius:"6px",
            border:"none",fontWeight:"500",cursor:sendDisabled?"not-allowed":"pointer"
          }}
        >
          Enviar
        </button>
      </footer>

      {/* Panel deslizante de configuración AI */}
      {panelOpen && (
        <div
          style={{
            position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9999,
            display:"flex",flexDirection:"column"
          }}
        >
          <h3 style={{padding:12,margin:0,color:"#e8eaf0",borderBottom:"1px solid var(--border)"}}>
            Configurar proveedor de IA
            <button onClick={togglePanel} style={{float:"right",background:"none",border:"none",color:"#64ffda"}}>&times;</button>
          </h3>
          <div style={{padding:12,flex:1,overflowY:"auto"}}>
            <label style={{display:"block",marginBottom:6,fontSize:"14px",color:"#9aa3b2"}}>
              Proveedor
              <select
                onChange={(e)=>onProviderChange(e.target.value as any)}
                style={{width:"100%",background:"#0b0d12",border:"1px solid var(--border)",color:"#e8eaf0",padding:"6px",borderRadius:"4px",marginBottom:10}}
              >
                <option value="nvidia">NVIDIA NIM</option>
                <option value="meta">Meta Llama API</option>
                <option value="custom">Personalizado</option>
              </select>
            </label>

            {cfg.provider === "custom" ? (
              <div style={{marginBottom:12}}>
                <label style={{fontSize:"13px",color:"#64ffda",marginBottom:4}}>Base URL</label>
                <input
                  type="text"
                  value={cfg.baseUrl||""}
                  onChange={(e)=>setAIClientConfig({baseUrl:e.target.value})}
                  style={{width:"100%",background:"#0b0d12",border:"1px solid var(--border)",color:"#e8eaf0",padding:"6px",borderRadius:"4px"}}
                />
              </div>
            ) : (
              <input type="hidden" />
            )}

            <label style={{fontSize:"13px",color:"#9aa3b2",marginBottom:4,marginTop:10}}>Modelo</label>
            <input
              type="text"
              value={cfg.model||""}
              onChange={(e)=>setAIClientConfig({model:e.target.value})}
              style={{width:"100%",background:"#0b0d12",border:"1px solid var(--border)",color:"#e8eaf0",padding:"6px",borderRadius:"4px"}}
            />

            {cfg.provider !== "custom" ? (
              <>
                <label style={{fontSize:"13px",color:"#9aa3b2",marginBottom:4,marginTop:10}}>API Key (se envía por petición)</label>
                <input
                  type="password"
                  value={cfg.apiKey||""}
                  onChange={(e)=>setAIClientConfig({apiKey:e.target.value})}
                  style={{width:"100%",background:"#0b0d12",border:"1px solid var(--border)",color:"#e8eaf0",padding:"6px",borderRadius:"4px"}}
                  placeholder="••••••••"
                />
              </>
            ) : (
              <p style={{fontSize:"12px",color:"#64ffda",marginTop:6}}>
                La clave se guarda solo en tu navegador (localStorage). Se envía al servidor solo para la petición actual.
              </p>
            )}

            <div style={{marginTop:12,display:"flex",gap:8}}>
              <button
                onClick={()=>{setAIClientConfig({provider:"nvidia",baseUrl:"",model:"meta/llama-3.1-8b-instruct",apiKey:""});togglePanel();}}
                style={{flex:1,background:"#1a2332",border:"1px solid var(--border)",color:"#e8eaf0",padding:"8px",borderRadius:"4px"}}
              >
                Cancelar
              </button>
              <button
                onClick={togglePanel}
                style={{flex:1,background:"#5ea1ff",color:"#0b0d12",padding:"8px",borderRadius:"4px",border:"none"}}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}