"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { savePreferencesAction } from "@/app/actions/preferences";

export default function AccountMenu({
  email,
  accountId,
}: {
  email: string;
  accountId?: string | null;
}) {
  const t = useTranslations("panel.account");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
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

  const switchLocale = async (next: string) => {
    if (next === locale || switching) return;
    setSwitching(true);
    const res = await savePreferencesAction({ locale: next });
    setSwitching(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
  };

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
          <Link
            href="/preferences"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <Settings className="size-4 text-muted-foreground" />
            {t("prefs")}
          </Link>
          <div className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5">
            <span className="text-sm text-muted-foreground">{t("language")}</span>
            <span className="flex gap-1">
              {(["es", "en"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  disabled={switching}
                  onClick={() => void switchLocale(code)}
                  aria-pressed={locale === code}
                  className={`flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold uppercase transition-colors ${
                    locale === code
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {locale === code && <Check className="size-3" />}
                  {code}
                </button>
              ))}
            </span>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <LogOut className="size-4 text-muted-foreground" />
              {t("signout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
