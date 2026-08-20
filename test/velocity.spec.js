'use strict';

/**
 * Testes das regras de velocity que vivem no script do dashboard.
 *
 * Por que rodar o script da página dentro de um vm em vez de duplicar a lógica:
 * essas regras já produziram dois defeitos reais (entrega no último dia da sprint
 * sendo descartada por comparar data com timestamp; entrega anterior ao início da
 * sprint desaparecendo do indicador). Testar a cópia não teria pegado nenhum dos
 * dois — o teste precisa exercitar o código que roda no navegador.
 *
 * Sem rede: DATA e __SPRINTS são sintéticos.
 *
 * Rode com:  npm run test:velocity
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- DOM/Chart mínimos ---------- */
const charts = {};
function fakeEl(id){
  return {
    id, style:{}, className:'', dataset:{}, children:[], innerHTML:'', textContent:'', value:'',
    appendChild(c){ this.children.push(c); return c; }, replaceChildren(){ this.children=[]; },
    addEventListener(){}, removeEventListener(){},
    querySelector:()=>fakeEl('q'), querySelectorAll:()=>[],
    getContext:()=>({canvas:{id}}),
    classList:{add(){}, remove(){}, toggle(){}, contains:()=>false},
    setAttribute(){}, getAttribute:()=>null, closest:()=>null, focus(){}, insertAdjacentHTML(){},
  };
}
const registry = new Map();
const getEl = (id)=>{ if(!registry.has(id)) registry.set(id, fakeEl(id)); return registry.get(id); };
class ChartStub {
  constructor(ctx, config){ charts[ctx.canvas.id] = config; }
  destroy(){} update(){}
}
ChartStub.defaults = { font:{}, color:'', plugins:{legend:{labels:{}}} };
ChartStub.register = ()=>{};

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const script = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))
  .map((m)=>m[1]).filter((s)=>s && s.trim())[0];

const sandbox = {
  document:{ getElementById:getEl, querySelector:()=>fakeEl('q'), querySelectorAll:()=>[],
    createElement:(t)=>fakeEl(t), addEventListener(){}, body:fakeEl('body'), head:fakeEl('head'),
    documentElement:fakeEl('html') },
  Chart: ChartStub, console, setTimeout, clearTimeout,
  requestAnimationFrame:(f)=>f(), fetch: async ()=>{ throw new Error('sem rede no teste'); },
  location:{href:'',search:''}, navigator:{userAgent:'node'}, indexedDB: undefined,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
// `let`/`const` não viram propriedades do global num vm; o epílogo roda no mesmo
// escopo lexical e expõe o que o teste precisa.
const epilogo = `
;globalThis.__T = {
  set DATA(v){ DATA.length=0; DATA.push(...v); },
  selections, normalizeData, serieVelocity, atribuirEntregas, sprintJanelaDatas,
  renderVelocity, initVelocityRange, sprintCatalogoOrdenado,
  matchesSprintTabFilters, sprintNamesFromData, initSprintSelector, syncFilterBarForTab,
  get sprintSelection(){ return sprintSelection; },
  set sprintSelection(v){ sprintSelection=v; },
  set activeTab(v){ activeTab=v; },
  set velocityRange(v){ velocityRange=v; },
};`;
vm.createContext(sandbox);
vm.runInContext(script + epilogo, sandbox, { filename: 'index.html:inline' });
const T = sandbox.__T;

/* ---------- cenário sintético ----------
   S1: 01/07 a 15/07 (fechada)   S2: 20/07 a 31/07 (fechada)
   Reproduz a janela real observada no Jira: fim às 03:00 UTC = meia-noite local. */
const S1 = { name:'S1', state:'closed', startDate:'2026-07-01T13:00:00.000Z', endDate:'2026-07-16T03:00:00.000Z' };
const S2 = { name:'S2', state:'closed', startDate:'2026-07-20T13:52:00.000Z', endDate:'2026-07-31T03:00:00.000Z' };
sandbox.window.__SPRINTS = [S1, S2];

const item = (o) => ({
  Chave:o.chave, 'Tipo Agrupado':'História', 'Tipo de item':'Story', Squad:'Squad X',
  'Story Points':o.sp, Concluido:!!o.concl, Cancelado:false, WIP:!o.concl,
  'Data Conclusao':o.conclusao || null, Sprints:o.sprints || [],
  SprintPeriodos:o.periodos || [], SprintHistoricoOk:true,
});

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nAtribuição de entregas (uma entrega -> uma sprint):');

const dentro = item({ chave:'A-1', sp:5, concl:true, conclusao:'2026-07-10', sprints:['S1'],
  periodos:[{sprint:'S1', enteredAt:'2026-07-01T14:00:00.000Z', leftAt:null}] });
const ultimoDia = item({ chave:'A-2', sp:3, concl:true, conclusao:'2026-07-16', sprints:['S1'],
  periodos:[{sprint:'S1', enteredAt:'2026-07-02T10:00:00.000Z', leftAt:null}] });
const antesDoInicio = item({ chave:'A-3', sp:1, concl:true, conclusao:'2026-07-16', sprints:['S2'],
  periodos:[{sprint:'S2', enteredAt:'2026-07-15T13:10:00.000Z', leftAt:null}] });
const depoisDoFim = item({ chave:'A-4', sp:8, concl:true, conclusao:'2026-08-20', sprints:['S2'],
  periodos:[{sprint:'S2', enteredAt:'2026-07-21T10:00:00.000Z', leftAt:null}] });
const arrastou = item({ chave:'A-5', sp:2, concl:true, conclusao:'2026-07-25', sprints:['S1','S2'],
  periodos:[{sprint:'S1', enteredAt:'2026-07-02T10:00:00.000Z', leftAt:null},
            {sprint:'S2', enteredAt:'2026-07-20T14:00:00.000Z', leftAt:null}] });
const adicionado = item({ chave:'A-6', sp:4, concl:false, sprints:['S2'],
  periodos:[{sprint:'S2', enteredAt:'2026-07-25T10:00:00.000Z', leftAt:null}] });

const todos = [dentro, ultimoDia, antesDoInicio, depoisDoFim, arrastou, adicionado];
T.DATA = todos;
T.normalizeData();

const { porSprint, foraDeSprint } = T.atribuirEntregas(todos, [S1, S2]);
const chavesDe = (nome) => (porSprint.get(nome) || []).map((d)=>d.Chave).sort();

// Objetos devolvidos pelo vm têm outro prototype (outro realm), então as
// asserções comparam valores primitivos, não estruturas.
check('janela da sprint é lida em datas locais, inclusive nas pontas', () => {
  const j = T.sprintJanelaDatas(S1);
  assert.strictEqual(j.de, '2026-07-01');
  assert.strictEqual(j.ate, '2026-07-16');
});

check('entrega no ÚLTIMO DIA da sprint conta (regressão: data vs timestamp)', () => {
  assert.ok(chavesDe('S1').includes('A-2'), 'A-2 concluído em 16/07 deve entrar na S1');
});

check('entrega dentro da janela conta na sprint da janela', () => {
  assert.ok(chavesDe('S1').includes('A-1'));
});

check('concluído ANTES do início conta na sprint que abriu com ele pronto (caso LEG-2049)', () => {
  assert.ok(chavesDe('S2').includes('A-3'),
    'A-3 concluído em 16/07 numa sprint que começa em 20/07 deve contar na S2');
});

check('concluído DEPOIS do fim de todas as suas sprints não conta em nenhuma', () => {
  assert.ok(!chavesDe('S1').includes('A-4'));
  assert.ok(!chavesDe('S2').includes('A-4'));
  assert.strictEqual(foraDeSprint.map((d)=>d.Chave).join(','), 'A-4');
});

check('item que passou por duas sprints conta UMA vez, na sprint da conclusão', () => {
  const ocorrencias = [...chavesDe('S1'), ...chavesDe('S2')].filter((k)=>k==='A-5');
  assert.strictEqual(ocorrencias.length, 1, 'A-5 não pode ser contado duas vezes');
  assert.ok(chavesDe('S2').includes('A-5'), 'concluído em 25/07 -> S2');
});

check('item não concluído não recebe atribuição', () => {
  assert.ok(![...chavesDe('S1'), ...chavesDe('S2')].includes('A-6'));
  assert.ok(!foraDeSprint.some((d)=>d.Chave==='A-6'));
});

console.log('\nSérie por sprint (comprometido / adicionado / entregue):');

const { serie } = T.serieVelocity(todos, [S1, S2]);
const s1 = serie.find((r)=>r.sprint.name==='S1');
const s2 = serie.find((r)=>r.sprint.name==='S2');

check('S1: nenhum item era membro no instante do início -> tudo é adicionado', () => {
  // A-1 entrou 01/07 14:00, depois do start 13:00; A-2 e A-5 entraram em 02/07.
  assert.strictEqual(s1.comprometido, 0);
  assert.strictEqual(s1.adicionado, 10, 'A-1(5) + A-2(3) + A-5(2)');
  assert.strictEqual(s1.entregue, 8, 'A-1(5) + A-2(3), este último no último dia');
});

check('S2: entregue soma A-3 (concluído antes do início) e A-5 (arrastou)', () => {
  assert.strictEqual(s2.entregue, 3, 'A-3(1) + A-5(2)');
});

check('S2: A-3 conta em comprometido E em entregue (não fica só num lado)', () => {
  assert.strictEqual(s2.comprometido, 1, 'A-3 já era membro quando a S2 abriu');
  assert.ok(s2.itens.comprometidos.some((d)=>d.Chave==='A-3'));
  assert.ok(s2.itens.entregues.some((d)=>d.Chave==='A-3'));
});

check('S2: quem entrou depois do início entra em adicionado', () => {
  assert.strictEqual(s2.adicionado, 14, 'A-4(8) + A-5(2) + A-6(4)');
  assert.ok(s2.itens.adicionados.some((d)=>d.Chave==='A-6'), 'A-6 entrou em 25/07');
});

check('soma das entregas por sprint + fora de sprint = todo o SP concluído', () => {
  const porSprintSp = serie.reduce((a,r)=>a+r.entregue, 0);
  const foraSp = foraDeSprint.reduce((a,d)=>a+(Number(d['Story Points'])||0), 0);
  const conclSp = todos.filter((d)=>d.Concluido).reduce((a,d)=>a+(Number(d['Story Points'])||0), 0);
  assert.strictEqual(porSprintSp + foraSp, conclSp, 'nenhum SP entregue pode se perder');
});

console.log('\nFiltros específicos da aba Sprint:');

const sprintItem = (chave, squad, tipo, sprints, cancelado=false) => ({
  Chave:chave, Squad:squad, 'Tipo de item':tipo, 'Tipo Agrupado':'História',
  Sprints:sprints, SprintPeriodos:[], Cancelado:cancelado,
});
const sprintData = [
  sprintItem('X-1', 'Squad X', 'Story', ['X Sprint 1']),
  sprintItem('X-2', 'Squad X', 'Bug', ['X Sprint 2']),
  sprintItem('Y-1', 'Squad Y', 'Story', ['Y Sprint 1']),
  sprintItem('Y-2', 'Squad Y', 'Story', ['Y Cancelada'], true),
];
T.DATA = sprintData;
T.selections.Squad.clear();
T.selections['Tipo de item'].clear();

check('sem Squad o seletor interno não oferece sprints', () => {
  assert.strictEqual(T.sprintNamesFromData().length, 0);
});

check('uma Squad oferece somente as sprints daquele Team', () => {
  T.selections.Squad.add('Squad X');
  assert.strictEqual(T.sprintNamesFromData().join(','), 'X Sprint 2,X Sprint 1');
});

check('múltiplas Squads produzem a união das sprints, sem canceladas', () => {
  T.selections.Squad.add('Squad Y');
  const names = T.sprintNamesFromData();
  assert.ok(names.includes('X Sprint 1') && names.includes('X Sprint 2') && names.includes('Y Sprint 1'));
  assert.ok(!names.includes('Y Cancelada'));
});

check('filtros ocultos não afetam a aba, mas Tipo afeta', () => {
  T.selections.Programa.add('Programa inexistente');
  T.selections.Status.add('Status inexistente');
  T.selections['Tipo de item'].add('Story');
  assert.strictEqual(T.matchesSprintTabFilters(sprintData[0]), true);
  assert.strictEqual(T.matchesSprintTabFilters(sprintData[1]), false);
});

check('troca de Squad substitui uma sprint que não pertence ao novo Team', () => {
  T.selections.Squad.clear();
  T.selections.Squad.add('Squad X');
  T.sprintSelection = 'X Sprint 1';
  T.initSprintSelector();
  assert.strictEqual(T.sprintSelection, 'X Sprint 1', 'mantém uma sprint ainda válida');
  T.selections.Squad.clear();
  T.selections.Squad.add('Squad Y');
  T.initSprintSelector();
  assert.strictEqual(T.sprintSelection, 'Y Sprint 1', 'troca para a sprint disponível da nova Squad');
});

check('a barra recebe sprint-only apenas na aba Sprint', () => {
  const states = {};
  getEl('filterBar').classList = { toggle(cls,on){ states[cls]=on; } };
  T.activeTab = 'sprint'; T.syncFilterBarForTab();
  assert.strictEqual(states['sprint-only'], true);
  assert.strictEqual(states['pi-only'], false);
  T.activeTab = 'exec'; T.syncFilterBarForTab();
  assert.strictEqual(states['sprint-only'], false);
});

const sprintHidden = ['#dd-Programa','#dd-VS','#dd-PI','#dd-AnoCriacao','#dd-Mes','#dd-Status','.date-filter'];
for(const selector of sprintHidden){
  const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  check(`CSS da aba Sprint esconde ${selector}`, () => {
    assert.ok(new RegExp(`#filterBar\\.sprint-only\\s+${literal}\\s*[,{]`).test(html));
  });
}

check('Conclusão não força display inline sobre a regra da aba Sprint', () => {
  assert.doesNotMatch(html, /wrap\.style\.cssText\s*=\s*['"]display:flex/);
  assert.match(html, /#filterBar\s+\.date-filter\s*\{display:flex;\}/);
});

console.log(`\n✅ ${passed} verificações passaram.\n`);
