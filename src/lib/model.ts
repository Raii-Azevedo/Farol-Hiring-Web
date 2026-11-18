/**
 * Regras de negócio do Farol, portadas 1:1 do app.py do Streamlit.
 *
 * Este arquivo não importa nada de servidor: roda no Node (para montar o
 * payload) e no navegador (para refazer os recortes quando o filtro muda,
 * sem ida ao servidor). Quando uma regra mudar aqui, atualize a aba
 * "Como ler" junto.
 */

// ---------------------------------------------------------------------------
// Constantes do processo
// ---------------------------------------------------------------------------
export const STAGES_ORDER: readonly string[] = [
  "Avaliação de currículo",
  "Envio do Case Escrito",
  "Avaliação case escrito",
  "Entrevista Fit",
  "Entrevista Técnica 1",
  "Entrevista Técnica 2",
  "Conversa Final",
  "Oferta",
  "Contratação",
];

export const ETAPA_CURTA: Record<string, string> = {
  "Avaliação de currículo": "Currículo",
  "Envio do Case Escrito": "Envio do case",
  "Avaliação case escrito": "Avaliação do case",
  "Entrevista Fit": "Fit",
  "Entrevista Técnica 1": "Técnica 1",
  "Entrevista Técnica 2": "Técnica 2",
  "Conversa Final": "Conversa final",
  Oferta: "Oferta",
};

export const SENIORIDADE_ORDER = ["Estagiário", "Entry", "Senior"];
export const SEM_SENIORIDADE = "Não informada";
/** Estagiário fica fora do farol: segue o ritmo das turmas de estágio. */
export const SENIORIDADES_FAROL = ["Entry", "Senior"];
/** Da Entrevista Fit até a Oferta: quem já passou da triagem e do case. */
export const QUALIFIED_STAGES = [
  "Entrevista Fit",
  "Entrevista Técnica 1",
  "Entrevista Técnica 2",
  "Conversa Final",
  "Oferta",
];

export const HORIZONTE_FAROL_DIAS = 45;
export const JANELA_MESES = 3;
/** Mês futuro só entra na janela do farol se ela cobrir ao menos isto de dias dele. */
export const MIN_DIAS_MES_JANELA = 15;
export const DIAS_CARGA_ATRASADA = 7;
/** Gap abaixo de 1 pessoa não move o farol, qualquer que seja o percentual. */
export const GAP_MINIMO_PESSOAS = 1;
export const TODOS = "Todos";
export const ETAPA_SU = "See You Soon (banco)";

export type Status = "acelerar" | "manter" | "pausar" | "sem_dado";
export type StatusSla = "critico" | "atencao" | "ok";

export const STATUS_LABEL: Record<Status, string> = {
  acelerar: "Acelerar",
  manter: "Manter",
  pausar: "Pausar",
  sem_dado: "Sem dado",
};

// ---------------------------------------------------------------------------
// Tipos do payload (o que o servidor manda para a página)
// ---------------------------------------------------------------------------

/** Grão chapter × senioridade × etapa, com SOMA e CONTAGEM (não a média),
 * para qualquer recorte refazer a média ponderada certa. */
export interface PipeNivel {
  chapter: string;
  senioridade: string;
  etapa: string;
  ordem_etapa: number;
  candidatos: number;
  /** candidaturas com etapa atual = esta, em qualquer status */
  total: number;
  conv_soma: number;
  conv_n: number;
  tempo_soma: number;
  tempo_n: number;
  meta_sla_dias: number | null;
}

export interface Taxa {
  chapter: string;
  senioridade: string;
  candidaturas: number;
  chegaram_case: number;
  chegaram_fit: number;
  chegaram_tec1: number;
  contratados: number;
  recusas_oferta: number;
  dias_contratacao: number;
  contratados_com_dias: number;
}

/** Candidatos em processo agregados por vaga. Os nomes NÃO vêm aqui: só
 * chegam ao navegador quando alguém abre o detalhe (/api/pessoas). */
export interface ParadoVaga {
  chapter: string;
  senioridade: string;
  etapa: string;
  status: StatusSla | null;
  vaga: string;
  n: number;
  pior_dias: number | null;
  meta_sla_dias: number | null;
}

export interface SuOferta {
  chapter: string;
  senioridade: string;
  candidaturas_sys: number;
  aceites_sys: number;
}

export interface SuBanco {
  chapter: string | null;
  senioridade: string;
  n: number;
  dias_soma: number;
  dias_n: number;
}

export interface FarolRow {
  mes: string;
  chapter: string;
  senioridade: string;
  demanda_bruta_fte: number;
  desalocado_fte: number;
  demanda_liquida: number;
  oferta_ajustada: number;
  gap: number;
  farol_status: Status;
  gap_pct: number | null;
}

export interface FarolPico extends FarolRow {
  mes_pico: string;
}

export interface Dashboard {
  geradoEm: string;
  mesSnapshot: string; // YYYY-MM
  dataCarga: string; // YYYY-MM-DD
  hoje: string; // YYYY-MM-DD
  fimJanela: string; // YYYY-MM-DD
  fimForecast: string; // YYYY-MM
  meses: string[];
  mesesJanela: string[];
  farol: FarolRow[];
  farolJanela: FarolPico[];
  pipeNivel: PipeNivel[];
  taxas: Taxa[];
  parados: ParadoVaga[];
  suOfertas: SuOferta[];
  suBanco: SuBanco[];
  chaptersSemDemanda: string[];
}

// ---------------------------------------------------------------------------
// Farol
// ---------------------------------------------------------------------------
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Semáforo a partir do gap entre demanda líquida e oferta ajustada.
 * Ordem: sem demanda -> sem dado; |gap| < 1 pessoa -> manter; demanda <= 0
 * -> pausar; senão o % decide (> +20% acelerar, < -10% pausar). */
export function farolStatus(
  demanda: number | null | undefined,
  oferta: number | null | undefined,
): [Status, number | null] {
  if (demanda == null || Number.isNaN(demanda)) return ["sem_dado", null];
  const o = oferta == null || Number.isNaN(oferta) ? 0 : oferta;
  if (Math.abs(demanda - o) < GAP_MINIMO_PESSOAS) {
    return ["manter", demanda > 0 ? round1(((demanda - o) / demanda) * 100) : null];
  }
  if (demanda <= 0) return ["pausar", null];
  const pct = round1(((demanda - o) / demanda) * 100);
  if (pct > 20) return ["acelerar", pct];
  if (pct >= -10) return ["manter", pct];
  return ["pausar", pct];
}

/** Arredonda meio para cima (2,5 -> 3), como o `floor(x + 0.5)` do Python. */
export const meioParaCima = (v: number) => Math.floor(v + 0.5);

export function gapTexto(gapPct: number | null, demanda: number, oferta: number, curto = false): string {
  const falta = demanda - oferta;
  if (Math.abs(falta) < 0.05) return "equilibrado";
  if (curto) return falta > 0 ? `falta ${fmt0(falta)}` : `sobra ${fmt0(-falta)}`;
  let t = falta > 0 ? `faltam ${fmt0(falta)} pessoas` : `sobram ${fmt0(-falta)} pessoas`;
  if (gapPct != null && demanda >= 1) t += ` (${sinal(gapPct)}%)`;
  return t;
}

export function farolInsight(status: Status, gapPct: number | null, demanda: number, oferta: number): string {
  if (status === "sem_dado") return "Sem demanda registrada neste período, então não dá para calcular o farol.";
  if (status === "acelerar")
    return `Oferta cobre ${fmt0((oferta / demanda) * 100)}% da demanda (gap ${sinal(gapPct ?? 0)}%). Priorize abrir vagas neste chapter.`;
  if (status === "manter") {
    if (Math.abs(demanda - oferta) < GAP_MINIMO_PESSOAS)
      return `Demanda e oferta empatadas em ${fmt0(demanda)} pessoas. Mantenha o ritmo atual de contratação.`;
    return `Oferta e demanda estão equilibradas (gap ${sinal(gapPct ?? 0)}%). Mantenha o ritmo atual de contratação.`;
  }
  if (gapPct == null)
    return `Demanda líquida de ${fmt0(demanda)} pessoas: as desalocações cobrem o Resource Request deste mês. Considere pausar novas aberturas ou redirecionar candidatos para outro chapter.`;
  return `Oferta já superou a demanda em ${fmt0(Math.abs(gapPct))}%. Considere pausar novas aberturas ou redirecionar candidatos para outro chapter.`;
}

// ---------------------------------------------------------------------------
// Pipe
// ---------------------------------------------------------------------------
export interface PipeResumo {
  chapter?: string;
  senioridade?: string;
  etapa?: string;
  ordem_etapa?: number;
  candidatos: number;
  conversao_pct: number | null;
  tempo_medio_dias: number | null;
  meta_sla_dias: number | null;
  excesso_dias: number | null;
  status_sla: StatusSla | null;
}

type ChavePipe = "chapter" | "senioridade" | "etapa";

/** Agrega o pipe no nível pedido e refaz médias ponderadas e SLA. */
export function resumoPipe(rows: PipeNivel[], por: ChavePipe[]): PipeResumo[] {
  const grupos = new Map<string, { k: Partial<PipeNivel>; acc: PipeNivel[] }>();
  for (const r of rows) {
    const key = por.map((p) => r[p]).join("\u0001");
    let g = grupos.get(key);
    if (!g) {
      const k: Partial<PipeNivel> = {};
      for (const p of por) (k as Record<string, unknown>)[p] = r[p];
      if (por.includes("etapa")) k.ordem_etapa = r.ordem_etapa;
      g = { k, acc: [] };
      grupos.set(key, g);
    }
    g.acc.push(r);
  }
  const out: PipeResumo[] = [];
  for (const { k, acc } of grupos.values()) {
    let candidatos = 0, convS = 0, convN = 0, tempoS = 0, tempoN = 0;
    let meta: number | null = null;
    for (const r of acc) {
      candidatos += r.candidatos;
      convS += r.conv_soma;
      convN += r.conv_n;
      tempoS += r.tempo_soma;
      tempoN += r.tempo_n;
      if (r.meta_sla_dias != null) meta = meta == null ? r.meta_sla_dias : Math.max(meta, r.meta_sla_dias);
    }
    let tempo = tempoN > 0 ? Math.round(tempoS / tempoN) : null;
    if (k.etapa === "Contratação") {
      tempo = null;
      meta = null;
    }
    const excesso = tempo != null && meta != null ? tempo - meta : null;
    out.push({
      ...(k as object),
      candidatos,
      conversao_pct: convN > 0 ? round1(convS / convN) : null,
      tempo_medio_dias: tempo,
      meta_sla_dias: meta,
      excesso_dias: excesso,
      status_sla: excesso == null ? null : excesso > 5 ? "critico" : excesso > 0 ? "atencao" : "ok",
    });
  }
  return out;
}

/** Filtra por chapter e senioridade; null ou "Todos" não filtra. */
export function recorte<T extends { chapter: string | null; senioridade: string }>(
  rows: T[],
  chapter?: string | null,
  senioridade?: string | null,
): T[] {
  return rows.filter(
    (r) =>
      (!chapter || chapter === TODOS || r.chapter === chapter) &&
      (!senioridade || senioridade === TODOS || r.senioridade === senioridade),
  );
}

const INICIO_CONVERSAO = {
  "Avaliação de currículo": "candidaturas",
  "Envio do Case Escrito": "chegaram_case",
  "Entrevista Fit": "chegaram_fit",
  "Entrevista Técnica 1": "chegaram_tec1",
} as const;

export function conversaoAteContratacao(
  taxas: Taxa[],
  inicio: keyof typeof INICIO_CONVERSAO,
  chapter?: string | null,
  sen?: string | null,
): { contratados: number; base: number; pct: number | null } {
  const df = recorte(taxas, chapter, sen);
  const col = INICIO_CONVERSAO[inicio];
  const base = sum(df, (r) => r[col]);
  const contratados = sum(df, (r) => r.contratados);
  return { contratados, base, pct: base ? (contratados / base) * 100 : null };
}

export function taxaAceiteOferta(taxas: Taxa[], chapter?: string | null, sen?: string | null): number | null {
  const df = recorte(taxas, chapter, sen);
  const c = sum(df, (r) => r.contratados);
  const decididas = c + sum(df, (r) => r.recusas_oferta);
  return decididas ? (c / decididas) * 100 : null;
}

export function tempoMedioContratacao(taxas: Taxa[], chapter?: string | null, sen?: string | null): number | null {
  const df = recorte(taxas, chapter, sen);
  const n = sum(df, (r) => r.contratados_com_dias);
  return n ? sum(df, (r) => r.dias_contratacao) / n : null;
}

export function taxaAceiteSys(su: SuOferta[], chapter?: string | null, sen?: string | null): number | null {
  const df = recorte(su, chapter, sen);
  const c = sum(df, (r) => r.candidaturas_sys);
  return c ? (sum(df, (r) => r.aceites_sys) / c) * 100 : null;
}

export function suTempoMedioBanco(su: SuBanco[], chapter?: string | null, sen?: string | null): number | null {
  const df = recorte(su, chapter, sen);
  const n = sum(df, (r) => r.dias_n);
  return n ? sum(df, (r) => r.dias_soma) / n : null;
}

export function pipeQualificado(pipe: PipeNivel[], chapter?: string): number {
  return sum(
    pipe.filter(
      (r) =>
        QUALIFIED_STAGES.includes(r.etapa) &&
        SENIORIDADES_FAROL.includes(r.senioridade) &&
        (!chapter || r.chapter === chapter),
    ),
    (r) => r.candidatos,
  );
}

// ---------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------
const MES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** '2026-11' -> 'Nov/2026' */
export function rotuloMes(ym: string): string {
  const [ano, mes] = ym.slice(0, 7).split("-");
  return `${MES_PT[Number(mes) - 1]}/${ano}`;
}

/** '2026-11-17' -> '17/11/2026' */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Inteiro no formato brasileiro: 57312 -> 57.312 (meio para longe do zero, como o Python mostrava). */
export const fmt0 = (v: number) => nf0.format(Math.round(v) === 0 ? 0 : Math.round(v));
export const fmt1 = (v: number) => nf1.format(v);
export const sinal = (v: number) => (Math.round(v) > 0 ? "+" : "") + fmt0(v);
export const pct0 = (v: number | null) => (v == null ? "—" : `${fmt0(v)}%`);
export const pct1 = (v: number | null) => (v == null ? "—" : `${fmt1(v)}%`);

export function sum<T>(rows: T[], f: (r: T) => number | null | undefined): number {
  let s = 0;
  for (const r of rows) s += f(r) ?? 0;
  return s;
}

export function janelaTxt(d: Dashboard): string {
  return `próximos ${HORIZONTE_FAROL_DIAS} dias (até ${dataBR(d.fimJanela)})`;
}

export function listaPt(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export function ordenarSenioridades(sens: Iterable<string>): string[] {
  const set = new Set(sens);
  return [
    ...SENIORIDADE_ORDER.filter((s) => set.has(s)),
    ...[...set].filter((s) => !SENIORIDADE_ORDER.includes(s)).sort(),
  ];
}
