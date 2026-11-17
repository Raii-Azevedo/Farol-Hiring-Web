"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { Drawer, Finding, Hint, Kpi, Note, Pill, Sec, Select, Tiles } from "../ui";
import { Funnel, HBars, Heatmap } from "../charts";
import {
  ETAPA_CURTA, STAGES_ORDER, TODOS, conversaoAteContratacao, dataBR, fmt0, fmt1, ordenarSenioridades, recorte,
  resumoPipe, sinal, suTempoMedioBanco, sum, taxaAceiteOferta, taxaAceiteSys, type PipeResumo, type StatusSla,
} from "@/lib/model";
import type { Pessoa } from "@/app/api/pessoas/route";

interface LinhaSla {
  chapter: string | null; // null = recorte inteiro
  rotulo: string;
  cel: Map<string, PipeResumo>;
  su: number | null;
}

type Detalhe =
  | { tipo: "su"; chapter: string | null }
  | { tipo: "vagas"; etapa: string; status: StatusSla }
  | { tipo: "pessoas"; etapa: string; status: StatusSla; vaga: string };

const STATUS_PT: Record<string, string> = { critico: "Crítico", atencao: "Atenção", ok: "OK" };

export function VisaoPipe() {
  const { data, pipeChapter: ch, pipeSen: sen, setPipe } = useApp();
  const [det, setDet] = useState<Detalhe | null>(null);

  const chapters = useMemo(() => [...new Set(data.pipeNivel.map((p) => p.chapter))].sort(), [data]);
  const sens = useMemo(() => ordenarSenioridades(data.pipeNivel.map((p) => p.senioridade)), [data]);
  const rotulo = `${ch === TODOS ? "todos os chapters" : ch} · ${sen === TODOS ? "todas as senioridades" : sen}`;
  const dc = dataBR(data.dataCarga);

  const nivel = useMemo(() => recorte(data.pipeNivel, ch, sen), [data, ch, sen]);
  const porEtapa = useMemo(
    () => resumoPipe(nivel, ["etapa"]).sort((a, b) => (a.ordem_etapa ?? 0) - (b.ordem_etapa ?? 0)),
    [nivel],
  );
  const porChEtapa = useMemo(() => resumoPipe(nivel, ["chapter", "etapa"]), [nivel]);
  const parados = useMemo(() => recorte(data.parados, ch, sen), [data, ch, sen]);

  const k = useMemo(() => {
    const fit = conversaoAteContratacao(data.taxas, "Entrevista Fit", ch, sen);
    const tx = recorte(data.taxas, ch, sen);
    const su = recorte(data.suOfertas, ch, sen);
    return {
      fit,
      case: conversaoAteContratacao(data.taxas, "Envio do Case Escrito", ch, sen),
      tec1: conversaoAteContratacao(data.taxas, "Entrevista Técnica 1", ch, sen),
      cv: conversaoAteContratacao(data.taxas, "Avaliação de currículo", ch, sen),
      aceite: taxaAceiteOferta(data.taxas, ch, sen),
      contratados: sum(tx, (r) => r.contratados),
      decididas: sum(tx, (r) => r.contratados + r.recusas_oferta),
      sys: taxaAceiteSys(data.suOfertas, ch, sen),
      nSu: sum(su, (r) => r.candidaturas_sys),
      nSuAc: sum(su, (r) => r.aceites_sys),
      banco: suTempoMedioBanco(data.suBanco, ch, sen),
    };
  }, [data, ch, sen]);

  if (!nivel.length) {
    return (
      <>
        {filtros()}
        <Note variant="neutral">Sem candidaturas no recorte {rotulo}.</Note>
      </>
    );
  }

  const sla = porChEtapa.filter((r) => r.excesso_dias != null);
  const pior = [...sla].sort((a, b) => (b.excesso_dias ?? 0) - (a.excesso_dias ?? 0))[0];
  const nSla = (s: string) => sla.filter((r) => r.status_sla === s).length;

  // Matriz de SLA: uma linha por chapter (+ o recorte inteiro, quando há
  // mais de um), uma coluna por etapa e a espera no See You Soon no fim.
  const etapasSla = STAGES_ORDER.filter((e) => e !== "Contratação" && porChEtapa.some((r) => r.etapa === e && r.tempo_medio_dias != null));
  const metaEtapa = new Map(porEtapa.filter((r) => r.meta_sla_dias != null).map((r) => [r.etapa!, r.meta_sla_dias!]));
  const chSla = [...new Set(porChEtapa.map((r) => r.chapter!))].sort();
  const linhasSla: LinhaSla[] = [
    ...(chSla.length > 1
      ? [{ chapter: null, rotulo: "Recorte inteiro", cel: new Map(porEtapa.map((r) => [r.etapa!, r])), su: k.banco }]
      : []),
    ...chSla.map((c) => ({
      chapter: c,
      rotulo: c,
      cel: new Map(porChEtapa.filter((r) => r.chapter === c).map((r) => [r.etapa!, r])),
      su: suTempoMedioBanco(data.suBanco, c, sen),
    })),
  ];

  let notaFit = "Ninguém chegou à Entrevista Fit neste recorte.";
  if (k.fit.pct != null) {
    notaFit = `${fmt0(k.fit.contratados)} contratações de ${fmt0(k.fit.base)} candidaturas que chegaram à Fit.`;
    if (k.tec1.pct != null) notaFit += ` Desde a Técnica 1: ${fmt1(k.tec1.pct)}%.`;
    if (k.case.pct != null) notaFit += ` Desde o Envio do Case: ${fmt1(k.case.pct)}%.`;
    if (k.fit.contratados) notaFit += ` Desde o currículo: 1 a cada ${fmt0(k.cv.base / k.fit.contratados)}.`;
  }

  const funil = porEtapa.filter((r) => (r.ordem_etapa ?? 0) >= 2 && r.etapa !== "Contratação");
  const nCv = porEtapa.find((r) => r.etapa === "Avaliação de currículo")?.candidatos ?? 0;

  // O Greenhouse registra a conversão na etapa DESTINO: "avança a partir
  // desta etapa" é a conversão da etapa seguinte.
  const convPor = new Map(porEtapa.map((r) => [r.etapa, r.conversao_pct]));
  const etapas = STAGES_ORDER.filter((e) => convPor.has(e));
  const conv = etapas.slice(0, -1)
    .map((o, i) => ({ o, d: etapas[i + 1], v: convPor.get(etapas[i + 1]) }))
    .filter((x): x is { o: string; d: string; v: number } => x.v != null);

  const etapasHeat = STAGES_ORDER.filter((e) => e !== "Avaliação de currículo" && e !== "Contratação");
  const heatIdx = new Map(porChEtapa.map((r) => [`${r.chapter}|${r.etapa}`, r.candidatos]));
  const heatRows = [...new Set(porChEtapa.filter((r) => etapasHeat.includes(r.etapa!)).map((r) => r.chapter!))].sort();
  const heatCols = etapasHeat.filter((e) => porChEtapa.some((r) => r.etapa === e));
  const triagem = porChEtapa
    .filter((r) => r.etapa === "Avaliação de currículo")
    .sort((a, b) => b.candidatos - a.candidatos);

  // Quebra por senioridade de cada célula do heatmap, mostrada no tooltip
  // (era uma tabela separada logo abaixo). ▲ = volume atípico para a etapa:
  // acima de média + 1,5 desvio entre as combinações chapter × senioridade.
  const porNivel = resumoPipe(nivel, ["chapter", "senioridade", "etapa"]);
  const limiar = new Map(
    STAGES_ORDER.map((e) => {
      const vs = porNivel.filter((r) => r.etapa === e).map((r) => r.candidatos);
      const m = vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
      const sd = Math.sqrt(vs.reduce((a, b) => a + (b - m) ** 2, 0) / (vs.length || 1));
      return [e, sd ? m + 1.5 * sd : m * 1.5];
    }),
  );
  const quebraSen = (chapter: string, etapa: string) =>
    porNivel
      .filter((r) => r.chapter === chapter && r.etapa === etapa && r.candidatos > 0)
      .sort((a, b) => sens.indexOf(a.senioridade!) - sens.indexOf(b.senioridade!))
      .map((r) => {
        const alto = r.candidatos >= 5 && r.candidatos > (limiar.get(etapa) ?? Infinity);
        return `${r.senioridade}: ${fmt0(r.candidatos)}${alto ? "  ▲ acima do normal" : ""}`;
      });

  const etapasParados = STAGES_ORDER.filter((e) => data.parados.some((p) => p.etapa === e));
  const metas = new Map<string, number>();
  for (const p of data.parados) if (p.meta_sla_dias != null) metas.set(p.etapa, Math.max(metas.get(p.etapa) ?? 0, p.meta_sla_dias));
  const contagem = (e: string, s: string) => sum(parados.filter((p) => p.etapa === e && p.status === s), (p) => p.n);
  const nPar = (s: string) => sum(parados.filter((p) => p.status === s), (p) => p.n);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão do Pipe</h1>
          <p>Conversão, tempo por etapa, distribuição de candidatos e gargalos do funil no Greenhouse.</p>
          <div className="meta-row">
            <span className="meta-pill"><span className="dot" style={{ background: "var(--bar)" }} />Pipe: foto de {dc}</span>
            <span className="meta-pill">Os filtros valem para a aba inteira</span>
          </div>
        </div>
        {filtros()}
      </div>

      <div className="grid g4">
        <Kpi label="Entrevista Fit → contratação" value={k.fit.pct == null ? "—" : `${fmt1(k.fit.pct)}%`} note={notaFit} />
        <Kpi
          label="Oferta → contratação"
          value={k.aceite == null ? "—" : `${fmt0(k.aceite)}%`}
          note={`${fmt0(k.contratados)} contratados de ${fmt0(k.decididas)} com a oferta já decidida. Quem ainda está em Oferta fica fora.`}
        />
        <Kpi
          label="See You Soon → contratação"
          value={k.sys == null ? "—" : `${fmt0(k.sys)}%`}
          note={`${fmt0(k.nSuAc)} de ${fmt0(k.nSu)} pessoas que passaram pelo banco aceitaram uma oferta.`}
        />
        <Kpi
          label="Espera no See You Soon"
          value={k.banco == null ? "—" : fmt0(k.banco)}
          unit="dias"
          note="Média de dias no banco de quem aguarda hoje, cada um desde a data em que entrou."
        />
      </div>
      <p className="caption">Recorte: <b>{rotulo}</b> · conversões no histórico inteiro do Greenhouse.</p>

      <div style={{ marginTop: 16 }}>
        <Finding>
          {rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}:{" "}
          {nSla("critico") && pior ? (
            <>
              <b>{nSla("critico")} etapa(s) em SLA crítico</b>. A pior é <b>{pior.etapa}</b> em {pior.chapter} (
              {fmt0(pior.tempo_medio_dias!)}d vs. meta de {fmt0(pior.meta_sla_dias!)}d).
            </>
          ) : (
            "nenhuma etapa em SLA crítico."
          )}
        </Finding>
      </div>

      <Sec eyebrow="1 · Onde trava" title="Tempo em cada etapa contra a meta" />
      <div className="card">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <p className="card-sub" style={{ margin: 0, maxWidth: 640 }}>
            Dias corridos que um candidato fica em cada etapa (média do Greenhouse por vaga, ponderada pelas
            candidaturas), comparados com a meta da etapa. Na última coluna, a espera no banco See You Soon.
          </p>
          <div className="legend-row" style={{ margin: 0 }}>
            <span><i style={{ background: "var(--red)" }} />{nSla("critico")} crítico</span>
            <span><i style={{ background: "var(--amber)" }} />{nSla("atencao")} atenção</span>
            <span><i style={{ background: "var(--green)" }} />{nSla("ok")} dentro da meta</span>
          </div>
        </div>
        <SlaMatriz
          linhas={linhasSla}
          etapas={etapasSla}
          metaEtapa={metaEtapa}
          onSu={(chapter) => setDet({ tipo: "su", chapter })}
        />
        <Hint>Passe o mouse numa célula para ver meta e excesso; clique na coluna See You Soon para ver quem está no banco.</Hint>
        <p className="caption">
          Atenção: acima da meta · Crítico: mais de 5 dias acima. Uma Oferta longa pode ser negociação demorada ou
          registro não atualizado no Greenhouse.
        </p>
      </div>

      <Sec eyebrow="2 · Por que trava" title="Volume e conversão em cada etapa" />
      <div className="grid g2">
        <div className="card">
          <div className="card-title">Funil de volume a partir do Envio do Case</div>
          <p className="card-sub">
            Candidatos em processo hoje. A triagem de currículo ({fmt0(nCv)} hoje) fica fora para não achatar as outras
            etapas; as contratações ({fmt0(k.fit.contratados)} no histórico) estão no card acima.
          </p>
          <Funnel items={funil.map((r) => ({ label: r.etapa!, value: r.candidatos, text: fmt0(r.candidatos), tip: `${r.etapa}\nCandidatos: ${fmt0(r.candidatos)}` }))} />
        </div>
        <div className="card">
          <div className="card-title">Quanto avança a partir de cada etapa</div>
          <p className="card-sub">De cada 100 que estavam na etapa, quantos foram para a seguinte. Taxa do Greenhouse, teto de 100% por vaga.</p>
          <HBars
            max={100}
            items={conv.map((x) => ({
              key: x.o,
              label: `${x.o} → ${x.d}`,
              value: x.v,
              text: `${fmt0(x.v)}%`,
              tip: `${x.o} → ${x.d}\n${fmt0(x.v)}% de quem estava na etapa avançou`,
            }))}
          />
        </div>
      </div>

      <Sec eyebrow="3 · Onde está o volume" title="Candidatos vivos por etapa" />
      <div className="card">
        <div className="card-title">Candidatos por etapa × chapter</div>
        <p className="card-sub">Do Envio do Case até a Oferta. Mais escuro = mais gente aguardando ali.</p>
        {triagem.length > 0 && (
          <div className="chips" style={{ marginBottom: 14 }}>
            <span className="sec-eyebrow" style={{ marginRight: 4 }}>Triagem de currículo · monitoramento</span>
            {triagem.map((t) => (
              <span className="chip" key={t.chapter}>{t.chapter} <b>{fmt0(t.candidatos)}</b></span>
            ))}
          </div>
        )}
        {heatRows.length === 0 ? (
          <Note variant="neutral">Ninguém do Envio do Case em diante neste recorte.</Note>
        ) : (
          <>
            <HeatCandidatos rows={heatRows} cols={heatCols} idx={heatIdx} quebra={quebraSen} />
            <Hint>Passe o mouse numa célula para ver quantos são de cada senioridade.</Hint>
          </>
        )}
      </div>

      <Sec eyebrow="4 · Quem está travado" title="Candidatos parados por etapa" sub={`dias na etapa até a carga de ${dc}`} />
      <Tiles
        items={[
          { n: fmt0(nPar("critico")), label: "candidatos em crítico", status: "critico" },
          { n: fmt0(nPar("atencao")), label: "em atenção", status: "atencao" },
          { n: fmt0(nPar("ok")), label: "dentro da meta", status: "ok" },
        ]}
      />
      {parados.length === 0 ? (
        <Note variant="neutral">Nenhum candidato em processo neste recorte.</Note>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="pm" style={{ gridTemplateColumns: `110px repeat(${etapasParados.length}, minmax(86px, 1fr))` }}>
            <div />
            {etapasParados.map((e) => (
              <div className="pm-th" key={e}>
                {e}
                {metas.has(e) && <span>Meta {fmt0(metas.get(e)!)}d · crítico &gt;{fmt0(metas.get(e)! + 5)}d</span>}
              </div>
            ))}
            {(["atencao", "critico"] as const).map((s) => (
              <Fragment key={s}>
                <div className={`pm-lbl s-${s}`}><i />{STATUS_PT[s]}</div>
                {etapasParados.map((e) => {
                  const q = contagem(e, s);
                  return q ? (
                    <button
                      key={e}
                      className={`pm-cell s-${s}`}
                      onClick={() => setDet({ tipo: "vagas", etapa: e, status: s })}
                      data-tip={`${q} em ${STATUS_PT[s].toLowerCase()} na etapa ${e}\nClique para ver as vagas`}
                    >
                      {fmt0(q)}
                    </button>
                  ) : (
                    <div className="pm-empty" key={e}>–</div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <Hint>Clique em um número para ver as vagas e quem está parado, com os dias de cada um na etapa.</Hint>
          <p className="caption">
            Antes de agir, confira no Greenhouse: etapa desatualizada (ex.: pessoa já contratada ainda em Conversa
            Final) aparece aqui como parada.
          </p>
        </div>
      )}

      {det && <DetalheDrawer det={det} setDet={setDet} />}
    </>
  );

  function filtros() {
    return (
      <div className="filters">
        <Select id="f-ch" label="Chapter" value={ch} options={[TODOS, ...chapters]} onChange={(v) => setPipe(v, sen)} />
        <Select id="f-sen" label="Senioridade" value={sen} options={[TODOS, ...sens]} onChange={(v) => setPipe(ch, v)} />
      </div>
    );
  }
}

function HeatCandidatos({
  rows, cols, idx, quebra,
}: {
  rows: string[];
  cols: string[];
  idx: Map<string, number>;
  quebra: (chapter: string, etapa: string) => string[];
}) {
  const { dark } = useApp();
  return (
    <Heatmap
      dark={dark}
      rows={rows}
      cols={cols}
      value={(r, c) => idx.get(`${r}|${c}`)}
      fmt={(v) => fmt0(v)}
      tip={(r, c, v) => {
        const linhas = quebra(r, c);
        return [`${r} · ${c}`, `Candidatos: ${v == null ? "—" : fmt0(v)}`, ...(linhas.length ? ["", ...linhas] : [])].join("\n");
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Matriz de SLA: chapter × etapa, célula = tempo médio na cor do status
// ---------------------------------------------------------------------------
function SlaMatriz({
  linhas, etapas, metaEtapa, onSu,
}: {
  linhas: LinhaSla[];
  etapas: string[];
  metaEtapa: Map<string, number>;
  onSu: (chapter: string | null) => void;
}) {
  const temSu = linhas.some((l) => l.su != null);
  return (
    <div className="sla" style={{ gridTemplateColumns: `minmax(150px, 1.3fr) repeat(${etapas.length}, minmax(68px, 1fr))${temSu ? " minmax(84px, 1fr)" : ""}` }}>
      <div />
      {etapas.map((e) => (
        <div className="sla-h" key={e}>
          {ETAPA_CURTA[e] ?? e}
          <span>{metaEtapa.has(e) ? `meta ${fmt0(metaEtapa.get(e)!)}d` : " "}</span>
        </div>
      ))}
      {temSu && (
        <div className="sla-h sla-su-h">
          See You Soon<span>espera no banco</span>
        </div>
      )}
      {linhas.map((l) => (
        <Fragment key={l.rotulo}>
          <div className={`sla-r${l.chapter == null ? " sla-total" : ""}`}>{l.rotulo}</div>
          {etapas.map((e) => {
            const c = l.cel.get(e);
            if (c?.tempo_medio_dias == null) return <div className="sla-c sla-vazio" key={e}>—</div>;
            const st = c.status_sla;
            return (
              <div
                key={e}
                className={`sla-c${st ? ` s-${st}` : ""}${l.chapter == null ? " sla-total" : ""}`}
                data-tip={[
                  `${l.rotulo} · ${e}`,
                  `Tempo médio: ${fmt0(c.tempo_medio_dias)} dias`,
                  c.meta_sla_dias != null ? `Meta: ${fmt0(c.meta_sla_dias)} dias (excesso ${sinal(c.excesso_dias ?? 0)})` : "",
                  st ? `Status: ${STATUS_PT[st]}` : "",
                ].filter(Boolean).join("\n")}
              >
                {fmt0(c.tempo_medio_dias)}d
              </div>
            );
          })}
          {temSu &&
            (l.su == null ? (
              <div className="sla-c sla-vazio">—</div>
            ) : (
              <button
                className={`sla-c sla-su${l.chapter == null ? " sla-total" : ""}`}
                onClick={() => onSu(l.chapter)}
                data-tip={`${l.rotulo} · See You Soon\nEspera média no banco: ${fmt0(l.su)} dias\nClique para ver quem está no banco`}
              >
                {fmt0(l.su)}d
              </button>
            ))}
        </Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de detalhe
// ---------------------------------------------------------------------------
function DetalheDrawer({ det, setDet }: { det: Detalhe; setDet: (d: Detalhe | null) => void }) {
  const { data, pipeChapter: ch, pipeSen: sen } = useApp();
  const fechar = () => setDet(null);
  const dc = dataBR(data.dataCarga);

  if (det.tipo === "vagas") {
    const rows = recorte(data.parados, ch, sen).filter((p) => p.etapa === det.etapa && p.status === det.status);
    const porVaga = new Map<string, { n: number; pior: number | null }>();
    for (const p of rows) {
      const g = porVaga.get(p.vaga) ?? { n: 0, pior: null };
      g.n += p.n;
      if (p.pior_dias != null) g.pior = Math.max(g.pior ?? 0, p.pior_dias);
      porVaga.set(p.vaga, g);
    }
    const vagas = [...porVaga.entries()].sort((a, b) => b[1].n - a[1].n || (b[1].pior ?? 0) - (a[1].pior ?? 0));
    const total = sum(rows, (p) => p.n);
    return (
      <Drawer
        title={`${det.etapa} · ${STATUS_PT[det.status]}`}
        sub={`${fmt0(total)} candidato(s), dias na etapa contados até a carga de ${dc}. Clique numa vaga para ver quem são.`}
        onClose={fechar}
      >
        {vagas.map(([vaga, g]) => (
          <button key={vaga} className="list-btn" onClick={() => setDet({ tipo: "pessoas", etapa: det.etapa, status: det.status, vaga })}>
            <span>
              {vaga}
              {g.pior != null && <small>até {fmt0(g.pior)}d na etapa</small>}
            </span>
            <Pill status={det.status} label={`${g.n}`} />
          </button>
        ))}
      </Drawer>
    );
  }

  const params =
    det.tipo === "su"
      ? new URLSearchParams({ tipo: "su", chapter: det.chapter ?? ch, senioridade: sen })
      : new URLSearchParams({ tipo: "parados", etapa: det.etapa, status: det.status, vaga: det.vaga, chapter: ch, senioridade: sen });
  return (
    <Drawer
      title={det.tipo === "su" ? `Banco See You Soon${det.chapter ? ` · ${det.chapter}` : ""}` : det.vaga}
      sub={
        det.tipo === "su"
          ? `Quem está aguardando no banco, de quem espera há mais tempo para quem espera há menos. Dias até a carga de ${dc}.`
          : `"${det.etapa}" · ${STATUS_PT[det.status]}. Dias na etapa até ${dc}.`
      }
      onClose={fechar}
    >
      {det.tipo === "pessoas" && (
        <button className="link-btn" style={{ marginBottom: 12 }} onClick={() => setDet({ tipo: "vagas", etapa: det.etapa, status: det.status })}>
          ‹ Voltar para as vagas
        </button>
      )}
      <ListaPessoas qs={params.toString()} su={det.tipo === "su"} />
    </Drawer>
  );
}

function ListaPessoas({ qs, su }: { qs: string; su: boolean }) {
  const [rows, setRows] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setRows(null);
    setErro(null);
    fetch(`/api/pessoas?${qs}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? r.statusText);
        return j as Pessoa[];
      })
      .then((j) => vivo && setRows(j))
      .catch((e) => vivo && setErro(String(e.message ?? e)));
    return () => { vivo = false; };
  }, [qs]);

  if (erro) return <Note variant="critical">Não consegui carregar a lista: {erro}</Note>;
  if (!rows) return <>{[0, 1, 2, 3, 4].map((i) => <div className="skeleton" key={i} />)}</>;
  if (!rows.length) return <Note variant="neutral">Ninguém neste recorte.</Note>;
  const media = su ? sum(rows, (r) => r.dias) / (rows.filter((r) => r.dias != null).length || 1) : null;
  return (
    <>
      <p className="caption" style={{ marginTop: 0 }}>
        {rows.length} pessoa(s){media != null && <> · média de <b>{fmt0(media)} dias</b> no banco</>}
        {rows.length === 500 && " (mostrando as 500 há mais tempo)"}
      </p>
      {rows.map((r, i) => {
        const ini = (r.candidato ?? "?").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
        const cor = r.status === "critico" ? "var(--red)" : r.status === "atencao" ? "var(--amber)" : "var(--ink)";
        const desde = r.desde ? `desde ${dataBR(r.desde)}` : "sem data de entrada";
        return (
          <div className="cand" key={`${r.candidato}${i}`}>
            <div className="cand-l">
              <div className="cand-av">{ini}</div>
              <div style={{ minWidth: 0 }}>
                <div className="cand-n">{r.candidato}</div>
                <div className="cand-r">{r.chapter ?? "Sem chapter"} · {r.senioridade}{su && r.vaga ? ` · ${r.vaga}` : ""}</div>
              </div>
            </div>
            <div className="cand-d">
              <b style={{ color: cor }}>{r.dias != null ? `${fmt0(r.dias)}d` : "—"}</b>
              <small>{r.meta_sla_dias != null ? `meta ${fmt0(r.meta_sla_dias)}d · ` : ""}{desde}</small>
            </div>
          </div>
        );
      })}
    </>
  );
}
