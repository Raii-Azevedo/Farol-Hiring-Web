"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useApp } from "../App";
import { CardHead, Drawer, Finding, InfoTip, Kpi, Note, Pill, Sec, Select, Tiles, tip, type TipData } from "../ui";
import { Funnel, HBars, Heatmap } from "../charts";
import {
  ETAPA_CURTA, STAGES_ORDER, TODOS, conversaoAteContratacao, dataBR, fmt0, fmt1, ordenarSenioridades, recorte,
  resumoPipe, suTempoMedioBanco, sum, taxaAceiteOferta, taxaAceiteSys, type StatusSla,
} from "@/lib/model";
import type { Pessoa } from "@/app/api/pessoas/route";

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
        return { sen: r.senioridade!, n: r.candidatos, alto };
      });

  const etapasParados = STAGES_ORDER.filter((e) => data.parados.some((p) => p.etapa === e));
  const metas = new Map<string, number>();
  for (const p of data.parados) if (p.meta_sla_dias != null) metas.set(p.etapa, Math.max(metas.get(p.etapa) ?? 0, p.meta_sla_dias));
  const contagem = (e: string, s: string) => sum(parados.filter((p) => p.etapa === e && p.status === s), (p) => p.n);
  const nPar = (s: string) => sum(parados.filter((p) => p.status === s), (p) => p.n);
  // etapa com mais gente em crítico, para a frase de destaque
  const topCrit = etapasParados
    .map((e) => ({ e, n: contagem(e, "critico") }))
    .sort((a, b) => b.n - a.n)[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão do Pipe</h1>
          <p>Onde o funil trava, por quê, e quem está parado.</p>
          <div className="meta-row">
            <span className="meta-pill" data-tip={tip({ t: "Pipe", n: "Foto do Greenhouse na data da última carga. Os filtros valem para a aba inteira." })}>
              <span className="dot" style={{ background: "var(--bar)" }} />Pipe: {dc}
            </span>
          </div>
        </div>
        {filtros()}
      </div>

      <div className="grid g4">
        <Kpi
          label="Entrevista Fit → contratação"
          value={k.fit.pct == null ? "—" : `${fmt1(k.fit.pct)}%`}
          info={`${notaFit} Conversões no histórico inteiro do Greenhouse.`}
          detail={k.fit.pct != null ? <><b>{fmt0(k.fit.contratados)}</b> de <b>{fmt0(k.fit.base)}</b></> : undefined}
        />
        <Kpi
          label="Oferta → contratação"
          value={k.aceite == null ? "—" : `${fmt0(k.aceite)}%`}
          progress={k.aceite}
          info="Contratados ÷ ofertas já decididas. Quem ainda está em Oferta fica fora."
          detail={<><b>{fmt0(k.contratados)}</b> de <b>{fmt0(k.decididas)}</b> decididas</>}
        />
        <Kpi
          label="See You Soon → contratação"
          value={k.sys == null ? "—" : `${fmt0(k.sys)}%`}
          progress={k.sys}
          info="Pessoas que passaram pelo banco See You Soon e aceitaram uma oferta."
          detail={<><b>{fmt0(k.nSuAc)}</b> de <b>{fmt0(k.nSu)}</b> pessoas</>}
        />
        <Kpi
          label="Espera no See You Soon"
          value={k.banco == null ? "—" : fmt0(k.banco)}
          unit="dias"
          info="Média de dias no banco de quem aguarda hoje, cada um desde a data em que entrou. Clique para ver quem está no banco."
          detail="Ver quem está no banco ↗"
          onClick={k.banco == null ? undefined : () => setDet({ tipo: "su", chapter: ch === TODOS ? null : ch })}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <Finding>
          {rotulo.charAt(0).toUpperCase() + rotulo.slice(1)}:{" "}
          {nPar("critico") > 0 && topCrit?.n ? (
            <>
              <b>{fmt0(nPar("critico"))} candidato(s) em crítico</b> e {fmt0(nPar("atencao"))} em atenção. A etapa com
              mais gente em crítico é <b>{topCrit.e}</b> ({fmt0(topCrit.n)}).
            </>
          ) : (
            "nenhum candidato em crítico."
          )}
        </Finding>
      </div>

      <Sec eyebrow="1 · Por que trava" title="Volume e conversão em cada etapa" />
      <div className="grid g2">
        <div className="card">
          <CardHead
            title="Funil a partir do Envio do Case"
            info={`Candidatos em processo hoje. A triagem de currículo (${fmt0(nCv)} hoje) fica fora para não achatar as outras etapas; as contratações (${fmt0(k.fit.contratados)} no histórico) estão no card acima.`}
          />
          <Funnel items={funil.map((r) => ({ label: r.etapa!, value: r.candidatos, text: fmt0(r.candidatos), tip: tip({ t: r.etapa!, rows: [{ l: "Candidatos hoje", v: fmt0(r.candidatos), c: "var(--bar)" }] }) }))} />
        </div>
        <div className="card">
          <CardHead
            title="Quanto avança de cada etapa"
            info="De cada 100 que estavam na etapa, quantos foram para a seguinte. Taxa do Greenhouse, teto de 100% por vaga."
          />
          <HBars
            max={100}
            items={conv.map((x) => ({
              key: x.o,
              label: `${x.o} → ${x.d}`,
              value: x.v,
              text: `${fmt0(x.v)}%`,
              tip: tip({ t: x.o, s: `→ ${x.d}`, rows: [{ l: "Avançou", v: `${fmt0(x.v)}%`, bar: x.v / 100, c: "var(--bar)" }] }),
            }))}
          />
        </div>
      </div>

      <Sec eyebrow="2 · Onde está o volume" title="Candidatos vivos por etapa" />
      <div className="card">
        <CardHead
          title="Candidatos por etapa × chapter"
          info="Do Envio do Case até a Oferta. Mais escuro = mais gente aguardando ali. Passe o mouse numa célula para ver a quebra por senioridade; ▲ marca volume acima do normal para a etapa."
        />
        {triagem.length > 0 && (
          <div className="chips" style={{ marginBottom: 16 }}>
            <span className="chips-lbl">
              Triagem de currículo
              <InfoTip text="Fica fora do mapa para não achatar as outras etapas. Só monitoramento." />
            </span>
            {triagem.map((t) => (
              <span className="chip" key={t.chapter}>{t.chapter} <b>{fmt0(t.candidatos)}</b></span>
            ))}
          </div>
        )}
        {heatRows.length === 0 ? (
          <Note variant="neutral">Ninguém do Envio do Case em diante neste recorte.</Note>
        ) : (
          <HeatCandidatos rows={heatRows} cols={heatCols} idx={heatIdx} quebra={quebraSen} />
        )}
      </div>

      <Sec
        eyebrow="3 · Quem está travado"
        title="Candidatos parados por etapa"
        info={`Dias na etapa até a carga de ${dc}. Clique num número para ver as vagas e quem está parado. Antes de agir, confira no Greenhouse: etapa desatualizada (ex.: pessoa já contratada ainda em Conversa Final) aparece aqui como parada.`}
      />
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
              <div
                className="pm-th"
                key={e}
                data-tip={metas.has(e) ? tip({ t: e, rows: [{ l: "Meta", v: `${fmt0(metas.get(e)!)} dias` }, { l: "Crítico", v: `> ${fmt0(metas.get(e)! + 5)} dias`, c: "var(--red)" }] }) : undefined}
              >
                {ETAPA_CURTA[e] ?? e}
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
                      data-tip={tip({ t: `${e} · ${STATUS_PT[s]}`, rows: [{ l: "Candidatos", v: fmt0(q), c: s === "critico" ? "var(--red)" : "var(--amber)" }], n: "Clique para ver as vagas" })}
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

interface Quebra { sen: string; n: number; alto: boolean }

function HeatCandidatos({
  rows, cols, idx, quebra,
}: {
  rows: string[];
  cols: string[];
  idx: Map<string, number>;
  quebra: (chapter: string, etapa: string) => Quebra[];
}) {
  const { dark } = useApp();
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => idx.get(`${r}|${c}`) ?? 0)));
  return (
    <Heatmap
      dark={dark}
      rows={rows}
      cols={cols}
      value={(r, c) => idx.get(`${r}|${c}`)}
      fmt={(v) => fmt0(v)}
      tip={(r, c, v) => {
        const q = quebra(r, c);
        const total = v ?? 0;
        const d: TipData = {
          t: r,
          s: c,
          rows: [
            { l: "Candidatos", v: v == null ? "—" : fmt0(v), bar: total / max, c: "var(--pink)" },
            ...(q.length ? [{ l: "—", v: "" }] : []),
            ...q.map((x) => ({
              l: x.sen,
              v: fmt0(x.n),
              bar: total ? x.n / total : 0,
              c: x.alto ? "var(--pink)" : "var(--bar)",
              flag: x.alto ? "▲" : undefined,
            })),
          ],
          n: q.some((x) => x.alto) ? "▲ volume acima do normal para a etapa" : undefined,
        };
        return tip(d);
      }}
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
