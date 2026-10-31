"use client";
import { useTranslations } from "next-intl";

import { Crosshair, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setViewLocked, useViewLocked } from "@/lib/viewer/view";
import { useSandbox } from "@/lib/viewer/sandbox";

export default function ViewLockButton() {
  const t = useTranslations("panel.viewlock");
  const locked = useViewLocked();
  const sandbox = useSandbox();
  if (!sandbox) return null;
  const label = locked ? t("release") : t("engage");
  return (
    <Button
      type="button"
      size="icon"
      variant={locked ? "default" : "secondary"}
      onClick={() => setViewLocked(!locked)}
      title={label}
      aria-label={label}
      className="size-8 rounded-full border border-[#EDEDED] shadow-sm"
    >
      {locked ? <Unlock className="size-3.5" /> : <Crosshair className="size-3.5" />}
    </Button>
  );
}
