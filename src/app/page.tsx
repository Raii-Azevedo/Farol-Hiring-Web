import { verificarAcesso } from "@/lib/acesso";
import { loadDashboard } from "@/lib/data";
import { Gate } from "@/components/Gate";
import { App } from "@/components/App";

// Sempre no servidor, a cada acesso: o gate de autorização não pode ser
// servido de cache. O dado em si vem do cache de 30 min (lib/data.ts).
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const acesso = await verificarAcesso();

  if (acesso.tipo !== "ok") {
    // erro devolvido pelo callback de login (allowlist negou ou caiu)
    if (acesso.tipo === "login" && sp.erro === "negado") return <Gate tipo="negado" email={sp.email ?? ""} />;
    if (acesso.tipo === "login" && sp.erro === "indisponivel") return <Gate tipo="indisponivel" detalhe="" />;
    return <Gate {...acesso} />;
  }

  try {
    const data = await loadDashboard();
    return <App data={data} usuario={acesso.usuario} />;
  } catch (e) {
    return <Gate tipo="erro-dados" detalhe={e instanceof Error ? e.message : String(e)} />;
  }
}
