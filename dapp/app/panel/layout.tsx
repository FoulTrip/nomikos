import AccountIntl from "@/components/panel/AccountIntl";

/**
 * Layout del panel: idioma de la cuenta para /panel, /panel/docs y
 * componentes (ver AccountIntl). El tema claro vive en cada página.
 */
export default function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AccountIntl>{children}</AccountIntl>;
}
