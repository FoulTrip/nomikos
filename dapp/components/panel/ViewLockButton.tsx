"use client";

import { Crosshair, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setViewLocked, useViewLocked } from "@/lib/viewer/view";
import { useSandbox } from "@/lib/viewer/sandbox";

export default function ViewLockButton() {
  const locked = useViewLocked();
  const sandbox = useSandbox();
  if (!sandbox) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant={locked ? "default" : "secondary"}
      onClick={() => setViewLocked(!locked)}
      title="Fija la cámara de frente y desactiva la rotación"
      className="w-full"
    >
      {locked ? <Unlock /> : <Crosshair />}
      {locked ? "liberar vista 3D" : "fijar vista de frente"}
    </Button>
  );
}
