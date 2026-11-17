import "server-only";
import { auth, authConfigurado } from "@/auth";
import { AllowlistIndisponivel, checarAllowlist, normalizeEmail } from "./allowlist";

export interface Usuario {
  email: string;
  name: string;
  role: string | null;
  modoAberto?: boolean;
}

export type Acesso =
  | { tipo: "ok"; usuario: Usuario }
  | { tipo: "login" }
  | { tipo: "negado"; email: string }
  | { tipo: "indisponivel"; detalhe: string }
  | { tipo: "sem-config" };

/**
 * Gate de toda página e rota de API. Roda no servidor: se não passar, o
 * dashboard nem é montado, e nenhum dado sai para o navegador.
 *
 * Sem AUTH_GOOGLE_ID/SECRET:
 *  - em desenvolvimento, modo aberto com aviso visível (como no Streamlit);
 *  - em produção, BLOQUEIA. Diferente do Streamlit de propósito: na Vercel
 *    o link é público, e esquecer uma variável não pode expor candidatos.
 */
export async function verificarAcesso(): Promise<Acesso> {
  if (!authConfigurado) {
    if (process.env.NODE_ENV === "production") return { tipo: "sem-config" };
    return {
      tipo: "ok",
      usuario: { email: "dev@local", name: "Modo dev, sem autenticação", role: null, modoAberto: true },
    };
  }
  const session = await auth();
  const email = normalizeEmail(session?.user?.email);
  if (!email) return { tipo: "login" };
  try {
    const { autorizado, role } = await checarAllowlist(email);
    if (!autorizado) return { tipo: "negado", email };
    return { tipo: "ok", usuario: { email, name: session?.user?.name ?? email, role } };
  } catch (e) {
    const detalhe = e instanceof AllowlistIndisponivel ? e.message : String(e);
    return { tipo: "indisponivel", detalhe };
  }
}
