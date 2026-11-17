"use client";

import { Fragment, useMemo, useState } from "react";
import { useApp } from "../App";
import { Finding, Note, Pill, Sec, Seg, Table } from "../ui";
import {
  type FarolPico, SENIORIDADES_FAROL, STATUS_LABEL, dataBR, farolInsight, fmt0, gapTexto, janelaTxt, listaPt,
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
          <p>
            Cruza a demanda líquida de projetos (Artefactory) com a oferta ajustada do funil (Greenhouse) e traduz isso
            em um semáforo por chapter e senioridade.
          </p>
          <div className="meta-row">
            <span className="meta-pill"><span className="dot" style={{ background: "var(--pink)" }} />Demanda: pico dos {J}, cobre {listaPt(data.mesesJanela.map(rotuloMes))}</span>
            <span className="meta-pill"><span className="dot" style={{ background: "var(--bar)" }} />Pipe: foto de {dataBR(data.dataCarga)}</span>
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

      <Sec title="Farol por carreira × senioridade" sub="cada célula é uma decisão" />
      <div className="matrix" style={{ gridTemplateColumns: `minmax(130px, 0.8fr) repeat(${SENIORIDADES_FAROL.length}, minmax(0, 1.25fr)) minmax(0, 1fr)` }}>
        <div />
        {SENIORIDADES_FAROL.map((s) => (
          <div className="mx-th" key={s}>{s}</div>
        ))}
        <div className="mx-th">Total do chapter<span>sem status, de propósito</span></div>

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
                  <div className={`fm s-${r.farol_status}`} key={s}>
                    <div className="fm-foot">
                      <Pill status={r.farol_status} />
                      <button className="link-btn" onClick={() => verNoPipe(ch, s)} title={`Abre a Visão do Pipe filtrada em ${ch} · ${s}`}>
                        Ver no pipe ↗
                      </button>
                    </div>
                    <div className="fm-gap">{cap(g)}</div>
                    <div className="fm-nums">
                      <span>Demanda <b>{fmt0(r.demanda_liquida)}</b></span>
                      <span>Oferta <b>{fmt0(r.oferta_ajustada)}</b></span>
                    </div>
                    <div className="fm-bar" data-tip={`Oferta cobre ${fmt0(cobertura * 100)}% da demanda`}>
                      <i style={{ width: `${(Math.max(0, r.demanda_liquida) / maxRef) * 100}%`, opacity: 0.25 }} />
                      <i style={{ width: `${(r.oferta_ajustada / maxRef) * 100}%` }} />
                    </div>
                    <div className="fm-orig">
                      Resource Request {fmt0(r.demanda_bruta_fte)} − desalocados {fmt0(r.desalocado_fte)}
                      {varios && <> · pico em {rotuloMes(r.mes_pico)}</>}
                    </div>
                    <div className="fm-why">{farolInsight(r.farol_status, r.gap_pct, r.demanda_liquida, r.oferta_ajustada)}</div>
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
      <p className="caption">
        A demanda de cada célula já é líquida: o que os projetos pedem menos as pessoas que saem de projeto e podem ser
        realocadas. Vale o mês de maior demanda dentro dos 45 dias, porque a demanda mensal é estoque de alocação e
        somar os meses contaria a mesma pessoa duas vezes. Estagiário fica só na Visão do Pipe. &quot;Total do
        chapter&quot; não tem status: a soma das senioridades pode dizer pausar enquanto uma delas precisa contratar.
      </p>

      <Sec title="Demanda × oferta por senioridade" sub={`pico dos ${J}`} />
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
                      data-tip={`${r.senioridade}\nResource Request: ${fmt0(r.demanda_bruta_fte)}\n− Desalocados: ${fmt0(r.desalocado_fte)}\n= Demanda líquida: ${fmt0(r.demanda_liquida)} pessoas`}
                    />
                    <span className="hb-val">{fmt0(r.demanda_liquida)}</span>
                  </div>
                  <div className="hb-track">
                    <div
                      className="hb-bar"
                      style={{ width: `${(r.oferta_ajustada / maxDet) * 85}%` }}
                      data-tip={`${r.senioridade}\nOferta ajustada: ${fmt0(r.oferta_ajustada)} pessoas`}
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

      {detalhe.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Table
            rowKey={(r) => r.senioridade}
            rows={detalhe}
            cols={[
              { key: "s", label: "Senioridade", render: (r) => <b>{r.senioridade}</b> },
              { key: "rr", label: "Resource Request", align: "r", help: "Quanto os projetos pedem de gente no mês de pico dos 45 dias (Artefactory; 1 FTE = 1 contratação).", render: (r) => fmt0(r.demanda_bruta_fte) },
              { key: "d", label: "Desalocados", align: "r", help: "Pessoas que saem de projeto nesse mesmo mês e podem ser realocadas, em vez de contratar.", render: (r) => (r.desalocado_fte ? `−${fmt0(r.desalocado_fte)}` : "0") },
              { key: "dl", label: "Demanda líquida", align: "r", help: "Resource Request menos desalocados: o que sobra para contratar.", render: (r) => fmt0(r.demanda_liquida) },
              { key: "o", label: "Oferta ajustada", align: "r", help: "Candidatos vivos do Envio do Case em diante, cada um pesado pela chance de virar contratação em até 45 dias.", render: (r) => fmt0(r.oferta_ajustada) },
              { key: "fs", label: "Falta / sobra", render: (r) => gapTexto(r.gap_pct, r.demanda_liquida, r.oferta_ajustada, true) },
              { key: "g", label: "Gap %", align: "r", help: "(Demanda − Oferta) / Demanda. Só aparece com demanda de 1 pessoa ou mais.", render: (r) => (r.gap_pct != null && r.demanda_liquida >= 1 ? `${sinal(r.gap_pct)}%` : "—") },
              { key: "st", label: "Status", help: "Diferença menor que 1 pessoa = manter. Demanda zero ou negativa = pausar. Senão: acima de +20% acelerar, abaixo de −10% pausar.", render: (r) => <Pill status={r.farol_status} label={STATUS_LABEL[r.farol_status]} /> },
            ]}
          />
        </div>
      )}
    </>
  );
}
