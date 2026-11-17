"use client";

import { Fragment, useMemo, useState } from "react";
import { useApp } from "../App";
import { InfoTip, Finding, Note, Pill, Sec, Seg, tip } from "../ui";
import {
  type FarolPico, SENIORIDADES_FAROL, dataBR, farolInsight, fmt0, gapTexto, janelaTxt, listaPt,
  pipeQualificado, rotuloMes, sinal, sum,
} from "@/lib/model";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function FarolExecutivo() {
  const { data, setPipe, irPara } = useApp();
  const J = janelaTxt(data);
  const varios = data.mesesJanela.length > 1;
  const fj = data.farolJanela;
  const chapters = useMemo(() => [...new Set(fj.map((r) => r.chapter))].sort(), [fj]);
  const [chSel, setChSel] = useState(chapters[0] ?? "");

  const idx = useMemo(() => new Map(fj.map((r) => [`${r.chapter}|${r.senioridade}`, r])), [fj]);
  const dec = fj.filter((r) => SENIORIDADES_FAROL.includes(r.senioridade));
  const acel = dec.filter((r) => r.farol_status === "acelerar").sort((a, b) => b.gap - a.gap);
  const paus = dec.filter((r) => r.farol_status === "pausar").sort((a, b) => a.gap - b.gap);
  const lista = (rs: FarolPico[]) =>
    rs.map((r, i) => (
      <Fragment key={`${r.chapter}${r.senioridade}`}>
        {i > 0 && ", "}
        <b>{r.chapter} {r.senioridade}</b> ({gapTexto(r.gap_pct, r.demanda_liquida, r.oferta_ajustada, true)})
      </Fragment>
    ));

  const maxRef = Math.max(1, ...dec.map((r) => Math.max(r.demanda_liquida, r.oferta_ajustada)));
  const verNoPipe = (c: string, s: string) => {
    setPipe(c, s);
    setChSel(c);
    irPara("pipe", `Visão do Pipe filtrada em ${c} · ${s}`);
  };

  const detalhe = SENIORIDADES_FAROL.map((s) => idx.get(`${chSel}|${s}`)).filter((r): r is FarolPico => !!r);
  const maxDet = Math.max(0.5, ...detalhe.map((r) => Math.max(r.demanda_liquida, r.oferta_ajustada)));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Farol de Contratação</h1>
          <p>Demanda líquida de projetos contra a oferta do funil, em um semáforo por chapter e senioridade.</p>
          <div className="meta-row">
            <span className="meta-pill" data-tip={tip({ t: "Janela de demanda", n: `Pico dos ${J}, cobrindo ${listaPt(data.mesesJanela.map(rotuloMes))}.` })}>
              <span className="dot" style={{ background: "var(--pink)" }} />Demanda: {J}
            </span>
            <span className="meta-pill" data-tip={tip({ t: "Pipe", n: "Foto do Greenhouse na data da última carga." })}>
              <span className="dot" style={{ background: "var(--bar)" }} />Pipe: {dataBR(data.dataCarga)}
            </span>
          </div>
        </div>
      </div>

      <Finding>
        {acel.length === 0 && paus.length === 0 ? (
          <>Nos <b>{J}</b>, todas as combinações de {SENIORIDADES_FAROL.join(" e ")} estão em 🟡 manter.</>
        ) : (
          <>
            Nos <b>{J}</b>:{" "}
            {acel.length > 0 && <>🟢 <b>acelerar</b>: {lista(acel)}</>}
            {acel.length > 0 && paus.length > 0 && " · "}
            {paus.length > 0 && <>🔴 <b>pausar</b>: {lista(paus)}</>}.
          </>
        )}
      </Finding>

      <Sec
        title="Farol por carreira × senioridade"
        info="Cada célula é uma decisão. A demanda já é líquida: o que os projetos pedem menos quem sai de projeto e pode ser realocado. Vale o mês de maior demanda dentro dos 45 dias (demanda mensal é estoque; somar contaria a mesma pessoa duas vezes). Estagiário fica só na Visão do Pipe. Passe o mouse num card para ver o porquê."
      />
      <div className="matrix" style={{ gridTemplateColumns: `minmax(130px, 0.8fr) repeat(${SENIORIDADES_FAROL.length}, minmax(0, 1.25fr)) minmax(0, 1fr)` }}>
        <div />
        {SENIORIDADES_FAROL.map((s) => (
          <div className="mx-th" key={s}>{s}</div>
        ))}
        <div className="mx-th">Total do chapter<InfoTip text="Sem status de propósito: a soma das senioridades pode dizer pausar enquanto uma delas precisa contratar." /></div>

        {chapters.map((ch) => {
          const doCh = fj.filter((r) => r.chapter === ch);
          return (
            <Fragment key={ch}>
              <div className="mx-ch">{ch}</div>
              {SENIORIDADES_FAROL.map((s) => {
                const r = idx.get(`${ch}|${s}`);
                if (!r) return <div className="fm fm-empty" key={s}>sem demanda nem pipe</div>;
                const g = gapTexto(r.gap_pct, r.demanda_liquida, r.oferta_ajustada, true);
                const cobertura = r.demanda_liquida > 0 ? Math.min(1, r.oferta_ajustada / r.demanda_liquida) : 1;
                return (
                  <div
                    className={`fm s-${r.farol_status}`}
                    key={s}
                    data-tip={tip({
                      t: `${ch} · ${s}`,
                      s: varios ? `Pico em ${rotuloMes(r.mes_pico)}` : undefined,
                      rows: [
                        { l: "Resource Request", v: fmt0(r.demanda_bruta_fte) },
                        { l: "− Desalocados", v: fmt0(r.desalocado_fte) },
                        { l: "—", v: "" },
                        { l: "Demanda líquida", v: fmt0(r.demanda_liquida), c: "var(--pink)" },
                        { l: "Oferta ajustada", v: fmt0(r.oferta_ajustada), c: "var(--bar)", bar: cobertura },
                        ...(r.gap_pct != null && r.demanda_liquida >= 1 ? [{ l: "Gap", v: `${sinal(r.gap_pct)}%` }] : []),
                      ],
                      n: farolInsight(r.farol_status, r.gap_pct, r.demanda_liquida, r.oferta_ajustada),
                    })}
                  >
                    <div className="fm-foot">
                      <Pill status={r.farol_status} />
                      <button className="link-btn" onClick={() => verNoPipe(ch, s)} data-tip={tip({ n: `Abre a Visão do Pipe filtrada em ${ch} · ${s}` })}>
                        Ver no pipe ↗
                      </button>
                    </div>
                    <div className="fm-gap">{cap(g)}</div>
                    <div className="fm-nums">
                      <span>Demanda <b>{fmt0(r.demanda_liquida)}</b></span>
                      <span>Oferta <b>{fmt0(r.oferta_ajustada)}</b></span>
                    </div>
                    <div className="fm-bar">
                      <i style={{ width: `${(Math.max(0, r.demanda_liquida) / maxRef) * 100}%`, opacity: 0.25 }} />
                      <i style={{ width: `${(r.oferta_ajustada / maxRef) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="fm fm-total">
                <div><span>Resource Request</span><b>{fmt0(sum(doCh, (r) => r.demanda_bruta_fte))}</b></div>
                <div><span>− Desalocados</span><b>{fmt0(sum(doCh, (r) => r.desalocado_fte))}</b></div>
                <div className="liq"><span>Demanda líquida</span><b>{fmt0(sum(doCh, (r) => r.demanda_liquida))}</b></div>
                <div><span>Oferta</span><b>{fmt0(sum(doCh, (r) => r.oferta_ajustada))}</b></div>
                <div><span>Pipeline Qualificado</span><b>{fmt0(pipeQualificado(data.pipeNivel, ch))}</b></div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <Sec title="Demanda × oferta por senioridade" info={`Mês de pico dos ${J}. Passe o mouse nas barras para ver a conta.`} />
      <div className="card">
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <Seg label="Chapter" value={chSel} options={chapters} onChange={setChSel} />
          <div className="legend-row" style={{ margin: 0 }}>
            <span><i style={{ background: "var(--pink)" }} />Demanda líquida</span>
            <span><i style={{ background: "var(--bar)" }} />Oferta ajustada</span>
          </div>
        </div>
        {detalhe.length === 0 ? (
          <Note variant="warn">Sem dado para este chapter nos próximos 45 dias.</Note>
        ) : (
          <div className="hbars" style={{ gap: 18 }}>
            {detalhe.map((r) => (
              <div className="hb-row" key={r.senioridade} style={{ gridTemplateColumns: "90px 1fr minmax(150px, auto)" }}>
                <div className="hb-label" style={{ fontWeight: 700, fontSize: 14 }}>{r.senioridade}</div>
                <div style={{ display: "grid", gap: 5 }}>
                  <div className="hb-track">
                    <div
                      className="hb-bar"
                      style={{ width: `${(Math.max(0, r.demanda_liquida) / maxDet) * 85}%`, background: "var(--pink)" }}
                      data-tip={tip({ t: `${chSel} · ${r.senioridade}`, s: "Demanda líquida", rows: [{ l: "Resource Request", v: fmt0(r.demanda_bruta_fte) }, { l: "− Desalocados", v: fmt0(r.desalocado_fte) }, { l: "—", v: "" }, { l: "Demanda líquida", v: `${fmt0(r.demanda_liquida)} pessoas`, c: "var(--pink)" }] })}
                    />
                    <span className="hb-val">{fmt0(r.demanda_liquida)}</span>
                  </div>
                  <div className="hb-track">
                    <div
                      className="hb-bar"
                      style={{ width: `${(r.oferta_ajustada / maxDet) * 85}%` }}
                      data-tip={tip({ t: `${chSel} · ${r.senioridade}`, s: "Oferta ajustada", rows: [{ l: "Oferta ajustada", v: `${fmt0(r.oferta_ajustada)} pessoas`, c: "var(--bar)" }], n: "Candidatos do Envio do Case em diante, pesados pela chance de virar contratação em até 45 dias." })}
                    />
                    <span className="hb-val">{fmt0(r.oferta_ajustada)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <Pill status={r.farol_status} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{gapTexto(r.gap_pct, r.demanda_liquida, r.oferta_ajustada, true)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </>
  );
}
