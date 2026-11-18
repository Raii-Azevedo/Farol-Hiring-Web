# Configurar o login Google no Cloud Run

Passo a passo para ligar o "Entrar com Google" do Farol de Hiring no serviço do Cloud Run.
Sem isso, o app mostra **"Login não configurado"** e não abre para ninguém (de propósito).

Serviço de referência: `farol-hiring-app`, região `us-central1`
(URL `https://farol-hiring-app-86858454361.us-central1.run.app`). Ajuste os nomes se mudarem.

## De onde vem cada valor

| Variável | O que é | De onde vem | Segredo? |
|---|---|---|---|
| `AUTH_GOOGLE_ID` | Client ID do login Google | **Gerado pelo Google** ao criar o OAuth Client (passo 2). Formato `1234...-abc.apps.googleusercontent.com` | Não |
| `AUTH_GOOGLE_SECRET` | Client Secret do login Google | **Gerado pelo Google** junto com o ID (passo 2). Formato `GOCSPX-...` | **Sim** |
| `AUTH_SECRET` | Chave que assina o cookie de sessão | **Você gera**: qualquer string aleatória longa (passo 3) | **Sim** |
| `AUTH_GOOGLE_HD` | Domínio do Google Workspace (opcional) | O domínio dos e-mails da empresa, ex. `artefact.com` | Não |

Nada disso é chave de service account: a política que bloqueia chave JSON não se aplica.
O acesso ao BigQuery continua pela service account do serviço, sem chave.

---

## 1. Tela de consentimento (uma vez por projeto)

No [Console do GCP](https://console.cloud.google.com), **no mesmo projeto do Cloud Run**:

1. Menu → **APIs e serviços → Tela de consentimento OAuth**
   (no console novo aparece como **Google Auth Platform → Branding / Público-alvo**).
2. Tipo de usuário: **Interno**. Só contas do Google Workspace da Artefact conseguem logar.
   > Se "Interno" não aparecer, o projeto não está dentro da organização: fale com a TI.
3. Nome do app: `Farol de Hiring`. E-mail de suporte: um e-mail do time.
4. Escopos: não precisa adicionar nada (o app só pede `openid`, `email` e `profile`, que são padrão).
5. Salvar.

## 2. Criar o OAuth Client → gera `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET`

1. Menu → **APIs e serviços → Credenciais → + Criar credenciais → ID do cliente OAuth**
   (no console novo: **Google Auth Platform → Clientes → + Criar cliente**).
2. Tipo de aplicativo: **Aplicativo da Web**. Nome: `Farol de Hiring - Cloud Run`.
3. **URIs de redirecionamento autorizados** → adicionar:
   ```
   https://farol-hiring-app-86858454361.us-central1.run.app/api/auth/callback/google
   ```
   Tem que ser **exatamente** a URL do serviço + `/api/auth/callback/google`.
   (Opcional, para testar local: `http://localhost:3000/api/auth/callback/google`.)
4. Criar. O Google mostra:
   - **ID do cliente** → é o `AUTH_GOOGLE_ID`;
   - **Chave secreta do cliente** → é o `AUTH_GOOGLE_SECRET`.
   Copie os dois agora (o secret pode ser baixado em JSON nessa tela; **não** commite esse arquivo).

## 3. Guardar os segredos no Secret Manager

No Cloud Shell (ou terminal com `gcloud` logado), no projeto do Cloud Run:

```bash
PROJETO=<id-do-projeto>

# AUTH_GOOGLE_SECRET: cole o "Chave secreta do cliente" do passo 2
printf '%s' 'GOCSPX-COLE-AQUI' | gcloud secrets create farol-auth-google-secret --data-file=- --project=$PROJETO

# AUTH_SECRET: gerado na hora, ninguém precisa saber o valor
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create farol-auth-secret --data-file=- --project=$PROJETO
```

Dar à service account do serviço permissão de ler os dois segredos:

```bash
# descobre qual service account o serviço usa
SA=$(gcloud run services describe farol-hiring-app --region=us-central1 --project=$PROJETO \
  --format='value(spec.template.spec.serviceAccountName)')
echo $SA   # vazio = usa a conta padrão do Compute; o ideal é uma conta dedicada (README)

for s in farol-auth-google-secret farol-auth-secret; do
  gcloud secrets add-iam-policy-binding $s --project=$PROJETO \
    --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
done
```

## 4. Ligar as variáveis no Cloud Run

```bash
gcloud run services update farol-hiring-app --region=us-central1 --project=$PROJETO \
  --update-env-vars=AUTH_GOOGLE_ID=COLE-O-CLIENT-ID.apps.googleusercontent.com,AUTH_GOOGLE_HD=artefact.com \
  --update-secrets=AUTH_GOOGLE_SECRET=farol-auth-google-secret:latest,AUTH_SECRET=farol-auth-secret:latest
```

Pelo Console dá no mesmo: **Cloud Run → farol-hiring-app → Editar e implantar nova revisão →
Variáveis e secrets**: `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_HD` como variáveis; `AUTH_GOOGLE_SECRET` e
`AUTH_SECRET` em "Referenciar um secret", versão `latest`.

Isso cria uma revisão nova; não precisa rebuildar a imagem.

## 5. Liberar quem pode ver

O login só diz **quem** é a pessoa. Quem **pode ver** está na tabela
`br-in-dataplatform.greenhouse_dev.greenhouse_dash_access` (a mesma do Streamlit):

```sql
INSERT INTO `br-in-dataplatform.greenhouse_dev.greenhouse_dash_access` (email, role)
VALUES ('nome.sobrenome@artefact.com', 'viewer');
```

Vale em até 1 minuto, sem deploy. Para tirar alguém, apague a linha.
A service account do serviço precisa de `roles/bigquery.dataViewer` no dataset (ver README).

## 6. Testar

1. Abrir a URL do serviço numa aba anônima → deve aparecer **"Entrar com Google"**.
2. Entrar com uma conta da lista → abre o painel.
3. Entrar com uma conta da Artefact fora da lista → tela de **acesso negado**.

## Se der erro

| O que aparece | Causa provável | Como resolver |
|---|---|---|
| "Login não configurado" | `AUTH_GOOGLE_ID` ou `AUTH_GOOGLE_SECRET` não chegou ao serviço | Conferir o passo 4 na revisão ativa |
| Google: `Erro 400: redirect_uri_mismatch` | URI do passo 2.3 diferente da URL real | Copiar a URL exata do serviço + `/api/auth/callback/google` |
| Google: `Erro 403: org_internal` | Conta fora do Workspace da Artefact (ex.: Gmail pessoal) | Entrar com a conta da empresa |
| Página de erro do Auth.js / "Configuration" | `AUTH_SECRET` ausente | Conferir o passo 3 e 4 |
| "Verificação indisponível" | Service account sem leitura no dataset (não lê a allowlist) | Dar `bigquery.dataViewer` no dataset e `bigquery.jobUser` no projeto |
| "Acesso negado" para quem deveria entrar | E-mail fora da tabela ou diferente (ex.: alias) | Inserir o e-mail exato que a pessoa usa no Google |
| Revisão não sobe: `Permission denied on secret` | Service account sem `secretAccessor` | Rodar o `add-iam-policy-binding` do passo 3 |

## Se a URL mudar

Domínio próprio ou serviço novo = URL nova. Adicione o novo redirect URI no **mesmo** OAuth Client
(passo 2.3); não precisa gerar outro ID/secret.
