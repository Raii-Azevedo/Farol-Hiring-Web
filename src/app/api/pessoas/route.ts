import { NextResponse, type NextRequest } from "next/server";
import { verificarAcesso } from "@/lib/acesso";
import { consultar } from "@/lib/bq";
import { SQL_PESSOAS_PARADAS, SQL_PESSOAS_SU } from "@/lib/queries";
import { TODOS } from "@/lib/model";

export const dynamic = "force-dynamic";

export interface Pessoa {
  candidato: string;
  vaga: string | null;
  chapter: string | null;
  senioridade: string;
  dias: number | null;
  desde: string | null;
  meta_sla_dias: number | null;
  status: string | null;
}

/**
 * Nomes de candidatos só saem por aqui, um recorte por vez, quando alguém
 * abre um detalhe. O payload do dashboard (em cache, igual para todos) não
 * tem nome nenhum.
 */
export async function GET(req: NextRequest) {
  const acesso = await verificarAcesso();
  if (acesso.tipo !== "ok") return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const p = (k: string) => {
    const v = q.get(k) ?? "";
    return v === TODOS ? "" : v.slice(0, 200);
  };
  const tipo = q.get("tipo");
  const params = { chapter: p("chapter"), senioridade: p("senioridade") };

  try {
    const rows =
      tipo === "su"
        ? await consultar<Pessoa>(SQL_PESSOAS_SU(), params)
        : await consultar<Pessoa>(SQL_PESSOAS_PARADAS(), {
            ...params,
            etapa: p("etapa"),
            status: p("status"),
            vaga: p("vaga"),
          });
    return NextResponse.json(rows, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
