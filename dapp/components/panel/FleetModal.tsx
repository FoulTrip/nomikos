"use client";
import { useTranslations } from "next-intl";
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
const VID_KEYS: Record<number, string> = {
  0x303a: "native",
  0x10c4: "cp210x",
  0x1a86: "ch340",
  0x0403: "ftdi",
};

const CLAIM_RE = /\b[0-9A-F]{8}\b/;

type Tab = "fleet" | "pair" | "install";

function timeAgo(ts: number | null, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (!ts) return t("never");
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return t("agoS", { s });
  if (s < 3600) return t("agoM", { m: Math.round(s / 60) });
  return t("agoH", { h: Math.round(s / 3600) });
}

export default function FleetModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("fleet");
  const tc = useTranslations("common");
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
      setFleetError(e instanceof Error ? e.message : tc("networkError"));
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
      setClaimError(e instanceof Error ? e.message : tc("networkError"));
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
      setSerialError(t("errSerial"));
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      const info = port.getInfo();
      const vid = info.usbVendorId ?? 0;
      const vidKey = VID_KEYS[vid];
      const label = vidKey ? t(`vid.${vidKey}`) : vid ? `VID ${vid.toString(16)}` : t("serialPort");
      setPortLabel(label);
      setSerialOpen(true);
      pushLine(t("connectedTo", { label }));
      startReading(port);
    } catch (e) {
      setSerialError(e instanceof Error ? e.message : t("errOpenPort"));
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
          <Radio className="size-5 text-primary" />{t("title")}</>
      }
      onClose={onClose}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="fleet">{t("tabFleet")}</TabsTrigger>
          <TabsTrigger value="pair">{t("tabPair")}</TabsTrigger>
          <TabsTrigger value="install">{t("tabInstall")}</TabsTrigger>
        </TabsList>

        {/* ───────────────────────── Mi flota ───────────────────────── */}
        <TabsContent value="fleet" className="grid gap-2">
          {!devices && !fleetError && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />{t("loading")}</p>
          )}
          {devices?.length === 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("empty")}
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
                {d.online ? t("onlineAt", { ago: timeAgo(d.last_seen_at, t) }) : t("seenAt", { ago: timeAgo(d.last_seen_at, t) })}
                {d.agent_version ? ` · ${d.agent_version}` : ""}
              </small>
              {(d.daily_limit_lamports != null || d.tx_limit_lamports != null) && (
                <code className="w-fit rounded-md border bg-muted px-2 py-0.5 font-mono text-[11px] text-primary">
                  {t("limits", { daily: d.daily_limit_lamports ?? "—", tx: d.tx_limit_lamports ?? "—" })}
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
              <RefreshCw />{t("refresh")}</Button>
          </footer>
        </TabsContent>

        {/* ───────────────────────── Emparejar ───────────────────────── */}
        <TabsContent value="pair" className="grid gap-3">
          <section className="grid gap-2">
            <Label htmlFor="fleet-claim">{t("pairLabel")}</Label>
            <Input
              id="fleet-claim"
              value={claimCode}
              onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") doClaim(claimCode);
              }}
              placeholder={t("pairPh")}
              maxLength={8}
              className="font-mono tracking-widest"
            />
            <small className="text-xs leading-relaxed text-muted-foreground">
              {t("pairHint")}
            </small>
          </section>
          {claimedDev && (
            <p className="flex items-start gap-2 text-[13px] text-emerald-400">
              <CircleCheck className="mt-0.5 size-4 shrink-0" />
              {t("claimed", { name: claimedDev.name })}
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
              {claiming ? t("claiming") : t("pair")}
            </Button>
          </footer>
        </TabsContent>

        {/* ───────────────────────── Instalador ───────────────────────── */}
        <TabsContent value="install" className="grid gap-4">
          <section className="grid gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">{t("stepBoard")}</h4>
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
                {t("sbcNote")}
              </small>
            )}
          </section>

          {board.kind === "mcu" && (
            <>
              <section className="grid gap-2">
                <h4 className="text-xs font-medium text-muted-foreground">{t("stepFlash")}</h4>
                {manifestState === "checking" && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LoaderCircle className="size-3.5 animate-spin" />{t("checking")}</p>
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
                    {t("pendingA")} <code className="text-primary">/installer/manifests/{boardId}.json</code>.
                    {t("pendingB")}
                  </p>
                )}
              </section>

              <section className="grid gap-2">
                <h4 className="text-xs font-medium text-muted-foreground">{t("stepConsole")}</h4>
                {!serialOpen ? (
                  <Button
                    type="button"
                    onClick={connectSerial}
                    disabled={!serialSupported}
                    className="w-fit"
                  >
                    <Usb />{t("connectUsb")}</Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={disconnectSerial}
                    className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Unplug />
                    {t("disconnect")} {portLabel ? `(${portLabel})` : ""}
                  </Button>
                )}
                {!serialSupported && (
                  <p className="text-xs text-muted-foreground">{t("serialRequired")}</p>
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
                    ? t("consoleWaiting")
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
                              {t("useAsCode", { code: l.code! })}
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
                      placeholder={t("sendPh")}
                      className="flex-1"
                    />
                    <Button type="button" variant="ghost" onClick={sendSerial}>
                      <Send />{t("send")}</Button>
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
