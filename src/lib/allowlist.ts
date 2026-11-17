import "server-only";
import { unstable_cache } from "next/cache";
import { consultar } from "./bq";
import { SQL_ALLOWLIST } from "./queries";

/** 'User@Company.com ' e 'user@company.com' são o mesmo e-mail. */
export const normalizeEmail = (email?: string | null) => (email ?? "").trim().toLowerCase();

/** Falha ao LER a allowlist. Tratada como negação (fail closed), mas com
 * tela própria: não é "você não tem acesso", é "não deu para confirmar". */
export class AllowlistIndisponivel extends Error {}

async function _checar(email: string): Promise<{ autorizado: boolean; role: string | null }> {
  let rows: { email: string; role: string | null }[];
  try {
    rows = await consultar(SQL_ALLOWLIST(), { email });
  } catch (e) {
    throw new AllowlistIndisponivel(e instanceof Error ? e.message : String(e));
  }
  return { autorizado: rows.length > 0, role: rows[0]?.role || null };
}

/** Cache de 60s por e-mail, como o st.cache_data(ttl=60) do Streamlit:
 * uma inclusão na tabela vale no minuto seguinte, sem redeploy. Erro não
 * entra no cache (unstable_cache só guarda o que resolve). */
export function checarAllowlist(email: string) {
  const e = normalizeEmail(email);
  return unstable_cache(() => _checar(e), ["allowlist", e], { revalidate: 60 })();
}
