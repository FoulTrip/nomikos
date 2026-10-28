"use client";
import { useTranslations } from "next-intl";
/**
 * SandboxIndicator — píldora junto a "Flota", visible solo con el
 * sandbox activo: "Ejecución local" o "Ejecución remota".
 */

import { useEffect, useState } from "react";
import { useSandbox } from "@/lib/viewer/sandbox";
import { cn } from "@/lib/utils";

export default function SandboxIndicator() {
  const t = useTranslations("panel.sandbox");
  const on = useSandbox();
  const [env, setEnv] = useState<"local" | "remote" | null>(null);

  useEffect(() => {
    if (!on) {
      setEnv(null);
      return;
    }
    const h = window.location.hostname;
    setEnv(
      h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h.endsWith(".local")
        ? "local"
        : "remote",
    );
  }, [on]);

  if (!on || !env) return null;
  const local = env === "local";

  return (
    <span
      title={
        local
          ? t("localTitle")
          : t("remoteTitle")
      }
      className="flex h-8 items-center gap-1.5 rounded-full border px-2 text-xs whitespace-nowrap sm:h-9 sm:px-2.5"
    >
      <span className={cn("size-1.5 rounded-full", local ? "bg-emerald-400" : "bg-sky-400")} />
      <span className={cn("hidden min-[480px]:inline", local ? "text-emerald-400" : "text-sky-400")}>
        {local ? t("local") : t("remote")}
      </span>
    </span>
  );
}
