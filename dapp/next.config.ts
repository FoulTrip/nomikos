import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Genera un servidor Node autónomo, ideal para imágenes Docker mínimas.
  output: "standalone",
  transpilePackages: ["three"],
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
export default withNextIntl(nextConfig);
