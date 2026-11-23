import { signIn, signOut } from "@/auth";

type Props =
  | { tipo: "login" }
  | { tipo: "negado"; email: string }
  | { tipo: "indisponivel"; detalhe: string }
  | { tipo: "sem-config" }
  | { tipo: "erro-dados"; detalhe: string };

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Gate(props: Props) {
  async function entrar() {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }
  async function sair() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="gate">
      <div className="gate-card fade-in">
        <div className="gate-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/artefact_a_white.png" alt="Artefact" />
          <h1>Farol de Hiring</h1>
          <p>Artefact · People &amp; Talent</p>
        </div>
        <div className="gate-body">
          {props.tipo === "login" && (
            <>
              <p>
                Leitura do ritmo de contratação por chapter e senioridade. Acesso restrito ao time de People &amp;
                Talent da Artefact. Entre com sua conta Google corporativa.
              </p>
              <form action={entrar}>
                <button className="btn" type="submit">
                  <GoogleIcon /> Continuar com Google
                </button>
              </form>
            </>
          )}

          {props.tipo === "negado" && (
            <>
              <div className="card">
                <div className="card-title">Acesso não autorizado</div>
                <p className="kpi-note" style={{ margin: 0 }}>
                  {props.email ? (
                    <>A conta <b>{props.email}</b> foi autenticada pelo Google, mas</>
                  ) : (
                    <>Sua conta foi autenticada pelo Google, mas</>
                  )}{" "}
                  não está na lista de usuários autorizados do Farol de Hiring. Se você deveria ter acesso, peça ao
                  time de People &amp; Talent para incluir seu e-mail na allowlist,
                  mantida pelo time de Dados.
                </p>
              </div>
              <form action={sair}>
                <button className="btn" type="submit">Sair e tentar com outra conta</button>
              </form>
            </>
          )}

          {props.tipo === "indisponivel" && (
            <div className="card">
              <div className="card-title">Não foi possível verificar seu acesso</div>
              <p className="kpi-note" style={{ margin: 0 }}>
                O Farol não conseguiu ler a lista de usuários autorizados (<code>greenhouse_dash_access</code>, no
                BigQuery). Isso não quer dizer que você não tem acesso, só que não deu para confirmar agora. Por
                segurança, o acesso fica bloqueado até a verificação voltar. Avise o time de Dados.
              </p>
              {props.detalhe && <p className="caption" style={{ opacity: 0.75 }}>Detalhe: {props.detalhe}</p>}
            </div>
          )}

          {props.tipo === "sem-config" && (
            <div className="card">
              <div className="card-title">Login não configurado</div>
              <p className="kpi-note" style={{ margin: 0 }}>
                Este ambiente está em produção sem <code>AUTH_GOOGLE_ID</code> e <code>AUTH_GOOGLE_SECRET</code>. Por
                segurança o Farol não abre em modo aberto fora do desenvolvimento local. Configure as variáveis na
                Vercel (ver README).
              </p>
            </div>
          )}

          {props.tipo === "erro-dados" && (
            <div className="card">
              <div className="card-title">Não consegui ler as views do BigQuery</div>
              <p className="kpi-note" style={{ margin: 0 }}>
                Normalmente é credencial ausente (local: <code>gcloud auth application-default login</code>; na
                Vercel: <code>GCP_SERVICE_ACCOUNT_JSON</code>), falta de permissão de leitura no dataset, ou as views
                ainda não foram criadas.
              </p>
              <p className="caption" style={{ opacity: 0.75, wordBreak: "break-word" }}>Detalhe: {props.detalhe}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
