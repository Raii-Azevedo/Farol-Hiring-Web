import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // o client do BigQuery usa módulos nativos do Node: fica fora do bundle
  serverExternalPackages: ["@google-cloud/bigquery"],
  poweredByHeader: false,
  // permite um segundo `next dev` (ex.: preview) sem disputar a .next com o primeiro
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // build do container (Cloud Run): servidor Node enxuto em .next/standalone,
  // só com as dependências usadas. Ligado pelo Dockerfile; local fica normal.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
