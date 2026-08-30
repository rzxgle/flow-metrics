// @ts-nocheck -- harness dinâmico executado dentro do sandbox do jsdom.
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
    getContext:()=>({canvas:{id}, createLinearGradient:()=>({addColorStop(){}})}),
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

const loadDashboardHtml = require('./support/dashboardHtml');
const html = loadDashboardHtml();
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
  sprintFimMs, dataEntregaSprint, TOLERANCIA_FECHAMENTO_DIAS,
  renderExec, renderSprint, renderSP, renderVelocity, initVelocityRange, sprintCatalogoOrdenado,
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
  'Data Conclusao':o.conclusao || null,
  // Ausente = cai no fallback para 'Data Conclusao'; os casos antigos exercitam
  // justamente esse caminho.
  'Data Entrega Sprint':o.entrega || null, Sprints:o.sprints || [],
  SprintPeriodos:o.periodos || [], SprintHistoricoOk:true,
});

let passed = 0;
const check = (desc, fn) => { fn(); passed += 1; console.log('  ✓', desc); };

console.log('\nAtribuição de entregas (uma entrega -> uma sprint):');

check('Visão Geral renderiza sem os KPIs de SP e mantém o gráfico por PI', () => {
  const execItem = item({chave:'EXEC-1', sp:5, concl:true, conclusao:'2026-07-10'});
  execItem.PI = 'PI3'; execItem.FaseFluxo = 'Concluído'; execItem.AnoMesConclusao = '2026-07';
  execItem.LeadTimeDias = 2; execItem.CycleTimeDias = 1;
  assert.doesNotThrow(()=>T.renderExec([execItem], [execItem]));
  const kpis = getEl('exec-kpis').innerHTML;
  assert.doesNotMatch(kpis, /Story Points (planejados|concluídos)/);
  assert.ok(charts['chart-exec-sp-pi'], 'o gráfico de SP por PI continua renderizado');
});

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

console.log('\nJanela real da sprint e regra do fechamento:');

/* S3 fecha DEPOIS do endDate planejado — é o padrão na base real (153 de 195
   sprints fechadas). S4 fecha ANTES, como a 26_SQD_ExperiênciaCompra_PI3_1
   (endDate 27/07, completeDate 25/07), que originou o caso CONV-462. */
const S3 = { name:'S3', state:'closed', startDate:'2026-09-01T13:00:00.000Z',
  endDate:'2026-09-14T03:00:00.000Z', completeDate:'2026-09-17T18:00:00.000Z' };
const S4 = { name:'S4', state:'closed', startDate:'2026-09-18T13:00:00.000Z',
  endDate:'2026-10-02T03:00:00.000Z', completeDate:'2026-09-30T02:58:00.000Z' };
const S5 = { name:'S5', state:'active', startDate:'2026-10-05T13:00:00.000Z',
  endDate:'2026-10-19T03:00:00.000Z', completeDate:null };

check('janela vai até o fechamento REAL quando a sprint fecha depois do previsto', () => {
  assert.strictEqual(T.sprintJanelaDatas(S3).ate, '2026-09-17');
});

check('fechamento antecipado NÃO encurta a janela planejada', () => {
  assert.strictEqual(T.sprintJanelaDatas(S4).ate, '2026-10-02');
});

/* Caso CONV-462: entrou em Done 1 dia após o fim, e o Jira fechou a sprint com o
   item ainda dentro (não houve carry-over para a sprint seguinte). */
const fechouJunto = item({ chave:'B-1', sp:5, concl:true, conclusao:'2026-11-20',
  entrega:'2026-10-03', sprints:['S4'],
  periodos:[{sprint:'S4', enteredAt:'2026-09-18T14:00:00.000Z', leftAt:null}] });
/* Mesma situação, mas o Done veio 20 dias depois: status atualizado tarde, não
   entrega da sprint. */
const doneTardio = item({ chave:'B-2', sp:3, concl:true, conclusao:'2026-10-22',
  entrega:'2026-10-22', sprints:['S4'],
  periodos:[{sprint:'S4', enteredAt:'2026-09-18T14:00:00.000Z', leftAt:null}] });
/* Saiu da sprint antes do fim e só depois concluiu. */
const saiuAntes = item({ chave:'B-3', sp:2, concl:true, conclusao:'2026-10-05',
  entrega:'2026-10-05', sprints:['S4'],
  periodos:[{sprint:'S4', enteredAt:'2026-09-18T14:00:00.000Z', leftAt:'2026-09-25T10:00:00.000Z'}] });
/* Data de entrega dentro da janela, conclusão (release) muito depois: a
   homologação integrada roda fora da sprint e não pode empurrar a entrega. */
const releaseDepois = item({ chave:'B-4', sp:8, concl:true, conclusao:'2026-12-15',
  entrega:'2026-09-25', sprints:['S4'],
  periodos:[{sprint:'S4', enteredAt:'2026-09-18T14:00:00.000Z', leftAt:null}] });
/* Sem changelog de status: cai no fallback da data de conclusão. */
const semChangelog = item({ chave:'B-5', sp:1, concl:true, conclusao:'2026-09-22',
  sprints:['S4'],
  periodos:[{sprint:'S4', enteredAt:'2026-09-18T14:00:00.000Z', leftAt:null}] });
/* Sprint ainda aberta: a regra do fechamento não se aplica. */
const emSprintAberta = item({ chave:'B-6', sp:4, concl:true, conclusao:'2026-10-25',
  entrega:'2026-10-25', sprints:['S5'],
  periodos:[{sprint:'S5', enteredAt:'2026-10-05T14:00:00.000Z', leftAt:null}] });

const lote = [fechouJunto, doneTardio, saiuAntes, releaseDepois, semChangelog, emSprintAberta];
const r2 = T.atribuirEntregas(lote, [S3, S4, S5]);
const em = (nome) => (r2.porSprint.get(nome) || []).map((d)=>d.Chave).sort();
const motivoDe = (chave) => (r2.foraDetalhe.find((x)=>x.item.Chave===chave) || {}).motivo;

check('entrou em Done 1 dia após o fim e ficou na sprint até fechar -> conta nela (CONV-462)', () => {
  assert.ok(em('S4').includes('B-1'),
    'o Jira só move para a próxima sprint os itens incompletos; ficar é sinal de pronto');
});

check('saiu de uma sprint futura e voltou à anterior: entrega fica onde terminou (CONV-1121)', () => {
  const anterior = {name:'R1', state:'closed', startDate:'2026-07-13T17:40:11.547Z',
    endDate:'2026-07-27T03:00:00.000Z', completeDate:'2026-07-25T02:58:48.974Z'};
  const futura = {name:'R2', state:'closed', startDate:'2026-07-27T16:29:12.273Z',
    endDate:'2026-08-10T03:00:00.000Z', completeDate:'2026-08-07T21:12:40.856Z'};
  const retornou = item({chave:'CONV-1121', sp:5, concl:true, entrega:'2026-07-28',
    sprints:['R1'], periodos:[
      {sprint:'R1', enteredAt:'2026-07-08T13:26:01.915Z', leftAt:'2026-07-09T22:16:25.534Z'},
      {sprint:'R2', enteredAt:'2026-07-09T22:16:25.534Z', leftAt:'2026-07-16T15:32:20.045Z'},
      {sprint:'R1', enteredAt:'2026-07-16T15:32:20.045Z', leftAt:null},
    ]});
  const calc = T.atribuirEntregas([retornou], [anterior, futura]);
  assert.strictEqual((calc.porSprint.get('R1')||[]).map(d=>d.Chave).join(','), 'CONV-1121');
  assert.strictEqual((calc.porSprint.get('R2')||[]).length, 0,
    'uma passagem encerrada antes do início de R2 não pode sequestrar a entrega');
});

check('entrega anterior à PI3_1 permanece na sprint em que o item estava (CONV-21)', () => {
  const pi2 = {name:'PI2_5', state:'closed', startDate:'2026-06-16T11:59:00.301Z',
    endDate:'2026-06-26T21:00:00.000Z', completeDate:'2026-06-26T21:16:33.207Z'};
  const pi3 = {name:'PI3_1', state:'closed', startDate:'2026-07-13T17:40:11.547Z',
    endDate:'2026-07-27T03:00:00.000Z', completeDate:'2026-07-25T02:58:48.974Z'};
  const antiga = item({chave:'CONV-21', sp:5, concl:true, entrega:'2026-06-15',
    sprints:['PI3_1','PI2_5'], periodos:[
      {sprint:'PI2_5', enteredAt:'2026-06-11T15:38:00.027Z', leftAt:'2026-06-16T12:18:00.130Z'},
    ]});
  const calc = T.atribuirEntregas([antiga], [pi2, pi3]);
  assert.strictEqual((calc.porSprint.get('PI2_5')||[]).map(d=>d.Chave).join(','), 'CONV-21');
  assert.strictEqual((calc.porSprint.get('PI3_1')||[]).length, 0,
    'uma entrega de junho não pode ser creditada a uma sprint iniciada em julho');
});

check('Done mais de 7 dias após o fim fica fora, com motivo "tardia"', () => {
  assert.ok(!em('S4').includes('B-2'));
  assert.strictEqual(motivoDe('B-2'), 'tardia');
});

check('item que saiu da sprint antes do fim fica fora, com motivo "saiu"', () => {
  assert.ok(!em('S4').includes('B-3'));
  assert.strictEqual(motivoDe('B-3'), 'saiu');
});

check('a data de entrega manda sobre a de conclusão (release pós-homologação)', () => {
  assert.ok(em('S4').includes('B-4'),
    'entrega 25/09 dentro da S4; a conclusão em 15/12 é release, não sprint');
});

check('sem data de entrega, o fallback é a data de conclusão', () => {
  assert.strictEqual(T.dataEntregaSprint(semChangelog), '2026-09-22');
  assert.ok(em('S4').includes('B-5'));
});

check('a regra do fechamento não vale para sprint ainda aberta', () => {
  assert.ok(!em('S5').includes('B-6'), 'S5 está ativa: nada de crédito por fechamento');
  assert.strictEqual(motivoDe('B-6'), 'tardia');
});

check('nenhuma entrega é contada em duas sprints', () => {
  const todasAtribuidas = [...em('S3'), ...em('S4'), ...em('S5')];
  assert.strictEqual(new Set(todasAtribuidas).size, todasAtribuidas.length);
});

check('SP entregue + SP fora = SP concluído (nada se perde no lote novo)', () => {
  const dentroSp = [...r2.porSprint.values()].flat().reduce((a,d)=>a+(Number(d['Story Points'])||0), 0);
  const foraSp = r2.foraDeSprint.reduce((a,d)=>a+(Number(d['Story Points'])||0), 0);
  const total = lote.reduce((a,d)=>a+(Number(d['Story Points'])||0), 0);
  assert.strictEqual(dentroSp + foraSp, total);
});

check('progresso da sprint usa as mesmas entregas atribuídas pelo velocity', () => {
  const entregueS1 = item({ chave:'P-1', sp:3, concl:true, entrega:'2026-07-10',
    sprints:['S1'], periodos:[{sprint:'S1', enteredAt:'2026-07-01T14:00:00.000Z', leftAt:null}] });
  const entregueS2 = item({ chave:'P-2', sp:5, concl:true, entrega:'2026-07-25',
    sprints:['S1','S2'], periodos:[
      {sprint:'S1', enteredAt:'2026-07-01T14:00:00.000Z', leftAt:'2026-07-17T10:00:00.000Z'},
      {sprint:'S2', enteredAt:'2026-07-20T14:00:00.000Z', leftAt:null},
    ] });
  T.DATA = [entregueS1, entregueS2];
  T.selections.Squad.clear(); T.selections.Squad.add('Squad X');
  T.selections['Tipo de item'].clear(); T.selections['Tipo de item'].add('Story');
  T.sprintSelection = 'S1';
  sandbox.window.__SPRINTS = [S1, S2];
  T.renderSprint();
  const kpis = getEl('sprint-kpis').innerHTML;
  assert.match(kpis, /Standard entregues/);
  assert.match(kpis, /<div class="val">1\/2<\/div>/,
    'P-2 pertenceu à S1, mas sua entrega foi atribuída somente à S2');
  assert.match(kpis, /Story Points planejados[\s\S]*?<div class="val">8<span class="unit">sp<\/span>/);
  assert.match(kpis, /Story Points concluídos[\s\S]*?<div class="val">3<span class="unit">sp<\/span>/);

  T.selections.Sprint.clear(); T.selections.Sprint.add('S1');
  const removidoAntes = item({chave:'P-3', sp:7, concl:false,
    sprints:['S2'], periodos:[
      {sprint:'S1', enteredAt:'2026-06-20T10:00:00.000Z', leftAt:'2026-06-25T10:00:00.000Z'},
      {sprint:'S2', enteredAt:'2026-07-20T14:00:00.000Z', leftAt:null},
    ]});
  const dadosSp = [entregueS1, entregueS2, removidoAntes];
  T.DATA = dadosSp;
  T.renderSP(dadosSp, dadosSp);
  const spKpis = getEl('sp-kpis').innerHTML;
  assert.match(spKpis, /Story Points planejados[\s\S]*?<div class="val">8<span class="unit">sp<\/span>/);
  assert.match(spKpis, /Story Points concluídos[\s\S]*?<div class="val">3<span class="unit">sp<\/span>/,
    'a aba Estimativas deve usar a mesma entrega atribuída pelo velocity');
  T.selections.Sprint.clear();
});

check('o resíduo é detalhado na tela, separado por motivo', () => {
  T.DATA = lote;
  T.normalizeData();
  sandbox.window.__SPRINTS = [S3, S4, S5];
  T.selections.Squad.clear();
  T.selections.Squad.add('Squad X');
  T.velocityRange = 0;
  T.renderVelocity();
  const txt = getEl('velocity-fora-detalhe').innerHTML;
  assert.match(txt, /velocity_fora_tardia/, 'os itens com Done tardio precisam ser clicáveis');
  assert.match(txt, /velocity_fora_saiu/, 'os que saíram da sprint também');
  T.selections.Squad.clear();
});

check('a tolerância documentada no glossário é a do código', () => {
  assert.strictEqual(T.TOLERANCIA_FECHAMENTO_DIAS, 7);
  assert.ok(/em até <b>7 dias<\/b>/.test(html), 'o glossário precisa citar a mesma tolerância');
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
  T.activeTab = 'sp'; T.syncFilterBarForTab();
  assert.strictEqual(states['sp-sprint-filter'], true);
  T.activeTab = 'flow'; T.syncFilterBarForTab();
  assert.strictEqual(states['sp-sprint-filter'], false);
});

check('filtro Sprint aparece apenas em Estimativas', () => {
  assert.match(html, /#filterBar #dd-Sprint\{display:none;\}/);
  assert.match(html, /#filterBar\.sp-sprint-filter #dd-Sprint\{display:block;\}/);
});

check('Ano e Mês permanecem no modelo, mas não aparecem na interface', () => {
  assert.equal(typeof T.selections.AnoCriacao?.add, 'function');
  assert.equal(typeof T.selections.Mes?.add, 'function');
  assert.match(html, /#filterBar #dd-AnoCriacao,\s*#filterBar #dd-Mes\{display:none;\}/);
});

const sprintHidden = ['#dd-Programa','#dd-VS','#dd-PI','#dd-Status','.date-filter'];
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

console.log('\nEficiência de Fluxo (Visão Geral):');

/* Numerador e denominador vêm da mesma cronologia de status. */
const tempoItem = (chave, valor, total) => {
  const d = item({ chave, sp:1, concl:true, conclusao:'2026-07-10' });
  d.PI = 'PI3'; d.FaseFluxo = 'Concluído'; d.AnoMesConclusao = '2026-07';
  d.LeadTimeDias = total; d.CycleTimeDias = valor;
  d.StatusHistoricoOk = true;
  d.TempoPorStatus = [
    {status:'Desenvolvimento',dias:valor},
    {status:'PRONTO PARA DESENVOLVIMENTO',dias:total-valor},
  ];
  return d;
};
const cardsExec = (issues) => {
  T.renderExec(issues, issues);
  return getEl('exec-kpis').innerHTML.split('<div class="kpi ').slice(1).map((b)=>({
    label: (b.match(/class="eyebrow">([^<]*)</) || [])[1],
    valor: (b.match(/class="val">([^<]*)</) || [])[1],
    unidade: (b.match(/class="unit">([^<]*)</) || [])[1] || null,
    delta: (b.match(/class="delta [^"]*">([^<]*)</) || [])[1] || null,
    regra: (b.match(/data-kpi-rule="([^"]*)"/) || [])[1] || null,
    clicavel: /kpi-clickable/.test(b),
  }));
};
const acharCard = (cards, label) => cards.find((c)=>c.label===label);

const baseTempos = [tempoItem('T-1',2,10), tempoItem('T-2',4,20), tempoItem('T-3',6,30)];

check('o card divide a soma do valor agregado pela soma do tempo total', () => {
  const cards = cardsExec(baseTempos);
  assert.strictEqual(acharCard(cards,'Lead Time (P85)').valor, '27.0');
  assert.strictEqual(acharCard(cards,'Cycle Time (P85)').valor, '5.4');
  const efic = acharCard(cards,'Eficiência de Fluxo');
  assert.strictEqual(efic.valor, '20.0');
  assert.strictEqual(efic.unidade, '%');
});

check('o card fica ao lado dos dois P85, no fim da linha de KPIs', () => {
  const labels = cardsExec(baseTempos).map((c)=>c.label);
  assert.deepStrictEqual(labels.slice(-3),
    ['Lead Time (P85)', 'Cycle Time (P85)', 'Eficiência de Fluxo']);
});

check('o complemento declara a fatia de espera', () => {
  const efic = acharCard(cardsExec(baseTempos), 'Eficiência de Fluxo');
  assert.strictEqual(efic.delta, '80.0% em espera');
});

check('sem histórico de status o card mostra travessão, não 0%', () => {
  const d=tempoItem('S-1',2,10); d.TempoPorStatus=[];
  const efic = acharCard(cardsExec([d]), 'Eficiência de Fluxo');
  assert.strictEqual(efic.valor, '—');
  assert.strictEqual(efic.delta, null, 'sem base não há espera a declarar');
});

check('tempo total zerado não gera Infinity nem NaN', () => {
  const d=tempoItem('Z-1',0,0); d.TempoPorStatus=[];
  const efic = acharCard(cardsExec([d]), 'Eficiência de Fluxo');
  assert.strictEqual(efic.valor, '—');
});

check('variação de caixa e acento não tira status de valor agregado', () => {
  const d=tempoItem('X-1',0,10);
  d.TempoPorStatus=[{status:'DEPLOY EM PROD',dias:4},{status:'PRONTO PARA PROD',dias:6}];
  assert.strictEqual(acharCard(cardsExec([d]),'Eficiência de Fluxo').valor,'40.0');
});

check('Backlog fica fora do numerador, denominador e decomposição', () => {
  const d=tempoItem('B-1',2,10);
  d.TempoPorStatus=[{status:'BACKLOG',dias:90},{status:'Desenvolvimento',dias:2},
    {status:'PRONTO PARA DESENVOLVIMENTO',dias:8}];
  assert.strictEqual(acharCard(cardsExec([d]),'Eficiência de Fluxo').valor,'20.0');
});

check('a regra do card cabe no limite de 170 caracteres do tooltip', () => {
  // Acima disso enhanceHelpTooltips descarta o texto e cai no genérico, que não
  // avisa que as duas bases são diferentes.
  const efic = acharCard(cardsExec(baseTempos), 'Eficiência de Fluxo');
  assert.ok(efic.regra && efic.regra.length > 0, 'card sem data-kpi-rule');
  assert.ok(efic.regra.length <= 170, `${efic.regra.length} caracteres`);
  assert.match(efic.regra, /changelog/);
});

check('o card é clicável para auditar a conta por item e status', () => {
  const cards = cardsExec(baseTempos);
  assert.strictEqual(acharCard(cards,'Eficiência de Fluxo').clicavel, true);
  assert.strictEqual(acharCard(cards,'Cycle Time (P85)').clicavel, true);
});

console.log(`\n✅ ${passed} verificações passaram.\n`);
