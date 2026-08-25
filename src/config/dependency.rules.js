'use strict';

/**
 * Regras do issuetype "Dependência".
 *
 * Uma dependência é uma issue própria que um time (o DEMANDANTE) abre para o
 * time de quem ele depende (o DEPENDENTE). No Jira isso aparece assim:
 *
 *   - `Team/Squad` (customfield_10001) = time DEPENDENTE, quem vai executar;
 *   - `Time Demandante` (customfield_12487) = squad que abriu a dependência;
 *   - `Time Externo` (customfield_12486) = preenchido quando o time dependente
 *     está FORA das nossas Value Streams (SSO, Ecommerce Engine, CaaS, RM...).
 *     Conferido contra a base: em 27 dos 29 casos ele repete o Team, ou seja,
 *     marca "de quem eu dependo está fora", não "quem me pediu está fora";
 *   - label do PI (`PI3AfyaOne`, ...) situa a dependência no ciclo;
 *   - o andamento é o próprio workflow: To Do / Backlog / EM ANDAMENTO / Done /
 *     CANCELADO — todos já classificados em `classification.rules.js`.
 *
 * Estas regras ficam isoladas aqui (dados, não lógica) pelo mesmo motivo das
 * demais: mudou o processo, muda este arquivo, não o serviço.
 */

/** Nome do issuetype no Jira. */
const dependencyIssueType = 'Dependência';

/**
 * Tipos de link OFICIAIS do processo. O nome do tipo já carrega o escopo:
 * "in VS" é dependência dentro do mesmo conjunto de squads; "out VS" é
 * dependência para fora dele.
 *
 * O sentido (`Dependo de` vs `Depende de mim`) NÃO entra aqui: ele é lido do
 * lado do link (`direction`), porque os dois sentidos compartilham o mesmo
 * nome de tipo.
 */
const officialLinkTypes = {
  'Dependência entre times (mesma VS)': 'Mesma VS',
  'Dependência externa (Outras VS ou áreas)': 'Outras VS',
};

/**
 * Tipos aceitos como link de dependência quando o oficial não foi usado.
 *
 * Motivo: na base atual só 31 das 189 dependências (16%) usam um dos tipos
 * oficiais. Aceitar `Blocks` e `Relates` leva a cobertura a 78 (41%) sem
 * inventar relação nenhuma — as duas descrevem, na prática, o item que ficou
 * esperando. `Cloners` fica DELIBERADAMENTE de fora: clone é duplicação da
 * própria dependência, não o item impactado, e entraria como ruído (42 links).
 *
 * Escopo destes é desconhecido — ver `unknownScopeLabel`.
 */
const fallbackLinkTypes = ['Blocks', 'Relates'];

/** Escopo exibido quando nenhum link oficial diz de que lado a dependência é. */
const unknownScopeLabel = 'Não informado';

/**
 * Prefixo de nomenclatura das squads no campo Team. O campo `Time Demandante` é
 * uma lista de seleção com o nome CURTO ("Core Features"), enquanto o Team usa
 * o nome longo ("Squad Core - Core Features"). Sem remover o prefixo, a matriz
 * demandante x dependente sairia com dois nós para a mesma squad.
 *
 * A variação sem espaço antes do hífen ("Squad Conversão- Encontrar...") existe
 * de verdade na base e é coberta pelo mesmo padrão.
 */
const squadPrefixPattern = /^squad\s+[^-]*-\s*/i;

/**
 * Equivalências que a normalização por si só não resolve — nome curto e nome
 * longo divergem de fato, não só na formatação. Chave e valor já normalizados
 * (minúsculas, sem acento).
 */
const teamAliases = {
  // "Squad Aprender - Rotina de Estudos" x demandante "Rotina de Estudo"
  'rotina de estudo': 'rotina de estudos',
  // "Squad Aprender - Desempenho" x demandante "Desempenho e Conclusão"
  desempenho: 'desempenho e conclusao',
  // Time externo "SSO" x Team "Foundation (SSO)"
  'foundation (sso)': 'sso',
};

/**
 * Rótulo preferido de cada time, quando o nome que aparece primeiro não é o
 * melhor para ler num eixo de gráfico.
 */
const teamLabels = {
  sso: 'SSO (Foundation)',
  'desempenho e conclusao': 'Desempenho e Conclusão',
  'rotina de estudos': 'Rotina de Estudos',
  // Os times abaixo aparecem escritos de dois jeitos (acento e caixa diferentes
  // entre o `Team` e o `Time Demandante`). Sem fixar o rótulo, o eixo do gráfico
  // mostraria a grafia do primeiro registro lido, que muda a cada coleta.
  'experiencia de compra': 'Experiência de Compra',
  'ativacao do curso': 'Ativação do Curso',
  'busca e recomendacao': 'Busca & Recomendação',
  'core features': 'Core Features',
  'encontrar e considerar': 'Encontrar e Considerar',
  'estruturacao e aceleracao': 'Estruturação e Aceleração',
  'atrair e engajar': 'Atrair e Engajar',
  'preparatorios': 'Preparatórios',
};

/** Rótulo usado quando o time não foi preenchido. */
const unknownTeamLabel = 'Não informado';

module.exports = {
  dependencyIssueType,
  officialLinkTypes,
  fallbackLinkTypes,
  unknownScopeLabel,
  squadPrefixPattern,
  teamAliases,
  teamLabels,
  unknownTeamLabel,
};
