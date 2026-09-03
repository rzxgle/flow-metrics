# Deploy no AWS Amplify Hosting Compute

O dashboard e a API Express sao publicados juntos a partir da branch `main`.
O build produz o bundle `.amplify-hosting/`.

## Variaveis de ambiente

No app do Amplify, abra **Hosting > Environment variables > Manage variables**
e cadastre as variaveis abaixo para a branch `main`:

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
PROGRESSIVE_PAGES_PER_REQUEST
```

`JIRA_EMAIL` e `JIRA_API_TOKEN` sao obrigatorias. As demais devem reproduzir a
configuracao do `.env` local.

`PROGRESSIVE_PAGES_PER_REQUEST` e opcional e usa `5` por padrao. Nao configure
acima de 5: esse limite mantem cada chamada confortavelmente abaixo do timeout e
do tamanho maximo de resposta do Amplify.

O Amplify disponibiliza essas variaveis durante o build, mas nao automaticamente
para um servidor Express em runtime. Por isso, `scripts/build-amplify.js` copia
somente essa lista permitida para `runtime-config.json`, dentro do bundle privado
do Compute. Os valores nao sao incluidos no HTML nem enviados ao navegador.

Importante: pessoas com permissao para acessar os artefatos de deploy do Amplify
podem ler esse arquivo. Restrinja o acesso ao app e aos logs. Para isolamento mais
forte, use Parameter Store ou o gerenciamento de segredos do Amplify.

## Criar o app

1. Conecte o repositorio ao Amplify Hosting.
2. Selecione a branch `main`.
3. Cadastre as variaveis antes do primeiro deploy.
4. Use o `amplify.yml` versionado.
5. Publique e valide `/api/health` e o botao **Atualizar dados**.

Nao e necessario criar Parameter Store nem SSR Compute role para esta modalidade.

## Refresh

O frontend chama `POST /api/dashboard/progressive` sequencialmente. Primeiro
carrega os ultimos 60 dias e depois o restante do recorte da JQL. Cada resposta
traz ate cinco paginas do Jira e um `nextPageToken` para o lote seguinte.

O snapshot completo fica no IndexedDB do navegador. Ao abrir novamente, o
dashboard exibe esse snapshot imediatamente sem repetir a carga completa. Se a
carga anterior foi interrompida, cada lote ja salvo e o token de continuacao sao
recuperados e o processo continua do ponto em que parou.

Depois que o snapshot estiver completo, o botao **Atualizar dados** consulta
somente issues novas ou alteradas desde a ultima sincronizacao, usando o campo
`updated` do Jira e uma pequena sobreposicao temporal de seguranca. O disco do
Compute e tratado como efemero.
