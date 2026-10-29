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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useSandbox } from "@/lib/viewer/sandbox";

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
  execution_environment: "sandbox" | "production";
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
  const sandbox = useSandbox();
  const [tab, setTab] = useState<Tab>("fleet");

  // ── Mi flota ──
  const [devices, setDevices] = useState<FleetDevice[] | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const visibleDevices = devices?.filter((device) =>
    sandbox
      ? device.execution_environment === "sandbox"
      : device.execution_environment === "production",
  ) ?? null;

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
          <Radio className="size-5 text-primary" />
          {t("title")}
          <Badge variant={sandbox ? "secondary" : "outline"}>
            {sandbox ? t("sandboxMode") : t("productionMode")}
          </Badge>
        </>
      }
      onClose={onClose}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-3">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="fleet">{t("tabFleet")}</TabsTrigger>
          <TabsTrigger value="pair">{t("tabPair")}</TabsTrigger>
          <TabsTrigger value="install">{t("tabInstall")}</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet" className="mt-0">
          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="gap-1 px-4 py-3">
              <CardTitle className="flex items-center justify-between gap-2 text-sm">
                {t("tabFleet")}
                {visibleDevices && (
                  <Badge variant="outline">{visibleDevices.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {sandbox ? t("sandboxScope") : t("productionScope")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 px-4 pb-4">
              <div className="flex justify-end">
                <Button type="button" variant="outline" size="sm" onClick={loadFleet}>
                  <RefreshCw />
                  {t("refresh")}
                </Button>
              </div>
              {!devices && !fleetError && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("loading")}
                </p>
              )}
              {visibleDevices?.length === 0 && (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {sandbox ? t("emptySandbox") : t("emptyProduction")}
                </p>
              )}
              {visibleDevices?.map((device) => (
                <Card key={device.id} className="gap-0 py-0 shadow-none">
                  <CardContent className="grid gap-2 p-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-1">
                        <CardTitle className="truncate text-sm">{device.name}</CardTitle>
                        <CardDescription>
                          {device.board}
                          {device.agent_version ? ` · ${device.agent_version}` : ""}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={device.online ? "default" : "secondary"}
                        className="shrink-0"
                      >
                        {device.online ? t("online") : t("offline")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {device.online
                        ? t("onlineAt", { ago: timeAgo(device.last_seen_at, t) })
                        : t("seenAt", { ago: timeAgo(device.last_seen_at, t) })}
                    </p>
                    {(device.daily_limit_lamports != null || device.tx_limit_lamports != null) && (
                      <Badge variant="outline" className="w-fit font-mono text-[11px]">
                        {t("limits", {
                          daily: device.daily_limit_lamports ?? "—",
                          tx: device.tx_limit_lamports ?? "—",
                        })}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
              {fleetError && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>{fleetError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pair" className="mt-0">
          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="gap-1 px-4 py-3">
              <CardTitle className="text-sm">{t("tabPair")}</CardTitle>
              <CardDescription>{t("pairHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 pb-4">
              <div className="grid gap-2">
                <Label htmlFor="fleet-claim">{t("pairLabel")}</Label>
                <Input
                  id="fleet-claim"
                  value={claimCode}
                  onChange={(event) => setClaimCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") doClaim(claimCode);
                  }}
                  placeholder={t("pairPh")}
                  maxLength={8}
                  className="font-mono tracking-widest"
                />
              </div>
              {claimedDev && (
                <div className="flex items-center gap-2 text-sm text-emerald-700">
                  <CircleCheck className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    {t("claimed", { name: claimedDev.name })}
                  </span>
                  <Badge variant="outline">
                    {claimedDev.execution_environment === "sandbox"
                      ? t("sandboxMode")
                      : t("productionMode")}
                  </Badge>
                </div>
              )}
              {claimError && (
                <Alert variant="destructive">
                  <TriangleAlert />
                  <AlertDescription>{claimError}</AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => doClaim(claimCode)}
                  disabled={claiming || claimCode.trim().length < 8}
                >
                  {claiming && <LoaderCircle className="animate-spin" />}
                  {claiming ? t("claiming") : t("pair")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="install" className="mt-0 grid gap-3">
          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="gap-1 px-4 py-3">
              <CardTitle className="text-sm">{t("stepBoard")}</CardTitle>
              {board.kind === "sbc" && (
                <CardDescription>{t("sbcNote")}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Select value={boardId} onValueChange={setBoardId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="theme-light bg-white text-[#343433]">
                  {BOARDS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {board.kind === "mcu" && (
            <>
              <Card className="gap-0 py-0 shadow-none">
                <CardHeader className="gap-1 px-4 py-3">
                  <CardTitle className="text-sm">{t("stepFlash")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 px-4 pb-4">
                  {manifestState === "checking" && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <LoaderCircle className="size-4 animate-spin" />
                      {t("checking")}
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
                    <CardDescription className="leading-relaxed">
                      {t("pendingA")} <code className="text-primary">/installer/manifests/{boardId}.json</code>. {t("pendingB")}
                    </CardDescription>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-0 py-0 shadow-none">
                <CardHeader className="gap-1 px-4 py-3">
                  <CardTitle className="text-sm">{t("stepConsole")}</CardTitle>
                  <CardDescription>
                    {serialOpen
                      ? portLabel ?? t("serialPort")
                      : serialSupported
                        ? t("serialHint")
                        : t("serialRequired")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 px-4 pb-4">
                  {!serialOpen ? (
                    <Button
                      type="button"
                      onClick={connectSerial}
                      disabled={!serialSupported}
                      className="w-fit"
                    >
                      <Usb />
                      {t("connectUsb")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={disconnectSerial}
                      className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Unplug />
                      {t("disconnect")}
                    </Button>
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
                      : lines.map((line, index) => (
                          <span key={index}>
                            {line.text}
                            {line.code && (
                              <button
                                type="button"
                                className="ml-2 inline-block cursor-pointer rounded-md border border-primary bg-primary/15 px-2 text-[10.5px] text-primary"
                                onClick={() => {
                                  setClaimCode(line.code!);
                                  setTab("pair");
                                }}
                              >
                                {t("useAsCode", { code: line.code! })}
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
                        onChange={(event) => setTx(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") sendSerial();
                        }}
                        placeholder={t("sendPh")}
                        className="min-w-0 flex-1"
                      />
                      <Button type="button" variant="outline" onClick={sendSerial}>
                        <Send />
                        {t("send")}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </Modal>
  );
}
