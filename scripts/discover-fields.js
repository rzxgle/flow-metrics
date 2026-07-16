'use strict';

require('dotenv').config();

/**
 * Descobre os IDs dos custom fields da SUA instância do Jira.
 *
 * Uso:  npm run discover:fields
 *
 * Lista todos os campos e destaca os que provavelmente correspondem a:
 * Team, Story Points, Start date, Data de início real, Data de fim real.
 * Copie os IDs (customfield_XXXXX) para o seu .env.
 */
async function main() {
  const baseUrl = (process.env.JIRA_BASE_URL || '').replace(/\/$/, '');
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    console.error('Configure JIRA_BASE_URL, JIRA_EMAIL e JIRA_API_TOKEN no .env primeiro.');
    process.exit(1);
  }

  const auth = 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64');
  const res = await fetch(`${baseUrl}/rest/api/3/field`, {
    headers: { Authorization: auth, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.error(`Erro ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const fields = await res.json();

  const hints = {
    'JIRA_FIELD_TEAM': /team|time|squad|equipe/i,
    'JIRA_FIELD_STORY_POINTS': /story\s*point|pontos/i,
    'JIRA_FIELD_START_DATE': /start date|data de in[íi]cio$/i,
    'JIRA_FIELD_ACTUAL_START': /in[íi]cio real|actual start/i,
    'JIRA_FIELD_ACTUAL_END': /fim real|actual end|end real/i,
  };

  console.log('\n=== Sugestões para o seu .env ===\n');
  for (const [envVar, rx] of Object.entries(hints)) {
    const matches = fields.filter((f) => rx.test(f.name));
    if (matches.length) {
      matches.forEach((m) => console.log(`${envVar}=${m.id}   # "${m.name}"`));
    } else {
      console.log(`# ${envVar}= (nenhum campo óbvio encontrado — veja a lista completa abaixo)`);
    }
    console.log('');
  }

  console.log('=== Todos os campos customizados ===\n');
  fields
    .filter((f) => f.custom)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((f) => console.log(`${f.id.padEnd(22)} ${f.name}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
