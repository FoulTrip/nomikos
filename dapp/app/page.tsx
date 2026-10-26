import { Cpu } from "lucide-react";
import AuthForm from "@/components/AuthForm";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Iniciar sesión | ESP32-S3 Agent OS",
  description:
    "Gestión de sesión del dapp — Auth.js v5 contra el IdP de api (Rust :8080).",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12">
      {/* Halo cálido vintage sobre el fondo espresso */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[480px] max-w-3xl rounded-full bg-primary/10 blur-[120px]"
      />

      <main className="relative flex max-w-md flex-col items-center gap-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl border bg-card shadow-sm">
          <Cpu className="size-6 text-primary" />
        </span>
        <Badge variant="secondary" className="font-normal">
          Next.js 16 · Auth.js v5 · API Rust
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          ESP32-S3 · Agent OS
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Simulador Zero-UI del dispositivo ESP32-S3-Touch-AMOLED-1.43.
          Inicia sesión para operar el gateway agéntico con el contexto de tu
          cuenta: LLM propio, red Solana y pagos x402 delegados.
        </p>
      </main>

      <AuthForm />
    </div>
  );
}
