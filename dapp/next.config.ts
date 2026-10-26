import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Genera un servidor Node autónomo, ideal para imágenes Docker mínimas.
  output: "standalone",
  transpilePackages: ["three"],
};

export default nextConfig;
