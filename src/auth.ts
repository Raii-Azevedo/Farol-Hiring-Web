import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { checarAllowlist, normalizeEmail } from "@/lib/allowlist";

/**
 * Autenticação (quem é você?) pelo Google, via Auth.js.
 * Autorização (você pode ver o Farol?) pela allowlist no BigQuery, em
 * lib/allowlist.ts: checada no login E a cada carregamento de página
 * (lib/acesso.ts), para que remover alguém da tabela valha em até 1 min,
 * não só quando a sessão expirar.
 */
export const authConfigurado = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: authConfigurado
    ? [
        Google({
          // restringe o seletor de conta ao domínio, quando definido
          authorization: process.env.AUTH_GOOGLE_HD
            ? { params: { hd: process.env.AUTH_GOOGLE_HD, prompt: "select_account" } }
            : { params: { prompt: "select_account" } },
        }),
      ]
    : [],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async signIn({ profile }) {
      const email = normalizeEmail(profile?.email);
      if (!email || profile?.email_verified === false) return "/?erro=negado";
      try {
        const { autorizado } = await checarAllowlist(email);
        return autorizado ? true : `/?erro=negado&email=${encodeURIComponent(email)}`;
      } catch {
        return "/?erro=indisponivel";
      }
    },
  },
});
