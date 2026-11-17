"use client";

import { useMemo } from "react";
import { useApp } from "../App";
import { CardHead, Finding, Kpi, Note, Sec, Tiles, tip } from "../ui";
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
    const cont = (s: string) => dec.filter((r) => r.farol_status === s);
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
      nCrit, nAten, topEtapa: top(porEtapa), topChEtapa: top(porChEtapa),
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

  const lista = (rs: { chapter: string; senioridade: string }[]) =>
    rs.length ? rs.map((r) => `${r.chapter} ${r.senioridade}`).join(", ") : "nenhuma";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão Gerencial</h1>
          <p>Quanto falta contratar, quanto o pipe cobre e quão rápido o funil anda.</p>
          <div className="meta-row">
            <span className="meta-pill" data-tip={tip({ t: "Janela de demanda", n: `Pico de necessidade dentro dos ${J}, cobrindo ${mesesTxt}.` })}>
              <span className="dot" style={{ background: "var(--pink)" }} />Demanda: {J}
            </span>
            <span className="meta-pill" data-tip={tip({ t: "Pipe", n: "Foto do Greenhouse na data da última carga." })}>
              <span className="dot" style={{ background: "var(--bar)" }} />Pipe: {dataBR(data.dataCarga)}
            </span>
          </div>
        </div>
      </div>

      {diasCarga > DIAS_CARGA_ATRASADA && (
        <Note variant="critical">
          ⚠️ <b>Dados do Greenhouse de {dataBR(data.dataCarga)}, há {diasCarga} dias.</b> Avise o time de Dados.
        </Note>
      )}

      <Finding>
        Faltam <b>{fmt0(v.demanda)} pessoas</b> nos {J}, com <b>{fmt0(v.pipeQual)} candidatos</b> no Pipeline
        Qualificado. <b>{v.placar.acelerar.length}</b> combinação(ões) pedem para acelerar e{" "}
        <b>{v.placar.pausar.length}</b> para pausar.
      </Finding>

      <Sec eyebrow="Demanda × oferta" title="O pipe dá conta?" />
      <div className="grid g3">
        <Kpi
          label="Necessidade líquida"
          value={fmt0(v.demanda)}
          unit="pessoas"
          info="Resource Request menos as pessoas que saem de projeto e podem ser realocadas, somando todos os chapters."
          detail={<><b>{fmt0(v.pedido)}</b> pedidas − <b>{fmt0(v.desal)}</b> realocáveis</>}
        />
        <Kpi
          label="Cobertura da necessidade"
          value={v.cobertura == null ? "—" : `${fmt0(v.cobertura)}%`}
          progress={v.cobertura}
          info={`Quanto da necessidade o pipe deve gerar em até 45 dias, carreira por carreira (sobra num chapter não cobre falta em outro). Oferta ajustada total: ${fmt0(v.ofertaTotal)}.`}
          detail={v.necPos > 0 ? <><b>{fmt0(v.coberto)}</b> de <b>{fmt0(v.necPos)}</b> contratações</> : `Sem necessidade nos ${J}`}
        />
        <Kpi
          label="Pipeline Qualificado"
          value={fmt0(v.pipeQual)}
          unit="candidatos"
          info="Entry e Senior da Entrevista Fit até a Oferta, nos chapters com demanda: quem já passou da triagem e do case."
          detail="Da Fit até a Oferta"
        />
      </div>

      <Sec eyebrow="Eficiência do funil" title="Quanto vira contratação e em quanto tempo" />
      <div className="grid g3">
        <Kpi
          label="Entrevista Fit → contratação"
          value={v.fit.pct == null ? "—" : `${fmt1(v.fit.pct)}%`}
          info="Contratações ÷ candidaturas que chegaram à Entrevista Fit, no histórico do Greenhouse."
          detail={<><b>{fmt0(v.fit.contratados)}</b> de <b>{fmt0(v.fit.base)}</b> candidaturas</>}
        />
        <Kpi
          label="Tempo médio de contratação"
          value={v.tempo == null ? "—" : fmt0(v.tempo)}
          unit="dias"
          info="Média de dias no pipe das pessoas contratadas, somando todos os chapters."
        />
        <Kpi
          label="Aceite de oferta"
          value={v.aceite == null ? "—" : `${fmt0(v.aceite)}%`}
          progress={v.aceite}
          info="Contratados ÷ (contratados + reprovados na etapa Oferta)."
        />
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <CardHead
            title="Placar do farol"
            info={`Combinações carreira × senioridade (${SENIORIDADES_FAROL.join(" e ")}) com demanda cadastrada.`}
          />
          <Tiles
            items={(["acelerar", "manter", "pausar"] as const).map((s) => ({
              n: v.placar[s].length,
              label: s,
              status: s,
              tip: tip({ t: s[0].toUpperCase() + s.slice(1), n: lista(v.placar[s]) }),
            }))}
          />
        </div>
        <div className="card">
          <CardHead
            title="Onde agir agora"
            info={
              v.nCrit && v.topEtapa
                ? `Candidatos acima da meta da etapa, do Envio do Case à Oferta. Etapa com mais gente em crítico: ${v.topEtapa[0]} (${fmt0(v.topEtapa[1])}). Maior concentração: ${v.topChEtapa?.[0]} (${fmt0(v.topChEtapa?.[1] ?? 0)}).`
                : "Candidatos acima da meta da etapa, do Envio do Case à Oferta."
            }
          />
          <Tiles
            items={[
              { n: fmt0(v.nCrit), label: "em crítico", status: "critico", tip: tip({ t: "Crítico", n: "Mais de 5 dias acima da meta da etapa." }) },
              { n: fmt0(v.nAten), label: "em atenção", status: "atencao", tip: tip({ t: "Atenção", n: "Acima da meta, por até 5 dias." }) },
            ]}
          />
        </div>
      </div>

      <Sec
        eyebrow="Mês a mês"
        title="A demanda está subindo ou caindo?"
        info="Necessidade líquida (Resource Request − desalocados), Entry e Senior, todos os chapters. Rosa: dentro dos 45 dias; azul: depois, só tendência. Negativo = mais gente saindo de projeto do que pedidos novos."
      />
      <div className="card">
        <VBars
          height={200}
          items={nec.map(({ mes, v: val }) => {
            const dentro = data.mesesJanela.includes(mes);
            return {
              label: rotuloMes(mes),
              value: val,
              text: fmt0(val),
              color: dentro ? "var(--pink)" : "var(--bar)",
              tip: tip({
                t: rotuloMes(mes),
                s: dentro ? "Dentro da janela de 45 dias" : "Tendência",
                rows: [{ l: "Necessidade líquida", v: `${fmt0(val)} pessoas`, c: dentro ? "var(--pink)" : "var(--bar)" }],
              }),
            };
          })}
        />
      </div>
    </>
  );
}
