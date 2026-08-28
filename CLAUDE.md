# CLAUDE.md

Instruções para agentes trabalhando neste repositório.

O `README.md` explica **o que o projeto é** (arquitetura, como rodar, deploy) e
continua sendo a referência para isso. Este arquivo cobre o que não está lá: as
**regras de processo**, as **regras de domínio da Afya** e as **convenções de
código** que já foram decididas e não devem ser redescobertas nem revertidas por
engano.

## Como ler a procedência de cada regra

Este projeto mede processo de times reais, e a diferença entre "o time decidiu"
e "eu inferi da base" é o que separa uma regra de um palpite. Por isso cada
regra abaixo vem marcada:

- 🟢 **Regra do time** — foi decidida por pessoas. Não mude sem alguém pedir.
- 🔵 **Medido na base** — veio de análise do dataset. Pode ser reconferido, e o
  número pode ter mudado desde então.

Ao escrever comentários, notas metodológicas ou documentação nova, **marque a
procedência do mesmo jeito**. Já houve um caso concreto de dano aqui: uma
inferência minha ("o SP de sub-item é herdado do pai") foi escrita com o mesmo
tom de uma regra do time, em três lugares que se reforçavam, e passou a ser
tratada como fato até alguém notar um gráfico vazio. Era falsa.

---

## Processo de trabalho

🟢 **Nunca commitar por conta própria.** O usuário revisa pessoalmente toda
alteração antes do commit. Termine o trabalho deixando as mudanças no diretório
de trabalho e **relate o que mudou**: arquivos tocados, decisões e o resultado
de `npm test`. Não encerre perguntando "quer que eu commite?" — ele já respondeu
essa pergunta de forma geral. Quando ele pedir o commit explicitamente ("vamos
commitar isso"), aí sim faça.

🟢 **Commit não é push.** Sem pedido explícito, pare no commit local.

🟢 **Push é sempre para duas branches.** O remoto de trabalho é `empresa`
(`afya-educon/educon.agile.dashboard`); a branch local é `main-empresa`. Um push
são sempre **dois** comandos, e o segundo não é opcional:

```bash
git push empresa main-empresa:main
git push empresa main-empresa:afya-metrics-dashboard
```

As duas branches andam sempre no mesmo commit. Elas têm sido fast-forward
sempre; se alguma vez **não** forem, isso significa que algo entrou no remoto por
fora — **pare e avise**, nunca resolva com `--force`. Dê `git fetch empresa`
logo antes de empurrar.

🟢 **Não abrir PR.** Não há revisores humanos neste projeto. Push direto é o
fluxo aceito, e sugerir PR ou branch de revisão é ruído.

🟢 **O remoto `origin`** (fork pessoal `rzxgle/jira-flow-metrics`) só recebe push
se ele pedir.

### O double check antes de publicar

Quando ele pedir "garanta que nada vá quebrar", isso é parte do pedido, não
formalidade — já apareceu assim um vazamento real de dados de um issuetype novo
para outras abas. O que funciona:

1. `npm test` (19 specs).
2. **Render diferencial**: renderizar `public/index.html` da versão anterior
   (`git show HEAD:public/index.html`) e da atual com o mesmo dataset do cache,
   e comparar dados de todos os gráficos, KPIs, tabelas e legendas. O que mudar
   fora do escopo do trabalho é vazamento. Compare também **cor de série** e
   **rótulo de dataset**, não só os valores: na aba Lead & Cycle Time a cor
   codifica a medida, então uma troca de cor muda o que o gráfico afirma sem
   mexer em nenhum número. Use chave estável (caminho no DOM ou id) ao comparar
   texto — indexar por posição na `NodeList` faz qualquer elemento inserido
   deslocar todo o resto e reprovar a tela inteira.
3. Procurar texto obsoleto: uma mudança de regra costuma deixar afirmações
   velhas em `TAB_HELP`, na aba de Notas metodológicas e nos cabeçalhos dos
   testes.
4. **Mudou o formato do payload? Suba `DASHBOARD_SCHEMA_VERSION`** (em
   `public/index.html`). O navegador guarda o dataset em IndexedDB e, ao
   reabrir, **renderiza direto do snapshot sem chamar o servidor** — só o
   descarte por versão o obriga a recoletar. Já aconteceu: `piPeriods` ganhou o
   campo `programa` e o ajuste "não replicou em produção", porque o snapshot
   antigo trazia o campo vazio. O modo de falhar é o pior possível — **calado e
   parcial**: o que é puro front-end (um filtro padrão, por exemplo) continua
   funcionando, e só o que depende do campo novo fica mudo, então a tela parece
   meio aplicada em vez de quebrada. Quem já está com a página aberta se
   resolve clicando em **Atualizar dados**, que remonta o `meta`.

---

## Testes

```bash
npm test          # tudo (19 specs)
npm run test:sp-tempo   # uma spec isolada
```

🟢 **Front-end se testa com jsdom**, executando o script real da página. O
usuário decidiu **não adotar puppeteer nem E2E de navegador**. O padrão está em
qualquer spec de visão (`test/status-time-view.spec.js`,
`test/sp-tempo-por-sp.spec.js`, `test/flow-medidas.spec.js`): jsdom + stubs de
`Chart` e `canvas` que capturam a configuração recebida, sem rede.

Convenções que valem para toda spec nova:

- O **cabeçalho do arquivo documenta as decisões** que a visão implementa, com o
  porquê de cada uma. É o handoff mais denso que existe — ao retomar um assunto
  em sessão nova, leia-o antes do código.
- Teste **decisões que podem quebrar em silêncio** (o gráfico mostraria outro
  número sem erro), não a mecânica do Chart.js.
- Listas vindas do jsdom precisam de `Array.from` antes de `deepStrictEqual` —
  o `Array.prototype` é de outro realm e a comparação reprova por protótipo.
- Cores e fases de status saem das listas reais de `classification.rules.js`,
  nunca de casamento por pedaço de nome.

---

## Regras de domínio

Estas descrevem o processo da Afya. Mudar qualquer uma altera o significado dos
indicadores — confirme com o usuário antes.

### Níveis de trabalho

🟢 **Nível história** = grupos `História` (tipos crus `História`, `Story`,
`Melhoria`), `Enabler` e `Débito Técnico`. **Bug fica de fora** — correção de
defeito não é entrega de escopo novo. Épico, subitens e Dependência também
ficam fora, por serem outros níveis. No código: `GRUPOS_NIVEL_HISTORIA`.

🟢 **Dependência não é trabalho de entrega da squad.** É acordo entre times.
Fica fora de sprint, velocity, Story Points planejados, total de itens de épico
e percentual de conclusão. No código: fora de `isStandard`, e excluída no
`EpicSummaryBuilder` e no `buildProgressiveEpicSummaries`.

🟢 **Sub-itens têm estimativa própria.** O time pontua cada sub-item com
**0,5 ou 1 SP** de propósito, no mesmo campo `Story Points`. 🔵 92,3% dos 8.228
sub-itens concluídos com SP estão nesses dois valores. **Não é valor herdado do
pai** — não use esse argumento para excluí-los de uma visão.

Isso não autoriza somar os dois níveis: 🔵 um sub-item de 1 SP roda em ~2,1 dias
de Cycle Time contra ~5,2 de um item de entrega de 1 SP, e sub-itens são muito
mais numerosos, então num recorte misturado são eles que mandam na média.
Analisar separadamente é legítimo; fundir num agregado único, não.

🟢 **Programa vem do projeto, e `BOPS` é Afya Bridge.** Não existe campo
"Programa" no Jira: ele é derivado do projeto em `classification.rules.js`. São
Afya Bridge os projetos `LEG` (*Value Streams Afya Bridge*) e `BOPS`
(*Operação e Bugs*); qualquer outro é Afya One. A comparação é pela **chave** do
projeto, não pelo nome — rename no Jira quebraria a classificação em silêncio.
`BOPS` não está na JQL geral e só chega pela coleta da aba PI Tracking, que busca
épicos por label de PI **sem filtro de projeto**; era por aí que um épico do
Legado (`BOPS-2768`) entrava contado como Afya One.

🟢 **A barra abre com padrões, e o de PI é só da aba PI Tracking.** Tipo de item
(tipos de produção), Programa (**Afya One**) e Conclusão (**D-30 → hoje**) são
padrões **globais**. O **PI do quarter corrente** entra ao abrir a aba PI
Tracking e sai ao deixá-la — nunca global: 🔵 o PI é campo de preenchimento
manual, 63,6% dos sub-itens e 57% dos bloqueios não têm label, e pré-selecioná-lo
na barra inteira deixaria 27% da base de pé (Bloqueios de 421 para 61). Na aba
ele é de graça porque a seleção é feita no épico, que tem a label.

🟢 **A lista de PI acompanha o Programa.** A correlação PI → Programa vive em
`quarter.rules.js` (`piPeriods[pi].programa`), como dado, nunca por casamento de
pedaço do nome. `Não informado` fica sempre visível nas duas listas — 🔵 57,8% da
base não tem label de PI, nos dois programas. Trocar de Programa remove da
seleção o PI que saiu do recorte e, dentro da aba PI Tracking, põe o PI do
quarter do novo programa.

### Tempo

🟢 **A entrega de uma sprint é a primeira transição para `Pronto p/ Deploy STG`**
(primeiro status da categoria Done), não a `Data de Fim Real`. A homologação
integrada acontece **depois** da sprint, então usar status posteriores joga o
trabalho para fora da própria sprint. `Data de Fim Real` continua válida para
lead/cycle time de ponta a ponta.

🟢 **A duração de um bloqueio (`Sub-block`) é lead time** — da criação até a
conclusão, não Cycle Time. Um bloqueio nasce ativo; ninguém "começa a trabalhar"
num impedimento. Bloqueio aberto conta da criação até hoje. Cancelamento **não**
encerra a contagem: só a conclusão fecha o episódio.

🟢 **Ao rotular o resíduo de Lead Time menos Cycle Time, diga apenas "em
espera"** — nunca "espera antes da execução". No fluxo da Afya existe espera
**depois** do trabalho terminar (homologação integrada, deploy, ativação de
valor), então localizar a espera antes do início é factualmente falso.

### Apresentação

🟢 **Média, não mediana**, como medida central dos indicadores.

🟢 **Série temporal se desenha como barra + linha de média móvel, com o valor
escrito em cima da barra.** Não é gosto: o card de Tendência mensal do tempo era
uma área com curva suavizada e voltou de uma **reunião executiva** com o
feedback de que estava difícil de ler. Curva suavizada **inventa movimento entre
os meses**; barra é uma medida por mês, discreta, que é o que o número é. Rótulo
visível porque em sala ninguém lê altura contra a grade. E a **tendência vai
desenhada**, não deixada por conta do olho: média móvel de **3 meses**, janela
traseira e parcial no começo — a mesma do gráfico de evolução mensal de SP, para
o painel não ter duas ideias de "tendência". Quem responde "estamos melhorando?"
é a linha, não a barra. Ver `chart-flow-lead-trend` e `chart-sp-month`.

Duas consequências no código: `barLabels` **ignora datasets de linha** (rotular
os dois põe dois números quase iguais um sobre o outro em cada mês), e o clique
distingue as séries — **barra abre o mês, linha abre a janela inteira** da média
móvel, porque o ponto da linha não é aquele mês.

🟢 **Cancelado é categoria própria, nunca descarte.** Não pode somar com
concluído (leria como entrega) nem sumir da tela — ofereça primeiro torná-lo
visível numa fatia própria. E um bloqueio aberto cujo pai foi cancelado continua
acionável: a solução é de apresentação, não de filtro.

🟢 **Não travar o que o filtro permite.** Se o filtro de Tipo deixa um issuetype
entrar, a visão mostra. Quando houver risco de leitura ruim, **declare** —
composição do recorte, contagem por nível, aviso na legenda — em vez de
restringir. Nas palavras dele: "é escolha do usuário o que ele vai querer
filtrar e colocar no balde, podemos trabalhar isso como processo". Levantar o
risco medido continua sendo desejado; o que ele recusa é a trava. Isso não
desfaz exclusões que ele mesmo determinou, como Dependência.

🟢 **Atalho pode; substituir o controle granular, não.** O filtro de Tipo tem
chips de grupo no topo do painel (`Nível história`, `Sub-itens`, `Bugs`,
`Épicos`, `Dependências`) que escrevem na **mesma** seleção de tipos crus. Eles
existem porque trocar o recorte para sub-itens custava ~11 cliques. **Não são a
volta do filtro "Tipo Agrupado"**: não há uma segunda seleção, de grupos,
concorrendo com a de tipos, e os checkboxes seguem à vista para marcação um a
um. A pergunta que ele fez ao aprovar foi exatamente essa — "a pessoa ainda pode
selecionar os tipos isolados?" —, então acelerar o caminho comum é bem-vindo
desde que o caminho fino continue disponível. Os grupos saem do dado
(`Tipo Agrupado`), não de lista mantida à mão. Os chips se somam, e com seleção
parcial o clique **completa** o grupo em vez de limpar.

🟢 **`Sub-block` entra no balde de sub-itens.** Ao recortar por nível de
trabalho, bloqueio é sub-item como qualquer outro — a leitura própria dele vive
na aba de Bloqueios. Decisão do usuário. Medido, tirá-lo quase não move os
números (Lead P85 de sub-itens vai de 21,8 para 22,1 dias; Cycle de 3,4 para
3,7), então a escolha é conceitual, não numérica.

### Cards agnósticos à medida (seletor de Lead × Cycle Time)

🟢 **É um padrão, e ele deve se repetir.** Um card que mostra tempo não escolhe
a régua por conta própria: ele traz um seletor **Medida** no canto superior
direito e um título **genérico**, sem citar Lead nem Cycle. O pedido dele foi
literal — "vamos tentar seguir um padrão?" —, então um card de tempo novo já
nasce assim. Hoje são quatro: Tempo por Story Point (Estimativas), Tempo por
status, Tendência mensal do tempo e Tempo P85 por Squad (Lead & Cycle Time).

Como fazer, em ordem:

1. **Marcação**: `div.statustime-head` com o `<h3>` e um
   `label.statustime-metric` contendo o `<select>`. O CSS já existe.
   🟢 **O título tem de caber na mesma linha do seletor.** Num card de meia
   largura (`grid-2`) sobram ~660px, e o par "Medida + select" come ~330px — daí
   o título curto. Qualificador de recorte (`(top 12 por volume)`, `(top 25)`)
   **vai para a legenda, não para o rótulo**: ele empurrava o seletor para uma
   segunda linha, e é justamente a informação que muda quando a medida muda.
   No CSS, quem cede espaço é o título (`.statustime-head h3{min-width:0}`), não
   o controle — sem isso a linha inteira quebra em vez de o título quebrar.
2. **As medidas saem de `SP_TIME_MEASURES`** — nunca redeclare. Uma segunda
   definição de "Cycle Time" no painel divergiria em silêncio no dia em que uma
   das duas mudasse, e o dashboard passaria a ter duas réguas com o mesmo nome.
3. **O padrão é a medida que o card já mostrava.** A tendência mensal e o
   ranking por squad abrem em **Lead Time**; o card de Estimativas abre em
   **Cycle Time**, porque mede execução. Trocar o padrão muda, sem pedido, o
   número que o time lê hoje.
4. **Cada seletor é independente do outro.** Ver a tendência em Lead Time e o
   ranking de squads em Cycle Time responde "o tempo total piorou; a execução de
   quem?". Amarrar os dois num seletor só tiraria leitura.
5. **O `<select>` é ligado uma vez**, fora do render, e trocar a medida
   redesenha **só aquele gráfico**, a partir da base guardada do último render
   (`__flowTrendBase`, `__flowSquadBase`, `__spTimeBase`). Refazer o recorte da
   aba significaria, em modo Sprint, rodar `atribuirEntregas` de novo.

🟢 **Item sem a data que a medida exige fica de fora, nunca entra como zero.**
Zero dia puxaria o número para baixo como se a entrega tivesse sido instantânea,
quando o que houve foi ausência de registro.

🟢 **Trocar a medida pode mudar o que aparece na tela, e isso se declara na
legenda.** É a regra "declarar em vez de travar" aplicada aqui. 🔵 O Cycle Time
depende de dois campos manuais e cobre 4.663 itens contra 9.151 do Lead Time,
então: um mês sem nenhum início real preenchido **não vira ponto vazio** no meio
da linha, e o "top 12 por volume" do ranking conta **itens medidos**, de modo que
squads entram e saem ao trocar de régua. 🔵 No recorte padrão, `Squad Aprender -
Ativação do curso` lidera o Lead Time com 205,1 dias e **desaparece** do ranking
de Cycle Time. Sem o aviso na legenda, isso se lê como "a squad parou de
entregar" — é cobertura de preenchimento.

🟢 **O drill abre exatamente os itens que formaram o número** — os medidos do mês
ou da squad, não todos os concluídos. Com Cycle Time os dois conjuntos divergem
muito, e a lista tem de fechar com a barra.

🟢 **Na aba Lead & Cycle Time a cor codifica a medida**: rosa (`#CE0058`) é Lead
Time, âmbar (`#D98E3B`) é Cycle Time — a convenção dos dois histogramas do topo e
do card de Value Stream. Num card que troca de régua, a cor troca junto: um
ranking é lido de longe, e cor errada anuncia régua errada. A fonte é
`FLOW_MEASURE_COLOR`, não literais espalhados.

---

## Convenções de código

**Arquitetura**: Clean Architecture no backend (`src/`), com as regras isoladas
em `src/config/*.rules.js` — adicionar um tipo ou status é editar dados, não
lógica. Ver `README.md`.

**O front-end é um arquivo só**: `public/index.html`, ~6.000 linhas, com HTML,
CSS e JS inline. É proposital (o build do Amplify só copia `public/`). Cada aba
tem uma `render*` e uma seção marcada com `/* ===== TAB: NOME ===== */`.

🟢 **Tamanho de payload**: entre duas opções de formato, escolha sempre a que
**não aumenta** o tamanho das requisições no Amplify, que tem limite de resposta.
Por isso `TempoPorStatus` só existe para concluídos e `visitas` é omitido quando
vale 1 — quem lê deve tratar ausência como 1.

**Comentar o porquê, não o quê.** O padrão do repo é comentário que explica a
decisão e o que aconteceria sem ela, muitas vezes com o número medido que a
motivou. Siga isso — é o que torna o código legível em sessão nova.

**Toda mudança de regra visível vira parágrafo na aba "Notas metodológicas"**
(`panel-notas`, dentro do `index.html`). É a documentação que o time lê.

**Identificadores internos são estáveis mesmo quando o rótulo muda.** A aba
`Estimativas` ainda se chama `sp` em `data-tab`, `panel-sp`, `activeTab` e nas
chaves de CSS — renomear não mudaria nada na tela e quebraria seletores. Pelo
mesmo motivo os dois cards de tempo da aba Lead & Cycle Time mantiveram os ids
`chart-flow-lead-trend` e `chart-flow-lead-squad` depois de ficarem agnósticos à
medida: o "lead" no id virou histórico, e trocá-lo só quebraria o registro de
gráficos, o drill e os testes.

---

## Dados para análise

`cache/dataset.json` guarda o dataset **já enriquecido** (o mesmo formato que o
front consome), gravado pelo servidor. É a fonte para conferir qualquer
afirmação sobre a base sem chamar o Jira.

⚠️ **Ele é reescrito enquanto o servidor roda.** Se um número mudar entre duas
análises suas, confira o campo `savedAt` antes de suspeitar do código — já
aconteceu de um total crescer por refresh, não por regressão.

Scripts de análise vão no diretório de scratchpad, **nunca no repo**. Como
`jsdom` só existe no `node_modules` local, um script que precise dele deve ser
copiado para a raiz, executado e removido.
