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
    "Pronto para Prod",
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
 * Status considerados "Entregue (amplo)" — entregue em produção ou em fase
 * final de entrega de valor.
 */
const broadlyDeliveredStatuses = doneStatuses;

/**
 * Regras de PI a partir dos labels (campo "Categorias").
 * A ordem importa: o primeiro token encontrado (de cima para baixo) define o PI.
 * Assim, se um item tiver PI2 e PI3, prevalece o PI mais recente.
 */
const piRulesInPriorityOrder = [
  { label: 'PI4AfyaOne', pi: 'PI4 - Afya One' },
  { label: 'PI3AfyaOne', pi: 'PI3 - Afya One' },
  { label: 'PI2AfyaOne', pi: 'PI2 - Afya One' },
  { label: 'PI1AfyaOne', pi: 'PI1 - Afya One' },
  { label: 'EpicoPI3Legado', pi: 'PI3 - Legado' },
  { label: 'EpicoPI2Legado', pi: 'PI2 - Legado' },
  { label: 'EpicoPI1Legado', pi: 'PI1 - Legado' },
];

/** Valor de PI quando nenhum label conhecido é encontrado. */
const defaultPi = 'Não informado';

/**
 * Nome do projeto (Value Stream) que representa o programa "Afya Bridge".
 * Qualquer outro projeto é considerado "Afya One".
 */
const bridgeValueStreamName = 'Value Streams Afya Bridge';

module.exports = {
  issueTypeToGroup,
  defaultGroup,
  doneStatuses,
  cancelledStatuses,
  broadlyDeliveredStatuses,
  piRulesInPriorityOrder,
  defaultPi,
  bridgeValueStreamName,
};
