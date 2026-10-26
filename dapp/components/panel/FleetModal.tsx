"use client";
/**
 * FleetModal — NomikOS Fase 2: gestión de flota e instalador web.
 *
 *  · Mi flota: dispositivos de la cuenta (GET /api/account/devices →
 *    api /devices con el Bearer de la sesión) con estado online.
 *  · Emparejar: canje del claim_code que la placa enseña en su pantalla
 *    (POST /api/account/devices/claim → api). La placa recibe su token
 *    al sondear POST /api/devices/token con su enroll_secret.
 *  · Instalador: detección de la placa por USB (Web Serial, VID/PID) +
 *    consola serial en vivo (útil HOY con cualquier firmware) con
 *    autodetección de claim codes → "usar como código". El flasheo web
 *    (esp-web-tools) se activa cuando haya un manifiesto publicado
 *    (firmware de la Fase 3 en /public/installer/manifests/).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  LoaderCircle,
  Radio,
  RefreshCw,
  Send,
  TriangleAlert,
  Unplug,
  Usb,
} from "lucide-react";
import Modal from "./ModalShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface FleetDevice {
  id: string;
  name: string;
  board: string;
  status: string;
  online: boolean;
  last_seen_at: number | null;
  agent_version: string | null;
  daily_limit_lamports: number | null;
  tx_limit_lamports: number | null;
  created_at: number;
}

/** Catálogo de placas soportadas por el instalador. */
const BOARDS = [
  { id: "esp32-s3-amoled-143", label: "ESP32-S3-Touch-AMOLED-1.43", kind: "mcu" as const },
  { id: "rpi4", label: "Raspberry Pi 4 (NomikOS · SBC)", kind: "sbc" as const },
];

/** VID de USB → chip/puente (detección amigable de la placa conectada). */
const VID_NAMES: Record<number, string> = {
  0x303a: "Espressif nativo (ESP32-S2/S3/C3)",
  0x10c4: "Puente SiLabs CP210x (placas ESP32 clásicas)",
  0x1a86: "Puente WCH CH340/CH341",
  0x0403: "Puente FTDI",
};

const CLAIM_RE = /\b[0-9A-F]{8}\b/;

type Tab = "fleet" | "pair" | "install";

function timeAgo(ts: number | null): string {
  if (!ts) return "nunca visto";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
}

export default function FleetModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("fleet");

  // ── Mi flota ──
  const [devices, setDevices] = useState<FleetDevice[] | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);

  const loadFleet = useCallback(async () => {
    setFleetError(null);
    try {
      const res = await fetch("/api/account/devices", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFleetError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setDevices(data.devices ?? []);
    } catch (e) {
      setFleetError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  // ── Emparejar ──
  const [claimCode, setClaimCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimedDev, setClaimedDev] = useState<FleetDevice | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const doClaim = async (code: string) => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setClaiming(true);
    setClaimError(null);
    setClaimedDev(null);
    try {
      const res = await fetch("/api/account/devices/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setClaimError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setClaimedDev(data.device);
      setClaimCode("");
      loadFleet();
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setClaiming(false);
    }
  };

  // ── Instalador: Web Serial ──
  const serialSupported = typeof navigator !== "undefined" && "serial" in navigator;
  const portRef = useRef<SerialPort | null>(null);
  const readingRef = useRef(false);
  const [serialOpen, setSerialOpen] = useState(false);
  const [portLabel, setPortLabel] = useState<string | null>(null);
  const [lines, setLines] = useState<{ text: string; code?: string }[]>([]);
  const [serialError, setSerialError] = useState<string | null>(null);
  const [tx, setTx] = useState("");
  const [manifestState, setManifestState] = useState<"idle" | "checking" | "available" | "pending">("idle");
  const [boardId, setBoardId] = useState(BOARDS[0].id);
  const consoleRef = useRef<HTMLPreElement | null>(null);

  const pushLine = useCallback((raw: string) => {
    const text = raw.replace(/\r/g, "");
    const m = text.match(CLAIM_RE);
    setLines((prev) => {
      const next = [...prev, { text, code: m?.[0] }];
      return next.length > 300 ? next.slice(next.length - 300) : next;
    });
  }, []);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [lines]);

  const startReading = useCallback(
    async (port: SerialPort) => {
      if (!port.readable) return;
      readingRef.current = true;
      const reader = port.readable.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (readingRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop() ?? "";
          for (const p of parts) if (p.trim()) pushLine(p);
        }
      } catch {
        /* puerto cerrado o USB desconectado */
      } finally {
        readingRef.current = false;
        try {
          reader.releaseLock();
        } catch {
          /* ya liberado */
        }
      }
    },
    [pushLine],
  );

  const connectSerial = async () => {
    setSerialError(null);
    if (!serialSupported) {
      setSerialError("Web Serial no disponible en este navegador — usa Chrome o Edge en escritorio.");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      const info = port.getInfo();
      const vid = info.usbVendorId ?? 0;
      const label = VID_NAMES[vid] ?? (vid ? `VID ${vid.toString(16)}` : "puerto serial");
      setPortLabel(label);
      setSerialOpen(true);
      pushLine(`— conectado a ${label} @115200 —`);
      startReading(port);
    } catch (e) {
      setSerialError(e instanceof Error ? e.message : "No se pudo abrir el puerto");
    }
  };

  const disconnectSerial = async () => {
    readingRef.current = false;
    const port = portRef.current;
    portRef.current = null;
    setSerialOpen(false);
    try {
      await port?.close();
      pushLine("— desconectado —");
    } catch {
      /* cierre best-effort */
    }
  };

  const sendSerial = async () => {
    const port = portRef.current;
    const text = tx.trim();
    if (!port?.writable || !text) return;
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(text + "\n"));
      pushLine(`> ${text}`);
      setTx("");
    } finally {
      writer.releaseLock();
    }
  };

  // cierre del modal → liberar el puerto
  useEffect(() => {
    return () => {
      readingRef.current = false;
      portRef.current?.close().catch(() => {});
      portRef.current = null;
    };
  }, []);

  // ── Instalador: manifiesto de firmware (flasheo web) ──
  const checkManifest = async (board: string) => {
    setManifestState("checking");
    try {
      const res = await fetch(`/installer/manifests/${board}.json`, { cache: "no-store" });
      setManifestState(res.ok ? "available" : "pending");
    } catch {
      setManifestState("pending");
    }
  };

  useEffect(() => {
    if (tab === "install") checkManifest(boardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, boardId]);

  const loadEspWebTools = () => {
    if (document.getElementById("esp-web-tools")) return;
    const s = document.createElement("script");
    s.id = "esp-web-tools";
    s.src = "https://unpkg.com/esp-web-tools@latest/dist/web/install-button.js";
    document.head.appendChild(s);
  };

  const board = BOARDS.find((b) => b.id === boardId) ?? BOARDS[0];

  return (
    <Modal
      title={
        <>
          <Radio className="size-5 text-primary" />
          Flota de dispositivos
        </>
      }
      onClose={onClose}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="fleet">Mi flota</TabsTrigger>
          <TabsTrigger value="pair">Emparejar</TabsTrigger>
          <TabsTrigger value="install">Instalador</TabsTrigger>
        </TabsList>

        {/* ───────────────────────── Mi flota ───────────────────────── */}
        <TabsContent value="fleet" className="grid gap-2">
          {!devices && !fleetError && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Cargando flota…
            </p>
          )}
          {devices?.length === 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Sin dispositivos todavía — empareja una placa en la pestaña
              “Emparejar” con el código que muestra en su pantalla.
            </p>
          )}
          {devices?.map((d) => (
            <div key={d.id} className="flex flex-col gap-1 rounded-xl border p-3">
              <header className="flex items-center gap-2 text-[13px]">
                <b className="font-semibold">{d.name}</b>
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    d.online
                      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                      : "bg-muted-foreground/40",
                  )}
                />
                <Badge variant="outline" className="ml-auto text-[10px] text-primary">
                  {d.board}
                </Badge>
              </header>
              <small className="text-xs text-muted-foreground">
                {d.online ? `online · ${timeAgo(d.last_seen_at)}` : `visto ${timeAgo(d.last_seen_at)}`}
                {d.agent_version ? ` · ${d.agent_version}` : ""}
              </small>
              {(d.daily_limit_lamports != null || d.tx_limit_lamports != null) && (
                <code className="w-fit rounded-md border bg-muted px-2 py-0.5 font-mono text-[11px] text-primary">
                  dPaaS: {d.daily_limit_lamports ?? "—"} lamports/día ·{" "}
                  {d.tx_limit_lamports ?? "—"}/tx
                </code>
              )}
            </div>
          ))}
          {fleetError && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{fleetError}</AlertDescription>
            </Alert>
          )}
          <footer className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={loadFleet}>
              <RefreshCw />
              Refrescar
            </Button>
          </footer>
        </TabsContent>

        {/* ───────────────────────── Emparejar ───────────────────────── */}
        <TabsContent value="pair" className="grid gap-3">
          <section className="grid gap-2">
            <Label htmlFor="fleet-claim">Código de emparejado</Label>
            <Input
              id="fleet-claim"
              value={claimCode}
              onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") doClaim(claimCode);
              }}
              placeholder="El código de 8 caracteres de la pantalla del dispositivo"
              maxLength={8}
              className="font-mono tracking-widest"
            />
            <small className="text-xs leading-relaxed text-muted-foreground">
              El dispositivo lo enseña al arrancar (o en la consola serial del
              instalador). Caduca a los 15 minutos.
            </small>
          </section>
          {claimedDev && (
            <p className="flex items-start gap-2 text-[13px] text-emerald-400">
              <CircleCheck className="mt-0.5 size-4 shrink-0" />
              {claimedDev.name} emparejado — la placa recibirá su token al
              sondear (POST /api/devices/token).
            </p>
          )}
          {claimError && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{claimError}</AlertDescription>
            </Alert>
          )}
          <footer className="flex justify-end">
            <Button
              type="button"
              onClick={() => doClaim(claimCode)}
              disabled={claiming || claimCode.trim().length < 8}
            >
              {claiming && <LoaderCircle className="animate-spin" />}
              {claiming ? "Emparejando…" : "Emparejar dispositivo"}
            </Button>
          </footer>
        </TabsContent>

        {/* ───────────────────────── Instalador ───────────────────────── */}
        <TabsContent value="install" className="grid gap-4">
          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">1 · Placa</h4>
            <Select value={boardId} onValueChange={setBoardId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOARDS.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {board.kind === "sbc" && (
              <small className="text-xs leading-relaxed text-muted-foreground">
                SBC: no requiere flasheo por USB — la imagen Buildroot de NomikOS
                (Fase 4) se escribirá en la microSD y la placa se empareja por red
                al primer arranque.
              </small>
            )}
          </section>

          {board.kind === "mcu" && (
            <>
              <section className="grid gap-2">
                <h4 className="text-xs font-medium text-muted-foreground">
                  2 · Flashear desde el navegador
                </h4>
                {manifestState === "checking" && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Consultando manifiesto de firmware…
                  </p>
                )}
                {manifestState === "available" && (
                  <div
                    ref={() => loadEspWebTools()}
                    dangerouslySetInnerHTML={{
                      __html: `<esp-web-install-button manifest="/installer/manifests/${boardId}.json"></esp-web-install-button>`,
                    }}
                  />
                )}
                {manifestState === "pending" && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Firmware en camino (Fase 3: agentd-mini para esta placa). El
                    botón de instalación se activará solo cuando el manifiesto se
                    publique en <code className="text-primary">/installer/manifests/{boardId}.json</code>.
                    Mientras tanto puedes probar la conexión por la consola de
                    abajo con cualquier firmware que ya tenga la placa.
                  </p>
                )}
              </section>

              <section className="grid gap-2">
                <h4 className="text-xs font-medium text-muted-foreground">
                  3 · Consola serial (115200)
                </h4>
                {!serialOpen ? (
                  <Button
                    type="button"
                    onClick={connectSerial}
                    disabled={!serialSupported}
                    className="w-fit"
                  >
                    <Usb />
                    Conectar placa por USB
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={disconnectSerial}
                    className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Unplug />
                    Desconectar {portLabel ? `(${portLabel})` : ""}
                  </Button>
                )}
                {!serialSupported && (
                  <p className="text-xs text-muted-foreground">
                    Requiere Chrome/Edge en escritorio (Web Serial).
                  </p>
                )}
                {serialError && (
                  <Alert variant="destructive">
                    <TriangleAlert />
                    <AlertDescription>{serialError}</AlertDescription>
                  </Alert>
                )}

                <pre
                  ref={consoleRef}
                  className="thin-scroll h-44 overflow-y-auto rounded-lg border bg-black/60 p-2.5 font-mono text-[11.5px] leading-relaxed break-all whitespace-pre-wrap text-[#9fd6b8]"
                >
                  {lines.length === 0
                    ? "— consola en espera —"
                    : lines.map((l, i) => (
                        <span key={i}>
                          {l.text}
                          {l.code && (
                            <button
                              type="button"
                              className="ml-2 inline-block cursor-pointer rounded-md border border-primary bg-primary/15 px-2 text-[10.5px] text-primary"
                              onClick={() => {
                                setClaimCode(l.code!);
                                setTab("pair");
                              }}
                            >
                              usar «{l.code}» como código
                            </button>
                          )}
                          {"\n"}
                        </span>
                      ))}
                </pre>

                {serialOpen && (
                  <div className="flex gap-2">
                    <Input
                      value={tx}
                      onChange={(e) => setTx(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendSerial();
                      }}
                      placeholder="Enviar línea al dispositivo…"
                      className="flex-1"
                    />
                    <Button type="button" variant="ghost" onClick={sendSerial}>
                      <Send />
                      Enviar
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>
      </Tabs>
    </Modal>
  );
}
