import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import DeviceViewer from "@/components/DeviceViewer";
import TopbarTools from "@/components/panel/TopbarTools";
import CanvasBoundary from "@/components/panel/CanvasBoundary";
import SpecsCard from "@/components/panel/SpecsCard";
import DiagnosisCard from "@/components/panel/DiagnosisCard";
import ViewLockButton from "@/components/panel/ViewLockButton";
import AccountMenu from "@/components/panel/AccountMenu";
import SandboxSwitch from "@/components/panel/SandboxSwitch";
import SandboxGate from "@/components/panel/SandboxGate";
import DeviceSelect from "@/components/panel/DeviceSelect";
import DeviceMicBridge from "@/components/panel/DeviceMicBridge";
import AgentDock from "@/components/panel/AgentDock";

export const metadata = {
  title: "Panel | ESP32-S3 Agent OS",
  description:
    "Simulador Zero-UI operando como cuenta: navbar + visor 3D + gateway agéntico.",
};


export default async function PanelPage() {
  const session = await auth();
  // Defensa en profundidad: el proxy ya protege /panel, pero la regla de
  // Next.js 16 es no confiar solo en el proxy (Server Actions incluidas).
  if (!session?.user?.email) redirect("/signin");
  const t = await getTranslations("panel.specs");
  // i18n trae items como {label, value}; SpecsCard espera tuplas.
  const specs = (t.raw("items") as { label: string; value: string }[]).map(
    (i) => [i.label, i.value] as [string, string],
  );

  return (
    <div className="theme-light flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="z-10 bg-transparent">
        <div className="mx-auto flex w-full max-w-5xl flex-row items-center justify-between gap-2 px-4 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 sm:gap-2 [&>*]:shrink-0">
            {/* Wallet operativa + red del agente, y las dapps con flujo x402 */}
            <TopbarTools />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SandboxSwitch />
            <AccountMenu email={session.user.email} accountId={session.accountId} />
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {/* Boundary: R3F 9.8 + React 19 crashean al desmontar el Canvas
            (navegación login⇄panel) — ver components/panel/CanvasBoundary */}
        <DeviceMicBridge />
        <AgentDock />
        <SandboxGate>
          <CanvasBoundary>
            <DeviceViewer />
          </CanvasBoundary>
        </SandboxGate>

        <div className="absolute top-4 right-4 z-[5] flex w-64 flex-col gap-3 max-md:right-3 max-md:left-3 max-md:w-auto">
          <DeviceSelect />
          <ViewLockButton />
          <SpecsCard specs={specs} />
          <DiagnosisCard />
        </div>
      </main>
    </div>
  );
}
