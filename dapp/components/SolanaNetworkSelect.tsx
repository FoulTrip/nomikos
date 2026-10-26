"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/** Redes Solana soportadas por el selector. */
type SolanaNetwork = "local" | "devnet" | "testnet" | "mainnet";

/** Estado de la red vista desde el navegador. */
type NetState = "checking" | "online" | "offline";

const NETWORKS: { id: SolanaNetwork; short: string; label: string }[] = [
  { id: "local", short: "Local", label: "Local · validador (localhost:8899)" },
  { id: "devnet", short: "Devnet", label: "Devnet" },
  { id: "testnet", short: "Testnet", label: "Testnet" },
  { id: "mainnet", short: "Mainnet", label: "Mainnet" },
];

const STATE_LABEL: Record<NetState, string> = {
  checking: "Verificando…",
  online: "Corriendo",
  offline: "Sin conexión",
};

const POLL_MS = 10_000;
const STORAGE_KEY = "solana-network";
const LAMPORTS_PER_SOL = 1_000_000_000;

/** lamports → "1.5" / "0.1234" (recorta ceros finales). */
function formatSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL)
    .toFixed(4)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

/** Acorta una pubkey para el menú: "BMHZ…97w1". */
function shortWallet(pubkey: string): string {
  return pubkey.length > 12 ? `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}` : pubkey;
}

function isSolanaNetwork(v: string | null): v is SolanaNetwork {
  return v === "local" || v === "devnet" || v === "testnet" || v === "mainnet";
}

/**
 * Selector de red Solana con indicador rojo/verde y balance en SOL:
 * permite elegir entre el validador local, devnet, testnet o mainnet;
 * muestra si la red corre (versión + slot) y el saldo de la wallet
 * local en esa red. La elección se guarda en localStorage y el estado
 * se sondea vía /api/solana/status.
 */
export default function SolanaNetworkSelect() {
  const [network, setNetwork] = useState<SolanaNetwork>("devnet");
  const [state, setState] = useState<NetState>("checking");
  const [detail, setDetail] = useState("");
  const [wallet, setWallet] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Descarta respuestas obsoletas al cambiar de red rápidamente.
  const reqIdRef = useRef(0);

  // Red elegida en visitas anteriores.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isSolanaNetwork(saved)) setNetwork(saved);
  }, []);

  const check = useCallback(async (net: SolanaNetwork) => {
    const id = ++reqIdRef.current;
    try {
      const res = await fetch(`/api/solana/status?network=${net}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        running?: boolean;
        version?: string | null;
        slot?: number | null;
        wallet?: string | null;
        balance?: number | null; // lamports
      };
      if (id !== reqIdRef.current) return;
      setState(data.running ? "online" : "offline");
      setWallet(data.wallet ?? "");
      setBalance(data.running ? data.balance ?? null : null);
      if (data.running) {
        const parts = [data.version ?? null, data.slot != null ? `slot ${data.slot}` : null];
        setDetail(parts.filter(Boolean).join(" · "));
      } else {
        setDetail("");
      }
    } catch {
      if (id !== reqIdRef.current) return;
      setState("offline");
      setWallet("");
      setBalance(null);
      setDetail("");
    }
  }, []);

  // Comprobar la red actual + sondeo periódico (se reinicia al cambiar).
  useEffect(() => {
    check(network);
    const id = setInterval(() => check(network), POLL_MS);
    return () => clearInterval(id);
  }, [network, check]);

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

  const choose = (net: SolanaNetwork) => {
    setNetwork(net);
    setState("checking");
    setDetail("");
    setWallet("");
    setBalance(null);
    window.localStorage.setItem(STORAGE_KEY, net);
    setOpen(false);
  };

  const active = NETWORKS.find((n) => n.id === network);
  const short = active?.short ?? network;
  const showBalance = state === "online" && balance != null;

  return (
    <div className="net-select" ref={rootRef}>
      <button
        type="button"
        className="net-select-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Solana ${short}: ${STATE_LABEL[state]}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`net-dot net-dot--${state}`} aria-hidden="true" />
        <span>Solana · {short}</span>
        {showBalance && (
          <span className="net-balance">{formatSol(balance)} SOL</span>
        )}
        <span className="net-chevron" aria-hidden="true">
          <ChevronDown size={12} />
        </span>
      </button>

      {open && (
        <div className="net-menu" role="listbox" aria-label="Red de Solana">
          <div className="net-status">
            <span className={`net-dot net-dot--${state}`} aria-hidden="true" />
            <span>
              {STATE_LABEL[state]}
              {state === "online" && detail ? ` — ${detail}` : ""}
            </span>
          </div>
          {state === "online" &&
            (wallet ? (
              <div className="net-option-detail">
                {showBalance ? `${formatSol(balance)} SOL` : "—"} ·{" "}
                {shortWallet(wallet)}
              </div>
            ) : (
              <div className="net-option-detail">
                Sin wallet local — créala con: solana-keygen new
              </div>
            ))}
          <div className="net-sep" aria-hidden="true" />
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              type="button"
              role="option"
              aria-selected={n.id === network}
              className={`net-option${n.id === network ? " net-option--selected" : ""}`}
              onClick={() => choose(n.id)}
            >
              <span>{n.label}</span>
              {n.id === network && (
                <span className="net-check" aria-hidden="true">
                  <Check size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
