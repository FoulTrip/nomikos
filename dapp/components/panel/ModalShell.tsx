"use client";
/** ModalShell — overlay + tarjeta de los modales del panel del dapp (estilo shadcn). */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Portal a body: los modales se montan dentro del <header>, que lleva
  // backdrop-blur — y backdrop-filter crea un containing block que rompe
  // `fixed` (el inset-0 se resolvía contra el header y el modal salía
  // arriba del todo). El guard mounted evita mismatch de hidratación.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5"
      onClick={onClose}
    >
      <div
        className="thin-scroll flex max-h-[86vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-6 shadow-lg"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b pb-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            {title}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar"
            className="size-8 shrink-0"
          >
            <X />
          </Button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
