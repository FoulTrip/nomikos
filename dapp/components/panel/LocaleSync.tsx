"use client";
/**
 * LocaleSync — una vez por pestaña: alinea la cookie NOMIK_LOCALE con el
 * idioma guardado en la cuenta y refresca si cambió. Así el idioma viaja
 * amarrado a la cuenta, no al navegador.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { syncLocaleAction } from "@/app/actions/preferences";

const FLAG = "nomikos-locale-synced";

export default function LocaleSync() {
  const router = useRouter();
  useEffect(() => {
    if (sessionStorage.getItem(FLAG)) return;
    sessionStorage.setItem(FLAG, "1");
    void syncLocaleAction().then((r) => {
      if (r.changed) router.refresh();
    });
  }, [router]);
  return null;
}
