import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // o client do BigQuery usa módulos nativos do Node: fica fora do bundle
  serverExternalPackages: ["@google-cloud/bigquery"],
  poweredByHeader: false,
  // permite um segundo `next dev` (ex.: preview) sem disputar a .next com o primeiro
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
