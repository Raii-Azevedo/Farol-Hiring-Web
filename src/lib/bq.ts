import "server-only";
import { BigQuery } from "@google-cloud/bigquery";

/**
 * Cliente BigQuery do servidor. Credencial, nesta ordem:
 *  1. GCP_SERVICE_ACCOUNT_JSON: o JSON da service account (cru ou em
 *     base64). É o que funciona na Vercel, onde não há gcloud.
 *  2. Nada definido: a credencial de aplicação da máquina
 *     (`gcloud auth application-default login`), para rodar local.
 *
 * A conta precisa de leitura no DATASET inteiro (greenhouse_dev), não só
 * nas views do farol: a allowlist de acesso mora no mesmo dataset.
 */
export const PROJETO = process.env.BQ_PROJECT ?? "br-in-dataplatform";
export const DATASET = process.env.BQ_DATASET ?? "greenhouse_dev";

function credenciais(): Record<string, string> | undefined {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return undefined;
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(json);
}

let _cliente: BigQuery | undefined;
export function cliente(): BigQuery {
  _cliente ??= new BigQuery({ projectId: PROJETO, credentials: credenciais() });
  return _cliente;
}

export const tabela = (nome: string) => `\`${PROJETO}.${DATASET}.${nome}\``;

export async function consultar<T>(query: string, params?: Record<string, unknown>): Promise<T[]> {
  const [rows] = await cliente().query({ query, params, location: process.env.BQ_LOCATION });
  return rows as T[];
}
