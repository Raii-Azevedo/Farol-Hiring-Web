"use client";

import { useMemo } from "react";
import { useApp } from "../App";
import { Finding, Kpi, Note, Sec, Tiles } from "../ui";
import { VBars } from "../charts";
import {
  DIAS_CARGA_ATRASADA, SENIORIDADES_FAROL, conversaoAteContratacao, dataBR, fmt0, fmt1, janelaTxt, listaPt,
  pipeQualificado, rotuloMes, sum, taxaAceiteOferta, tempoMedioContratacao,
} from "@/lib/model";

export function Gerencial() {
  const { data } = useApp();
  const J = janelaTxt(data);
  const mesesTxt = listaPt(data.mesesJanela.map(rotuloMes));

  const v = useMemo(() => {
    const fj = data.farolJanela;
    const chapters = [...new Set(fj.map((r) => r.chapter))];
    const demanda = sum(fj, (r) => r.demanda_liquida);
    const pedido = sum(fj, (r) => r.demanda_bruta_fte);
    const desal = sum(fj, (r) => r.desalocado_fte);
    const pipeQual = sum(chapters, (c) => pipeQualificado(data.pipeNivel, c));
    // cobertura carreira por carreira: sobra num chapter não cobre falta em outro
    const necPos = sum(fj, (r) => Math.max(0, r.demanda_liquida));
    const coberto = sum(fj, (r) => Math.min(r.oferta_ajustada, Math.max(0, r.demanda_liquida)));
    const ofertaTotal = sum(fj, (r) => r.oferta_ajustada);
    const dec = fj.filter((r) => SENIORIDADES_FAROL.includes(r.senioridade));
    const cont = (s: string) => dec.filter((r) => r.farol_status === s).length;
    const acel = dec.filter((r) => r.farol_status === "acelerar");
    const crit = data.parados.filter((p) => p.status === "critico");
    const nCrit = sum(crit, (p) => p.n);
    const nAten = sum(data.parados.filter((p) => p.status === "atencao"), (p) => p.n);
    const porEtapa = new Map<string, number>();
    const porChEtapa = new Map<string, number>();
    for (const p of crit) {
      porEtapa.set(p.etapa, (porEtapa.get(p.etapa) ?? 0) + p.n);
      const k = `${p.chapter} · ${p.etapa}`;
      porChEtapa.set(k, (porChEtapa.get(k) ?? 0) + p.n);
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      demanda, pedido, desal, pipeQual, necPos, coberto, ofertaTotal,
      cobertura: necPos > 0 ? (coberto / necPos) * 100 : null,
      fit: conversaoAteContratacao(data.taxas, "Entrevista Fit"),
      tempo: tempoMedioContratacao(data.taxas),
      aceite: taxaAceiteOferta(data.taxas),
      placar: { acelerar: cont("acelerar"), manter: cont("manter"), pausar: cont("pausar") },
      acel, nCrit, nAten, topEtapa: top(porEtapa), topChEtapa: top(porChEtapa),
    };
  }, [data]);

  const nec = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.farol) m.set(r.mes, (m.get(r.mes) ?? 0) + r.demanda_liquida);
    return data.meses.map((mes) => ({ mes, v: m.get(mes) ?? 0 }));
  }, [data]);

  const diasCarga = Math.round(
    (new Date(`${data.hoje}T12:00:00Z`).getTime() - new Date(`${data.dataCarga}T12:00:00Z`).getTime()) / 86_400_000,
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão Gerencial</h1>
          <p>
            Foto do dia: quanto falta contratar nos {J}, quanto Pipeline Qualificado já existe para cobrir essa
            necessidade, e quão rápido e eficiente está o funil.
          </p>
          <div className="meta-row">
            <span className="meta-pill"><span className="dot" style={{ background: "var(--pink)" }} />Demanda: pico dos {J}, cobre {mesesTxt}</span>
            <span className="meta-pill"><span className="dot" style={{ background: "var(--bar)" }} />Pipe: foto de {dataBR(data.dataCarga)}</span>
          </div>
        </div>
      </div>

      {diasCarga > DIAS_CARGA_ATRASADA && (
        <Note variant="critical">
          ⚠️ <b>Os dados do Greenhouse são de {dataBR(data.dataCarga)}, há {diasCarga} dias.</b> Pipe, parados e
          conversões mostram a situação daquele dia. Avise o time de Dados para conferir a carga.
        </Note>
      )}

      <Finding>
        Nos <b>{J}</b>: o Resource Request é de <b>{fmt0(v.pedido)} pessoas</b>, <b>{fmt0(v.desal)}</b> saem de projeto e
        podem ser realocadas, e a necessidade líquida de contratação fica em <b>{fmt0(v.demanda)} pessoas</b>, com{" "}
        <b>{fmt0(v.pipeQual)} candidatos</b> no Pipeline Qualificado. Entre {SENIORIDADES_FAROL.join(" e ")}:{" "}
        <b>{v.acel.length} combinação(ões)</b> pedindo para acelerar
        {v.acel.length > 0 && <> ({v.acel.map((r) => `${r.chapter} ${r.senioridade}`).join(", ")})</>} e{" "}
        <b>{v.placar.pausar}</b> para pausar.
      </Finding>

      <Sec eyebrow="Demanda × oferta" title="O pipe dá conta do que falta contratar?" />
      <div className="grid g3">
        <Kpi
          label="Necessidade líquida"
          value={fmt0(v.demanda)}
          unit="pessoas"
          note={<>Resource Request de <b>{fmt0(v.pedido)}</b> menos <b>{fmt0(v.desal)}</b> pessoas que saem de projeto e podem ser realocadas, somando todos os chapters.</>}
        />
        <Kpi
          label="Cobertura da necessidade"
          value={v.cobertura == null ? "—" : `${fmt0(v.cobertura)}%`}
          note={
            v.necPos > 0 ? (
              <>O pipe deve gerar <b>{fmt0(v.coberto)}</b> das <b>{fmt0(v.necPos)}</b> contratações necessárias em até 45 dias, carreira por carreira. Oferta ajustada total: {fmt0(v.ofertaTotal)}.</>
            ) : (
              <>Sem necessidade positiva de contratação nos {J}.</>
            )
          }
        />
        <Kpi
          label="Pipeline Qualificado"
          value={fmt0(v.pipeQual)}
          unit="candidatos"
          note="Entry e Senior da Entrevista Fit até a Oferta, nos chapters com demanda: quem já passou da triagem e do case."
        />
      </div>

      <Sec eyebrow="Eficiência do funil" title="Quanto vira contratação e em quanto tempo" />
      <div className="grid g3">
        <Kpi
          label="Entrevista Fit → contratação"
          value={v.fit.pct == null ? "—" : `${fmt1(v.fit.pct)}%`}
          note={<><b>{fmt0(v.fit.contratados)}</b> contratações de <b>{fmt0(v.fit.base)}</b> candidaturas que chegaram à Fit, no histórico do Greenhouse.</>}
        />
        <Kpi
          label="Tempo médio de contratação"
          value={v.tempo == null ? "—" : fmt0(v.tempo)}
          unit="dias"
          note="Média de dias no pipe das pessoas contratadas, somando todos os chapters."
        />
        <Kpi
          label="Aceite de oferta"
          value={v.aceite == null ? "—" : `${fmt0(v.aceite)}%`}
          note="Contratados ÷ (contratados + reprovados na etapa Oferta)."
        />
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">Placar do farol</div>
          <p className="card-sub">Combinações carreira × senioridade ({SENIORIDADES_FAROL.join(" e ")}) com demanda cadastrada.</p>
          <Tiles
            items={[
              { n: v.placar.acelerar, label: "acelerar", status: "acelerar" },
              { n: v.placar.manter, label: "manter", status: "manter" },
              { n: v.placar.pausar, label: "pausar", status: "pausar" },
            ]}
          />
        </div>
        <div className="card">
          <div className="card-title">Onde agir agora</div>
          <p className="card-sub">Candidatos acima da meta da etapa, do Envio do Case à Oferta.</p>
          <Tiles
            items={[
              { n: fmt0(v.nCrit), label: "em crítico", status: "critico" },
              { n: fmt0(v.nAten), label: "em atenção", status: "atencao" },
            ]}
          />
          <p className="caption">
            {v.nCrit && v.topEtapa ? (
              <>Etapa com mais gente em crítico: <b>{v.topEtapa[0]}</b> ({fmt0(v.topEtapa[1])}). Maior concentração: <b>{v.topChEtapa?.[0]}</b> ({fmt0(v.topChEtapa?.[1] ?? 0)}).</>
            ) : (
              "Ninguém acima da meta da etapa."
            )}
          </p>
        </div>
      </div>

      <Sec eyebrow="Necessidade mês a mês" title="A demanda está subindo ou caindo?" />
      <div className="card">
        <div className="legend-row">
          <span><i style={{ background: "var(--pink)" }} />Dentro dos 45 dias</span>
          <span><i style={{ background: "var(--bar)" }} />Depois, só tendência</span>
        </div>
        <VBars
          height={200}
          items={nec.map(({ mes, v: val }) => ({
            label: rotuloMes(mes),
            value: val,
            text: fmt0(val),
            color: data.mesesJanela.includes(mes) ? "var(--pink)" : "var(--bar)",
            tip: `${rotuloMes(mes)}\nNecessidade líquida: ${fmt0(val)} pessoas`,
          }))}
        />
        <p className="caption">
          Resource Request menos desalocados, somando todos os chapters (Entry e Senior). Valor negativo = mais gente
          saindo de projeto do que pedidos novos.
        </p>
      </div>
    </>
  );
}
