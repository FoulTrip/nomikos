"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Cpu, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AccountDevice {
  id: string;
  name: string;
  board: string;
  online: boolean;
  execution_environment: "sandbox" | "production";
}

const SIMULATOR_ID = "simulator:esp32-s3-touch-amoled-143";
const SIMULATOR_DEVICE = {
  id: SIMULATOR_ID,
  name: "ESP32-S3-Touch-AMOLED-1.43",
  board: "ESP32-S3-Touch-AMOLED-1.43",
  online: true,
  execution_environment: "sandbox" as const,
};
const SELECTION_KEY = "nomikos-selected-sandbox-device";

function DevicePreview({ board }: { board: string }) {
  const isRoundDisplay = /esp32|amoled|round/i.test(board);

  return (
    <div
      aria-hidden="true"
      className="flex h-[72px] w-[68px] shrink-0 items-center justify-center rounded-xl bg-[#F6F4EF]"
    >
      {isRoundDisplay ? (
        <div className="relative flex h-[62px] w-[48px] items-center justify-center rounded-[19px] border border-[#4d525a] bg-gradient-to-br from-[#3d4149] via-[#202329] to-[#101216] shadow-[0_3px_5px_rgba(0,0,0,0.22)]">
          <div className="absolute -top-1 h-2 w-4 rounded-t-sm bg-[#262a30]" />
          <div className="absolute -bottom-1 h-2 w-4 rounded-b-sm bg-[#262a30]" />
          <div className="flex size-[37px] items-center justify-center rounded-full border-[3px] border-[#777d86] bg-black shadow-inner">
            <div className="text-center leading-none text-white">
              <span className="block text-[9px] font-bold tracking-tight">22:37</span>
              <span className="mt-0.5 block text-[4px] text-zinc-400">mié 28 oct</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid size-11 place-items-center rounded-lg border border-[#343433]/15 bg-[#343433] text-white shadow-sm">
          <Cpu className="size-6" />
        </div>
      )}
    </div>
  );
}

export default function DeviceSelect() {
  const t = useTranslations("panel.device");
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [selectedId, setSelectedId] = useState(SIMULATOR_ID);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SELECTION_KEY);
      if (saved) setSelectedId(saved);
    } catch {
      // La selección sigue funcionando mientras este panel permanezca abierto.
    }
  }, []);

  useEffect(() => {
    let current = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/account/devices", { cache: "no-store" });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; devices?: AccountDevice[] }
          | null;
        if (!res.ok || data?.ok !== true) throw new Error("device list unavailable");
        if (current) {
          setDevices(
            (data.devices ?? []).filter(
              (device) => device.execution_environment === "sandbox",
            ),
          );
        }
      } catch {
        if (current) setError(true);
      } finally {
        if (current) setLoading(false);
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [reloadKey]);

  const choose = (id: string) => {
    setSelectedId(id);
    try {
      window.sessionStorage.setItem(SELECTION_KEY, id);
    } catch {
      // La selección sigue activa en el estado del panel.
    }
  };

  const deviceOption = (
    device: AccountDevice,
    label: string,
    detail: string,
  ) => {
    const isSelected = selectedId === device.id;
    return (
      <button
        key={device.id}
        type="button"
        onClick={() => choose(device.id)}
        aria-pressed={isSelected}
        className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
          isSelected
            ? "border-[#343433]/55 bg-[#F6F4EF]"
            : "border-[#EDEDED] bg-white hover:bg-[#FAF9F7]"
        }`}
      >
        <DevicePreview board={device.board} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{label}</span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">{detail}</span>
        </span>
        {isSelected ? (
          <Check className="size-4 shrink-0 text-foreground" />
        ) : (
          <span
            className={`size-2 shrink-0 rounded-full ${device.online ? "bg-emerald-500" : "bg-zinc-300"}`}
            aria-label={device.online ? t("online") : t("offline")}
          />
        )}
      </button>
    );
  };

  return (
    <section className="grid gap-2.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{t("choose")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("description")}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={t("refresh")}
          aria-label={t("refresh")}
          onClick={() => setReloadKey((key) => key + 1)}
          disabled={loading}
          className="size-7"
        >
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>

      <p className="px-1 pt-1 text-[11px] font-medium text-muted-foreground">
        {t("simulatorGroup")}
      </p>
      {deviceOption(SIMULATOR_DEVICE, t("simulator"), SIMULATOR_DEVICE.board)}

      <p className="px-1 pt-2 text-[11px] font-medium text-muted-foreground">
        {t("accountDevices")}
      </p>
      {loading && devices.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-5 text-xs text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t("loading")}
        </p>
      ) : error ? (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {t("loadError")}
        </p>
      ) : devices.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="grid gap-2">
          {devices.map((device) =>
            deviceOption(
              device,
              device.name,
              `${device.board} · ${device.online ? t("online") : t("offline")}`,
            ),
          )}
        </div>
      )}
    </section>
  );
}
