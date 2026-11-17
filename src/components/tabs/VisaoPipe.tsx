"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { Drawer, Finding, Hint, Kpi, Note, Pill, Sec, Select, Table, Tiles } from "../ui";
import { Funnel, HBars, Heatmap, VBars } from "../charts";
import {
  ETAPA_SU, STAGES_ORDER, TODOS, conversaoAteContratacao, dataBR, fmt0, fmt1, ordenarSenioridades, recorte,
  resumoPipe, sinal, suTempoMedioBanco, sum, taxaAceiteOferta, taxaAceiteSys, type StatusSla,
} from "@/lib/model";
import type { Pessoa } from "@/app/api/pessoas/route";

type Detalhe =
  | { tipo: "tempo"; etapa: string }
  | { tipo: "su" }
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

  const sla = porChEtapa
    .filter((r) => r.excesso_dias != null)
    .sort((a, b) => (a.chapter ?? "").localeCompare(b.chapter ?? "") || (a.ordem_etapa ?? 0) - (b.ordem_etapa ?? 0));
  const pior = [...sla].sort((a, b) => (b.excesso_dias ?? 0) - (a.excesso_dias ?? 0))[0];
  const nSla = (s: string) => sla.filter((r) => r.status_sla === s).length;

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

  const tempos = porEtapa.filter((r) => r.tempo_medio_dias != null);

  const etapasHeat = STAGES_ORDER.filter((e) => e !== "Avaliação de currículo" && e !== "Contratação");
  const heatIdx = new Map(porChEtapa.map((r) => [`${r.chapter}|${r.etapa}`, r.candidatos]));
  const heatRows = [...new Set(porChEtapa.filter((r) => etapasHeat.includes(r.etapa!)).map((r) => r.chapter!))].sort();
  const heatCols = etapasHeat.filter((e) => porChEtapa.some((r) => r.etapa === e));
  const triagem = porChEtapa
    .filter((r) => r.etapa === "Avaliação de currículo")
    .sort((a, b) => b.candidatos - a.candidatos);

  // volume por nível com marcação de volume atípico (> média + 1,5 desvio)
  const porNivel = resumoPipe(nivel, ["chapter", "senioridade", "etapa"]);
  const nivelCols = STAGES_ORDER.filter((e) => porNivel.some((r) => r.etapa === e));
  const nivelIdx = new Map(porNivel.map((r) => [`${r.chapter}|${r.senioridade}|${r.etapa}`, r.candidatos]));
  const nivelRows = [...new Set(porNivel.map((r) => `${r.chapter}|${r.senioridade}`))].sort((a, b) => {
    const [ca, sa] = a.split("|"), [cb, sb] = b.split("|");
    return ca.localeCompare(cb) || sens.indexOf(sa) - sens.indexOf(sb);
  });
  const limiar = new Map(
    nivelCols.map((e) => {
      const vs = nivelRows.map((r) => nivelIdx.get(`${r}|${e}`)).filter((v): v is number => v != null);
      const m = vs.reduce((a, b) => a + b, 0) / (vs.length || 1);
      const sd = Math.sqrt(vs.reduce((a, b) => a + (b - m) ** 2, 0) / (vs.length || 1));
      return [e, sd ? m + 1.5 * sd : m * 1.5];
    }),
  );

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

      <Sec eyebrow="1 · Onde trava" title="Gargalos e SLA" sub="tempo médio de cada etapa contra a meta, por chapter" />
      <Tiles
        items={[
          { n: nSla("critico"), label: "chapter × etapa em crítico", status: "critico" },
          { n: nSla("atencao"), label: "em atenção", status: "atencao" },
          { n: nSla("ok"), label: "dentro da meta", status: "ok" },
        ]}
      />
      <div style={{ marginTop: 12 }}>
        <Table
          rowKey={(r) => `${r.chapter}${r.etapa}`}
          rows={sla}
          cols={[
            { key: "c", label: "Chapter", render: (r) => r.chapter },
            { key: "e", label: "Etapa", render: (r) => r.etapa },
            { key: "t", label: "Tempo médio (dias)", align: "r", help: "Tempo médio corrido que um candidato permanece nesta etapa (média do Greenhouse por vaga).", render: (r) => fmt0(r.tempo_medio_dias!) },
            { key: "m", label: "Meta (dias)", align: "r", help: "SLA alvo definido para esta etapa.", render: (r) => fmt0(r.meta_sla_dias!) },
            { key: "x", label: "Excesso (dias)", align: "r", help: "Tempo médio − meta. Negativo = dentro do prazo.", render: (r) => sinal(r.excesso_dias!) },
            { key: "s", label: "Status", help: "Crítico: excesso > 5 dias · Atenção: até 5 dias · OK: dentro da meta.", render: (r) => <Pill status={r.status_sla!} label={STATUS_PT[r.status_sla!]} /> },
          ]}
        />
      </div>
      {pior?.status_sla === "critico" && (
        <Note variant="critical">
          🔴 <b>Pior gargalo:</b> {pior.etapa} em {pior.chapter}: {fmt0(pior.tempo_medio_dias!)} dias vs. meta de{" "}
          {fmt0(pior.meta_sla_dias!)} dias.
        </Note>
      )}

      <Sec eyebrow="2 · Por que trava" title="Conversão e tempo em cada etapa" />
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Tempo médio por etapa</div>
        <p className="card-sub">
          Dias corridos em cada etapa (média do Greenhouse por vaga, ponderada pelas candidaturas). A barra rosa é o
          banco See You Soon e não entra na média da Oferta.
        </p>
        {tempos.length === 0 && k.banco == null ? (
          <Note variant="neutral">Sem dado de tempo médio para este recorte.</Note>
        ) : (
          <>
            <VBars
              height={210}
              items={[
                ...tempos.map((r) => ({
                  label: r.etapa!,
                  value: r.tempo_medio_dias!,
                  text: `${fmt0(r.tempo_medio_dias!)}d`,
                  tip: `${r.etapa}\nTempo médio: ${fmt0(r.tempo_medio_dias!)} dias${r.meta_sla_dias != null ? ` (meta ${fmt0(r.meta_sla_dias)})` : ""}\nClique para ver por chapter`,
                  onClick: () => setDet({ tipo: "tempo", etapa: r.etapa! }),
                })),
                ...(k.banco != null
                  ? [{
                      label: ETAPA_SU,
                      value: Math.round(k.banco),
                      text: `${fmt0(k.banco)}d`,
                      color: "var(--pink)",
                      tip: `${ETAPA_SU}\nEspera média: ${fmt0(k.banco)} dias\nClique para ver quem está no banco`,
                      onClick: () => setDet({ tipo: "su" }),
                    }]
                  : []),
              ]}
            />
            <Hint>Clique em uma barra azul para ver a quebra por chapter, ou na rosa para ver quem está no banco.</Hint>
          </>
        )}
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
          <HeatCandidatos rows={heatRows} cols={heatCols} idx={heatIdx} />
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Volume por etapa e por nível</div>
        <p className="card-sub">
          Mesmo recorte, aberto por chapter × senioridade. <span className="flag-up">▲</span> marca volume bem acima do
          normal para a etapa.
        </p>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Chapter</th>
                <th>Senioridade</th>
                {nivelCols.map((e) => <th key={e} className="r">{e}</th>)}
              </tr>
            </thead>
            <tbody>
              {nivelRows.map((r) => {
                const [c, s] = r.split("|");
                return (
                  <tr key={r}>
                    <td>{c}</td>
                    <td>{s}</td>
                    {nivelCols.map((e) => {
                      const v = nivelIdx.get(`${r}|${e}`);
                      if (v == null) return <td key={e} className="r" style={{ color: "var(--muted)" }}>—</td>;
                      const alto = v >= 5 && v > (limiar.get(e) ?? Infinity);
                      return (
                        <td key={e} className="r">
                          {fmt0(v)}{alto && <span className="flag-up"> ▲</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

function HeatCandidatos({ rows, cols, idx }: { rows: string[]; cols: string[]; idx: Map<string, number> }) {
  const { dark } = useApp();
  return (
    <Heatmap
      dark={dark}
      rows={rows}
      cols={cols}
      value={(r, c) => idx.get(`${r}|${c}`)}
      fmt={(v) => fmt0(v)}
      tip={(r, c, v) => `${r} · ${c}\nCandidatos: ${v == null ? "—" : fmt0(v)}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Painel de detalhe
// ---------------------------------------------------------------------------
function DetalheDrawer({ det, setDet }: { det: Detalhe; setDet: (d: Detalhe | null) => void }) {
  const { data, pipeChapter: ch, pipeSen: sen } = useApp();
  const fechar = () => setDet(null);
  const dc = dataBR(data.dataCarga);

  if (det.tipo === "tempo") {
    const rows = resumoPipe(recorte(data.pipeNivel.filter((p) => p.etapa === det.etapa), null, sen), ["chapter"])
      .filter((r) => r.tempo_medio_dias != null)
      .sort((a, b) => b.tempo_medio_dias! - a.tempo_medio_dias!);
    const media = rows.length ? sum(rows, (r) => r.tempo_medio_dias) / rows.length : null;
    return (
      <Drawer
        title={det.etapa}
        sub={`Tempo médio (dias corridos) nesta etapa, por chapter${sen !== TODOS ? ` · senioridade ${sen}` : ""}.`}
        onClose={fechar}
      >
        {rows.length === 0 ? (
          <Note variant="neutral">Sem dado de tempo para esta etapa.</Note>
        ) : (
          <>
            <p className="caption" style={{ marginTop: 0, marginBottom: 16 }}>
              Média entre chapters: <b>{fmt0(media!)} dias</b> · mais lento: <b>{rows[0].chapter}</b> · mais rápido:{" "}
              <b>{rows[rows.length - 1].chapter}</b>
            </p>
            <HBars
              items={rows.map((r) => ({
                label: r.chapter!,
                value: r.tempo_medio_dias!,
                text: `${fmt0(r.tempo_medio_dias!)}d`,
                color: r.meta_sla_dias != null && r.tempo_medio_dias! > r.meta_sla_dias + 5 ? "var(--red)" : r.meta_sla_dias != null && r.tempo_medio_dias! > r.meta_sla_dias ? "var(--amber)" : undefined,
              }))}
            />
          </>
        )}
      </Drawer>
    );
  }

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
      ? new URLSearchParams({ tipo: "su", chapter: ch, senioridade: sen })
      : new URLSearchParams({ tipo: "parados", etapa: det.etapa, status: det.status, vaga: det.vaga, chapter: ch, senioridade: sen });
  return (
    <Drawer
      title={det.tipo === "su" ? "Banco See You Soon" : det.vaga}
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
