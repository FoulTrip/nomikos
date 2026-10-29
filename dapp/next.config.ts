import type { NextConfig } from "next";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import createNextIntlPlugin from "next-intl/plugin";

// El workspace mantiene una sola configuración de entorno en su raíz.
loadEnvConfig(path.resolve(process.cwd(), ".."), process.env.NODE_ENV === "development");

const nextConfig: NextConfig = {
  // Genera un servidor Node autónomo, ideal para imágenes Docker mínimas.
  output: "standalone",
  transpilePackages: ["three"],
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl(nextConfig);
