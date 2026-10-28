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
  return (
    <Button
      type="button"
      size="sm"
      variant={locked ? "default" : "secondary"}
      onClick={() => setViewLocked(!locked)}
      title={t("title")}
      className="w-full"
    >
      {locked ? <Unlock /> : <Crosshair />}
      {locked ? t("release") : t("engage")}
    </Button>
  );
}
