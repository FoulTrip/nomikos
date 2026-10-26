"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Estado del ERP visto desde el navegador. */
type ErpState = "checking" | "online" | "offline";

const STATE_LABEL: Record<ErpState, string> = {
  checking: "Verificando…",
  online: "Corriendo",
  offline: "Detenido",
};

/** Intervalo de sondeo del estado del ERP (ms). */
const POLL_MS = 10_000;

/**
 * Selector del ERP (Medusa.js) con indicador rojo/verde:
 * verde = corriendo, rojo = detenido, gris = verificando.
 * Consulta /api/erp/status de forma periódica y al abrirse el
 * menú muestra el estado y la URL del servidor.
 */
export default function ErpStatusSelect() {
  const [state, setState] = useState<ErpState>("checking");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/erp/status", { cache: "no-store" });
      const data = (await res.json()) as { running?: boolean; url?: string };
      setUrl(data.url ?? "");
      setState(data.running ? "online" : "offline");
    } catch {
      setState("offline");
    }
  }, []);

  // Primera comprobación inmediata + sondeo periódico.
  useEffect(() => {
    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [check]);

  // Cerrar el menú al hacer clic fuera del selector.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div className="net-select" ref={rootRef}>
      <button
        type="button"
        className="net-select-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`ERP Medusa.js: ${STATE_LABEL[state]}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`net-dot net-dot--${state}`} aria-hidden="true" />
        <span>ERP · Medusa.js</span>
        <span className="net-chevron" aria-hidden="true">
          <ChevronDown size={12} />
        </span>
      </button>

      {open && (
        <div className="net-menu" role="listbox" aria-label="Estado del ERP">
          <div className="net-status" role="option" aria-selected="true">
            <span className={`net-dot net-dot--${state}`} aria-hidden="true" />
            <span>{STATE_LABEL[state]}</span>
          </div>
          {url && <div className="net-option-detail">{url}</div>}
        </div>
      )}
    </div>
  );
}
