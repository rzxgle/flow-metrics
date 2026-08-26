'use strict';

/**
 * Testes do card "Tempo por Story Point" (aba Estimativas), com o script real
 * da página rodando dentro do jsdom.
 *
 * O card cruza a ESTIMATIVA (Story Points) com a DURAÇÃO real dos itens já
 * concluídos. Quatro decisões dele podem quebrar sem que nada dê erro na tela —
 * o gráfico simplesmente mostraria outro número —, e é por isso que cada uma
 * tem teste próprio:
 *
 *   1. AS RÉGUAS SÃO DUAS, E O PADRÃO É O CYCLE TIME. São as mesmas métricas da
 *      aba Lead & Cycle Time, de propósito: o painel não tem uma terceira
 *      definição de tempo. O padrão é o Cycle Time porque o Lead Time carrega a
 *      fila de backlog anterior ao início, que não é esforço do item — abrir no
 *      Lead Time daria números plausíveis e três vezes maiores.
 *
 *   2. ITEM SEM A DATA QUE A MÉTRICA EXIGE ENTRA COMO "SEM MEDIDA", NÃO COMO
 *      ZERO. Zero dia puxaria a média para baixo como se o item tivesse sido
 *      instantâneo, quando o que houve foi ausência de registro. Isso pesa aqui:
 *      o Cycle Time depende de dois campos manuais e cobre 83% da base, e é por
 *      isso que a legenda sempre declara em quantos itens a medida existe.
 *
 *   3. SÓ ITENS DE ENTREGA. Épicos, subitens e Dependência ficam fora mesmo
 *      quando o filtro de Tipo os inclui — o SP de uma sub-task é herdado do
 *      pai, e na base real há 8.095 sub-tasks concluídas com SP.
 *
 *   4. O CORTE DE AMOSTRA ESTÁ EM 3 ITENS, e é baixo de propósito: no recorte
 *      por squad, exigir 5 derrubava squads inteiras para duas barras (medido:
 *      64 barras contra 76, nas 18 squads com 20+ itens). Abaixo do corte o
 *      tamanho não some — vai para a última linha da tabela e para a legenda,
 *      com a contagem.
 *
 *   5. A REFERÊNCIA DO COMITÊ É META, NÃO MEDIÇÃO, e só vale no Cycle Time —
 *      contra o Lead Time o descolamento chega a 18x. Tamanho fora da escala
 *      Fibonacci entra com referência ZERO (erro de cadastro, sem prazo), e não
 *      como valor faltante: é isso que o deixa sempre fora da referência.
 *
 * jsdom porque o objeto do teste é o que a tela produz. Sem rede: DATA
 * sintética, Chart e canvas são stubs que capturam a configuração recebida.
 *
 * Rode com:  npm run test:sp-tempo
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const rules = require('../src/config/classification.rules');

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

const charts = {};
const ctxStub = { canvas: null, createLinearGradient: () => ({ addColorStop() {} }) };
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  ctxStub.canvas = this;
  return ctxStub;
};
class ChartStub {
  constructor(ctx, config) {
    charts[ctx && ctx.canvas ? ctx.canvas.id : '?'] = config;
  }

  destroy() {} update() {} resize() {}
}
ChartStub.defaults = { font: {}, color: '', plugins: { legend: { labels: {} } } };
ChartStub.register = () => {};
window.Chart = ChartStub;
window.fetch = async () => { throw new Error('sem rede no teste'); };
window.__SPRINTS = [];

// As listas de fase vêm do módulo REAL: se um status mudar de lista amanhã, o
// teste acompanha em vez de mentir.
window.__RULES_PENDING = rules.pendingStatuses;
window.__RULES_INPROG = rules.inProgressStatuses;
window.__RULES_DONE = rules.doneStatuses;
window.__RULES_CANCELLED = rules.cancelledStatuses;

const epilogo = `
;window.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  get DATA(){ return DATA; },
  selections, renderSpTempoPorSP, agregarTempoPorSP,
  SP_TIME_MEASURES, SP_TIME_MIN_AMOSTRA, SP_REFERENCIA_COMITE, referenciaDoComite,
  get spTimeMetric(){ return spTimeMetric; },
  // A base do último render fica guardada para o seletor de medida poder
  // redesenhar sem refazer o recorte da aba (que em modo Sprint significaria
  // rodar atribuirEntregas de novo). O teste escreve nela pelo mesmo caminho.
  set spTimeBase(v){ __spTimeBase = v; },
  set openDrawer(v){ openDrawer = v; },
  set activeTab(v){ activeTab=v; },
};`;
window.eval(script + epilogo);
const T = window.__T;

/* ---------- base sintética ---------- */
let seq = 0;
/**
 * Item de entrega concluído. `cycle` é o Cycle Time em dias; o Lead Time vem
 * fixo em 30 para que trocar de régua produza um número inconfundível.
 */
const item = (sp, cycle, over = {}) => {
  seq += 1;
  return {
    Chave: `TESTE-${seq}`, Resumo: 'item', 'Tipo de item': 'Story', 'Tipo Agrupado': 'História',
    Programa: 'Programa X', VS: 'VS X', Squad: 'Squad X', PI: 'PI3', Labels: [],
    Status: 'Concluído', Concluido: true, Cancelado: false, WIP: false,
    FaseFluxo: 'Concluído', EntregueAmplo: true, Incremental: true,
    'Story Points': sp, Sprint: 'S1', Sprints: ['S1'], SprintPeriodos: [], SprintHistoricoOk: true,
    Criado: '2026-07-01', 'Data Conclusao': '2026-07-31', 'Data Entrega Sprint': '2026-07-31',
    'Data Inicio Real': '2026-07-02', AnoMesCriacao: '2026-07', AnoCriacao: 2026, Mes: '07',
    AnoMesConclusao: '2026-07', AnoConclusao: 2026, CycleTimeDias: cycle, LeadTimeDias: 30,
    parentKey: null, parent: null, EpicoChave: null,
    ...over,
  };
};

/** n itens do mesmo tamanho, todos com o mesmo Cycle Time. */
const lote = (sp, n, cycle, over = {}) => Array.from({ length: n }, () => item(sp, cycle, over));

const desenhar = (base) => {
  T.spTimeBase = base; // é o que renderSP faz antes de chamar o render
  T.renderSpTempoPorSP(base);
  return charts['chart-sp-time'];
};
const rotulos = (cfg) => Array.from((cfg || charts['chart-sp-time']).data.labels);
const serie = (cfg, i) => Array.from((cfg || charts['chart-sp-time']).data.datasets[i].data);
const legenda = () => document.getElementById('sp-time-caption').textContent;
const tabela = () => document.querySelector('#sp-time-table tbody').textContent;
const refDataset = (cfg) => (cfg || charts['chart-sp-time']).data.datasets
  .find((d) => d.label && d.label.startsWith('Referência'));
const colunasVisiveis = () => Array.from(document.querySelectorAll('#sp-time-table thead th'))
  .filter((th) => th.style.display !== 'none').map((th) => th.textContent);
const trocarMedida = (valor) => {
  const el = document.getElementById('spTimeMetric');
  el.value = valor;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

T.activeTab = 'sp';

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nO card existe na aba Estimativas:');

check('a aba se chama Estimativas na navegação e no título do painel', () => {
  // O identificador interno segue sendo `sp` (chave de CSS, do recorte de
  // Sprint e destes testes); só o RÓTULO mudou. Travado aqui porque "Story
  // Points" é o nome da métrica e voltaria fácil por hábito.
  const botao = document.querySelector('.tab-btn[data-tab="sp"]');
  assert.strictEqual(botao.textContent.trim(), 'Estimativas');
  const titulo = document.querySelector('#panel-sp > .section-head h2');
  assert.strictEqual(titulo.textContent.trim(), 'Estimativas');
});

check('canvas, seletor de medida, legenda e tabela estão no painel de Estimativas', () => {
  const painel = document.getElementById('panel-sp');
  assert.ok(painel.querySelector('#chart-sp-time'), 'canvas');
  assert.ok(painel.querySelector('#spTimeMetric'), 'seletor');
  assert.ok(painel.querySelector('#sp-time-caption'), 'legenda');
  assert.ok(painel.querySelector('#sp-time-table tbody'), 'tabela');
});

check('o card novo vem DEPOIS dos quatro gráficos que já fechavam a tela', () => {
  const canvases = Array.from(document.querySelectorAll('#panel-sp canvas')).map((c) => c.id);
  assert.deepStrictEqual(canvases, [
    'chart-sp-vs', 'chart-sp-squad', 'chart-sp-pi', 'chart-sp-month', 'chart-sp-time',
  ]);
});

console.log('\nDecisão 1 — duas réguas, e o padrão é o Cycle Time:');

check('o seletor oferece exatamente Cycle Time e Lead Time, nessa ordem', () => {
  const opcoes = Array.from(document.querySelectorAll('#spTimeMetric option'));
  assert.deepStrictEqual(opcoes.map((o) => o.value), ['cycle', 'lead']);
  assert.ok(opcoes[0].textContent.includes('Cycle Time'), opcoes[0].textContent);
  assert.ok(opcoes[1].textContent.includes('Lead Time'), opcoes[1].textContent);
});

check('não existe uma terceira régua registrada no código', () => {
  assert.deepStrictEqual(Object.keys(T.SP_TIME_MEASURES).sort(), ['cycle', 'lead']);
});

check('o card abre no Cycle Time, e o seletor mostra isso', () => {
  assert.strictEqual(T.spTimeMetric, 'cycle');
  assert.strictEqual(document.getElementById('spTimeMetric').value, 'cycle');
});

check('a medida padrão usa CycleTimeDias, não LeadTimeDias', () => {
  // Lead vale 30 em todos os itens: se a régua trocasse, a barra viria 30.
  const cfg = desenhar(lote(3, 5, 8));
  assert.deepStrictEqual(rotulos(cfg), ['3 SP']);
  assert.deepStrictEqual(serie(cfg, 0), [8]);
});

check('as duas séries medidas são média e P85, nessa ordem, antes da referência', () => {
  // cycle: 1,2,3,4,10 -> média 4 ; P85 interpola acima disso
  const cfg = desenhar([1, 2, 3, 4, 10].map((c) => item(2, c)));
  // Array.from traz o array para o realm do teste: o que vem do jsdom tem outro
  // Array.prototype e deepStrictEqual reprova por identidade de protótipo.
  // A referência vem DEPOIS das duas: os índices 0 e 1 são medição, e é neles
  // que o resto do arquivo (e o tooltip) confia.
  assert.deepStrictEqual(Array.from(cfg.data.datasets).map((d) => d.label),
    ['Média', 'P85', 'Referência (comitê de agilidade)']);
  assert.strictEqual(serie(cfg, 0)[0], 4);
  assert.ok(serie(cfg, 1)[0] > serie(cfg, 0)[0], 'P85 acima da média nesta amostra');
});

check('o seletor troca a régua sem refazer o recorte da aba', () => {
  desenhar(lote(3, 5, 8)); // Cycle 8, Lead 30 em todos
  trocarMedida('lead');
  assert.deepStrictEqual(serie(null, 0), [30], 'Lead Time');
  trocarMedida('cycle');
  assert.deepStrictEqual(serie(null, 0), [8], 'volta para Cycle Time');
});

check('a legenda nomeia a régua em uso — o eixo usa o mesmo rótulo', () => {
  assert.ok(legenda().includes('Cycle Time'), legenda());
  assert.strictEqual(charts['chart-sp-time'].options.scales.y.title.text,
    T.SP_TIME_MEASURES.cycle.eixo);
  trocarMedida('lead');
  assert.ok(legenda().includes('Lead Time'), legenda());
  assert.strictEqual(charts['chart-sp-time'].options.scales.y.title.text,
    T.SP_TIME_MEASURES.lead.eixo);
  trocarMedida('cycle');
});

console.log('\nDecisão 2 — sem a data exigida é "sem medida", não zero:');

check('item sem Cycle Time fica FORA da média', () => {
  // 5 itens de 8 dias + 1 sem as datas de início/fim reais.
  // Média correta = 8. Se o item entrasse com zero, cairia para 6,67.
  const base = lote(3, 5, 8).concat([item(3, null)]);
  assert.deepStrictEqual(serie(desenhar(base), 0), [8]);
});

check('a legenda declara a cobertura: quantos itens têm a medida', () => {
  const base = lote(3, 5, 8).concat([item(3, null)]);
  desenhar(base);
  assert.ok(/5<\/b> de 6/.test(document.getElementById('sp-time-caption').innerHTML), legenda());
});

check('trocar de régua muda a cobertura declarada, porque a base muda', () => {
  // O item sem Cycle Time TEM Lead Time: no Lead a cobertura fecha em 6 de 6.
  desenhar(lote(3, 5, 8).concat([item(3, null)]));
  trocarMedida('lead');
  assert.ok(/6<\/b> de 6/.test(document.getElementById('sp-time-caption').innerHTML), legenda());
  trocarMedida('cycle');
});

console.log('\nDecisão 3 — só itens de entrega entram:');

check('sub-task, épico e Dependência ficam fora mesmo com SP preenchido', () => {
  const base = lote(3, 5, 8).concat([
    item(3, 40, { 'Tipo de item': 'Sub-imp', 'Tipo Agrupado': 'Sub-task' }),
    item(3, 40, { 'Tipo de item': 'Epic', 'Tipo Agrupado': 'Épico' }),
    item(3, 40, { 'Tipo de item': 'Dependência', 'Tipo Agrupado': 'Dependência' }),
  ]);
  // Se qualquer um deles entrasse, a média de 8 subiria.
  assert.deepStrictEqual(serie(desenhar(base), 0), [8]);
});

check('Bug, Enabler e Débito Técnico entram — são trabalho estimado do time', () => {
  const base = [
    ...lote(2, 2, 8),
    item(2, 8, { 'Tipo de item': 'Bug', 'Tipo Agrupado': 'Bug' }),
    item(2, 8, { 'Tipo de item': 'Enabler', 'Tipo Agrupado': 'Enabler' }),
    item(2, 8, { 'Tipo de item': 'Technical Debt', 'Tipo Agrupado': 'Débito Técnico' }),
  ];
  const cfg = desenhar(base);
  assert.deepStrictEqual(rotulos(cfg), ['2 SP']);
  assert.ok(/5<\/b> de 5/.test(document.getElementById('sp-time-caption').innerHTML), legenda());
});

check('item sem Story Points não vira um balde "0 SP"', () => {
  const base = lote(3, 5, 8).concat([item(0, 8)]);
  assert.deepStrictEqual(rotulos(desenhar(base)), ['3 SP']);
});

console.log('\nDecisão 4 — abaixo de 3 itens sai do gráfico, mas não some:');

check('o corte está em 3 itens, e a borda é exata: 3 entra, 2 fica de fora', () => {
  // As duas bordas no mesmo fixture. O corte é baixo de propósito — no recorte
  // por squad, exigir 5 derrubava squads inteiras para duas barras.
  assert.strictEqual(T.SP_TIME_MIN_AMOSTRA, 3);
  const base = [...lote(1, 3, 2), ...lote(8, 2, 12)];
  assert.deepStrictEqual(rotulos(desenhar(base)), ['1 SP']);
});

check('com 3 itens a barra sai com a média deles, não com o item do meio', () => {
  const base = [2, 4, 12].map((c) => item(5, c));
  const cfg = desenhar(base);
  assert.deepStrictEqual(rotulos(cfg), ['5 SP']);
  assert.deepStrictEqual(serie(cfg, 0), [6]); // (2+4+12)/3
});

check('o tamanho descartado aparece na legenda e na última linha da tabela, com a contagem', () => {
  const base = [...lote(3, 5, 8), ...lote(8, 2, 12), ...lote(13, 1, 20)];
  desenhar(base);
  assert.ok(legenda().includes('8, 13'), legenda());
  assert.ok(legenda().includes('3 itens'), legenda()); // 2 de 8 SP + 1 de 13 SP
  assert.ok(tabela().includes('Amostra insuficiente'), tabela());
  assert.ok(tabela().includes('8 SP · 13 SP'), tabela());
});

check('a tabela lista um tamanho por linha, com n, média, P85 e as três de referência', () => {
  // 1 SP: 5 itens de 2 dias contra referência de 1 -> 2,0x, nenhum dentro.
  // 5 SP: 6 itens de 10 dias contra referência de 5 -> 2,0x, nenhum dentro.
  desenhar([...lote(1, 5, 2), ...lote(5, 6, 10)]);
  const linhas = Array.from(document.querySelectorAll('#sp-time-table tbody tr'))
    .map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent));
  assert.deepStrictEqual(linhas, [
    ['1', '5', '2.0', '2.0', '1 d', '2.0x', '0%'],
    ['5', '6', '10.0', '10.0', '5 d', '2.0x', '0%'],
  ]);
});

check('os tamanhos saem em ordem crescente, não na ordem de chegada', () => {
  const base = [...lote(8, 5, 12), ...lote(1, 5, 2), ...lote(3, 5, 6)];
  assert.deepStrictEqual(rotulos(desenhar(base)), ['1 SP', '3 SP', '8 SP']);
});

check('SP fracionário mantém o decimal no rótulo (0,5 e não 1)', () => {
  assert.deepStrictEqual(rotulos(desenhar(lote(0.5, 5, 1))), ['0,5 SP']);
});

console.log('\nDecisão 5 — a referência do comitê é meta, e só vale no Cycle Time:');

check('a tabela do comitê está fiel ao que foi definido', () => {
  assert.deepStrictEqual({ ...T.SP_REFERENCIA_COMITE },
    { 0.5: 1, 1: 1, 2: 2, 3: 3, 5: 5, 8: 8, 13: 15, 21: 20 });
});

check('tamanho fora da escala Fibonacci recebe referência ZERO, não "sem referência"', () => {
  // Decisão do time: 4, 6, 7, 9, 10, 12, 14 e 20 SP são erro de cadastro e não
  // ganham prazo. Zero, e não null — é o que os deixa sempre fora da referência.
  [4, 6, 7, 9, 10, 12, 14, 20, 34].forEach((sp) => {
    assert.strictEqual(T.referenciaDoComite(sp), 0, `${sp} SP`);
  });
  assert.strictEqual(T.referenciaDoComite(13), 15);
});

check('a linha de referência entra como série própria, tracejada, com os valores do comitê', () => {
  const cfg = desenhar([...lote(1, 3, 9), ...lote(3, 3, 9), ...lote(13, 3, 9)]);
  const ref = refDataset(cfg);
  assert.ok(ref, 'a série de referência existe');
  assert.strictEqual(ref.type, 'line');
  assert.ok(Array.isArray(ref.borderDash) && ref.borderDash.length, 'tracejada');
  assert.deepStrictEqual(serie(cfg, cfg.data.datasets.indexOf(ref)), [1, 3, 15]);
});

check('a linha desce a zero nos tamanhos fora da escala, em vez de interpolar', () => {
  const cfg = desenhar([...lote(3, 3, 9), ...lote(4, 3, 9), ...lote(5, 3, 9)]);
  const ref = refDataset(cfg);
  assert.deepStrictEqual(serie(cfg, cfg.data.datasets.indexOf(ref)), [3, 0, 5]);
});

check('"dentro da referência" conta os itens que couberam nela', () => {
  // 3 SP, referência 3 dias: dois itens dentro (1 e 3), dois fora (4 e 10).
  desenhar([1, 3, 4, 10].map((c) => item(3, c)));
  const celulas = Array.from(document.querySelectorAll('#sp-time-table tbody tr td'))
    .map((td) => td.textContent);
  assert.strictEqual(celulas[4], '3 d', 'coluna Referência');
  assert.strictEqual(celulas[6], '50%', 'coluna Dentro da referência');
});

check('tamanho fora da escala fica com 0% dentro e sem razão a exibir', () => {
  desenhar(lote(4, 3, 9));
  const celulas = Array.from(document.querySelectorAll('#sp-time-table tbody tr td'))
    .map((td) => td.textContent);
  assert.strictEqual(celulas[4], 'fora da escala');
  assert.strictEqual(celulas[5], '—', 'razão contra zero não é exibida');
  assert.strictEqual(celulas[6], '0%');
});

check('no Lead Time a linha e as três colunas somem, e a legenda diz que sumiram', () => {
  const base = [...lote(1, 3, 9), ...lote(3, 3, 9)];
  desenhar(base);
  assert.ok(refDataset(), 'a referência existe no Cycle Time');
  assert.strictEqual(colunasVisiveis().length, 7);

  trocarMedida('lead');
  assert.strictEqual(refDataset(), undefined, 'a série de referência sai do gráfico');
  assert.deepStrictEqual(colunasVisiveis(),
    ['Story Points', 'Itens medidos', 'Média (dias)', 'P85 (dias)']);
  assert.ok(legenda().includes('referência do comitê sai da tela'), legenda());

  trocarMedida('cycle');
  assert.ok(refDataset(), 'volta ao trocar de volta');
  assert.strictEqual(colunasVisiveis().length, 7);
});

check('a legenda nomeia os tamanhos que entraram com referência zero', () => {
  desenhar([...lote(3, 3, 9), ...lote(4, 3, 9), ...lote(6, 3, 9)]);
  assert.ok(legenda().includes('4, 6'), legenda());
  assert.ok(legenda().includes('erro de cadastro'), legenda());
});

console.log('\nDrill e estado vazio:');

check('clicar numa barra abre exatamente os itens medidos daquele tamanho', () => {
  const cfg = desenhar(lote(3, 5, 8).concat([item(3, null)]));
  const aberto = [];
  T.openDrawer = (title, issues) => aberto.push({ title, chaves: issues.map((d) => d.Chave) });
  cfg.options.onClick({}, [{ index: 0, datasetIndex: 0 }], {});
  assert.strictEqual(aberto.length, 1);
  assert.ok(aberto[0].title.includes('3 SP'), aberto[0].title);
  // 5 itens, não 6: o drawer mostra a MESMA base que a média usou.
  assert.strictEqual(aberto[0].chaves.length, 5);
});

check('recorte sem nenhum item de entrega concluído avisa, em vez de ficar mudo', () => {
  desenhar([item(3, 8, { 'Tipo Agrupado': 'Sub-task' })]);
  assert.ok(legenda().includes('Nenhum item de entrega concluído'), legenda());
  assert.deepStrictEqual(rotulos(), []);
});

check('base vazia não quebra o render', () => {
  desenhar([]);
  assert.deepStrictEqual(rotulos(), []);
  assert.ok(tabela().length > 0);
});

check('nenhum erro de jsdom durante a suíte', () => {
  assert.deepStrictEqual(erros, []);
});

console.log(`\n${passed} verificações OK — tempo por Story Point\n`);
