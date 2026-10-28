import { NextIntlClientProvider } from "next-intl";
import LocaleSync from "./LocaleSync";

/**
 * AccountIntl — proveedor next-intl + sincronía de idioma para las rutas
 * de cuenta (/panel/* y /preferences). El locale sale de la cookie
 * NOMIK_LOCALE (ver i18n/request.ts), amarrada a la cuenta.
 */
export default function AccountIntl({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <NextIntlClientProvider>
      <LocaleSync />
      {children}
    </NextIntlClientProvider>
  );
}
