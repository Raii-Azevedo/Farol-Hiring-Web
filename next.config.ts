import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // o client do BigQuery usa módulos nativos do Node: fica fora do bundle
  serverExternalPackages: ["@google-cloud/bigquery"],
  poweredByHeader: false,
};

export default nextConfig;
