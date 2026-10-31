"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Cpu, LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AccountDevice {
  id: string;
  name: string;
  board: string;
  online: boolean;
  agent_version?: string | null;
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

interface DeviceBadge {
  label: string;
  state?: "online" | "offline";
}

function isNomikosSimulator(device: AccountDevice): boolean {
  const board = device.board.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const name = device.name.trim().toLowerCase();
  return (
    device.agent_version === "nomikos-sim-0.1" ||
    (name === "nomikos sim (docker)" && board === "esp32-s3-amoled-143")
  );
}

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
  const [accountSimulator, setAccountSimulator] = useState<AccountDevice | null>(null);
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
          const sandboxDevices = (data.devices ?? []).filter(
            (device) => device.execution_environment === "sandbox",
          );
          const simulators = sandboxDevices.filter(isNomikosSimulator);
          setAccountSimulator(simulators[0] ?? null);
          setDevices(sandboxDevices.filter((device) => !isNomikosSimulator(device)));
          setSelectedId((currentId) =>
            simulators.some((device) => device.id === currentId) ? SIMULATOR_ID : currentId,
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
    badges: DeviceBadge[],
  ) => {
    const isSelected = selectedId === device.id;
    return (
      <div
        key={device.id}
        role="group"
        aria-label={label}
        className={`grid w-full grid-cols-[68px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border p-2 transition-colors ${
          isSelected
            ? "border-[#343433]/55 bg-[#F6F4EF]"
            : "border-[#EDEDED] bg-white"
        }`}
      >
        <div className="row-span-2">
          <DevicePreview board={device.board} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label}</p>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <span
                key={`${badge.label}-${badge.state ?? "label"}`}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  badge.state === "online"
                    ? "bg-emerald-50 text-emerald-700"
                    : badge.state === "offline"
                      ? "bg-zinc-100 text-zinc-600"
                      : "bg-[#EDEBE6] text-[#55534E]"
                }`}
              >
                {badge.state && (
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${
                      badge.state === "online" ? "bg-emerald-500" : "bg-zinc-400"
                    }`}
                  />
                )}
                {badge.label}
              </span>
            ))}
          </span>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => choose(device.id)}
            aria-pressed={isSelected}
            disabled={isSelected}
            className={`min-w-[84px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default ${
              isSelected
                ? "bg-[#E9E6DF] text-[#625F58]"
                : "bg-[#171717] text-white hover:bg-[#343433]"
            }`}
          >
            {isSelected ? t("inUse") : t("use")}
          </button>
        </div>
      </div>
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
      {deviceOption(
        { ...SIMULATOR_DEVICE, online: accountSimulator?.online ?? SIMULATOR_DEVICE.online },
        SIMULATOR_DEVICE.board,
        [
          { label: "NomikOS" },
          {
            label: (accountSimulator?.online ?? SIMULATOR_DEVICE.online)
              ? t("online")
              : t("offline"),
            state: (accountSimulator?.online ?? SIMULATOR_DEVICE.online)
              ? "online"
              : "offline",
          },
        ],
      )}

      {devices.length > 0 && (
        <>
          <p className="px-1 pt-2 text-[11px] font-medium text-muted-foreground">
            {t("accountDevices")}
          </p>
          <div className="grid gap-2">
            {devices.map((device) =>
              deviceOption(
                device,
                device.name,
                [
                  { label: device.board },
                  {
                    label: device.online ? t("online") : t("offline"),
                    state: device.online ? "online" : "offline",
                  },
                ],
              ),
            )}
          </div>
        </>
      )}
      {loading && devices.length === 0 && (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-5 text-xs text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t("loading")}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {t("loadError")}
        </p>
      )}
    </section>
  );
}
