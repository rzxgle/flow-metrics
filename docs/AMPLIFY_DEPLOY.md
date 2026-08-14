# Deploy no AWS Amplify Hosting Compute

O dashboard e a API Express sao publicados juntos a partir da branch
`afya-metrics-dashboard`. O build produz o bundle `.amplify-hosting/`.

## Variaveis de ambiente

No app do Amplify, abra **Hosting > Environment variables > Manage variables**
e cadastre as variaveis abaixo para a branch `afya-metrics-dashboard`:

```text
JIRA_BASE_URL
JIRA_EMAIL
JIRA_API_TOKEN
JIRA_JQL
JIRA_FIELD_TEAM
JIRA_FIELD_STORY_POINTS
JIRA_FIELD_START_DATE
JIRA_FIELD_ACTUAL_START
JIRA_FIELD_ACTUAL_END
JIRA_FIELD_SPRINT
JIRA_FIELD_BCP
JIRA_FIELD_BLOCK_REASON
```

`JIRA_EMAIL` e `JIRA_API_TOKEN` sao obrigatorias. As demais devem reproduzir a
configuracao do `.env` local.

O Amplify disponibiliza essas variaveis durante o build, mas nao automaticamente
para um servidor Express em runtime. Por isso, `scripts/build-amplify.js` copia
somente essa lista permitida para `runtime-config.json`, dentro do bundle privado
do Compute. Os valores nao sao incluidos no HTML nem enviados ao navegador.

Importante: pessoas com permissao para acessar os artefatos de deploy do Amplify
podem ler esse arquivo. Restrinja o acesso ao app e aos logs. Para isolamento mais
forte, use Parameter Store ou o gerenciamento de segredos do Amplify.

## Criar o app

1. Conecte o repositorio ao Amplify Hosting.
2. Selecione a branch `afya-metrics-dashboard`.
3. Cadastre as variaveis antes do primeiro deploy.
4. Use o `amplify.yml` versionado.
5. Publique e valide `/api/health` e o botao **Atualizar dados**.

Nao e necessario criar Parameter Store nem SSR Compute role para esta modalidade.

## Refresh

O frontend chama `/api/dashboard?refresh=1` com cache HTTP desabilitado. O
controller consolida requisicoes simultaneas em uma coleta e devolve o ultimo
cache com aviso se o Jira falhar. O disco do Compute e tratado como efemero.
