import "server-only";
import { unstable_cache } from "next/cache";
import { consultar } from "./bq";
import {
  SQL_DEMANDA, SQL_META, SQL_OFERTA, SQL_PARADOS, SQL_PIPE_NIVEL,
  SQL_SU_BANCO, SQL_SU_OFERTAS, SQL_TAXAS,
} from "./queries";
import {
  type Dashboard, type FarolPico, type FarolRow, type ParadoVaga, type PipeNivel,
  type SuBanco, type SuOferta, type Taxa,
  HORIZONTE_FAROL_DIAS, JANELA_MESES, MIN_DIAS_MES_JANELA, SENIORIDADES_FAROL, farolStatus, meioParaCima,
} from "./model";

interface Demanda {
  mes: string;
  chapter: string;
  senioridade: string;
  demanda_bruta_fte: number | null;
  desalocado_fte: number | null;
  demanda_liquida: number | null;
}
interface Oferta { chapter: string; senioridade: string; oferta_ajustada: number }

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addMeses = (ym: string, n: number) => {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
/** Hoje no fuso de São Paulo: a Vercel roda em UTC e virava o dia às 21h. */
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function carregar(): Promise<Dashboard> {
  // Todas as queries disparam juntas: o tempo total é o da mais lenta.
  const [meta, pipeNivel, taxas, parados, suOfertas, suBanco, oferta, demanda] = await Promise.all([
    consultar<{ snapshot_date: string; data_carga: string | null }>(SQL_META()),
    consultar<PipeNivel>(SQL_PIPE_NIVEL()),
    consultar<Taxa>(SQL_TAXAS()),
    consultar<ParadoVaga>(SQL_PARADOS()),
    consultar<SuOferta>(SQL_SU_OFERTAS()),
    consultar<SuBanco>(SQL_SU_BANCO()),
    consultar<Oferta>(SQL_OFERTA(HORIZONTE_FAROL_DIAS)),
    consultar<Demanda>(SQL_DEMANDA()),
  ]);

  const snapshot = meta[0]?.snapshot_date ?? hojeSP();
  const dataCarga = meta[0]?.data_carga ?? snapshot;
  const mesSnapshot = snapshot.slice(0, 7);

  // ---- farol: grade mês × chapter × senioridade -------------------------
  // O forecast não tem linha quando não há demanda; sem a grade, a oferta
  // dessa senioridade sumiria do mês. Sem linha vale demanda zero.
  const chaptersDemanda = new Set(demanda.map((d) => d.chapter));
  const combos = new Map<string, [string, string]>();
  for (const d of demanda) combos.set(`${d.chapter}|${d.senioridade}`, [d.chapter, d.senioridade]);
  for (const o of oferta)
    if (chaptersDemanda.has(o.chapter)) combos.set(`${o.chapter}|${o.senioridade}`, [o.chapter, o.senioridade]);

  const demIdx = new Map(demanda.map((d) => [`${d.mes}|${d.chapter}|${d.senioridade}`, d]));
  const ofIdx = new Map(oferta.map((o) => [`${o.chapter}|${o.senioridade}`, o.oferta_ajustada]));
  const todosMeses = [...new Set(demanda.map((d) => d.mes))].sort();

  let farol: FarolRow[] = [];
  for (const mes of todosMeses) {
    for (const [chapter, senioridade] of combos.values()) {
      if (!SENIORIDADES_FAROL.includes(senioridade)) continue;
      const d = demIdx.get(`${mes}|${chapter}|${senioridade}`);
      // inteiros: não se contrata fração de pessoa. A líquida é refeita das
      // partes já arredondadas para a conta da tela fechar.
      const bruta = meioParaCima(d?.demanda_bruta_fte ?? 0);
      const desal = meioParaCima(d?.desalocado_fte ?? 0);
      const of = meioParaCima(ofIdx.get(`${chapter}|${senioridade}`) ?? 0);
      const liq = bruta - desal;
      const [status, gapPct] = farolStatus(liq, of);
      farol.push({
        mes, chapter, senioridade,
        demanda_bruta_fte: bruta, desalocado_fte: desal, demanda_liquida: liq,
        oferta_ajustada: of, gap: liq - of, farol_status: status, gap_pct: gapPct,
      });
    }
  }

  // ---- janela: mês atual + JANELA_MESES ---------------------------------
  const fimForecast = todosMeses[todosMeses.length - 1] ?? mesSnapshot;
  const fimMesJanela = addMeses(mesSnapshot, JANELA_MESES);
  const naJanela = farol.filter((r) => r.mes >= mesSnapshot && r.mes <= fimMesJanela);
  if (naJanela.length) farol = naJanela;
  const meses = [...new Set(farol.map((r) => r.mes))].sort();

  const hoje = hojeSP();
  const fim = new Date(`${hoje}T12:00:00Z`);
  fim.setUTCDate(fim.getUTCDate() + HORIZONTE_FAROL_DIAS);
  const fimJanela = isoDate(fim);
  // Mês futuro só entra se a janela cobrir pelo menos MIN_DIAS_MES_JANELA
  // dias dele: hoje + 45 caindo em 01/01 não deve puxar a demanda de janeiro
  // inteiro por causa de um dia. O mês corrente sempre entra.
  const diasCobertos = (mes: string) => {
    const [a, m] = mes.split("-").map(Number);
    const ini = new Date(Math.max(Date.UTC(a, m - 1, 1), Date.parse(`${hoje}T00:00:00Z`)));
    const fimMes = Date.UTC(a, m, 0); // último dia do mês
    const fimJ = new Date(Math.min(fimMes, Date.parse(`${fimJanela}T00:00:00Z`)));
    return Math.max(0, Math.round((fimJ.getTime() - ini.getTime()) / 86_400_000) + 1);
  };
  let mesesJanela = meses.filter(
    (m) => m === mesSnapshot || (m > mesSnapshot && diasCobertos(m) >= MIN_DIAS_MES_JANELA),
  );
  if (!mesesJanela.length) mesesJanela = meses.slice(0, 1);

  // Demanda é ESTOQUE mensal: vale o mês de maior demanda líquida da janela,
  // nunca a soma (contaria a mesma pessoa duas vezes).
  const pico = new Map<string, FarolPico>();
  for (const r of farol) {
    if (!mesesJanela.includes(r.mes)) continue;
    const k = `${r.chapter}|${r.senioridade}`;
    const atual = pico.get(k);
    if (!atual || r.demanda_liquida > atual.demanda_liquida || (r.demanda_liquida === atual.demanda_liquida && r.mes < atual.mes_pico))
      pico.set(k, { ...r, mes_pico: r.mes });
  }

  const chaptersPipe = new Set(pipeNivel.map((p) => p.chapter));
  const chaptersFarol = new Set(farol.map((r) => r.chapter));

  return {
    geradoEm: new Date().toISOString(),
    mesSnapshot,
    dataCarga,
    hoje,
    fimJanela,
    fimForecast,
    meses,
    mesesJanela,
    farol,
    farolJanela: [...pico.values()],
    pipeNivel,
    taxas,
    parados,
    suOfertas,
    suBanco,
    chaptersSemDemanda: [...chaptersPipe].filter((c) => !chaptersFarol.has(c)).sort(),
  };
}

/** Mesmo TTL do st.cache_data(ttl=1800) do Streamlit. O cache vale para
 * todo mundo (o payload não tem nome de candidato), então só o primeiro
 * acesso a cada 30 min paga a ida ao BigQuery. */
export const loadDashboard = unstable_cache(carregar, ["farol-dashboard-v3"], {
  revalidate: 1800,
  tags: ["farol"],
});
