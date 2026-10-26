import { redirect } from "next/navigation";
import { Cpu, LogOut, Mouse, Move, Pointer, User, ZoomIn } from "lucide-react";
import { auth } from "@/auth";
import { logoutAction } from "@/app/actions/auth";
import DeviceViewer from "@/components/DeviceViewer";
import TopbarTools from "@/components/panel/TopbarTools";
import CanvasBoundary from "@/components/panel/CanvasBoundary";
import SimulatorBar from "@/components/panel/SimulatorBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const metadata = {
  title: "Panel | ESP32-S3 Agent OS",
  description:
    "Simulador Zero-UI operando como cuenta: navbar + visor 3D + gateway agéntico.",
};

const SPECS: [string, string][] = [
  ["Controlador", "ESP32-S3R8 · dual-core 240 MHz"],
  ["Pantalla", "AMOLED redonda 1.43\" · 466 × 466 px"],
  ["Táctil", "Capacitivo de 5 puntos"],
  ["Memoria", "16 MB Flash · 8 MB PSRAM"],
  ["Inalámbrico", "Wi‑Fi 2.4 GHz · BLE 5"],
  ["Extras", "microSD · SPI · I2C · RGB LED"],
];

const HINTS = [
  { icon: Mouse, label: "Arrastra para", bold: "rotar" },
  { icon: ZoomIn, label: "Rueda para", bold: "zoom" },
  { icon: Move, label: "Clic derecho para", bold: "mover" },
  { icon: Pointer, label: "Toca la pantalla para", bold: "interactuar" },
];

export default async function PanelPage() {
  const session = await auth();
  // Defensa en profundidad: el proxy ya protege /panel, pero la regla de
  // Next.js 16 es no confiar solo en el proxy (Server Actions incluidas).
  if (!session?.user?.email) redirect("/");

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="z-10 flex items-center justify-between gap-4 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select defaultValue="ESP32-S3-Touch-AMOLED-1.43">
            <SelectTrigger aria-label="Dispositivo" className="w-auto gap-2 text-xs font-semibold">
              <Cpu className="size-4 text-primary" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ESP32-S3-Touch-AMOLED-1.43">
                ESP32-S3-Touch-AMOLED-1.43
              </SelectItem>
            </SelectContent>
          </Select>
          {/* Wallet operativa + red del agente, y las dapps con flujo x402 */}
          <TopbarTools />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" title={session.accountId ?? ""} className="font-normal">
            <User />
            {session.user.email}
          </Badge>
          <form action={logoutAction}>
            <Button variant="outline" size="sm" type="submit">
              <LogOut />
              Cerrar sesión
            </Button>
          </form>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        {/* Boundary: R3F 9.8 + React 19 crashean al desmontar el Canvas
            (navegación login⇄panel) — ver components/panel/CanvasBoundary */}
        <CanvasBoundary>
          <DeviceViewer />
        </CanvasBoundary>

        <div className="absolute top-4 right-4 z-[5] flex w-64 flex-col gap-3 max-md:right-3 max-md:left-3 max-md:w-auto">
          {/* Simulador NomikOS: detección local + acciones del OS
              (el progreso vive en la DB de la cuenta, vía el api) */}
          <SimulatorBar />
          <Card className="gap-3 py-4 max-md:hidden">
            <CardHeader className="px-4">
              <CardTitle className="text-xs font-semibold tracking-widest text-primary uppercase">
                Ficha técnica
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <dl className="grid gap-2.5">
                {SPECS.map(([term, def]) => (
                  <div key={term}>
                    <dt className="text-[11px] tracking-wider text-muted-foreground uppercase">
                      {term}
                    </dt>
                    <dd className="mt-0.5 text-[13px]">{def}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>

        <footer className="absolute bottom-3.5 left-1/2 z-[5] flex -translate-x-1/2 items-center gap-4 rounded-full border bg-card/85 px-4 py-2 text-xs whitespace-nowrap text-muted-foreground shadow-sm backdrop-blur max-md:gap-2.5 max-md:text-[11px]">
          {HINTS.map(({ icon: Icon, label, bold }) => (
            <span key={bold} className="flex items-center gap-1.5">
              <Icon className="size-3.5 text-primary" />
              {label} <b className="font-semibold text-foreground">{bold}</b>
            </span>
          ))}
        </footer>
      </main>
    </div>
  );
}
