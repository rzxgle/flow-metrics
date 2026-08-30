// @ts-nocheck -- harness dinâmico executado dentro do sandbox do jsdom.
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
 * O bloco final testa o caso oposto e deliberado — a aba PI Tracking É quem
 * escreve o Programa padrão na barra ao ser aberta, e apaga ao ser deixada. Ele
 * roda pelo clique real na aba, porque o que interessa é o efeito colateral do
 * handler de troca de aba, não a função isolada.
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
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8');
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
// O handler de troca de aba reagenda um resize dos gráficos; este jsdom não é
// visual, então o callback só precisa existir para o clique não estourar.
window.requestAnimationFrame = (fn) => { fn(); return 0; };
window.__SPRINTS = [];

// `let`/`const` do script não viram propriedades do window; o epílogo roda no
// mesmo escopo lexical e expõe só o que o teste precisa.
const epilogo = `
;window.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  selections, buildFilterBar, syncFilterBarForTab, matchesSprintTabFilters,
  TIPOS_FORA_DA_ABA_SPRINT, DEFAULT_TIPO, DEFAULT_PROGRAMA,
  set PI_DATA(v){ PI_DATA.length=0; PI_DATA.push(...v); },
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
    'Tipo Agrupado': GRUPOS[tipo], Programa: 'Afya One', VS: 'VS X', Squad: 'Squad X',
    PI: 'PI3', Labels: [], Status: 'Concluído', Concluido: true, Cancelado: false,
    WIP: false, FaseFluxo: 'Concluído', EntregueAmplo: true, Incremental: true,
    'Story Points': 1, Sprint: 'S1', Sprints: ['S1'], SprintPeriodos: [], SprintHistoricoOk: true,
    Criado: '2026-07-01', 'Data Conclusao': '2026-07-10', 'Data Entrega Sprint': '2026-07-10',
    'Data Inicio Real': '2026-07-02', AnoMesCriacao: '2026-07', AnoCriacao: 2026, Mes: 7,
    AnoMesConclusao: '2026-07', AnoConclusao: 2026, CycleTimeDias: 8, LeadTimeDias: 9,
    parentKey: null, parent: null, EpicoChave: null,
  };
};
const BASE = Object.keys(GRUPOS).map(item);
/* Um item de outro Programa. As opções do filtro saem do DADO, e o bloco final
   deste arquivo precisa que "Afya One" exista como opção real na barra. Ele não
   muda nenhuma contagem de tipo: Story já está na lista. */
BASE.push({ ...item('Story'), Programa: 'Afya One' });
T.DATA = BASE;
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

/* Os padrões de abertura, verificados ANTES de qualquer teste mexer na barra —
   o bloco de "Limpar" mais abaixo zera as seleções de propósito. */
check('Programa = Afya One nasce marcado na barra, em qualquer aba', () => {
  assert.deepStrictEqual(Array.from(T.selections.Programa), ['Afya One']);
  // Array.from: a lista vem do realm do jsdom, e sem isso o deepStrictEqual
  // reprova por protótipo mesmo com o conteúdo igual.
  assert.deepStrictEqual(Array.from(T.DEFAULT_PROGRAMA), ['Afya One']);
  const cb = Array.from(dropdown('Programa').querySelectorAll('input[type=checkbox]'))
    .find((c) => c.value === 'Afya One');
  assert.strictEqual(cb.checked, true, 'o checkbox tem de nascer marcado');
  assert.strictEqual(dropdown('Programa').querySelector('.count').textContent, '1');
});

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

/* ===================================================================
   ATALHOS DE GRUPO NO FILTRO DE TIPO

   Vieram de um feedback: para trocar o recorte para sub-itens era preciso
   desmarcar 4 tipos e marcar 7 num dropdown de 16 opções, e ainda saber de cor
   quais são subs.

   O compromisso central, e o que estes testes existem para travar: OS CHIPS NÃO
   SÃO UM SEGUNDO FILTRO. Continua havendo uma seleção só, de tipos crus, e o
   chip apenas escreve nela em bloco — marcar e desmarcar tipo a tipo continua
   valendo, inclusive depois de usar um chip. Se alguém transformar isso num
   filtro paralelo (uma seleção de grupos separada da de tipos), o painel volta a
   ter duas verdades sobre o mesmo recorte e estes testes reprovam.
   =================================================================== */
const chips = () => Array.from(dropdown('Tipo de item').querySelectorAll('.dd-chip'));
const chip = (rotulo) => chips().find((c) => c.textContent.trim() === rotulo);
const estado = (rotulo) => {
  const c = chip(rotulo);
  return c.classList.contains('on') ? 'on' : (c.classList.contains('partial') ? 'partial' : 'off');
};
const marcados = () => Array.from(dropdown('Tipo de item')
  .querySelectorAll('.dd-item input[type=checkbox]')).filter((cb) => cb.checked)
  .map((cb) => cb.value).sort();
const SUBS = ['Sub-block', 'Sub-bug', 'Sub-design', 'Sub-imp', 'Sub-script', 'Sub-task', 'Sub-test'];
const HISTORIA = ['Enabler', 'Melhoria', 'Story', 'Technical Debt'];
const limparTipo = () => clicar(dropdown('Tipo de item').querySelector('[data-act="none"]'));

console.log('\nAtalhos de grupo no filtro de Tipo:');

check('os chips existem só no filtro de Tipo', () => {
  assert.ok(chips().length >= 2, 'sem chips no filtro de Tipo');
  for (const key of ['Programa', 'VS', 'Squad', 'PI', 'Sprint', 'Status']) {
    assert.strictEqual(dropdown(key).querySelectorAll('.dd-chip').length, 0, key);
  }
});

check('os grupos saem do DADO — grupo sem item na base não vira chip', () => {
  // Nesta base sintética não há Dependência, então o chip dela não existe. É o
  // que garante que a lista de chips acompanhe o Jira sem manutenção aqui.
  const rotulos = chips().map((c) => c.textContent.trim());
  assert.deepStrictEqual(rotulos, ['Nível história', 'Sub-itens', 'Bugs', 'Épicos']);
});

check('um clique marca o grupo inteiro — 7 subtipos de uma vez', () => {
  limparTipo();
  clicar(chip('Sub-itens'));
  assert.deepStrictEqual(selecionados(), SUBS.slice().sort());
  assert.strictEqual(estado('Sub-itens'), 'on');
});

check('a lista de checkboxes é a verdade e acompanha o chip', () => {
  // Se os dois divergirem, o dropdown passa a mostrar um recorte e a tela outro.
  assert.deepStrictEqual(marcados(), SUBS.slice().sort());
});

check('clicar de novo limpa só aquele grupo, sem tocar no resto', () => {
  limparTipo();
  clicar(chip('Nível história'));
  clicar(chip('Sub-itens'));
  assert.strictEqual(selecionados().length, 11);
  clicar(chip('Sub-itens'));
  assert.deepStrictEqual(selecionados(), HISTORIA.slice().sort(), 'o nível história ficou intacto');
});

check('os grupos se somam: dá para ver história e sub-itens ao mesmo tempo', () => {
  limparTipo();
  clicar(chip('Nível história'));
  clicar(chip('Sub-itens'));
  assert.strictEqual(estado('Nível história'), 'on');
  assert.strictEqual(estado('Sub-itens'), 'on');
  assert.strictEqual(estado('Bugs'), 'off');
});

check('seleção parcial mostra estado próprio, e clicar COMPLETA em vez de limpar', () => {
  // Quem marcou 3 subtipos à mão está tentando montar um recorte; se o clique
  // limpasse, ele perderia o que já tinha feito.
  limparTipo();
  ['Sub-imp', 'Sub-test', 'Sub-bug'].forEach((t) => {
    const cb = itensDe('Tipo de item').map((el) => el.querySelector('input')).find((i) => i.value === t);
    cb.checked = true;
    cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.strictEqual(estado('Sub-itens'), 'partial');
  clicar(chip('Sub-itens'));
  assert.deepStrictEqual(selecionados(), SUBS.slice().sort());
  assert.strictEqual(estado('Sub-itens'), 'on');
});

check('o chip não substitui o filtro: desmarcar um tipo à mão continua valendo', () => {
  // É a resposta à pergunta "a pessoa ainda pode selecionar os tipos isolados?".
  limparTipo();
  clicar(chip('Sub-itens'));
  const cb = itensDe('Tipo de item').map((el) => el.querySelector('input')).find((i) => i.value === 'Sub-test');
  cb.checked = false;
  cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(!selecionados().includes('Sub-test'), 'o tipo saiu da seleção');
  assert.strictEqual(selecionados().length, 6);
  assert.strictEqual(estado('Sub-itens'), 'partial', 'e o chip passa a anunciar que o grupo está incompleto');
});

check('"Limpar" e "Todos" do painel ressincronizam os chips', () => {
  limparTipo();
  assert.strictEqual(estado('Sub-itens'), 'off');
  assert.strictEqual(estado('Nível história'), 'off');
  clicar(dropdown('Tipo de item').querySelector('[data-act="all"]'));
  assert.strictEqual(estado('Sub-itens'), 'on');
  assert.strictEqual(estado('Bugs'), 'on');
});

check('na aba Sprint somem os chips cujos tipos todos saem da lista', () => {
  // Mesma regra dos .dd-item, e aqui vale a cascata real: um chip que só
  // seleciona tipos invisíveis naquela aba não pode ficar clicável.
  abrir('sprint');
  const visiveis = chips().filter((c) => !escondido(c)).map((c) => c.textContent.trim());
  assert.deepStrictEqual(visiveis, ['Nível história', 'Bugs']);
  abrir('exec');
  assert.strictEqual(chips().filter((c) => !escondido(c)).length, 4, 'e voltam ao sair da aba');
});

check('o "Limpar" geral da barra também zera os chips', () => {
  limparTipo(); // o teste anterior terminou com tudo marcado pelo "Todos"
  clicar(chip('Sub-itens'));
  assert.strictEqual(estado('Sub-itens'), 'on');
  clicar(Array.from(document.querySelectorAll('.clear-btn')).find((b) => /Limpar/.test(b.textContent)));
  assert.strictEqual(estado('Sub-itens'), 'off');
  assert.deepStrictEqual(selecionados(), []);
});

/* ---------- Programa global + PI do quarter na aba PI Tracking ----------
   Duas coisas diferentes que convivem na mesma barra:

   - `Programa = Afya One` é padrão GLOBAL, como o de Tipo: nasce marcado e vale
     em toda aba que usa Programa.
   - o `PI` do quarter corrente é padrão SÓ da aba PI Tracking, marcado ao entrar
     e apagado ao sair. Ele não pode ser global: o PI é campo de preenchimento
     manual, e 63,6% dos sub-itens e 57% dos bloqueios da base não têm label —
     pré-selecioná-lo em todas as abas deixaria 27% da base de pé.

   E a lista de PI acompanha o Programa: com Afya One marcado, só PIs de Afya
   One aparecem, mais o `Não informado`, que existe nos dois programas.

   Tudo aqui roda pelo clique real na aba, o único caminho em que o efeito
   acontece. */
const quarterRules = require('../src/config/quarter.rules');
window.__QUARTER_RULES = quarterRules;
T.PI_DATA = [{
  Chave: 'PI-1', Resumo: 'épico', 'Tipo de item': 'Epic', 'Tipo Agrupado': 'Épico',
  Programa: 'Afya One', VS: 'CORE EXPERIENCE', Squad: 'Squad X', PI: 'PI3 - Afya One',
  Labels: [], Status: 'Desenvolvimento', EpicoChave: 'PI-1', parentKey: null,
  Concluido: false, Cancelado: false, 'Story Points': 0,
}];

const abaBtn = (aba) => document.querySelector(`.tab-btn[data-tab="${aba}"]`);
const cbDe = (key, valor) => Array.from(dropdown(key).querySelectorAll('input[type=checkbox]'))
  .find((cb) => cb.value === valor);
const selecaoDe = (key) => Array.from(T.selections[key]).sort();
const pisNaTela = () => Array.from(dropdown('PI').querySelectorAll('.dd-item'))
  .filter((el) => !el.hasAttribute('data-pi-fora'))
  .map((el) => el.querySelector('input[type=checkbox]').value).sort();

/* A base sintética tem PI 'PI3' (valor solto, sem correlação). Para exercitar a
   correlação de verdade, a lista precisa conter PIs dos dois programas e o
   'Não informado'. */
T.DATA = BASE.concat([
  { ...item('Story'), PI: 'PI3 - Afya One' },
  { ...item('Story'), PI: 'PI2 - Afya One' },
  { ...item('Story'), PI: 'PI3 - Legado', Programa: 'Afya Bridge' },
  { ...item('Story'), PI: 'Não informado' },
]);
// O teste do "Limpar" geral, acima, zerou as seleções de propósito; o padrão
// de abertura já foi verificado no topo do arquivo.
T.selections.Programa.add('Afya One');
T.buildFilterBar();

check('a lista de PI só mostra os do Programa marcado, mais "Não informado"', () => {
  assert.deepStrictEqual(pisNaTela(), ['Não informado', 'PI2 - Afya One', 'PI3', 'PI3 - Afya One'],
    'PI3 - Legado é de outro programa; "PI3" solto não tem correlação e fica');
});

check('entrar na aba PI marca o PI do quarter corrente', () => {
  clicar(abaBtn('pi'));
  assert.deepStrictEqual(selecaoDe('PI'), ['PI3 - Afya One'], 'hoje cai no Q3/2026');
  assert.strictEqual(cbDe('PI', 'PI3 - Afya One').checked, true, 'o checkbox tem de aparecer marcado');
});

check('sair da aba PI desmarca — nenhuma outra aba herda o recorte de PI', () => {
  clicar(abaBtn('exec'));
  assert.deepStrictEqual(selecaoDe('PI'), []);
  assert.strictEqual(cbDe('PI', 'PI3 - Afya One').checked, false);
  assert.strictEqual(dropdown('PI').querySelector('.count').style.display, 'none');
});

check('trocar para Afya Bridge troca a lista e o PI do quarter', () => {
  clicar(abaBtn('pi'));
  assert.deepStrictEqual(selecaoDe('PI'), ['PI3 - Afya One']);
  const bridge = cbDe('Programa', 'Afya Bridge');
  bridge.checked = true;
  bridge.dispatchEvent(new window.Event('change', { bubbles: true }));
  const one = cbDe('Programa', 'Afya One');
  one.checked = false;
  one.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.deepStrictEqual(selecaoDe('Programa'), ['Afya Bridge']);
  assert.deepStrictEqual(pisNaTela(), ['Não informado', 'PI3', 'PI3 - Legado'],
    'a lista passa a ser a do outro programa');
  assert.deepStrictEqual(selecaoDe('PI'), ['PI3 - Legado'],
    'o PI do quarter corrente do novo programa entra no lugar do anterior');
});

check('desmarcar o PI dentro da aba tem efeito — o padrão não é trava', () => {
  const cb = cbDe('PI', 'PI3 - Legado');
  cb.checked = false;
  cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.deepStrictEqual(selecaoDe('PI'), [], 'a seleção fica vazia, sem padrão invisível');
  // E, a partir daí, a escolha é do usuário: sair da aba não pode reescrevê-la.
  T.selections.PI.add('PI2 - Afya One');
  clicar(abaBtn('exec'));
  assert.deepStrictEqual(selecaoDe('PI'), ['PI2 - Afya One'],
    'a aba não pode apagar uma escolha do usuário ao sair');
  clicar(abaBtn('pi'));
  assert.deepStrictEqual(selecaoDe('PI'), ['PI2 - Afya One'],
    'nem sobrescrevê-la ao voltar');
  T.selections.PI.clear();
  T.selections.Programa.clear();
  T.selections.Programa.add('Afya One');
  T.buildFilterBar();
});

check('a página não registrou erro em nenhuma dessas interações', () => {
  assert.deepStrictEqual(erros, []);
});

console.log(`\n✅ ${passed} verificações passaram.\n`);
