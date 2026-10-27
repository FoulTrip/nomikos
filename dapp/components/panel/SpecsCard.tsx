"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSandbox } from "@/lib/viewer/sandbox";

export default function SpecsCard({ specs }: { specs: [string, string][] }) {
  const [open, setOpen] = useState(true);
  const sandbox = useSandbox();
  if (!sandbox) return null;
  return (
    <Card className="gap-3 py-4 max-md:hidden">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center justify-between text-xs font-semibold tracking-widest text-primary uppercase">
          Ficha técnica
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            title={open ? "Colapsar" : "Expandir"}
            aria-expanded={open}
            className="size-6"
          >
            {open ? <Minus className="size-4" /> : <Plus className="size-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="px-4">
          <dl className="grid gap-2.5">
            {specs.map(([term, def]) => (
              <div key={term}>
                <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">
                  {term}
                </dt>
                <dd className="mt-0.5 text-[13px]">{def}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      )}
    </Card>
  );
}
