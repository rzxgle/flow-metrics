# Flow Metrics

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
│   ├── classification.rules.ts # REGRAS de negócio como dados (Open/Closed)
│   ├── quarter.rules.ts        # regras da aba PI Tracking (outras, de propósito)
│   └── dependency.rules.ts     # tipos de link e nomes de time da aba Dependências
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
│       ├── StatusTimeResolver.js     # tempo em cada status (changelog)
│       ├── DependencyResolver.js     # issuetype Dependência (times, links, datas)
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
  `config/classification.rules.ts`. Novo tipo de item? Edita dados, não código.
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

## Testes

```bash
npm test              # a suíte inteira (é o que o CI roda no PR)
npm run test:filtros  # uma suíte só; os nomes estão em "scripts", no package.json
```

Os testes não tocam a rede: todos usam fixtures sintéticos. Vários deles
extraem o `<script>` inline do `public/index.html` e o executam — testar uma
cópia da lógica não pegaria os defeitos que já apareceram ali. Os de cálculo
(`test:velocity`, por exemplo) rodam num `vm` do Node com um DOM falso;
`test:filtros`, `test:bloqueios`, `test:status-time-view`, `test:dependencias`,
`test:sp-tempo` e `test:burndown` usam **jsdom**, porque
o que eles verificam é apresentação — o que a tela de fato mostra: se um item some pela cascata de CSS
(inclusive quando a busca do dropdown escreve `display` inline no elemento), o
valor que cada KPI exibe, o HTML de uma linha de tabela. Um DOM falso não tem
cascata, e não dá para ler dele o que foi renderizado.

O jsdom é a única `devDependency` do projeto. O build do Amplify roda
`npm ci --omit=dev`, então ele nunca chega ao bundle de produção.

## ⚠️ Custom fields — leia isto

Campos padrão (summary, status, created, labels, parent...) têm nomes fixos na
API. Mas **Team, Story Points, Data de início real, Data de fim real e os campos
do issuetype Dependência (Time Demandante, Time Externo, Dependência Aprovada,
Descrição Dependência) são campos customizados**, e seus IDs
(`customfield_XXXXX`) são específicos da sua instância. Os valores no
`.env.example` são apenas chutes comuns.

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

**Ela usa outro conjunto de regras, de propósito.** `config/quarter.rules.ts`
replica status por status e tipo por tipo o painel de quarter legado que o time
já usa nas cerimônias de PI, para os dois números não
divergirem. Três diferenças em relação às outras abas:

1. **sub-tarefas e o próprio épico ficam fora do denominador** — contá-los soma o
   mesmo trabalho duas vezes (a história e cada um dos seus subitens);
2. **itens cancelados saem do denominador** em vez de contarem como não feitos;
3. a comparação de status é **normalizada** e `Em Homologação`, `Pronto para
   Staging` e `Staging` contam como concluído.

No dataset atual isso vale 15 pontos percentuais nos épicos de `PI3 - One`:
**51,1%** pela regra do PI (499 itens) contra **66,2%** pela regra das outras
abas (3.465 membros, dos quais 3.336 são sub-tarefas).

As regras vivem no servidor e **viajam com o payload** (`meta.quarterRules`) — o
navegador não guarda uma segunda cópia que sairia de sincronia.

Três detalhes que valem saber:

- **Os filhos não herdam o PI do épico.** As labels ficam no épico; 1.430 dos
  3.465 filhos dos épicos de PI3 têm PI "Não informado". A aba seleciona os
  **épicos** pela label e depois puxa **todos** os filhos pela cadeia de parent.
- **Labels de transbordo entram no PI de destino.** As labels históricas de
  transbordo e de item novo passaram a ser reconhecidas em
  `classification.rules.ts` — antes caíam em "Não informado", **em todas as
  abas**.
- **O PI Tracking usa uma coleta dedicada.** Os épicos são buscados pelas labels
  de PI sem o corte `created >= startOfYear()` e seus filhos são consultados em
  lotes. Esse conjunto não alimenta as demais abas.

KPIs: Progresso do PI, Épicos entregues, Quarter percorrido, Gap plano × tempo,
Total de épicos, Épicos vazios e Squads abaixo do esperado — todos clicáveis,
abrindo as issues por trás do número.

**Agrupamento.** Os épicos vêm em dois guarda-chuvas: **Value Stream** (o
projeto Jira do épico, campo `VS`) e, dentro dela, **squad**. Os dois níveis
agregam por **soma de itens**, nunca por média de percentuais, e ordenam pior
primeiro. Os dois níveis nascem **recolhidos**: a página abre no ranking das
Value Streams e o detalhe vem por escolha. O agrupamento
usa o VS do **épico**: uma squad com épicos em dois projetos aparece dentro de
cada Value Stream com os épicos daquela — mas os KPIs contam squads
**distintas**, para uma squad partida não virar duas.

**Filtros.** A aba usa **PI, Programa, Value Stream e Squad** da barra do topo.
Ano, Mês, Tipo, Status e o intervalo de conclusão **saem da tela** aqui: eles
mexeriam no *denominador* do progresso em vez do recorte (com "Status = Done",
todo épico apareceria com 100%). A seleção feita neles em outras abas continua
guardada. Como "quanto do quarter já passou" não tem resposta para dois quarters
somados, os KPIs temporais só aparecem com **um** PI selecionado; com mais de um,
avisam em vez de somar quarters.

**O PI do quarter corrente vem marcado ao entrar na aba** (hoje, `PI3 - One`)
e é desmarcado ao sair. Ele não é padrão global de propósito: o PI é campo
de preenchimento manual, e 63,6% dos sub-itens e 57% dos bloqueios da base não
têm label — pré-selecioná-lo na barra inteira deixaria 27% da base de pé
(Bloqueios cairia de 421 para 61 itens). Aqui o recorte é de graça, porque a
seleção é feita no **épico**, que tem a label, e os filhos entram pela cadeia de
parent; e ela liga os três KPIs temporais, que sem PI único abrem em "requer 1 PI
selecionado". A aba não sobrescreve nem apaga um PI que o usuário já tenha
escolhido, e **não há recorte por dentro** — desmarcar aqui tem efeito de
verdade.

Rode `npm run test:pi`, `npm run test:pi-drill` e `npm run test:pi-vs` para
validar as regras — os testes executam o script da própria página num `vm`, não
uma cópia.

## Tempo por status (aba Lead & Cycle Time)

Lead Time e Cycle Time dizem quanto tempo o item levou; não dizem **onde** o
tempo foi gasto. O gráfico "Tempo por status" decompõe isso a partir do
changelog do campo **Status** — que já era coletado na mesma chamada em lote do
changelog de Sprint, então a visão não custou nenhuma requisição nova ao Jira.

`domain/services/StatusTimeResolver.js` reconstrói as permanências. Três
particularidades moldam o algoritmo, e as duas primeiras são as mesmas que o
`SprintHistoryResolver` enfrenta no campo Sprint:

1. **O valor de criação não gera entrada no changelog.** O status inicial só é
   conhecido pelo `from` da primeira transição, e a permanência nele vai da
   criação até essa transição. Sem isso o tempo da primeira fila — tipicamente
   `Backlog`, a maior do fluxo — desapareceria sem nenhum sinal de erro.
2. **Reentradas somam.** Item devolvido do code review volta para
   `Desenvolvimento`; as passagens são somadas num único balde por status, com a
   contagem em `visitas`. É assim que retrabalho aparece como tempo acumulado em
   vez de virar duas médias diluídas.
3. **Só permanências encerradas.** A visita ao status atual está aberta e
   cresceria sozinha entre um snapshot e outro (é o problema que obriga o Aging a
   ser recalculado no navegador). Como a visão mede itens **concluídos**, a
   visita aberta é sempre o status final — nada de relevante se perde.

**O campo só existe em itens concluídos**, e é de propósito: é o recorte da
visão, e o payload atravessa a rede em lotes com limite de tamanho no Amplify.
Medido num lote de 500 issues amostrado da base inteira (59% concluídas): 589 KB
→ 676 KB, +14,7%. `visitas` é omitido quando vale 1, e quem lê trata a ausência
como 1.

### Duas coisas que mudam de sentido nesta visão

**O filtro de Status escolhe barras, não itens.** Nas outras abas ele recorta
pelo status *atual*; aqui isso responderia outra pergunta ("quem está parado
neste status hoje") e esvaziaria o gráfico. A base chega sem esse recorte
(`SKIP_STATUS`, o mesmo mecanismo do `SKIP_TIPO` na aba de Bloqueios) e a seleção
define quais status viram barra. Sem seleção, todos os status percorridos
aparecem.

Por isso o dropdown de Status passou a listar também os status vindos do
**histórico**, não só os atuais — exatamente como a dimensão Sprint já fazia.
Medido na base: `Em teste`, `PROD`, `Aprovação Comitê`, `PRONTO PARA PI PLANNING`
e `Tarefas pendentes` não têm um único item parado hoje, e `Em teste` é justo uma
etapa de trabalho que interessa medir. Efeito colateral aceito: nas outras abas,
selecionar um desses status filtra para zero itens — o que é verdade.

**O denominador está no rótulo da medida, porque muda o número.** "Média por item
concluído" divide por todos os itens da base (quem não passou pelo status entra
com zero) e por isso as barras **somam, aproximadamente, o Lead Time médio** — é
uma decomposição. A legenda do gráfico mostra a soma ao lado do Lead Time médio
justamente para a diferença ficar visível.

Ela não é exata, e a razão é conhecida: as barras cobrem de `Criado` até a
**última transição de status**, enquanto o Lead Time vai de `Criado` até
`Data de Fim Real` (ou a resolução). Como neste processo o item continua
transitando depois da entrega — homologação integrada, deploy em PROD, ativação
de valor — e a `Data de Fim Real` é preenchida à mão, a linha do tempo de status
costuma ser **mais longa** que o Lead Time. Medido no dataset atual, num recorte
de 287 itens: soma das barras 51,7 d contra Lead Time médio de 46,6 d. É a mesma
defasagem que motivou o `SprintDeliveryResolver`.

"P85 de quem passou" divide só pelos visitantes: responde "quando um item passa
por aqui, quanto tempo fica" e, por construção, **não** soma. (Havia uma terceira
medida, a mediana; foi retirada a pedido do time, que não a usa.)

Como as duas medidas convivem no mesmo gráfico, **o tooltip espelha a barra**: a
primeira linha repete, com o mesmo rótulo do seletor, o valor exato que está
desenhado, e a segunda dá a leitura complementar dizendo sobre quem foi
calculada. O título do eixo também nomeia a medida, para o número da barra nunca
ficar sem denominador. Sem isso a barra marcava 9,0 enquanto o tooltip abria com
18,2, e não havia como saber qual era qual.

### Por que um item não entra na média: são duas razões, não uma

A terceira linha do tooltip decompõe a base em **três grupos que somam o total**:

```
PRONTO PARA ATIVAÇÃO DE VALOR · Concluído
  Média por item concluído: 0.8 d
  Entre os 55 que passaram: 13.9 d de média
  55 já saíram deste status · 300 ainda estão nele · 654 nunca passaram
  1.11 visitas por item
  Quem ainda está no status tem permanência aberta e fica fora da média.
```

Antes essa linha dizia apenas "55 de 1.009 itens passaram por aqui", e não
distinguia as duas razões para um item ficar de fora: **nunca ter entrado** no
status, ou **estar nele agora** — caso em que a permanência está aberta, não tem
duração e por isso não conta.

O segundo caso não é exceção; é a regra nos status finais do fluxo. Medido no
recorte padrão de Tipo (1.009 itens concluídos com histórico):

| Status | já saíram | ainda estão nele | nunca passaram |
| --- | --- | --- | --- |
| `PRONTO PARA ATIVAÇÃO DE VALOR` | 55 | **300** | 654 |
| `PRONTO PARA PROD` | 666 | **269** | 74 |
| `Deploy em PROD` | ~207 | **~181** | ~622 |

É o que explica a barra de `PRONTO PARA ATIVAÇÃO DE VALOR` estar em 0,8 d: quase
todo mundo que está lá **continua lá**. A última linha só aparece quando há
alguém parado, e explica o mecanismo em vez de repetir o número. Grupos zerados
somem da linha, e quando todos passaram ela diz isso em uma frase.

Nada disso exigiu mudança no backend: `Status` e `TempoPorStatus` já bastam para
separar os três grupos no navegador.

Ordem e cor das barras saem da **fase do status** (Pendente → Em andamento →
Concluído → Cancelado), pelas listas de `classification.rules.ts` que viajam no
`meta` — nunca por pedaço do nome do status, que é a decisão travada em
`test/drawer-status.spec.js`.

`npm run test:status-time` valida as regras de domínio e
`npm run test:status-time-view` valida a tela (jsdom, executando o script real da
página).

### Cinco status saíram do default "Em andamento"

`To Do` (mais de 2.000 itens, quase todos sub-tarefas), `Aprofundamento`,
`PI Planning`, `PRONTO P/ PREPARAR PI PLANNING` e `Design detalhado` não
constavam em nenhuma lista de fase e caíam no default de `phaseOf`, inflando
"Itens em andamento" com trabalho que nem começou. Agora são **pendentes**, por
coerência com a lista, que já tratava refinamento e revisão de design como
trabalho não iniciado.

O que muda: cerca de 2.100 itens saem de "Em andamento" para "Pendente" no
recorte que inclui sub-tarefas e épicos — no snapshot em que isso foi medido,
Backlog foi de ~870 para ~2.950 e Em andamento de ~2.300 para ~230 (as
quantidades exatas mudam a cada coleta; a ordem de grandeza, não).

O que **não** muda: o WIP (é apenas "não concluído e não cancelado", não consulta
essas listas) e o painel no recorte padrão de Tipo — **nenhum** item afetado é
`Enabler`, `Melhoria`, `Story` ou `Technical Debt`, e essa é uma propriedade
estrutural do fluxo, não um número do snapshot.

## A aba Dependências

Uma **Dependência** é um issuetype próprio: o time **demandante** abre a issue
para o time de quem ele depende — o **dependente**, que é o campo `Team`. Quando
o dependente está fora das nossas Value Streams (SSO, Ecommerce Engine, CaaS…),
o campo `Time Externo` marca isso; conferido contra a base, ele repete o `Team`
em 27 dos 29 casos, ou seja, sinaliza *"de quem eu dependo está fora"*.

Quatro decisões desta aba divergem do resto do painel, e cada uma pode quebrar
mostrando um número plausível e errado. Todas estão travadas em
`test/dependencias.spec.js`.

**1. A data de conclusão vem do changelog, não de `resolutiondate`.** O workflow
deste issuetype não seta resolução: nas 62 dependências concluídas da base,
`resolutiondate` está vazia em **100%** delas, e `Data de Fim Real` também. A
data usada é a **entrada na categoria Done** — a mesma régua do
`SprintDeliveryResolver`. Sem isso, toda dependência chegaria sem data: lead time
nulo e a aba inteira desaparecendo do filtro global de período, sem erro na tela.

**2. O relógio começa na abertura**, como num bloqueio (ver
`domain/services/DependencyResolver.js`). Uma dependência nasce ativa: ninguém
"começa a trabalhar" nela. A duração é lead time (criação → conclusão), e a
dependência aberta conta da abertura até hoje — recalculado no navegador, senão o
snapshot em cache congelaria o envelhecimento. **Cancelada não soma dias**: no
processo do produto, cancelar significa que a dependência *deixou de ser
necessária*, então ela conta como episódio sem duração medida.

**3. Os dois campos de time escrevem a mesma squad de dois jeitos.** O `Team`
grava `Squad Core - Core Features`; o `Time Demandante`, `Core Features`. O
`DependencyResolver` canoniza os dois (remove o prefixo `Squad X - `, acentos e
`&`) e resolve o que sobra por apelido em `config/dependency.rules.ts` — sem
isso, a matriz demandante × dependente sai com dois nós para a mesma squad. Só o
**id canônico** viaja em cada linha do payload; os rótulos vão uma única vez em
`meta.dependencyTeams`, porque repetir "Martech CDP & Tracking [Educon]" duas
vezes por dependência custaria mais que o catálogo inteiro.

Por isso a aba tem **filtros próprios de Squad e Papel** (demandante /
dependente / ambos) na barra global, e o filtro `Squad` global sai da tela ali:
os dois se chamam igual porque são o mesmo conceito, mas o da aba compara pelo
**id canônico** e leva o papel em conta, enquanto o global compara com o nome cru
do campo `Team` — que só cobre o lado dependente. O da aba é de seleção
múltipla, como os demais da barra. O
filtro de Tipo também sai — a aba é de um tipo só, e o recorte padrão da barra
(Enabler/Melhoria/Story/Technical Debt) a esvaziaria.

**4. O item impactado depende de link no Jira.** Valem os links oficiais
`Dependo de` / `Depende de mim` (in e out VS) e, como aproximação acordada com o
time, `Blocks` e `Relates`. `Cloners` fica **de fora**: um clone é cópia da
própria dependência, não o item que ficou esperando, e entraria como ruído em 42
links. Hoje isso cobre **41%** das dependências — 16% se só os oficiais
contassem —, e a cobertura vai escrita embaixo da tabela de itens impactados. O
card **Qualidade do preenchimento** existe para essa lacuna encolher: ele mostra
quanto falta em Time Demandante, link, link oficial e label de PI, com drill para
a lista corrigível.

O escopo (`Mesma VS` / `Outras VS`) sai do tipo de link oficial. Sem link oficial
ele fica `Não informado` — dizer "mesma VS" por omissão seria inventar o dado.

`Dependência` tem **grupo próprio** em `classification.rules.ts`, e não o default
`Sub-task`: ela é um acordo entre times, não trabalho de entrega. Deixá-la cair
no default somaria as dependências ao velocity, ao burndown e ao `Incremental`.

## A aba Sprint: burndown de subitens e transbordo

O burndown do card **Burndown de subitens** desce o número de subitens ainda não
concluídos por dia, usando a **data de entrega da sprint** (entrada no primeiro
status de Done) — a mesma régua do velocity.

A linha ideal parte do que estava **aberto no primeiro dia**, e não do total de
subitens. A diferença aparece sempre que um item transborda do ciclo anterior:
ele chega com subitens já concluídos, e contá-los no ponto de partida da ideal
dava ao time uma vantagem que ele não conquistou na sprint. Medido na
`App - Aprender / 26_SQD_APP_Aprender_PI3_4`: a ideal começava em **116** contra
**83** da linha real, porque **33 dos 116 subitens já estavam em Done na
abertura** — 28 deles vindos de `APP-825` (15 de 19 subitens prontos) e `APP-767`
(13 de 17). A linha real nascia abaixo da ideal sem uma linha de código escrita
na sprint. Partindo do restante do primeiro dia, as duas linhas se encontram na
abertura, como num burndown clássico.

**Transbordo, aqui, é permanecer na sprint anterior até o fechamento dela**
(`transbordoDeSprint`). O item transbordado ganha um badge na tabela *Itens
standard na sprint*, com a sprint de origem e quantos subitens já vieram prontos.
O texto sai no **tooltip do painel**, não no `title` nativo do navegador — uma
frase desse tamanho no `title` fica ilegível. Foi por causa dele que
`showHelpTooltip` passou a aceitar `data-help-title`: o cabeçalho default é
"Regra", e aqui o tooltip não enuncia critério de cálculo, informa de onde
aquele item veio.

A definição é estrita de propósito. Ao encerrar uma sprint, o Jira move para a
próxima apenas os itens **incompletos**; continuar membro até o fim é, portanto,
o sinal de que a sprint anterior era a dona do item — a mesma leitura da regra 3
de `atribuirEntregas`, no velocity. A alternativa frouxa ("esteve em alguma
sprint anterior") marcaria **6 dos 8** itens dessa sprint, incluindo quatro que
**saíram** da PI3_3 com ela ainda aberta e chegaram com 0 a 2 subitens prontos —
replanejamento, não transbordo. Na base inteira a regra estrita marca **35 de
186** itens das 24 sprints ativas: sinal, não ruído. Item sem histórico de sprint
reconstruído não é marcado — preferimos deixar de marcar a marcar errado.

Nada disso passa pelo backend: `SprintPeriodos` e o catálogo de sprints já
chegam ao cliente para o velocity, então o payload não cresce.

**Uma distorção continua na tela**, e é deliberado: o total de subitens é a
contagem de **hoje**, então subitem criado depois do início da sprint é
retroagido ao dia 1. Nessa sprint são 11 subitens criados em 25 e 26/08 — a
abertura real tinha 105 subitens, 72 abertos, não 83. Corrigir exige contar o
escopo por `Criado` e desenhar a linha de escopo total; ficou para depois, para
não trocar a leitura de "restante" no mesmo passo.

Não confundir com o transbordo de **PI** da aba PI Tracking (`piIsTransbordo`),
que vem de uma label própria. Unidades diferentes, mesma
palavra — o vocabulário é o do time.

## Com o que a barra de filtros abre

Três padrões, todos desfazíveis num clique:

| Filtro | Padrão | Escopo |
|---|---|---|
| Tipo de item | Enabler, Melhoria, Story, Technical Debt | global |
| Programa | One | global (a aba Sprint não usa Programa) |
| Conclusão | últimos 30 dias (D-30 → hoje) | global; PI Tracking e Sprint ignoram |
| PI | quarter corrente do Programa marcado | **só** na aba PI Tracking, entra ao abrir e sai ao fechar |

**A lista de PI acompanha o Programa.** Com One marcado aparecem só
`PI1`–`PI4 - One`; com Bridge, os `PI* - Legado` (a label diz "Legado",
o programa chama-se Bridge). A correlação vive como dado em
`config/quarter.rules.ts`, ao lado da janela de cada quarter — casar por pedaço
do nome quebraria em silêncio após qualquer alteração de grafia. `Não informado`
fica sempre visível nas duas listas: são 57,8% dos itens da base, nos dois
programas. Ao trocar de Programa, o PI marcado que saiu do recorte é removido da
seleção, e dentro da aba PI Tracking o PI do quarter do novo programa entra no
lugar — marcar Bridge traz `PI3 - Legado`.

## Programa: de que projeto vem cada item

O Jira não tem um campo "Programa" — ele é derivado do **projeto** da issue, em
`config/classification.rules.ts`. São **Bridge** os projetos `LEG`
(*Value Streams Bridge*) e `BOPS` (*Operação e Bugs*); qualquer outro é
**One**.

A comparação usa a **chave** do projeto, não o nome. A chave é o identificador
estável no Jira: renomear um projeto muda o nome que chega aqui, e um dashboard
que classifica por nome passaria a errar em silêncio a partir do dia do rename.
O nome segue aceito como segunda via, para issues montadas sem a chave.

`BOPS` entrou por decisão do time e é um caso particular: o projeto **não está
na JQL geral** do dashboard, então ele só chega por um caminho — a coleta
própria da aba PI Tracking, que busca épicos por *label* de PI **sem filtro de
projeto** (`_piEpicJql`). Antes da regra, o único épico de BOPS com label de PI
(`BOPS-2768`, com `EpicoPI1Legado` e 7 filhos) era contado como One: um
épico do Legado somado ao outro programa.

## Fidelidade da transformação

As regras foram reconstruídas a partir do dataset original e **conferidas contra
as 3.202 issues reais**: correspondência de **100%** nos campos usados pelo
dashboard e **183/183** nas agregações de épico. As únicas diferenças
intencionais: a label principal do PI4 agora é mapeada para `PI4 - One` (o
processo antigo ainda não tratava PI4).

`npm run test:transform` valida todas as regras com um fixture sintético.

## Onde ajustar as coisas

- **Trocar/editar a JQL** → `JIRA_JQL` no `.env` (ou o padrão em `config/index.js`).
- **Novo tipo de item, status ou PI** → `config/classification.rules.ts`.
- **Regras do acompanhamento de PI** → `config/quarter.rules.ts`.
- **Tipos de link e apelidos de time da aba Dependências** → `config/dependency.rules.ts`.
- **Fórmula de Lead/Cycle/Aging** → `domain/services/FlowMetricsCalculator.js`.
- **Regra do tempo por status** → `domain/services/StatusTimeResolver.js`.
- **Regra de saúde do épico** → `domain/services/EpicHealthEvaluator.js`.
- **Trocar Jira por outra fonte** → nova classe que estenda `IssueRepository` e
  troque a linha no `main.js`.

## Deploy no AWS Amplify

O projeto suporta Amplify Hosting Compute com o HTML e a API Express no mesmo
domínio. A branch de deploy é `main`; o botão **Atualizar dados**
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
