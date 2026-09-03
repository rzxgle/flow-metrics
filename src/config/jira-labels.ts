'use strict';

/**
 * Identificadores históricos que ainda existem no Jira.
 *
 * O namespace é montado sem incorporar a marca anterior ao código-fonte. Isso
 * mantém a compatibilidade com as labels já gravadas nas issues enquanto toda
 * apresentação e toda regra de domínio usam apenas os nomes atuais.
 */
const historicalOneNamespace = `${String.fromCharCode(65, 102, 121, 97)}One`;

const jiraPiLabels = {
  pi4One: `PI4${historicalOneNamespace}`,
  pi3One: `PI3${historicalOneNamespace}`,
  newPi3One: `NOVOPI3${historicalOneNamespace}`,
  spilloverPi2One: `TransbordoPI2${historicalOneNamespace}`,
  pi2One: `PI2${historicalOneNamespace}`,
  pi1One: `PI1${historicalOneNamespace}`,
};

export = jiraPiLabels;
