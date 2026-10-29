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
      className="size-9 rounded-full border border-[#EDEDED] shadow-[0_3px_16px_rgba(0,0,0,0.06)]"
    >
      {locked ? <Unlock /> : <Crosshair />}
    </Button>
  );
}
