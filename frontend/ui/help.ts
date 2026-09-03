/* ===================== Ajuda contextual ===================== */
const TAB_HELP: Record<string, string> = {
  exec:'Consolida volume, esforço, tempos e distribuição do recorte. Métricas de entrega respeitam o período de conclusão; estados atuais, como pendentes e WIP, ignoram esse período.',
  throughput:'Conta itens com status classificado como concluído e usa a data de conclusão para posicioná-los no período. Os gráficos respondem aos filtros globais.',
  sp:'Compara Story Points planejados dos itens não cancelados com Story Points concluídos dentro do período selecionado. O card de tempo por Story Point cruza a estimativa com o Cycle Time real dos itens concluídos, em dias corridos, e segue o filtro de Tipo — sub-itens entram quando selecionados, e a legenda avisa quando o recorte mistura níveis.',
  flow:'Lead Time vai da criação à conclusão. Cycle Time vai do início real ao fim real. Datas ausentes ou invertidas ficam fora dessas métricas. O gráfico de tempo por status decompõe o Lead Time usando o changelog do Jira; nele o filtro de Status escolhe quais status aparecem, não quais itens entram. A tendência mensal e o P85 por squad seguem a medida escolhida no próprio card, com seletores independentes; a tendência posiciona cada item pelo mês de conclusão e traz a barra do mês com a média móvel de 3 meses por cima, e o top 12 do ranking conta itens que têm a medida.',
  wip:'Mostra entregas, trabalho ainda aberto e Aging. Os KPIs do topo ignoram o filtro de Tipo (cada card já recorta o seu tipo); os gráficos de entrega seguem o filtro. Aging conta do início real até hoje apenas para itens em WIP.',
  block:'Considera itens do tipo Sub-block. Bloqueios resolvidos usam Cycle Time; bloqueios abertos contam da criação até hoje.',
  sprint:'A associação usa o histórico de sprints do Jira. Completude é subitens concluídos dividido pelo total de subitens do item.',
  pi:'Agrupa épicos do PI por Value Stream e, dentro dela, por squad — os dois níveis nascem recolhidos. O progresso usa os filhos elegíveis, exclui cancelados do denominador e não duplica épicos ou subtarefas. Ao entrar nesta aba o filtro de Programa vem marcado em One; ao sair, a marcação é desfeita.',
  dep:'Considera issues do tipo Dependência. O time DEPENDENTE vem do campo Team; o DEMANDANTE, do campo Time Demandante. A duração conta da abertura até a entrada em Done, lida do changelog — o workflow deste tipo não preenche resolução. Dependência cancelada deixou de ser necessária: conta como episódio, sem somar dias.',
  notas:'Documenta origem dos campos, regras de cálculo, limitações e decisões metodológicas do dashboard.'
};
const FILTER_HELP: Record<string, string> = {
  'dd-Programa':'Programa é derivado do projeto e do time. Vazio significa todos os programas.',
  'dd-VS':'Value Stream é mapeada a partir do projeto do Jira. Vazio significa todas.',
  'dd-Squad':'Squad vem do campo Team do Jira. Na aba Sprint, esse filtro também define quais sprints ficam disponíveis.',
  'dd-PI':'PI é identificado pelas labels configuradas. Quando há mais de uma label válida, prevalece o PI mais recente reconhecido.',
  'dd-Sprint':'Na aba Estimativas, planejado é o escopo standard da sprint e concluído usa a mesma atribuição do velocity.',
  'dd-AnoCriacao':'Filtra pelo ano de criação da issue, não pelo ano de conclusão.',
  'dd-Mes':'Filtra pelo mês de criação da issue, não pelo mês de conclusão.',
  'dd-Tipo_de_item':'Filtra pelo tipo bruto do Jira, como Story, Enabler, Bug ou Sub-task. Os atalhos no topo do painel marcam um grupo inteiro de uma vez (Nível história, Sub-itens, Bugs, Épicos) e se somam entre si; eles escrevem nesta mesma seleção, então os tipos continuam marcáveis um a um.',
  'dd-Status':'Filtra pelo status atual da issue. Na aba PI Tracking ele é ocultado para não alterar artificialmente o denominador.',
  'dd-sprintPick':'Seleciona uma sprint da squad escolhida. A associação considera o histórico de participação no Jira.',
  'dd-velocityRange':'Define quantas sprints anteriores entram na série de velocity.'
};
const SECTION_HELP: Record<string, string> = {
  'panel-exec':TAB_HELP.exec,'panel-throughput':TAB_HELP.throughput,'panel-sp':TAB_HELP.sp,
  'panel-flow':TAB_HELP.flow,'panel-wip':TAB_HELP.wip,'panel-block':TAB_HELP.block,
  'panel-sprint':TAB_HELP.sprint,'panel-pi':TAB_HELP.pi,'panel-dep':TAB_HELP.dep,'panel-notas':TAB_HELP.notas
};

function helpForKpi(label: unknown): string {
  const text=String(label||'').toLocaleLowerCase('pt-BR');
  if(text.includes('lead')) return 'Lead Time: dias corridos entre a criação e a conclusão. Só entram itens concluídos com datas válidas.';
  if(text.includes('cycle')) return 'Cycle Time: dias corridos entre o início real e o fim real. Itens sem as duas datas ficam fora.';
  if(text.includes('aging')) return 'Aging: dias desde o início real até hoje para itens ainda em WIP. Não usa a data de criação como substituta.';
  if(text.includes('velocity')) return 'Velocity: média de Story Points entregues por sprint fechada. Sprint ativa e itens cancelados não entram na média.';
  if(text.includes('comprometido')) return 'Story Points dos itens que já pertenciam à sprint quando ela começou.';
  if(text.includes('adicionado')) return 'Story Points dos itens que entraram na sprint depois da data de início.';
  if(text.includes('fora de sprint')) return 'Itens concluídos depois do fim de todas as sprints conhecidas não são atribuídos a uma sprint.';
  if(text.includes('bloque')) return 'Indicador calculado a partir de itens Sub-block e das regras de duração de bloqueio.';
  if(text.includes('cancel')) return 'Itens cujo status atual está classificado como cancelado. Eles não contam como entrega.';
  if(text.includes('quarter')||text.includes('gap plano')) return 'Compara o percentual concluído do PI com o percentual de tempo já transcorrido no quarter.';
  if(text.includes('épico')||text.includes('epico')) return 'Indicador de épicos dentro do PI e dos filtros atuais. Progresso dos filhos e status do épico são dimensões independentes.';
  if(text.includes('story point')||/^sp\b/.test(text)||text.includes(' sp')) return 'Story Points representam esforço. Planejado exclui cancelados; concluído considera itens entregues no recorte aplicável.';
  if(text.includes('wip')||text.includes('andamento')) return 'Itens em andamento no estado atual. O intervalo de conclusão não se aplica porque esses itens ainda não terminaram.';
  if(text.includes('pendente')) return 'Itens em status classificados como pendentes no estado atual. O filtro de período de conclusão não se aplica.';
  if(text.includes('conclu')||text.includes('throughput')||text.includes('entreg')) return 'Quantidade entregue conforme os status classificados como concluídos e o período de conclusão selecionado.';
  if(text.includes('progresso')) return 'Percentual concluído calculado sobre o denominador elegível da métrica, excluindo cancelados quando indicado.';
  return 'Indicador calculado sobre as issues do recorte atual, respeitando os filtros aplicáveis desta aba.';
}

function makeHelpButton(text: string, label?: string | null): HTMLButtonElement {
  const button=document.createElement('button');
  button.type='button';button.className='help-icon';button.textContent='i';
  button.dataset.help=text;button.setAttribute('aria-label',`Ajuda sobre ${label||'esta informação'}`);
  return button;
}
function showHelpTooltip(anchor: HTMLElement): void {
  if(!anchor?.dataset?.help) return;
  let tooltip=document.getElementById('__help-tooltip');
  if(!tooltip){tooltip=document.createElement('div');tooltip.id='__help-tooltip';tooltip.setAttribute('role','tooltip');document.body.appendChild(tooltip);}
  tooltip.innerHTML='';
  /* O cabeçalho é "Regra" por default porque a esmagadora maioria das âncoras
     explica um critério de cálculo. `data-help-title` cobre o caso em que o
     tooltip fala de UM item — o badge de transbordo, por exemplo, não enuncia
     regra nenhuma: informa de onde aquele item veio. */
  const title=document.createElement('div');title.className='help-tooltip-title';
  title.textContent=anchor.dataset.helpTitle||'Regra';
  const body=document.createElement('div');body.className='help-tooltip-body';body.textContent=anchor.dataset.help;
  tooltip.append(title,body);tooltip.style.display='block';tooltip.dataset.anchor='active';
  const rect=anchor.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
  const gap=8,margin=10;
  const left=Math.max(margin,Math.min(window.innerWidth-box.width-margin,rect.left+rect.width/2-box.width/2));
  let top=rect.top-box.height-gap;
  if(top<margin) top=rect.bottom+gap;
  if(top+box.height>window.innerHeight-margin) top=Math.max(margin,window.innerHeight-box.height-margin);
  tooltip.style.left=`${left}px`;tooltip.style.top=`${Math.max(margin,top)}px`;
}
function hideHelpTooltip(): void {
  const tooltip=document.getElementById('__help-tooltip');
  if(tooltip) tooltip.style.display='none';
}

function closestHelpTarget(target: EventTarget | null, selector: string): HTMLElement | null {
  if(!(target instanceof Element)) return null;
  return target.closest(selector) as HTMLElement | null;
}

function installHelpEvents(): void {
  if(document.body.dataset.helpEvents==='ready') return;
  document.body.dataset.helpEvents='ready';
  document.addEventListener('mouseover',e=>{const a=closestHelpTarget(e.target,'[data-help]');if(a)showHelpTooltip(a);});
  document.addEventListener('mouseout',e=>{const a=closestHelpTarget(e.target,'[data-help]');if(a&&(!(e.relatedTarget instanceof Node)||!a.contains(e.relatedTarget)))hideHelpTooltip();});
  document.addEventListener('focusin',e=>{const a=closestHelpTarget(e.target,'[data-help]');if(a)showHelpTooltip(a);});
  document.addEventListener('focusout',e=>{if(closestHelpTarget(e.target,'[data-help]'))hideHelpTooltip();});
  document.addEventListener('click',e=>{const a=closestHelpTarget(e.target,'.help-icon[data-help]');if(a){e.preventDefault();e.stopPropagation();const t=document.getElementById('__help-tooltip');if(t&&t.style.display==='block')hideHelpTooltip();else showHelpTooltip(a);}else hideHelpTooltip();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideHelpTooltip();});
  window.addEventListener('scroll',hideHelpTooltip,true);window.addEventListener('resize',hideHelpTooltip);
}
function enhanceHelpTooltips(): void {
  installHelpEvents();
  document.querySelectorAll<HTMLElement>('.tab-btn[data-tab]').forEach(el=>{el.dataset.help=TAB_HELP[el.dataset.tab||'']||'';});
  Object.entries(FILTER_HELP).forEach(([id,text])=>{const btn=document.querySelector<HTMLElement>(`#${id} .dd-btn`);if(btn)btn.dataset.help=text;});
  document.querySelectorAll<HTMLElement>('.date-filter').forEach(el=>{el.dataset.help='Filtra pela data de conclusão. Métricas de estado atual, como WIP e pendentes, podem ignorar este intervalo.';});
  document.querySelectorAll<HTMLElement>('.clear-btn').forEach(el=>{el.dataset.help='Remove todas as seleções dos filtros globais e restaura o recorte padrão.';});
  document.querySelectorAll<HTMLElement>('.tabpanel').forEach(panel=>{
    const heading=panel.querySelector<HTMLElement>(':scope > .section-head h2');
    if(heading&&!heading.querySelector('.help-icon')) heading.appendChild(makeHelpButton(SECTION_HELP[panel.id]||'Explica as regras e o recorte desta seção.',heading.textContent));
  });
  document.querySelectorAll<HTMLElement>('.card h3').forEach(heading=>{
    if(heading.querySelector('.help-icon')) return;
    const card=heading.closest<HTMLElement>('.card');const cap=card?.querySelector<HTMLElement>('.cap');const hasChart=!!card?.querySelector('canvas');
    let text=cap?.textContent?.trim()||`Mostra ${(heading.textContent||'').trim().toLocaleLowerCase('pt-BR')} para o recorte atual.`;
    text+=' Responde aos filtros aplicáveis desta aba.'+(hasChart?' Passe o mouse para ver valores e clique em uma barra, ponto ou fatia para abrir as issues quando o gráfico permitir.':'');
    heading.appendChild(makeHelpButton(text,heading.textContent));
  });
  document.querySelectorAll<HTMLElement>('.kpi').forEach(kpi=>{
    if(kpi.querySelector('.help-icon')) return;
    const label=kpi.querySelector('.eyebrow')?.textContent?.trim()||'indicador';
    const explicit=(kpi.dataset.kpiRule||'').trim();
    const help=explicit&&explicit.length<=170?explicit:helpForKpi(label);
    kpi.appendChild(makeHelpButton(help,label));
  });
}
