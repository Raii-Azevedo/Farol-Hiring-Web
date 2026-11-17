"use client";

import { useMemo, useState } from "react";
import { useApp } from "../App";
import { Note, Sec, Select, Table } from "../ui";
import { Heatmap, VBars } from "../charts";
import {
  ETAPA_CURTA, STAGES_ORDER, TODOS, dataBR, fmt0, ordenarSenioridades, recorte, resumoPipe, sum,
  taxaAceiteOferta, taxaAceiteSys,
} from "@/lib/model";

export function Comparacao() {
  const { data, dark } = useApp();
  const [sen, setSen] = useState(TODOS);
  const sens = useMemo(() => ordenarSenioridades(data.pipeNivel.map((p) => p.senioridade)), [data]);
  const rotSen = sen === TODOS ? "todas as senioridades" : sen;
  const Rot = rotSen.charAt(0).toUpperCase() + rotSen.slice(1);

  const comp = useMemo(() => resumoPipe(recorte(data.pipeNivel, null, sen), ["chapter", "etapa"]), [data, sen]);
  const etapasFunil = STAGES_ORDER.filter((e) => e !== "Contratação");
  const tempoIdx = new Map(comp.map((r) => [`${r.chapter}|${r.etapa}`, r.tempo_medio_dias]));
  const chapters = [...new Set(comp.map((r) => r.chapter!))].sort();
  const colsTempo = etapasFunil.filter((e) => comp.some((r) => r.etapa === e && r.tempo_medio_dias != null));
  const metas = new Map(comp.filter((r) => r.meta_sla_dias != null).map((r) => [r.etapa!, r.meta_sla_dias!]));

  const tc = useMemo(() => {
    const m = new Map<string, { d: number; n: number }>();
    for (const t of recorte(data.taxas, null, sen)) {
      const g = m.get(t.chapter) ?? { d: 0, n: 0 };
      g.d += t.dias_contratacao;
      g.n += t.contratados_com_dias;
      m.set(t.chapter, g);
    }
    return [...m.entries()].filter(([, g]) => g.n > 0).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, sen]);

  const par = useMemo(() => {
    const m = new Map<string, { total: number; at: number; cr: number }>();
    for (const p of recorte(data.parados, null, sen)) {
      const g = m.get(p.chapter) ?? { total: 0, at: 0, cr: 0 };
      g.total += p.n;
      if (p.status === "atencao") g.at += p.n;
      if (p.status === "critico") g.cr += p.n;
      m.set(p.chapter, g);
    }
    return [...m.entries()]
      .map(([chapter, g]) => ({ chapter, ...g, pct: g.total ? (g.cr / g.total) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct || b.cr - a.cr);
  }, [data, sen]);

  const chAceite = [...new Set(data.taxas.map((t) => t.chapter))].sort();
  const chSys = [...new Set(data.suOfertas.map((t) => t.chapter))].sort();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comparação entre carreiras</h1>
          <p>Os indicadores da Visão do Pipe lado a lado para todos os chapters. Aqui só vale o filtro de senioridade: a ideia é comparar.</p>
        </div>
        <div className="filters">
          <Select id="c-sen" label="Senioridade" value={sen} options={[TODOS, ...sens]} onChange={setSen} />
        </div>
      </div>

      <Sec eyebrow="1 · Onde cada carreira demora" title="Tempo médio por etapa, por carreira" />
      <div className="card">
        <p className="card-sub">
          {Rot}. Dias corridos em cada etapa; mais escuro = mais lento. Metas:{" "}
          {colsTempo.filter((e) => metas.has(e)).map((e) => `${ETAPA_CURTA[e]} ${fmt0(metas.get(e)!)}d`).join(" · ")}.
        </p>
        {colsTempo.length === 0 ? (
          <Note variant="neutral">Sem dado de tempo neste recorte.</Note>
        ) : (
          <Heatmap
            dark={dark}
            rows={chapters}
            cols={colsTempo.map((e) => ETAPA_CURTA[e])}
            value={(r, c) => tempoIdx.get(`${r}|${colsTempo.find((e) => ETAPA_CURTA[e] === c)}`)}
            fmt={(v) => `${fmt0(v)}d`}
            tip={(r, c, v) => `${r} · ${c}\nTempo médio: ${v == null ? "—" : `${fmt0(v)} dias`}`}
          />
        )}
      </div>

      <div className="grid g2" style={{ marginTop: 0 }}>
        <div>
          <Sec eyebrow="2 · Em quanto tempo contrata" title="Tempo médio de contratação" />
          <div className="card">
            <p className="card-sub">{Rot}. Dias no pipe das pessoas contratadas, do início do processo à contratação.</p>
            {tc.length === 0 ? (
              <Note variant="neutral">Sem contratações com data neste recorte.</Note>
            ) : (
              <VBars
                height={200}
                items={tc.map(([c, g]) => ({
                  label: c,
                  value: Math.round(g.d / g.n),
                  text: `${fmt0(g.d / g.n)}d`,
                  tip: `${c}\nTempo médio: ${fmt0(g.d / g.n)} dias\n${fmt0(g.n)} contratação(ões)`,
                }))}
              />
            )}
          </div>
        </div>
        <div>
          <Sec eyebrow="3 · Onde está travado agora" title="Candidatos parados" />
          {par.length === 0 ? (
            <Note variant="neutral">Ninguém em processo do Envio do Case em diante neste recorte.</Note>
          ) : (
            <Table
              rowKey={(r) => r.chapter}
              rows={par}
              cols={[
                { key: "c", label: "Chapter", render: (r) => <b>{r.chapter}</b> },
                { key: "t", label: "Em processo", align: "r", help: "Candidatos do Envio do Case até a Oferta, hoje.", render: (r) => fmt0(r.total) },
                { key: "a", label: "Atenção", align: "r", render: (r) => fmt0(r.at) },
                { key: "k", label: "Crítico", align: "r", render: (r) => fmt0(r.cr) },
                {
                  key: "p", label: "% em crítico", align: "r", help: "Crítico ÷ em processo. Compara carreiras de tamanhos diferentes.",
                  render: (r) => (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 48, height: 6, borderRadius: 4, background: "var(--surface-3)", overflow: "hidden", display: "inline-block" }}>
                        <span style={{ display: "block", height: "100%", width: `${r.pct}%`, background: "var(--red)" }} />
                      </span>
                      {fmt0(r.pct)}%
                    </span>
                  ),
                },
              ]}
            />
          )}
          <p className="caption">Dias na etapa até a carga de {dataBR(data.dataCarga)}. Acima da meta = atenção; mais de 5 dias acima = crítico.</p>
        </div>
      </div>

      <Sec eyebrow="4 · Fim do funil" title="Oferta e banco See You Soon" />
      <div className="grid g2">
        <div className="card">
          <div className="card-title">Oferta → contratação, por carreira</div>
          <p className="card-sub">Contratados ÷ (contratados + reprovados na etapa Oferta), {rotSen}.</p>
          <VBars
            height={180}
            items={chAceite.map((c) => {
              const v = taxaAceiteOferta(data.taxas, c, sen);
              return { label: c, value: v ?? 0, text: v == null ? "—" : `${fmt0(v)}%`, tip: `${c}\nAceite: ${v == null ? "—" : `${fmt0(v)}%`}` };
            })}
          />
        </div>
        <div className="card">
          <div className="card-title">See You Soon → contratação, por carreira</div>
          <p className="card-sub">% das pessoas que passaram pelo banco e aceitaram oferta, {rotSen}.</p>
          {chSys.length === 0 ? (
            <Note variant="neutral">Sem dado do banco See You Soon.</Note>
          ) : (
            <VBars
              height={180}
              items={chSys.map((c) => {
                const v = taxaAceiteSys(data.suOfertas, c, sen);
                return { label: c, value: v ?? 0, text: v == null ? "—" : `${fmt0(v)}%`, color: "var(--pink)", tip: `${c}\nConversão do banco: ${v == null ? "—" : `${fmt0(v)}%`}` };
              })}
            />
          )}
        </div>
      </div>
      <p className="caption">Total de pessoas em processo: {fmt0(sum(par, (r) => r.total))}.</p>
    </>
  );
}
