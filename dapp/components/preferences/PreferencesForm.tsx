"use client";
/**
 * PreferencesForm — datos generales + idioma + país de la cuenta.
 * Mismo lenguaje visual que /panel: tarjetas cálidas redondeadas,
 * píldoras negras y selector de idioma tipo conmutador.
 * Guarda vía savePreferencesAction (PUT autenticado + cookie NOMIK_LOCALE)
 * y refresca para aplicar el idioma al instante en todo el panel.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  savePreferencesAction,
  type Preferences,
} from "@/app/actions/preferences";
import { COUNTRY_CODES, countryName } from "@/lib/countries";
import { cn } from "@/lib/utils";

function Section({
  title,
  className,
  plain = false,
  children,
}: {
  title: string;
  className?: string;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[32px] border border-[#EDEDED] bg-white p-7 shadow-[0_3px_16px_rgba(0,0,0,0.06)]",
        plain && "rounded-none border-0 bg-transparent px-0 shadow-none",
        className,
      )}
    >
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export default function PreferencesForm({ initial }: { initial: Preferences }) {
  const t = useTranslations("prefs");
  const locale = useLocale();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [lang, setLang] = useState<"es" | "en">(initial.locale);
  const [country, setCountry] = useState(initial.country ?? "");
  // Última versión guardada: el CTA vive de la diferencia contra esta base,
  // así desaparece al guardar en vez de quedar comparando props viejos.
  const [baseline, setBaseline] = useState({
    display_name: initial.display_name ?? "",
    locale: initial.locale,
    country: initial.country ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    displayName.trim() !== baseline.display_name ||
    lang !== baseline.locale ||
    (country || "") !== baseline.country;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await savePreferencesAction({
      display_name: displayName,
      locale: lang,
      country: country || null,
    });
    setSaving(false);
    if (!res.ok || !res.preferences) {
      setError(res.error && res.error !== "api" ? res.error : t("error"));
      return;
    }
    const p = res.preferences;
    const next = {
      display_name: p.display_name ?? "",
      locale: p.locale,
      country: p.country ?? "",
    };
    setDisplayName(next.display_name);
    setLang(p.locale);
    setCountry(next.country);
    setBaseline(next);
    setSaved(true);
    if (p.locale !== locale) router.refresh();
  }

  return (
    <form
      onSubmit={onSave}
      className="grid gap-4 lg:grid-cols-5 lg:items-start"
    >
      <Section title={t("account")} plain className="lg:col-span-3">
        <div className="grid gap-2">
          <Label>{t("email")}</Label>
          <Input
            value={initial.email}
            disabled
            className="h-12 rounded-2xl opacity-70"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="prefs-name">{t("displayName")}</Label>
          <Input
            id="prefs-name"
            value={displayName}
            maxLength={64}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("displayNamePh")}
            className="h-12 rounded-2xl"
          />
        </div>
      </Section>

      <div className="grid gap-4 lg:col-span-2">
        <Section title={t("language")}>
          {/* Conmutador English | Español — igual que el de la landing */}
          <div className="flex w-fit items-center gap-0.5 rounded-full bg-[#F6F4EF] p-1">
            {(
              [
                { code: "es", label: "Español" },
                { code: "en", label: "English" },
              ] as const
            ).map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full px-5 py-2 text-sm font-medium transition-colors",
                  lang === l.code
                    ? "bg-[#171717] text-white shadow-sm"
                    : "text-[#848281] hover:text-[#121212]",
                )}
              >
                {lang === l.code && <Check className="size-3.5" />}
                {l.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t("country")}>
          <Select
            value={country || "__none"}
            onValueChange={(v) => setCountry(v === "__none" ? "" : v)}
          >
            <SelectTrigger className="h-12 w-full rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">{t("countryNone")}</SelectItem>
              {COUNTRY_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {countryName(code, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-destructive lg:col-span-5"
        >
          <TriangleAlert className="size-4" />
          {error}
        </p>
      )}
      {saved && (
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 lg:col-span-5">
          <CircleCheck className="size-4" />
          {t("saved")}
        </p>
      )}

      {dirty && (
        <div className="flex items-center justify-end gap-3 lg:col-span-5">
          <Button
            type="submit"
            disabled={saving}
            className="lift h-12 rounded-full px-7 text-[15px]"
          >
            {saving && <LoaderCircle className="animate-spin" />}
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
