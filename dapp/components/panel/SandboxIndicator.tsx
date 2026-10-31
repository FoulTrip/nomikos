"use client";
import { useTranslations } from "next-intl";
/**
 * SandboxIndicator — píldora junto a "Flota", visible solo con el
 * sandbox activo: "Ejecución local" o "Ejecución remota".
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
    <Badge
      variant="outline"
      title={
        local
          ? t("localTitle")
          : t("remoteTitle")
      }
      className="h-7 gap-1 rounded-full border-[#EDEDED] bg-white px-1.5 text-[11px] font-normal whitespace-nowrap sm:h-8 sm:px-2 sm:text-xs"
    >
      <span className={cn("size-1 rounded-full", local ? "bg-emerald-500" : "bg-sky-500")} />
      <span className={cn("hidden min-[480px]:inline", local ? "text-emerald-700" : "text-sky-700")}>
        {local ? t("local") : t("remote")}
      </span>
    </Badge>
  );
}
