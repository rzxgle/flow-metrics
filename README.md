# Afya Metrics — Afya Bridge & Afya One

Dashboard ágil (SAFe / Flow Metrics) que agora lê os dados **direto da API do
Jira**, em vez de depender da exportação manual de uma planilha.

O backend busca as issues no Jira, aplica a mesma transformação que antes era
feita "offline" (classificação, PIs, flags de estado, Lead/Cycle/Aging,
resolução de épicos e agregações) e serve tudo para o dashboard via uma API
JSON. O front-end (o mesmo dashboard de antes) apenas passou a consumir essa API.

## Arquitetura (Clean Architecture + SOLID)

As dependências apontam sempre "para dentro" (domínio no centro, sem conhecer
Jira, Express ou HTTP):

```
src/
├── main.js                     # Composition Root: instancia e injeta tudo
├── config/
│   ├── index.js                # lê variáveis de ambiente (.env)
│   ├── classification.rules.js # REGRAS de negócio como dados (Open/Closed)
│   └── quarter.rules.js        # regras da aba PI Tracking (outras, de propósito)
│
├── domain/                     # Regras de negócio puras (sem dependências)
│   ├── entities/Issue.js
│   ├── repositories/IssueRepository.js   # PORTA (interface) — DIP
│   └── services/
│       ├── IssueClassifier.js       # tipo agrupado, programa, PI, flags
│       ├── FlowMetricsCalculator.js  # Lead / Cycle / Aging
│       ├── EpicResolver.js           # cadeia de parents -> épico
│       ├── EpicSummaryBuilder.js     # agregação por épico
│       ├── EpicHealthEvaluator.js    # saúde do épico
│       └── IssueEnricher.js          # compõe tudo no formato do dashboard
│
├── application/
│   └── use-cases/GetDashboardDataUseCase.js  # orquestra o fluxo
│
├── infrastructure/             # Detalhes (implementam as portas)
│   ├── jira/
│   │   ├── JiraHttpClient.js        # HTTP + auth + paginação
│   │   ├── JiraFieldMap.js          # IDs dos custom fields
│   │   └── JiraIssueRepository.js   # traduz JSON do Jira -> Issue
│   └── cache/InMemoryCache.js
│
└── interfaces/http/            # Adaptadores de entrega
    ├── server.js
    └── controllers/DashboardController.js

public/index.html               # O dashboard (consome /api/dashboard)
scripts/discover-fields.js      # Descobre os IDs de custom fields da sua instância
test/transform.spec.js          # Testa a transformação (regras de negócio)
```

**Por que cada princípio SOLID aparece aqui:**

- **S** (Single Responsibility): cada serviço faz uma coisa (classificar, calcular
  tempo, resolver épico, agregar). Mudar a fórmula de Lead Time mexe em um arquivo só.
- **O** (Open/Closed): as regras (tipos, status, PIs) vivem em
  `config/classification.rules.js`. Novo tipo de item? Edita dados, não código.
- **L** (Liskov): qualquer `IssueRepository` (Jira, CSV, mock de teste) é
  intercambiável sem quebrar o caso de uso.
- **I** (Interface Segregation): a porta `IssueRepository` expõe só o que o caso
  de uso precisa (`findAll`).
- **D** (Dependency Inversion): o caso de uso depende da abstração
  `IssueRepository`, não do `JiraIssueRepository`. A "amarração" acontece só no
  `main.js`.

## Por que existe um backend? (não dá para chamar o Jira direto do HTML)

Duas razões: (1) a API do Jira **bloqueia chamadas diretas do navegador por
CORS**; (2) chamar de dentro do HTML exigiria expor seu **token de acesso** no
front. O Node fica no meio: guarda o token com segurança e resolve o CORS.

## Como rodar

Pré-requisito: **Node.js 18+**.

```bash
# 1. Instalar dependências
npm install

# 2. Configurar credenciais
cp .env.example .env
#    edite o .env com seu e-mail e API token do Jira

# 3. Descobrir os IDs dos custom fields da SUA instância e colar no .env
npm run discover:fields

# 4. Subir
npm start
#    abra http://localhost:3000
```

Durante o desenvolvimento: `npm run dev` (reinicia ao salvar).

## ⚠️ Custom fields — leia isto

Campos padrão (summary, status, created, labels, parent...) têm nomes fixos na
API. Mas **Team, Story Points, Data de início real e Data de fim real são campos
customizados**, e seus IDs (`customfield_XXXXX`) são específicos da sua
instância. Os valores no `.env.example` são apenas chutes comuns.

Rode `npm run discover:fields` — ele lista os campos e sugere os IDs prováveis.
Cole os corretos no `.env`. Sem isso, Story Points/datas podem vir zerados/vazios.

## A API

| Método | Rota                       | Descrição                                             |
| ------ | -------------------------- | ----------------------------------------------------- |
| GET    | `/api/dashboard`           | `{ issues, epics, generatedAt }` (usa cache)          |
| GET    | `/api/dashboard?refresh=1` | Força rebuscar no Jira, ignorando o cache             |
| GET    | `/api/health`              | Healthcheck                                           |

## A aba PI Tracking

Acompanhamento dos épicos de um PI/quarter, agrupados por squad: progresso de
cada épico, quantos itens estão pendentes / em andamento / concluídos, e o
drill-down dos filhos com status e link para o Jira.

**Ela usa outro conjunto de regras, de propósito.** `config/quarter.rules.js`
replica status por status e tipo por tipo o painel de quarter que o time já usa
nas cerimônias de PI (projeto `afya-quarter`), para os dois números não
divergirem. Três diferenças em relação às outras abas:

1. **sub-tarefas e o próprio épico ficam fora do denominador** — contá-los soma o
   mesmo trabalho duas vezes (a história e cada um dos seus subitens);
2. **itens cancelados saem do denominador** em vez de contarem como não feitos;
3. a comparação de status é **normalizada** e `Em Homologação`, `Pronto para
   Staging` e `Staging` contam como concluído.

No dataset atual isso vale 15 pontos percentuais nos épicos de `PI3 - Afya One`:
**51,1%** pela regra do PI (499 itens) contra **66,2%** pela regra das outras
abas (3.465 membros, dos quais 3.336 são sub-tarefas).

As regras vivem no servidor e **viajam com o payload** (`meta.quarterRules`) — o
navegador não guarda uma segunda cópia que sairia de sincronia.

Dois detalhes que valem saber:

- **Os filhos não herdam o PI do épico.** As labels ficam no épico; 1.430 dos
  3.465 filhos dos épicos de PI3 têm PI "Não informado". A aba seleciona os
  **épicos** pela label e depois puxa **todos** os filhos pela cadeia de parent.
- **Labels de transbordo entram no PI de destino.** `TransbordoPI2AfyaOne`,
  `NOVOPI3AfyaOne`, `DESPRIORIZADOPI3AfyaOne`, `LegadoTransbordoP126` e
  `LegadoTransbordoP226` passaram a ser reconhecidas em
  `classification.rules.js` — antes caíam em "Não informado", **em todas as
  abas**.

KPIs: Progresso do PI, Épicos entregues, Quarter percorrido, Gap plano × tempo,
Total de épicos, Épicos vazios e Squads abaixo do esperado — todos clicáveis,
abrindo as issues por trás do número.

**Filtros.** A aba usa **PI, Programa, Value Stream e Squad** da barra do topo.
Ano, Mês, Tipo, Status e o intervalo de conclusão **saem da tela** aqui: eles
mexeriam no *denominador* do progresso em vez do recorte (com "Status = Done",
todo épico apareceria com 100%). A seleção feita neles em outras abas continua
guardada. Como "quanto do quarter já passou" não tem resposta para dois quarters
somados, os KPIs temporais só aparecem com **um** PI selecionado; com mais de um,
avisam em vez de somar quarters.

Rode `npm run test:pi` para validar as regras — o teste executa o script da
própria página num `vm`, não uma cópia.

## Fidelidade da transformação

As regras foram reconstruídas a partir do dataset original e **conferidas contra
as 3.202 issues reais**: correspondência de **100%** nos campos usados pelo
dashboard e **183/183** nas agregações de épico. As únicas diferenças
intencionais: o label `PI4AfyaOne` agora é mapeado para `PI4 - Afya One` (o
processo antigo ainda não tratava PI4).

`npm run test:transform` valida todas as regras com um fixture sintético.

## Onde ajustar as coisas

- **Trocar/editar a JQL** → `JIRA_JQL` no `.env` (ou o padrão em `config/index.js`).
- **Novo tipo de item, status ou PI** → `config/classification.rules.js`.
- **Regras do acompanhamento de PI** → `config/quarter.rules.js`.
- **Fórmula de Lead/Cycle/Aging** → `domain/services/FlowMetricsCalculator.js`.
- **Regra de saúde do épico** → `domain/services/EpicHealthEvaluator.js`.
- **Trocar Jira por outra fonte** → nova classe que estenda `IssueRepository` e
  troque a linha no `main.js`.

## Deploy no AWS Amplify

O projeto suporta Amplify Hosting Compute com o HTML e a API Express no mesmo
domínio. A branch de deploy é `afya-metrics-dashboard`; o botão **Atualizar dados**
continua consultando o Jira em tempo real sem expor o token no navegador.

Consulte `docs/AMPLIFY_DEPLOY.md` para cadastrar as variáveis de ambiente e
configurar o app no Amplify.

### Carga progressiva no Amplify

Para respeitar os limites de tempo e resposta do Web Compute, o navegador busca
o Jira em lotes de até 500 issues. Os últimos 60 dias têm prioridade; o restante
do ano é incorporado em seguida. O progresso é salvo no IndexedDB e as relações
de parent/épico são reconciliadas conforme os lotes chegam.

Cada lote é persistido: uma recarga retoma a paginação já iniciada. Quando o
snapshot completo existe, abrir o dashboard não repete a consulta das 15 mil
issues; o botão **Atualizar dados** busca somente itens novos ou modificados pelo
campo `updated` e os mescla por chave.

O endpoint usado pelo front é `POST /api/dashboard/progressive`. A rota completa
`GET /api/dashboard` permanece disponível para compatibilidade local.
