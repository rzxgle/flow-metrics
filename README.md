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
│   └── classification.rules.js # REGRAS de negócio como dados (Open/Closed)
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
- **Fórmula de Lead/Cycle/Aging** → `domain/services/FlowMetricsCalculator.js`.
- **Regra de saúde do épico** → `domain/services/EpicHealthEvaluator.js`.
- **Trocar Jira por outra fonte** → nova classe que estenda `IssueRepository` e
  troque a linha no `main.js`.
