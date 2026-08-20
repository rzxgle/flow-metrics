'use strict';

/**
 * Regras da aba "PI Tracking" (acompanhamento de épicos por quarter).
 *
 * ATENÇÃO — estas regras são DELIBERADAMENTE diferentes das de
 * `classification.rules.js`. Elas replicam, status por status e tipo por tipo,
 * o que a ferramenta `afya-quarter` (FastAPI/Streamlit) já calcula e que o time
 * usa nas cerimônias de PI. Se as duas discordarem, a aba nova perde a função:
 * ninguém confia em dois números para a mesma pergunta.
 *
 * Correspondência com o projeto original:
 *   `backend/app/core/workflow_rules.py`  -> doneStatuses / inProgressStatuses / ignoredStatuses
 *   `backend/app/core/label_options.py`   -> piPeriods (label de PI -> quarter/ano)
 *   `backend/app/core/config.py`          -> transbordoLabels
 *   provider Jira (`parent in (...) and issuetype not in (...)`) -> excludedChildTypes
 *
 * Diferenças de comportamento que isto implica, em relação ao resto do dashboard:
 *   - a comparação de status é NORMALIZADA (trim + maiúsculas), então
 *     "Pronto para Prod" e "PRONTO PARA PROD" contam igual;
 *   - "Em Homologação", "Pronto para Staging" e "Staging" contam como CONCLUÍDO;
 *   - "Inválido" conta como CANCELADO (aqui só "CANCELADO" contava);
 *   - sub-tarefas e o próprio épico ficam FORA do denominador de progresso,
 *     evitando contar a história e seus subitens como entregas separadas.
 */

/** Status que contam como CONCLUÍDO no acompanhamento de PI. */
const doneStatuses = [
  'Pronto para Prod',
  'Prod',
  'Done',
  'Deploy em PROD',
  'PRONTO PARA ATIVAÇÃO DE VALOR',
  'Pronto p/ Deploy STG',
  'Ativação de valor',
  'PRONTO PARA MEDIÇÃO',
  'Aprovação Comitê',
  'Deploy em Staging',
  'Concluído',
  // Homologação conta como concluído (decisão de regra herdada do afya-quarter).
  'Em Homologação',
  'Pronto para Staging',
  'PRONTO PARA HOMOLOGAÇÃO INTEGRADA',
  'Homologação integrada',
  'Staging',
  'Measure & Learn',
];

/** Status que contam como EM ANDAMENTO. */
const inProgressStatuses = [
  'Fazendo',
  'Desenvolvimento',
  'EM ANDAMENTO',
  'Code Review',
  'PRONTO PARA CODE REVIEW',
  'Pronto para Testes',
  'Em QA',
  'Em teste',
  'Beta',
];

/** Status que saem do cálculo (não entram no denominador do progresso). */
const ignoredStatuses = ['Inválido', 'Cancelado'];

/**
 * Tipos de item que NÃO contam como "filho entregável" de um épico.
 *
 * Replica o `issuetype not in (...)` da consulta do afya-quarter. Sub-tarefas
 * ficam fora porque somariam duas vezes o mesmo trabalho (a história e cada um
 * dos seus subitens), inflando o progresso de quem quebra muito o trabalho.
 */
const excludedChildTypes = [
  'Epic',
  'Enabler Epic',
  'Design',
  'Tarefa épico',
  'Dependência',
  'Tarefa',
  'Subtarefa',
  'Correção Staging',
];

/**
 * Prefixos de tipo tratados como sub-tarefa (equivale a `subtaskWorkTypes()`).
 * Cobre Sub-block, Sub-bug, Sub-design, Sub-imp, Sub-script, Sub-task e
 * Sub-test sem precisar listar cada um — e já cobre os que vierem depois.
 */
const subtaskTypePrefixes = ['Sub-', 'Sub '];

/**
 * Labels que marcam um item como TRANSBORDO (veio de um PI anterior).
 * Espelha TRANSBORDO_LABELS do afya-quarter.
 */
const transbordoLabels = [
  'LegadoTransbordoP126',
  'LegadoTransbordoP226',
  'TransbordoPI2AfyaOne',
];

/**
 * PI -> janela temporal do quarter. Alimenta o KPI de progresso no tempo
 * (quanto do quarter já passou), que é a régua contra a qual o progresso de
 * entrega é comparado.
 *
 * Derivado de `label_options.py`: Afya One PI1/PI2/PI3 = Q1/Q2/Q3 de 2026, e o
 * mesmo para o Legado. PI4 - Afya One não existe no afya-quarter; segue a
 * sequência como Q4/2026.
 */
const piPeriods = {
  'PI1 - Afya One': { quarter: 'Q1', year: 2026 },
  'PI2 - Afya One': { quarter: 'Q2', year: 2026 },
  'PI3 - Afya One': { quarter: 'Q3', year: 2026 },
  'PI4 - Afya One': { quarter: 'Q4', year: 2026 },
  'PI1 - Legado': { quarter: 'Q1', year: 2026 },
  'PI2 - Legado': { quarter: 'Q2', year: 2026 },
  'PI3 - Legado': { quarter: 'Q3', year: 2026 },
};

/** Primeiro e último dia de cada quarter (mês/dia), para montar as datas. */
const quarterBounds = {
  Q1: { startMonth: 1, startDay: 1, endMonth: 3, endDay: 31 },
  Q2: { startMonth: 4, startDay: 1, endMonth: 6, endDay: 30 },
  Q3: { startMonth: 7, startDay: 1, endMonth: 9, endDay: 30 },
  Q4: { startMonth: 10, startDay: 1, endMonth: 12, endDay: 31 },
};

module.exports = {
  doneStatuses,
  inProgressStatuses,
  ignoredStatuses,
  excludedChildTypes,
  subtaskTypePrefixes,
  transbordoLabels,
  piPeriods,
  quarterBounds,
};
