"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";

export default function AccountMenu({
  email,
  accountId,
}: {
  email: string;
  accountId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={accountId ? `${email} · ${accountId}` : email}
        aria-label={email}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground select-none"
      >
        {(email || "?").slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-10 right-0 z-50 w-52 rounded-md border bg-popover p-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => setOpen(false)}
            title="Próximamente"
            className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="size-4 text-muted-foreground" />
            Preferencias
          </button>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="size-4 text-muted-foreground" />
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
