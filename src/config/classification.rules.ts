'use strict';

/**
 * Regras de classificação de issues.
 *
 * Estas regras foram derivadas por engenharia reversa a partir do dataset
 * original (planilha do Jira -> JSON enriquecido do dashboard) e conferidas
 * contra 3.202 issues reais, com 100% de correspondência.
 *
 * Ficam isoladas aqui (e não espalhadas no código) para respeitar o princípio
 * Open/Closed: você adiciona/ajusta uma regra editando dados, sem tocar na
 * lógica que as aplica. Ex.: surgiu um novo tipo de item no Jira? Basta
 * adicioná-lo em `issueTypeToGroup`.
 */

/** Mapeia o "Tipo de item" cru do Jira para o "Tipo Agrupado" do dashboard. */
const issueTypeToGroup = {
  Epic: 'Épico',
  'Enabler Epic': 'Épico',
  História: 'História',
  Story: 'História',
  Melhoria: 'História',
  Bug: 'Bug',
  'Bug hotfix': 'Bug',
  'Technical Debt': 'Débito Técnico',
  Enabler: 'Enabler',
  // Dependência tem grupo próprio, e não o default 'Sub-task': ela não é
  // trabalho de entrega do time, é um acordo entre times. Deixá-la cair no
  // default somaria 189 itens ao velocity, ao burndown e ao "Incremental".
  'Dependência': 'Dependência',
  // Todos os subtipos caem em "Sub-task"
  Subtarefa: 'Sub-task',
  'Sub-block': 'Sub-task',
  'Sub-bug': 'Sub-task',
  'Sub-design': 'Sub-task',
  'Sub-imp': 'Sub-task',
  'Sub-script': 'Sub-task',
  'Sub-test': 'Sub-task',
  'Correção Staging': 'Sub-task',
};

/** Grupo usado quando o tipo de item não está mapeado acima. */
const defaultGroup = 'Sub-task';

/** Status que representam item CONCLUÍDO. */
const doneStatuses = [
    "PRONTO PARA PROD",
    "PROD",
    "Done",
    "Deploy em PROD",
    "PRONTO PARA ATIVAÇÃO DE VALOR",
    "Pronto p/ Deploy STG",
    "Ativação de valor",
    "PRONTO PARA MEDIÇÃO",
    "Aprovação Comitê",
    "Deploy em Staging",
    "PRONTO PARA HOMOLOGAÇÃO INTEGRADA",
    "Homologação integrada",
    'Measure & Learn',
    "Concluído"
];

/** Status que representam item CANCELADO. */
const cancelledStatuses = ['CANCELADO'];

/**
 * Status que representam item PENDENTE — trabalho que ainda NÃO começou
 * (backlog, priorização, refinamento).
 *
 * Cinco status estavam FORA de todas as listas e por isso caíam no default de
 * `phaseOf` ("Em andamento"), inflando o "Itens em andamento" com trabalho que
 * nem começou: `To Do` (mais de 2.000 itens, quase todos sub-tarefas),
 * `Aprofundamento`, `PI Planning`, `PRONTO P/ PREPARAR PI PLANNING` e
 * `Design detalhado`. Entram aqui por decisão do time e por coerência com a
 * lista, que já tratava refinamento e revisão de design como trabalho não
 * iniciado.
 *
 * Nenhum deles aparece em item do filtro padrão de Tipo (Enabler/Melhoria/
 * Story/Technical Debt), então o painel como ele abre não muda; muda o recorte
 * que inclui sub-tarefas e épicos. `isWip` NÃO é afetado — ele é
 * `!isDone && !isCancelled` e não consulta esta lista.
 */
const pendingStatuses = [
  'Backlog',
  'To Do',
  'PRIORIZADO',
  'PRIORIZADO PARA O PI',
  'PRONTO P/ PREPARAR PI PLANNING',
  'PRONTO PARA PI PLANNING',
  'PI Planning',
  'PRONTO PARA REF. NEGÓCIO',
  'Refinamento de negócio',
  'Aprofundamento',
  'Pronto para revisão design',
  'Revisão design',
  'Design detalhado',
  'PRONTO PARA REFINAMENTO TÉCNICO',
  'Refinamento técnico',
  'PRONTO PARA DESENVOLVIMENTO',
  'Tarefas pendentes',
];

/**
 * Status que representam item EM ANDAMENTO — trabalho já iniciado, mas não
 * concluído.
 */
const inProgressStatuses = [
  'EM ANDAMENTO',
  'Desenvolvimento',
  'CODE REVIEW',
  'PRONTO PARA CODE REVIEW',
  'Em teste',
  'PRONTO PARA TESTES',
];

/**
 * Status considerados "Entregue (amplo)" — entregue em produção ou em fase
 * final de entrega de valor.
 */
const broadlyDeliveredStatuses = doneStatuses;

/**
 * Regras de PI a partir dos labels (campo "Categorias").
 * A ordem importa: o primeiro token encontrado (de cima para baixo) define o PI.
 * Assim, se um item tiver PI2 e PI3, prevalece o PI mais recente.
 *
 * Além do label "principal" de cada PI, entram aqui os labels de TRANSBORDO e
 * de item NOVO. Eles não são um PI à parte: marcam um
 * item que passou a ser acompanhado DENTRO de um PI, e é assim que a ferramenta
 * de quarter (afya-quarter, `label_options.py`) monta o conjunto de cada ciclo.
 * Um item com `PI2AfyaOne` + `TransbordoPI2AfyaOne` transbordou para o PI3 e é
 * cobrado lá — por isso o label de transbordo vem ANTES do label do PI de
 * origem nesta lista.
 */
const piRulesInPriorityOrder = [
  { label: 'PI4AfyaOne', pi: 'PI4 - Afya One' },
  { label: 'PI3AfyaOne', pi: 'PI3 - Afya One' },
  { label: 'NOVOPI3AfyaOne', pi: 'PI3 - Afya One' },
  { label: 'TransbordoPI2AfyaOne', pi: 'PI3 - Afya One' },
  { label: 'PI2AfyaOne', pi: 'PI2 - Afya One' },
  { label: 'PI1AfyaOne', pi: 'PI1 - Afya One' },
  { label: 'EpicoPI3Legado', pi: 'PI3 - Legado' },
  { label: 'LegadoTransbordoP226', pi: 'PI3 - Legado' },
  { label: 'EpicoPI2Legado', pi: 'PI2 - Legado' },
  { label: 'LegadoTransbordoP126', pi: 'PI2 - Legado' },
  { label: 'EpicoPI1Legado', pi: 'PI1 - Legado' },
];

/** Valor de PI quando nenhum label conhecido é encontrado. */
const defaultPi = 'Não informado';

/**
 * Projetos que pertencem ao programa "Afya Bridge". Qualquer outro projeto é
 * considerado "Afya One".
 *
 * A checagem é feita primeiro pela CHAVE do projeto e só depois pelo nome. A
 * chave é o identificador estável no Jira — renomear um projeto muda o nome que
 * chega aqui, e um dashboard que classifica por nome passa a errar em silêncio a
 * partir do dia do rename.
 *
 * `BOPS` / `Operação e Bugs` entrou por decisão do time: ele é do Afya Bridge,
 * não do Afya One. O projeto NÃO está na JQL geral do dashboard, então ele só
 * chega por um caminho: a coleta própria da aba PI Tracking, que busca épicos
 * por LABEL de PI sem filtro de projeto (`_piEpicJql`). Antes desta regra, o
 * único épico de BOPS com label de PI — `BOPS-2768`, "Autenticação por JWT",
 * com a label `EpicoPI1Legado` e 7 filhos — aparecia como Afya One, ou seja,
 * um épico do Legado contado dentro do outro programa.
 */
const bridgeProjectKeys = ['LEG', 'BOPS'];
const bridgeValueStreamNames = ['Value Streams Afya Bridge', 'Operação e Bugs'];

const classificationRules = {
  issueTypeToGroup,
  defaultGroup,
  doneStatuses,
  cancelledStatuses,
  pendingStatuses,
  inProgressStatuses,
  broadlyDeliveredStatuses,
  piRulesInPriorityOrder,
  defaultPi,
  bridgeProjectKeys,
  bridgeValueStreamNames,
};

export = classificationRules;
