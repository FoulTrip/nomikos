import AccountIntl from "@/components/panel/AccountIntl";

/** /preferences comparte idioma de cuenta con el panel (ver AccountIntl). */
export default function PreferencesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccountIntl>{children}</AccountIntl>;
}
