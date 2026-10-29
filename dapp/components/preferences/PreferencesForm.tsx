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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-3 p-4">
      <CardHeader className="p-0">
        <CardTitle className="text-xs tracking-wide text-muted-foreground uppercase">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-0">{children}</CardContent>
    </Card>
  );
}

export default function PreferencesForm({ initial }: { initial: Preferences }) {
  const t = useTranslations("prefs");
  const locale = useLocale();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [lang, setLang] = useState<"es" | "en">(initial.locale);
  const [country, setCountry] = useState(initial.country ?? "");
  const [currency, setCurrency] = useState<"USD" | "COP">(initial.currency);
  // Última versión guardada: el CTA vive de la diferencia contra esta base,
  // así desaparece al guardar en vez de quedar comparando props viejos.
  const [baseline, setBaseline] = useState({
    display_name: initial.display_name ?? "",
    locale: initial.locale,
    country: initial.country ?? "",
    currency: initial.currency,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    displayName.trim() !== baseline.display_name ||
    lang !== baseline.locale ||
    (country || "") !== baseline.country ||
    currency !== baseline.currency;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await savePreferencesAction({
      display_name: displayName,
      locale: lang,
      country: country || null,
      currency,
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
      currency: p.currency,
    };
    setDisplayName(next.display_name);
    setLang(p.locale);
    setCountry(next.country);
    setCurrency(next.currency);
    setBaseline(next);
    setSaved(true);
    if (p.locale !== locale) router.refresh();
  }

  return (
    <form
      onSubmit={onSave}
      className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-2 md:items-start"
    >
      <header className="grid content-start gap-1 md:col-span-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </header>

      <div className="grid gap-4">
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
        {dirty && (
          <div className="flex justify-end pt-1">
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
        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            {error}
          </p>
        )}
        {saved && (
          <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="size-4 shrink-0" />
            {t("saved")}
          </p>
        )}
      </div>

      <div className="grid gap-4">
        <Section title={t("language")}>
          {/* Conmutador English | Español — igual que el de la landing */}
          <div className="flex w-fit flex-wrap items-center gap-2">
            {(
              [
                { code: "es", label: "Español" },
                { code: "en", label: "English" },
              ] as const
            ).map((l) => (
              <Button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
                variant={lang === l.code ? "default" : "outline"}
                className="h-10 rounded-full px-5"
              >
                {lang === l.code && <Check className="size-3.5" />}
                {l.label}
              </Button>
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

        <Section title={t("currency")}>
          <Select
            value={currency}
            onValueChange={(value) => setCurrency(value as "USD" | "COP")}
          >
            <SelectTrigger className="h-12 w-full rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">{t("currencyUSD")}</SelectItem>
              <SelectItem value="COP">{t("currencyCOP")}</SelectItem>
            </SelectContent>
          </Select>
        </Section>
      </div>

    </form>
  );
}
