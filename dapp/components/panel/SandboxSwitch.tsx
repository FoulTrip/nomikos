"use client";
import { useTranslations } from "next-intl";

import { FlaskConical } from "lucide-react";
import { setSandbox, useSandbox } from "@/lib/viewer/sandbox";
import { cn } from "@/lib/utils";

export default function SandboxSwitch() {
  const t = useTranslations("panel.sandbox");
  const on = useSandbox();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setSandbox(!on)}
      title={t("switchTitle")}
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2"
    >
      <FlaskConical className={cn("size-3.5", on ? "text-primary" : "text-muted-foreground")} />
      <span className="hidden text-[11px] whitespace-nowrap text-muted-foreground min-[480px]:inline">
        {t("switchLabel")}
      </span>
      <span
        className={cn(
          "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
          on ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white transition-transform",
            on && "translate-x-3.5",
          )}
        />
      </span>
    </button>
  );
}
