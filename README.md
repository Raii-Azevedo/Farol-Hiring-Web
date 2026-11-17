# 🚦 Farol de Hiring · versão web

Versão web do [Farol de Hiring](https://github.com/Raii-Azevedo/Farol-Hiring), feita para rodar na **Vercel**.
Mesmas regras, mesmas views do BigQuery e mesma allowlist do app Streamlit, com outra arquitetura:

| | Streamlit | Web (este repo) |
|---|---|---|
| Agregação | baixa ~69 mil candidaturas e agrupa em pandas | o **BigQuery** agrega; o servidor recebe centenas de linhas |
| Interação | cada clique roda o script inteiro no servidor | filtros, abas e detalhes rodam **no navegador**, sem ida ao servidor |
| Cache | `st.cache_data` por processo | cache de dados da Vercel, 30 min, compartilhado entre acessos |
| Gráficos | Plotly (~3 MB de JS) | HTML/CSS próprios; **~121 kB** de JS na primeira carga |
| Nome de candidato | vem junto com o dataset inteiro | só sai do servidor quando alguém abre um detalhe (`/api/pessoas`) |
| Hospedagem | servidor sempre ligado | serverless (Vercel) |

## Como rodar local

```bash
npm install
gcloud auth application-default login   # credencial do BigQuery da sua máquina
npm run dev                              # http://localhost:3000
```

Sem `AUTH_GOOGLE_ID` o app abre em **modo aberto** com um aviso na tela. Isso só vale em
`npm run dev`: em produção (`npm run build && npm start`, ou na Vercel) sem login configurado,
o app **bloqueia o acesso**. É diferente do Streamlit de propósito, porque na Vercel o link é público.

## Estrutura

```
src/
  auth.ts                       Auth.js: login Google + checagem da allowlist no login
  lib/
    model.ts                    regras do farol, SLA, conversões e formatação (roda no servidor e no navegador)
    queries.ts                  SQL das agregações (o que era o load_data() em pandas)
    data.ts                     monta o payload do dashboard; cache de 30 min
    bq.ts                       cliente BigQuery (service account ou credencial da máquina)
    allowlist.ts                leitura da greenhouse_dash_access, cache de 60 s por e-mail
    acesso.ts                   gate de toda página e API (fail closed)
  app/
    page.tsx                    gate + dashboard
    api/pessoas/route.ts        lista de candidatos de um recorte, sob demanda e autenticada
    api/auth/[...nextauth]      rotas do Auth.js
  components/
    App.tsx                     cabeçalho, abas, tema claro/escuro
    tabs/                       Visão Gerencial, Farol Executivo, Visão do Pipe, Comparação, Como ler
    charts.tsx, ui.tsx          gráficos e componentes
```

As regras de negócio estão em `lib/model.ts` e `lib/data.ts`, portadas 1:1 do `app.py`. **Quando uma
regra mudar no Streamlit, mude aqui também** (e na aba "Como ler"). A paridade foi conferida com os
dados reais: as células do farol, os KPIs da Visão Gerencial, os parados e os recortes filtrados batem.

## Deploy na Vercel

1. Suba este repositório no GitHub e importe em [vercel.com/new](https://vercel.com/new).
   Framework: Next.js (detectado sozinho). Não precisa mudar build nem output.
2. Em **Settings → Environment Variables**, cadastre (modelo em `.env.example`):
   - `GCP_SERVICE_ACCOUNT_JSON`: JSON da service account, de preferência em base64;
   - `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`: client OAuth do Google;
   - `AUTH_SECRET`: `npx auth secret`;
   - opcional `AUTH_GOOGLE_HD`: domínio do Google Workspace, para o seletor de conta.
3. No Google Cloud Console, no client OAuth, adicione o redirect URI
   `https://<seu-domínio>.vercel.app/api/auth/callback/google`
   (e `http://localhost:3000/api/auth/callback/google` para testar local).
4. Deploy. Sem as variáveis de login, a página mostra "Login não configurado" e não abre.

### Service account

Mesmas roles do Streamlit (comandos em `config_publicacao_exemplo.txt` do repo original):

- `roles/bigquery.dataViewer` no **dataset** `greenhouse_dev` (não recortado nas views: a allowlist mora lá);
- `roles/bigquery.jobUser` no projeto `br-in-dataplatform`;
- `roles/storage.objectViewer` no bucket `gs://idp-bucket-dev` (as tabelas de demanda são externas).

A Storage Read API não é mais necessária: o resultado já vem agregado.

## Autenticação e acesso

- **Autenticação**: Google via Auth.js. O app nunca vê senha.
- **Autorização**: e-mail (normalizado) presente em `br-in-dataplatform.greenhouse_dev.greenhouse_dash_access`.
  Checada no login **e a cada carregamento de página**, com cache de 60 s: remover alguém da tabela vale no
  minuto seguinte, não só quando a sessão (8 h) expirar.
- **Fail closed**: se a allowlist não puder ser lida, ninguém entra, com uma tela que explica que a
  verificação falhou (não que a pessoa foi negada).
- O dashboard é montado no servidor só depois do gate. A API de pessoas faz a mesma checagem.

## Desempenho

- O primeiro acesso a cada 30 min dispara 8 queries agregadas em paralelo no BigQuery (alguns segundos);
  os demais saem do cache em milissegundos.
- Trocar filtro, aba ou abrir detalhe de tempo não chama o servidor. Só a lista de pessoas
  (parados e See You Soon) busca no BigQuery, um recorte por vez, com no máximo 500 linhas.
