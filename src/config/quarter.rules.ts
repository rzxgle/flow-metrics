'use strict';

import jiraPiLabels = require('./jira-labels');

/**
 * Regras da aba "PI Tracking" (acompanhamento de épicos por quarter).
 *
 * ATENÇÃO — estas regras são DELIBERADAMENTE diferentes das de
 * `classification.rules.js`. Elas replicam, status por status e tipo por tipo,
 * o que o painel de quarter legado (FastAPI/Streamlit) já calcula e que o time
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
  // Homologação conta como concluído (decisão herdada do painel legado).
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
 * Replica o `issuetype not in (...)` da consulta do painel legado. Sub-tarefas
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
 * Espelha TRANSBORDO_LABELS do painel legado.
 */
const transbordoLabels = [
  'LegadoTransbordoP126',
  'LegadoTransbordoP226',
  jiraPiLabels.spilloverPi2One,
];

/**
 * PI -> janela temporal do quarter e PROGRAMA a que ele pertence.
 *
 * A janela alimenta o KPI de progresso no tempo (quanto do quarter já passou),
 * que é a régua contra a qual o progresso de entrega é comparado.
 *
 * O `programa` existe para o filtro de PI da barra saber quais opções fazem
 * sentido com o Programa escolhido: com One marcado, só os PIs de One
 * aparecem. A correlação vive aqui, como DADO, e não num casamento por pedaço do
 * nome ("- One"): qualquer alteração de grafia quebraria a regra em silêncio,
 * enquanto uma entrada faltando nesta tabela
 * aparece na hora — o PI some da lista.
 *
 * Atenção ao vocabulário: a label diz "Legado", mas o PROGRAMA correspondente
 * chama-se **Bridge** (o mesmo nome que `classification.rules.js` deriva do
 * projeto). São duas palavras para o mesmo lado do painel.
 *
 * Derivado de `label_options.py`: One PI1/PI2/PI3 = Q1/Q2/Q3 de 2026, e o
 * mesmo para o Legado. PI4 - One não existe no painel legado; segue a
 * sequência como Q4/2026. Não há PI4 - Legado: quando ele existir, precisa ser
 * acrescentado aqui, senão o Bridge fica sem PI corrente no Q4.
 */
const piPeriods = {
  'PI1 - One': { quarter: 'Q1', year: 2026, programa: 'One' },
  'PI2 - One': { quarter: 'Q2', year: 2026, programa: 'One' },
  'PI3 - One': { quarter: 'Q3', year: 2026, programa: 'One' },
  'PI4 - One': { quarter: 'Q4', year: 2026, programa: 'One' },
  'PI1 - Legado': { quarter: 'Q1', year: 2026, programa: 'Bridge' },
  'PI2 - Legado': { quarter: 'Q2', year: 2026, programa: 'Bridge' },
  'PI3 - Legado': { quarter: 'Q3', year: 2026, programa: 'Bridge' },
};

/** Primeiro e último dia de cada quarter (mês/dia), para montar as datas. */
const quarterBounds = {
  Q1: { startMonth: 1, startDay: 1, endMonth: 3, endDay: 31 },
  Q2: { startMonth: 4, startDay: 1, endMonth: 6, endDay: 30 },
  Q3: { startMonth: 7, startDay: 1, endMonth: 9, endDay: 30 },
  Q4: { startMonth: 10, startDay: 1, endMonth: 12, endDay: 31 },
};

const quarterRules = {
  doneStatuses,
  inProgressStatuses,
  ignoredStatuses,
  excludedChildTypes,
  subtaskTypePrefixes,
  transbordoLabels,
  piPeriods,
  quarterBounds,
};

export = quarterRules;
