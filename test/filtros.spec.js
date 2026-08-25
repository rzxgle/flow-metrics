'use strict';

/**
 * Testes do filtro de Tipo na aba Sprint, com DOM e CSS de verdade (jsdom).
 *
 * Por que jsdom e não o DOM falso do velocity.spec: o que está sob teste aqui é
 * apresentação. A opção continua no modelo e some da tela por uma regra CSS —
 * um DOM falso não tem cascata, então só daria para afirmar que a regra existe
 * no TEXTO do arquivo (é o que as checagens por regex do velocity.spec fazem).
 * A pergunta que interessa é outra: o item fica realmente escondido, inclusive
 * depois de a busca do dropdown escrever `display` inline no elemento? Esse é o
 * caso que o `!important` da regra resolve, e só a cascata de verdade responde.
 *
 * O outro compromisso verificado aqui é o de não mexer na lógica: entrar na aba
 * Sprint não pode alterar a seleção guardada pelas outras abas.
 *
 * Sem rede: DATA sintética cobrindo os 15 tipos crus; Chart, canvas e fetch são
 * stubs.
 *
 * Rode com:  npm run test:filtros
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

/* ---------- os tipos crus do Jira, agrupados como em classification.rules.js ---------- */
const GRUPOS = {
  Epic: 'Épico', 'Enabler Epic': 'Épico',
  Story: 'História', Melhoria: 'História',
  Enabler: 'Enabler',
  Bug: 'Bug', 'Bug hotfix': 'Bug',
  'Technical Debt': 'Débito Técnico',
  'Sub-task': 'Sub-task', 'Sub-block': 'Sub-task', 'Sub-bug': 'Sub-task',
  'Sub-design': 'Sub-task', 'Sub-imp': 'Sub-task', 'Sub-script': 'Sub-task',
  'Sub-test': 'Sub-task',
};
/* O nível que a aba Sprint mede: nem épico, nem subitem. */
const VISIVEIS_NA_SPRINT = ['Bug', 'Bug hotfix', 'Enabler', 'Melhoria', 'Story', 'Technical Debt'];
/* Os 12 da lista; `Subtarefa` e `Correção Staging` não têm ocorrência na base.
   `Dependência` entrou junto com a aba de Dependências: 141 das 189 da base têm
   sprint preenchida, mas uma dependência é acordo entre times e não trabalho de
   entrega da squad — ela não é o nível que esta aba mede. A exclusão de verdade
   está em `isStandard`; esta lista é a limpeza visual correspondente. */
const ESPERADOS_NA_LISTA = [
  'Epic', 'Enabler Epic', 'Dependência', 'Sub-block', 'Sub-bug', 'Sub-design',
  'Sub-imp', 'Sub-script', 'Sub-task', 'Sub-test', 'Subtarefa', 'Correção Staging',
];

/* ---------- boot da página real dentro do jsdom ---------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((m) => m[1]).filter((s) => s && s.trim())[0];

const erros = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => erros.push(e.message));

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', virtualConsole });
const { window } = dom;
const { document } = window;

// A página desenha gráficos ao renderizar; nada disso é o objeto deste teste.
const ctxStub = { canvas: null, createLinearGradient: () => ({ addColorStop() {} }) };
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  ctxStub.canvas = this;
  return ctxStub;
};
class ChartStub {
  destroy() {} update() {} resize() {}
}
ChartStub.defaults = { font: {}, color: '', plugins: { legend: { labels: {} } } };
ChartStub.register = () => {};
window.Chart = ChartStub;
window.fetch = async () => { throw new Error('sem rede no teste'); };
window.__SPRINTS = [];

// `let`/`const` do script não viram propriedades do window; o epílogo roda no
// mesmo escopo lexical e expõe só o que o teste precisa.
const epilogo = `
;window.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  selections, buildFilterBar, syncFilterBarForTab, matchesSprintTabFilters,
  TIPOS_FORA_DA_ABA_SPRINT, DEFAULT_TIPO,
  set activeTab(v){ activeTab=v; },
};`;
window.eval(script + epilogo);
const T = window.__T;

/* ---------- base sintética: um item por tipo cru ---------- */
let seq = 0;
const item = (tipo) => {
  seq += 1;
  return {
    Chave: `TESTE-${seq}`, Resumo: `item ${tipo}`, 'Tipo de item': tipo,
    'Tipo Agrupado': GRUPOS[tipo], Programa: 'Programa X', VS: 'VS X', Squad: 'Squad X',
    PI: 'PI3', Labels: [], Status: 'Concluído', Concluido: true, Cancelado: false,
    WIP: false, FaseFluxo: 'Concluído', EntregueAmplo: true, Incremental: true,
    'Story Points': 1, Sprint: 'S1', Sprints: ['S1'], SprintPeriodos: [], SprintHistoricoOk: true,
    Criado: '2026-07-01', 'Data Conclusao': '2026-07-10', 'Data Entrega Sprint': '2026-07-10',
    'Data Inicio Real': '2026-07-02', AnoMesCriacao: '2026-07', AnoCriacao: 2026, Mes: 7,
    AnoMesConclusao: '2026-07', AnoConclusao: 2026, CycleTimeDias: 8, LeadTimeDias: 9,
    parentKey: null, parent: null, EpicoChave: null,
  };
};
T.DATA = Object.keys(GRUPOS).map(item);
T.selections.Squad.add('Squad X');
T.activeTab = 'exec';
T.buildFilterBar();

/* ---------- helpers de leitura da tela ---------- */
const dropdown = (key) => document.getElementById('dd-' + key.replace(/\s/g, '_'));
const itensDe = (key) => Array.from(dropdown(key).querySelectorAll('.dd-item'));
const tipoDoItem = (el) => el.querySelector('input[type=checkbox]').value;
const escondido = (el) => window.getComputedStyle(el).display === 'none';
const naTela = (key) => itensDe(key).filter((el) => !escondido(el)).map(tipoDoItem).sort();
const abrir = (aba) => { T.activeTab = aba; T.syncFilterBarForTab(); };
const clicar = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const buscar = (key, texto) => {
  const campo = dropdown(key).querySelector('.dd-search');
  campo.value = texto;
  campo.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const selecionados = () => Array.from(T.selections['Tipo de item']).sort();

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nFiltro de Tipo na aba Sprint (jsdom, cascata de CSS real):');

check('a lista esconde os 11 tipos combinados, e só eles', () => {
  assert.deepStrictEqual(
    Array.from(T.TIPOS_FORA_DA_ABA_SPRINT).sort(),
    ESPERADOS_NA_LISTA.slice().sort(),
  );
});

check('os 15 tipos crus continuam no dropdown — nada saiu do modelo', () => {
  assert.strictEqual(itensDe('Tipo de item').length, 15);
  const marcados = itensDe('Tipo de item').filter((el) => el.hasAttribute('data-no-sprint'));
  assert.strictEqual(marcados.length, 9, 'os 9 da lista presentes na base saem marcados');
});

check('a marcação é exclusiva do Tipo: nenhum outro filtro foi tocado', () => {
  for (const key of ['Programa', 'VS', 'Squad', 'PI', 'Sprint', 'Status']) {
    const marcados = itensDe(key).filter((el) => el.hasAttribute('data-no-sprint'));
    assert.strictEqual(marcados.length, 0, `${key} não deveria ter itens marcados`);
  }
});

check('fora da aba Sprint a lista aparece inteira', () => {
  abrir('exec');
  assert.strictEqual(naTela('Tipo de item').length, 15);
});

check('na aba Sprint sobram só os 6 tipos do nível que a aba mede', () => {
  abrir('sprint');
  assert.deepStrictEqual(naTela('Tipo de item'), VISIVEIS_NA_SPRINT.slice().sort());
});

check('a busca não ressuscita os ocultos (o !important vence o display inline)', () => {
  buscar('Tipo de item', 'sub');
  assert.deepStrictEqual(naTela('Tipo de item'), [], 'nenhum "sub" reaparece');
  buscar('Tipo de item', 'bug');
  assert.deepStrictEqual(naTela('Tipo de item'), ['Bug', 'Bug hotfix'],
    'Sub-bug continua oculto enquanto os bugs do nível pai aparecem');
  buscar('Tipo de item', '');
});

check('"Todos" na aba Sprint marca o que está à vista, não os 15', () => {
  T.selections['Tipo de item'].clear();
  clicar(dropdown('Tipo de item').querySelector('[data-act="all"]'));
  assert.deepStrictEqual(selecionados(), VISIVEIS_NA_SPRINT.slice().sort());
});

check('"Limpar" zera tudo, inclusive o que está oculto', () => {
  clicar(dropdown('Tipo de item').querySelector('[data-act="none"]'));
  assert.deepStrictEqual(selecionados(), []);
});

check('fora da aba Sprint, "Todos" volta a marcar os 15', () => {
  abrir('exec');
  clicar(dropdown('Tipo de item').querySelector('[data-act="all"]'));
  assert.strictEqual(selecionados().length, 15);
});

check('entrar na aba Sprint não mexe na seleção guardada pelas outras abas', () => {
  const antes = selecionados();
  abrir('sprint');
  assert.deepStrictEqual(selecionados(), antes, 'esconder é só visual: o estado fica intacto');
  assert.ok(T.selections['Tipo de item'].has('Epic'), 'Epic segue selecionado, apenas invisível aqui');
  abrir('exec');
  assert.deepStrictEqual(selecionados(), antes, 'e continua valendo ao voltar');
});

check('o recorte da aba não mudou: Tipo segue valendo para o nível pai', () => {
  T.selections['Tipo de item'].clear();
  T.selections['Tipo de item'].add('Story');
  const amostra = Object.keys(GRUPOS).map(item);
  const de = (tipo) => amostra.find((d) => d['Tipo de item'] === tipo);
  assert.strictEqual(T.matchesSprintTabFilters(de('Story')), true);
  assert.strictEqual(T.matchesSprintTabFilters(de('Enabler')), false);
  // Um tipo oculto continua respondendo à regra de sempre: o filtro não foi
  // desligado para ele, apenas saiu do dropdown desta aba.
  assert.strictEqual(T.matchesSprintTabFilters(de('Sub-imp')), false);
  T.selections['Tipo de item'].add('Sub-imp');
  assert.strictEqual(T.matchesSprintTabFilters(de('Sub-imp')), true);
});

check('a página não registrou erro em nenhuma dessas interações', () => {
  assert.deepStrictEqual(erros, []);
});

console.log(`\n✅ ${passed} verificações passaram.\n`);
