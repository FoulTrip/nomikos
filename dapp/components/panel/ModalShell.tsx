"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setModalOpen } from "@/lib/viewer/view";

/** Contenedor shadcn compartido por Wallet, Modelos, Servicios y Flota. */
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("panel.modal");

  useEffect(() => {
    setModalOpen(true);
    return () => setModalOpen(false);
  }, []);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="theme-light thin-scroll flex max-h-[86vh] w-[calc(100vw-3rem)] max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border-border bg-white p-6 text-[#343433] shadow-lg sm:w-full"
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            {title}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("close")}
              className="size-8 shrink-0"
            >
              <X />
            </Button>
          </DialogClose>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
