import "server-only";
import { tabela } from "./bq";

/**
 * As agregações que o app.py fazia em pandas, agora no BigQuery.
 *
 * O Streamlit baixava ~69 mil candidaturas (com a Storage API, ~4s) e
 * agrupava em memória. Aqui cada query já devolve o grão que a tela usa,
 * algumas centenas de linhas: o BigQuery agrega em paralelo e o servidor
 * só serializa o resultado.
 *
 * Regras copiadas do load_data() do app.py; os comentários de lá valem.
 * Tudo que é DATE sai como STRING e tudo que é número sai como FLOAT64,
 * para o JSON não carregar objetos do client do BigQuery.
 */

// Mesmo recorte do app.py: vaga sem chapter só interessa ao See You Soon.
// "Pleno" virou "Entry" (nov/2026); vaga sem nível no nome vira grupo próprio.
const BASE = () => `
  base AS (
    SELECT
      * EXCEPT (senioridade),
      CASE
        WHEN senioridade IS NULL THEN 'Não informada'
        WHEN senioridade = 'Pleno' THEN 'Entry'
        ELSE senioridade
      END AS senioridade
    FROM ${tabela("vw_farol_base")}
    WHERE chapter IS NOT NULL OR flag_see_you_soon = 1
  )`;

export const SQL_META = () => `
  SELECT
    CAST(MAX(snapshot_date) AS STRING) AS snapshot_date,
    CAST(MAX(data_carga) AS STRING)    AS data_carga
  FROM ${tabela("vw_farol_base")}`;

export const SQL_PIPE_NIVEL = () => `
  WITH ${BASE()}
  SELECT
    chapter, senioridade, etapa,
    CAST(ordem_etapa AS FLOAT64) AS ordem_etapa,
    -- "Contratação" não é etapa viva: quem está lá entra pelo flag_contratado
    CAST(SUM(IF(etapa = 'Contratação', flag_contratado, flag_ativo)) AS FLOAT64) AS candidatos,
    CAST(COALESCE(SUM(conversao_etapa_pct), 0) AS FLOAT64) AS conv_soma,
    CAST(COUNT(conversao_etapa_pct) AS FLOAT64)            AS conv_n,
    CAST(COALESCE(SUM(tempo_medio_etapa), 0) AS FLOAT64)   AS tempo_soma,
    CAST(COUNT(tempo_medio_etapa) AS FLOAT64)              AS tempo_n,
    CAST(MAX(meta_sla_etapa) AS FLOAT64)                   AS meta_sla_dias
  FROM base
  WHERE tipo_etapa = 'funil' AND chapter IS NOT NULL
    AND etapa IS NOT NULL AND ordem_etapa IS NOT NULL
  GROUP BY 1, 2, 3, 4`;

export const SQL_TAXAS = () => `
  WITH ${BASE()}
  SELECT
    chapter, senioridade,
    CAST(COUNT(application_id) AS FLOAT64)                  AS candidaturas,
    CAST(COUNTIF(ordem_etapa >= 2) AS FLOAT64)              AS chegaram_case,
    CAST(COUNTIF(ordem_etapa >= 4) AS FLOAT64)              AS chegaram_fit,
    CAST(COUNTIF(ordem_etapa >= 5) AS FLOAT64)              AS chegaram_tec1,
    CAST(COALESCE(SUM(flag_contratado), 0) AS FLOAT64)      AS contratados,
    -- o Greenhouse não registra oferta recusada: recusa = reprovado ESTANDO em Oferta
    CAST(COUNTIF(LOWER(application_status) = 'rejected' AND etapa = 'Oferta') AS FLOAT64) AS recusas_oferta,
    CAST(COALESCE(SUM(IF(flag_contratado = 1, total_days_in_pipe, NULL)), 0) AS FLOAT64) AS dias_contratacao,
    CAST(COUNT(IF(flag_contratado = 1, total_days_in_pipe, NULL)) AS FLOAT64)            AS contratados_com_dias
  FROM base
  WHERE chapter IS NOT NULL
  GROUP BY 1, 2`;

// Triagem de currículo fica fora: ~14 mil currículos dominariam a seção.
const FILTRO_PARADOS = `
  flag_ativo = 1 AND tipo_etapa = 'funil' AND chapter IS NOT NULL
  AND etapa NOT IN ('Contratação', 'Avaliação de currículo')`;

export const SQL_PARADOS = () => `
  WITH ${BASE()}
  SELECT
    chapter, senioridade, etapa,
    status_parado AS status,
    vaga,
    CAST(COUNT(*) AS FLOAT64)            AS n,
    CAST(MAX(dias_na_etapa) AS FLOAT64)  AS pior_dias,
    CAST(MAX(meta_sla_etapa) AS FLOAT64) AS meta_sla_dias
  FROM base
  WHERE ${FILTRO_PARADOS}
  GROUP BY 1, 2, 3, 4, 5`;

export const SQL_SU_OFERTAS = () => `
  WITH ${BASE()},
  por_vaga AS (
    -- su_*_vaga vem REPETIDO em cada candidatura da vaga: um por vaga antes de somar
    SELECT job_id,
      ANY_VALUE(chapter) AS chapter, ANY_VALUE(senioridade) AS senioridade,
      ANY_VALUE(su_candidaturas_vaga) AS c, ANY_VALUE(su_aceites_vaga) AS a
    FROM base GROUP BY job_id
  )
  SELECT chapter, senioridade,
    CAST(COALESCE(SUM(c), 0) AS FLOAT64) AS candidaturas_sys,
    CAST(COALESCE(SUM(a), 0) AS FLOAT64) AS aceites_sys
  FROM por_vaga
  WHERE chapter IS NOT NULL
  GROUP BY 1, 2`;

const FILTRO_SU = `flag_see_you_soon = 1 AND flag_ativo = 1`;

export const SQL_SU_BANCO = () => `
  WITH ${BASE()}
  SELECT chapter, senioridade,
    CAST(COUNT(*) AS FLOAT64)                          AS n,
    CAST(COALESCE(SUM(dias_na_etapa), 0) AS FLOAT64)   AS dias_soma,
    CAST(COUNT(dias_na_etapa) AS FLOAT64)              AS dias_n
  FROM base
  WHERE ${FILTRO_SU}
  GROUP BY 1, 2`;

export const SQL_OFERTA = (horizonte: number) => `
  WITH ${BASE()}
  SELECT chapter, senioridade,
    CAST(SUM(contrib_oferta_ajustada) AS FLOAT64) AS oferta_ajustada
  FROM base
  WHERE flag_ativo = 1 AND dias_ate_contratacao <= ${Number(horizonte)}
    AND chapter IS NOT NULL AND senioridade != 'Não informada'
  GROUP BY 1, 2`;

export const SQL_DEMANDA = () => `
  SELECT
    LEFT(CAST(mes AS STRING), 7) AS mes,
    chapter,
    IF(senioridade = 'Pleno', 'Entry', senioridade) AS senioridade,
    CAST(SUM(demanda_bruta_fte) AS FLOAT64)   AS demanda_bruta_fte,
    CAST(SUM(desalocado_fte) AS FLOAT64)      AS desalocado_fte,
    CAST(SUM(demanda_liquida_fte) AS FLOAT64) AS demanda_liquida
  FROM ${tabela("vw_farol_demanda")}
  GROUP BY 1, 2, 3`;

// ---------------------------------------------------------------------------
// Listas de pessoas: só sob demanda, quando alguém abre um detalhe.
// Parâmetros sempre via @param, nunca interpolados.
// ---------------------------------------------------------------------------
export const SQL_PESSOAS_PARADAS = () => `
  WITH ${BASE()}
  SELECT
    candidato, vaga, chapter, senioridade,
    CAST(dias_na_etapa AS FLOAT64)       AS dias,
    CAST(data_entrada_etapa AS STRING)   AS desde,
    CAST(meta_sla_etapa AS FLOAT64)      AS meta_sla_dias,
    status_parado                        AS status
  FROM base
  WHERE ${FILTRO_PARADOS}
    AND etapa = @etapa
    AND (@status = '' OR status_parado = @status)
    AND (@vaga = '' OR vaga = @vaga)
    AND (@chapter = '' OR chapter = @chapter)
    AND (@senioridade = '' OR senioridade = @senioridade)
  ORDER BY dias DESC
  LIMIT 500`;

export const SQL_PESSOAS_SU = () => `
  WITH ${BASE()}
  SELECT
    candidato, vaga, chapter, senioridade,
    CAST(dias_na_etapa AS FLOAT64)     AS dias,
    CAST(data_entrada_etapa AS STRING) AS desde,
    CAST(NULL AS FLOAT64)              AS meta_sla_dias,
    CAST(NULL AS STRING)               AS status
  FROM base
  WHERE ${FILTRO_SU}
    AND (@chapter = '' OR chapter = @chapter)
    AND (@senioridade = '' OR senioridade = @senioridade)
  ORDER BY dias DESC
  LIMIT 500`;

export const SQL_ALLOWLIST = () => `
  SELECT LOWER(TRIM(email)) AS email, role
  FROM ${tabela("greenhouse_dash_access")}
  WHERE LOWER(TRIM(email)) = @email
  LIMIT 1`;
