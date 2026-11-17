"use client";

import type { ReactNode } from "react";
import { useApp } from "../App";
import { Sec } from "../ui";
import { GAP_MINIMO_PESSOAS, HORIZONTE_FAROL_DIAS, JANELA_MESES, SEM_SENIORIDADE, dataBR, type Status } from "@/lib/model";

// Glossário escrito a partir das regras de lib/model.ts. Quando uma regra
// mudar (farolStatus, oferta, SLA), atualizar o texto aqui junto.

function Termos({ itens }: { itens: [string, ReactNode][] }) {
  return (
    <div className="card terms">
      {itens.map(([n, d]) => (
        <div className="term" key={n}>
          <div className="term-n">{n}</div>
          <div className="term-d">{d}</div>
        </div>
      ))}
    </div>
  );
}

export function ComoLer() {
  const { data } = useApp();
  const regras: [Status, string, string, string][] = [
    ["manter", "1", `Diferença menor que ${GAP_MINIMO_PESSOAS} pessoa`, "Manter"],
    ["pausar", "2", "Demanda zero ou negativa", "Pausar"],
    ["acelerar", "3", "Gap % acima de +20%", "Acelerar"],
    ["manter", "3", "Gap % entre −10% e +20%", "Manter"],
    ["pausar", "3", "Gap % abaixo de −10%", "Pausar"],
  ];
  const metas: [string, number][] = [
    ["Avaliação de currículo", 30], ["Envio do Case", 3], ["Avaliação do case", 3], ["Entrevista Fit", 20],
    ["Técnica 1", 10], ["Técnica 2", 7], ["Conversa Final", 7], ["Oferta", 7],
  ];

  return (
    <>
      <div className="cl-hero">
        <h1>Como ler o Farol</h1>
        <p>
          O que cada aba responde, como cada número é calculado, de onde vêm os dados e o que eles ainda não conseguem
          dizer. As explicações curtas continuam embaixo das tabelas e nas legendas; aqui está tudo junto.
        </p>
      </div>

      <Sec title="As abas" sub="cada uma responde a uma pergunta" />
      <div className="grid g4">
        {[
          ["Visão Gerencial", "Quanto falta contratar nos próximos 45 dias e com que velocidade o funil entrega?", "Necessidade líquida, cobertura, Pipeline Qualificado, eficiência do funil, placar do farol e necessidade mês a mês. Foto do dia, sem seletor de mês."],
          ["Farol Executivo", "Devo abrir, manter ou pausar vagas? Em qual carreira e senioridade?", "Matriz carreira × senioridade e o detalhe de demanda × oferta. “Ver no pipe ↗” leva o recorte para a Visão do Pipe."],
          ["Visão do Pipe", "Onde o processo trava?", "Do macro ao micro: onde trava, por que trava, onde está o volume e quem está em cada etapa. Os filtros valem para a aba inteira."],
          ["Comparação", "Qual chapter converte melhor?", "Todos os chapters lado a lado. Não segue o filtro de chapter, só o de senioridade."],
        ].map(([n, p, t]) => (
          <div className="card" key={n}>
            <div className="card-title">{n}</div>
            <p style={{ margin: "4px 0 8px", fontWeight: 500, color: "var(--pink)", fontSize: 13 }}>{p}</p>
            <p className="kpi-note" style={{ margin: 0 }}>{t}</p>
          </div>
        ))}
      </div>

      <Sec title="Como o farol decide" sub="regras testadas nesta ordem, por carreira × senioridade" />
      <div className="rules">
        {regras.map(([s, n, cond, res], i) => (
          <div className={`rule s-${s}`} key={i}>
            <span className="rule-n">{n}</span>
            <span>{cond}</span>
            <span className={`pill s-${s}`}><span className="dot" />{res}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <Termos
          itens={[
            ["Resource Request", <>Quanto os projetos pedem de gente, segundo o Artefactory. O cadastro é mensal e funciona como estoque: o mesmo pedido se repete enquanto o projeto dura. O farol usa o mês de maior demanda líquida dentro dos próximos {HORIZONTE_FAROL_DIAS} dias, sem somar meses. <b>1 FTE = 1 contratação</b>; tudo em inteiros, arredondando meio para cima.</>],
            ["Desalocados", "Pessoas que saem de projeto naquele mês, na mesma carreira e nível, e podem ser realocadas em vez de contratar. Também vêm do Artefactory."],
            ["Demanda líquida", "Resource Request menos desalocados: o que sobra para contratar. É ela que o farol compara com a oferta. Fica negativa quando sai mais gente de projeto do que entra."],
            ["Oferta ajustada", <>Quantas contratações o pipe de hoje deve entregar em até {HORIZONTE_FAROL_DIAS} dias: candidatos vivos do <b>Envio do Case em diante</b>, cada um pesado pela chance de chegar à contratação. Triagem de currículo e See You Soon não entram.</>],
            ["Gap", <>Demanda líquida menos oferta ajustada. Positivo = <b>falta</b> gente; negativo = <b>sobra</b>. O Gap % só aparece com demanda de 1 pessoa ou mais.</>],
            ["Status por senioridade", "Somar senioridades esconde decisões opostas: um chapter pode sobrar Entry e faltar Senior ao mesmo tempo. Por isso o “Total do chapter” não tem status."],
            ["Entry e Senior", "O farol olha só Entry e Senior. Estagiário segue o ritmo das turmas de estágio e aparece só na Visão do Pipe."],
            ["Mês da demanda", `Só a demanda muda com o mês. O app mostra o mês atual e os ${JANELA_MESES} seguintes; o pipe é sempre a foto de hoje.`],
            ["Pipeline Qualificado", <>Candidatos Entry e Senior vivos hoje da <b>Entrevista Fit</b> até a Oferta. É contagem de pessoas; a Oferta ajustada é outra conta (começa no Envio do Case e pesa cada um pela chance de contratar), por isso sai menor.</>],
          ]}
        />
      </div>

      <Sec title="Conversões e tempos" sub="toda conversão diz em que etapa começa a conta" />
      <Termos
        itens={[
          ["Entrevista Fit → contratação", "Contratados ÷ candidaturas que chegaram à Fit, no histórico inteiro do Greenhouse. É a conversão principal porque começa depois da triagem."],
          ["Conversão etapa a etapa", "Quantos % chegaram a uma etapa vindos da anterior, segundo o Greenhouse. Quando candidatos pulam etapas o número passa de 100%, então cada vaga é limitada a 100%."],
          ["Oferta → contratação", "Contratados ÷ (contratados + reprovados na etapa Oferta). Quem ainda está em Oferta fica fora. O Greenhouse não registra oferta recusada, então a recusa é quem saiu do processo estando na Oferta."],
          ["See You Soon → contratação", "Pessoas que passaram pelo banco e aceitaram oferta ÷ todas que passaram pelo banco. Não é taxa de aceite: o banco não registra recusa."],
          ["Espera no See You Soon", "Dias que quem aguarda hoje já passou no banco, desde a data de entrada de cada pessoa. Clique na barra rosa do tempo por etapa para ver a lista."],
          ["Tempo médio por etapa", "Dias corridos em cada etapa, pela média do Greenhouse por vaga, ponderada pelas candidaturas."],
          ["Tempo médio de contratação", "Média de dias no pipe das pessoas contratadas. Não é a soma dos tempos de cada etapa, que inclui quem ficou parado e foi reprovado."],
        ]}
      />

      <Sec title="Metas e gargalos" sub="meta de dias em cada etapa do funil" />
      <div className="metas">
        {metas.map(([e, d]) => (
          <div className="meta" key={e}><b>{d}d</b><span>{e}</span></div>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <Termos
          itens={[
            ["Candidato parado", <>Dias desde que a pessoa entrou na etapa atual, até a última carga do Greenhouse, contra a meta da etapa. Acima da meta, <b>atenção</b>; mais de 5 dias acima, <b>crítico</b>.</>],
            ["Gargalos e SLA", "Tempo médio de cada etapa contra a meta, por chapter, com a mesma régua. A tabela segue a ordem do funil; o pior caso aparece no alerta abaixo dela."],
          ]}
        />
      </div>

      <Sec title="De onde vêm os dados" />
      <div className="grid g3">
        {[
          ["Demanda", "Artefactory", "Resource Request e desalocações, carregados por upload manual no BigQuery. O farol fica tão atual quanto o último upload."],
          ["Pipe", "Greenhouse", `Foto da última carga no BigQuery (${dataBR(data.dataCarga)}). Se essa data estiver antiga, a carga parou. Entrada e saída de cada etapa vêm da greenhouse_d_application_stages.`],
          ["Acesso", "Google + BigQuery", "Login com Google e lista de e-mails autorizados, mantida no BigQuery pelo time de Dados."],
        ].map(([tag, n, t]) => (
          <div className="card" key={tag}>
            <span className="sec-eyebrow">{tag}</span>
            <div className="card-title" style={{ marginTop: 4 }}>{n}</div>
            <p className="kpi-note" style={{ margin: 0 }}>{t}</p>
          </div>
        ))}
      </div>

      <Sec title="O que os números ainda não dizem" sub="leve isto em conta antes de decidir" />
      <div className="grid g2">
        {[
          ["Realocações que o farol não vê", "O desconto de desalocados vale só dentro da mesma carreira e nível, e só para saídas lançadas no Artefactory. Meses distantes costumam ter poucas desalocações lançadas, então a demanda líquida deles tende a vir alta."],
          ["Carreiras sem farol", "AI Engineering e Software Engineering têm pipe no Greenhouse, mas nenhuma demanda no Artefactory. Aparecem na Visão do Pipe, não no Farol."],
          ["Etapas desatualizadas", "Quem avançou ou foi contratado sem a etapa atualizada no Greenhouse continua na etapa antiga e distorce tempos e gargalos. Confira no Greenhouse antes de agir."],
          ["Senioridade pelo nome da vaga", `O Greenhouse não tem campo de senioridade, então ela sai do nome da vaga. Vaga sem nível no nome aparece como "${SEM_SENIORIDADE}" e fica fora do farol.`],
        ].map(([t, d]) => (
          <div className="note note-warn" key={t} style={{ margin: 0 }}>
            <b>{t}</b>
            <div style={{ marginTop: 4 }}>{d}</div>
          </div>
        ))}
      </div>
    </>
  );
}
