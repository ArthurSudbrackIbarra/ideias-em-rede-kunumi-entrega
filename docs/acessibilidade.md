# Acessibilidade em *Don't Leave It Uai-Tchê*

Este documento registra a auditoria de acessibilidade do jogo, feita em outubro de 2026 sobre o commit `360b09d`
da branch `sbgames-2027`, e o que foi corrigido depois dela. Ele foi escrito para servir de fonte ao artigo do
SBGames: cada número aqui pode ser reproduzido com os comandos indicados.

As referências são a WCAG 2.2 no nível AA (o piso), as Game Accessibility Guidelines nos níveis básico e
intermediário, o eMAG e a Lei Brasileira de Inclusão (Lei 13.146/2015). O público do jogo é o público brasileiro em
geral: pessoas com pouca familiaridade com leitura, pessoas idosas, pessoas com deficiência visual, auditiva, motora
ou cognitiva e pessoas que usam Libras.

Uma regra vale para tudo o que segue: nenhum recurso de acessibilidade altera o texto atribuído a uma pessoa real. O
verbatim continua verbatim, a versão simples continua como foi gerada e revisada.

## 1. Auditoria inicial

### Como foi medido

- axe-core 4.14 pelo `@axe-core/playwright`, com as regras `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `wcag22aa` e `best-practice`, em 14 estados: início, acervo, acervo com a dica de texto cortado, dossiê das ideias,
  prelúdio, fala no balão, texto original aberto, caderno, glossário, legenda e ajuda, a vez de falar no passo 1, a
  vez de falar com a prévia da frase, veredito e ata. O roteiro é `web/tests/a11y-audit.spec.ts` e roda com
  `npm run a11y:audit` (o relatório sai em `web/tests/a11y-report/`).
- Percurso só com teclado: o mesmo roteiro aperta Tab em cada tela e anota onde o foco para e se o anel de foco
  aparece. O resto do percurso (uma partida inteira da audiência 44, semente 20260912) foi feito lendo os
  manipuladores de tecla de cada componente e conferido no navegador.
- Contraste: calculado a partir das cores do `sim.css` com a fórmula de luminância relativa da WCAG, para cada par
  de texto e fundo usado. O axe não mede texto sobre o canvas 3D (marca como "incompleto"), então esses casos foram
  calculados à parte.
- Reflow: capturas a 320 px de largura (o equivalente a 400% de zoom numa tela de 1280 px).

### Resultado do axe

| Estado | Ocorrências | Regras violadas |
|---|---:|---|
| Início | 1 | aria-prohibited-attr |
| Acervo | 8 | color-contrast |
| Acervo, dica de texto cortado | 9 | color-contrast, region |
| Dossiê das ideias | 11 | aria-allowed-role, color-contrast, region |
| Prelúdio | 2 | color-contrast, region |
| Fala no balão | 15 | color-contrast, region |
| Texto original aberto | 18 | color-contrast, region |
| Caderno | 15 | color-contrast, region |
| Glossário | 22 | color-contrast, region, scrollable-region-focusable |
| Legenda e ajuda | 15 | color-contrast, region |
| A vez de falar, passo 1 | 23 | color-contrast, region |
| A vez de falar, com a prévia | 20 | color-contrast, region |
| Veredito | 18 | color-contrast, region |
| Ata | 26 | color-contrast, region |

São 203 ocorrências em 14 estados, de 5 regras. O axe enxerga pouco do que pesa num jogo: ele não percebe que o Tab
não anda, que o balão é uma região viva que muda a cada letra ou que uma decisão tem prazo. Os achados abaixo juntam
o axe com o percurso manual.

### Achados por critério

A gravidade usa quatro níveis. **Crítica**: impede uma parte da partida para um grupo de pessoas. **Alta**: falha um
critério AA em vários lugares ou dificulta muito. **Média**: falha pontual. **Baixa**: melhoria sem falha de critério.

#### Teclado e foco

| Critério | Gravidade | Achado |
|---|---|---|
| 2.1.1 Teclado | Crítica | Na sala, a tecla Tab abre o caderno em vez de mover o foco. Seis Tabs seguidos deixam o foco no `body`. Os botões da bancada e do balão só são alcançáveis pelos atalhos de uma letra. |
| 2.1.1 Teclado | Alta | No acervo, para chegar a "Entrar na sala" é preciso passar por todas as linhas da lista (24 de início, e a lista cresce ao rolar). |
| 2.1.1 Teclado | Média | No dossiê, Enter escolhe a ideia em qualquer lugar da tela, inclusive com o foco no link "audiências" ou no botão "ver o que foi dito", que deixam de funcionar pelo teclado. |
| 2.4.3 Ordem do foco | Alta | Caderno, glossário, legenda, a vez de falar e a ata não recebem o foco quando abrem, não prendem o foco e não o devolvem quando fecham. Quando a palavra é concedida, o foco fica no `body`. Quando o botão "continuar" some durante a digitação, o foco se perde. |
| 2.1.4 Atalhos de uma tecla | Alta | São 17 atalhos de uma letra ou número, sem opção de desligar nem de trocar. Eles já eram ignorados dentro de campos de texto. |
| 2.4.7 Foco visível | Alta | O anel de foco é uma sombra interna de 2 px na cor `#8d8177`. Sobre os botões ligados (fundo `#cfc7b6`) o contraste é 2,26:1. Na linha escolhida do acervo e na ideia escolhida da tira, a sombra do estado escolhido apaga o anel. |
| 2.4.1 Ignorar blocos | Média | Não há link para pular para o conteúdo. |
| 2.5.7 Movimentos de arrastar | Alta | Olhar em volta exige arrastar. Q e E viram só para quem fala. Não há botão para virar à esquerda ou à direita. |
| 2.5.8 Tamanho do alvo | Média | O "fechar" do glossário e da legenda tem cerca de 13 px de altura. "ver o que foi dito", "Anotar" e "tirar" ficam perto de 18 px. |

#### Leitores de tela e estrutura

| Critério | Gravidade | Achado |
|---|---|---|
| 4.1.3 Mensagens de status | Crítica | O balão de fala inteiro é uma região `aria-live` cujo texto muda a cada letra digitada. O leitor de tela recebe fragmentos ou uma enxurrada. O veredito é anunciado três vezes (balão, painel do veredito e a variação do medidor). |
| 1.1.1 Conteúdo não textual | Alta | O canvas 3D não tem descrição. Quem não vê a sala não sabe onde está nem quem está nela. |
| 1.3.1 Informações e relações | Média | Fora das telas de início e acervo, nada está dentro de um marco (`region`, 13 ocorrências por estado da sala). A sala e o dossiê não têm `h1`. Os painéis usam `h3` sem `h2`. As seções da ata são `span` com cara de título. |
| 2.4.2 Título da página | Média | Todas as rotas e fases têm o mesmo título, "Don't Leave It Uai-Tchê". |
| 4.1.2 Nome, função, valor | Média | `article` com `role="tabpanel"` (não permitido), `aria-label` num `span` sem papel no título da tela inicial, termos do glossário como `span` focável sem papel, área rolável do glossário que o teclado não alcança. |

#### Visual

| Critério | Gravidade | Achado |
|---|---|---|
| 1.4.3 Contraste mínimo | Alta | O axe apontou contraste insuficiente em 13 dos 14 estados. A causa são poucos tons usados em muitos lugares: `--ink-faint` (rótulos, referências e contadores no papel) tem 3,58:1 sobre o papel e 3,14:1 sobre o papel escuro; `--engrave` tem 4,11:1 e 3,58:1 sobre o chassi; `--mute-2` tem 3,95:1 sobre o painel elevado; `#6f665c` (rodapé da tela inicial, texto de exemplo da busca, número da audiência) fica entre 3,14:1 e 3,42:1; "Enter pula" no prelúdio tem 2,17:1. O botão Anotar herda a cor do papel de quem fala: setor privado 2,24:1, convidado 2,61:1, sociedade civil 3,06:1. |
| 1.4.11 Contraste não textual | Média | O interruptor do modo guiado desligado tem 1,59:1. O anel dos passos futuros tem 1,82:1. O pontilhado dos termos do glossário tem 2,18:1. Os pontos de papel do setor privado (2,24:1) e de convidado (2,61:1) somem no papel. |
| 1.4.1 Uso de cor | Média | O papel de cada pessoa (parlamentar, governo, sociedade civil, setor privado) aparece só pela cor do ponto nas cartas, na placa do balão, no fio do debate e nas listas do dossiê (lá, com um `title` que só aparece passando o mouse). Na trilha do topo, as vezes de falar passadas, a próxima e as futuras se distinguem só pela cor. Relações e vereditos já vinham com ícone e palavra. |
| 1.4.4 Redimensionar texto | Alta | As fontes estão em `px` e o jogo não tem controle de tamanho de texto. A bancada (116 px) e os botões (40 px) têm altura fixa e cortam texto grande. |
| 1.4.10 Reflow | Alta | A 320 px: no acervo o título bate na contagem e os filtros e o detalhe saem pela direita; no dossiê o cabeçalho transborda e a folha da ideia fica com uns 80 px; na sala os controles da bancada saem da tela; na tela inicial a marca "Uai-Tchê" passa da borda. |
| 1.4.13 Conteúdo em foco ou hover | Média | A dica de texto cortado, a explicação do glossário e a explicação do modo guiado somem quando o ponteiro sai do elemento (não dá para passar o ponteiro por cima delas). As duas últimas também não fecham com Esc. |

#### Tempo, movimento e som

| Critério | Gravidade | Achado |
|---|---|---|
| 2.2.1 Tempo ajustável | Alta | A tréplica fica disponível por 6 segundos do relógio da sessão, inclusive no modo manual. A atenção cai 6 pontos por segundo quando a câmera não olha para quem fala, e abaixo de 25 não dá para anotar. Quem usa leitor de tela ou só teclado não tem como saber para onde olhar. Avisos somem em 2,2 s e o cartão de relação em cerca de 2,9 s. |
| 2.2.2 Pausar, parar, ocultar | Média | No modo automático, abrir o caderno, o glossário ou a ajuda não pausa as falas. Com o caderno aberto o balão some, então falas passam sem ser vistas. O modo manual existe (tecla P) e fica lembrado. |
| 2.3.1 Três flashes | Sem falha | Nada pisca mais de três vezes por segundo. O cursor da digitação pisca a cerca de 1 Hz. O tremor da contradição é um deslocamento de 3 px por 260 ms, sem mudança de luminosidade. |
| 2.3.3 Animação por interação | Média | O CSS e a digitação respeitam `prefers-reduced-motion`, mas não há opção no jogo. As viradas de câmera, o balanço da respiração da câmera e dos bonecos ignoram a preferência. A vinheta do pós-processamento não pode ser desligada. |
| 1.4.2 Controle de áudio | Baixa | Três canais (máquina de escrever, palmas, sinais de relação) passam por um único mudo, sem volume separado. Nenhum som toca antes de um gesto: o áudio nasce no clique ou no Enter de "Defender esta ideia". |
| 1.2 Mídia | Sem falha | Toda fala do jogo é texto, então não há fala sem legenda. Cada som tem um equivalente visual: "(Palmas)" no balão, o cartão de relação, o painel do veredito. A tecla L abre a legenda das cores e ícones, não legendas de áudio. |

#### Cognição e Libras

| Item | Gravidade | Achado |
|---|---|---|
| Progresso | Média | A trilha do topo mostra marcas sem número. Não diz quantas vezes a palavra ainda vem. |
| Escolhas irreversíveis | Média | "Devolver a palavra" encerra a vez sem pedir confirmação. "Falar" já mostra a frase exata antes ("Você vai dizer"), e os passos da decisão já podem ser desfeitos pela trilha. |
| Histórico | Média | Não há como reler o que já foi dito. Quem perde uma fala perde de vez. |
| Libras | Alta | O jogo não oferece nada em Libras. |

## 2. O que foi feito

Cada item diz o que mudou e a que critério da WCAG 2.2 ou item das Game Accessibility Guidelines (GAG) ele responde.
Os arquivos citados ficam em `web/src/sim/`.

### Teclado e foco

- Tab voltou a ser do foco (WCAG 2.1.1, 2.4.3). O caderno passou para a tecla C. Todo controle da sala, do balão
  e dos painéis entra na ordem do Tab, na ordem em que aparece na tela.
- Um mapa de teclas só (`lib/keys.ts`). Os 18 atalhos de letra, número ou símbolo podem ser trocados um a um ou
  desligados de uma vez no painel Acessibilidade (WCAG 2.1.4, GAG intermediário "permitir remapear os controles").
  Se a tecla nova já tinha dono, as duas ações trocam de tecla. Enter, Espaço, Esc e as setas ficam fixos. Os
  atalhos não disparam dentro de campos de texto, e Enter ou Espaço sobre um botão acionam o botão, nunca o atalho.
  A tecla que aparece dentro de cada botão e a lista da ajuda saem do mesmo mapa, então mostram a tecla trocada.
- Todo painel é um diálogo (`ui/Dialog.tsx`, WCAG 2.1.2, 2.4.3, 4.1.2): caderno, glossário, ajuda, histórico,
  Acessibilidade e a vez de falar têm `role="dialog"`, `aria-modal`, título ligado por `aria-labelledby`, recebem o
  foco ao abrir, prendem o Tab, fecham com Esc e devolvem o foco a quem os abriu. Na vez de falar, Esc volta um passo
  (tira a citação, depois a anotação, depois o movimento). Com um diálogo aberto, os atalhos da sala ficam mudos,
  menos a tecla do próprio painel e os ajustes gerais (automático ou manual, velocidade, som, texto do balão).
- O foco nunca cai no vazio: numa troca de rota ele vai para o conteúdo novo, ao entrar na sala vai para o título
  dela, na ata vai para o título da ata. Na vez de falar, escolher um movimento leva o foco à primeira anotação
  possível e escolher a anotação leva a Falar (ou, ao contestar, à primeira candidata a citação). Quem avança pelo
  botão continuar com o teclado encontra o foco no continuar seguinte, mesmo quando ele troca de lugar.
- Acervo: a lista de audiências é uma `listbox` com uma parada só no Tab. Setas, Home, End, PageUp e PageDown
  escolhem, Enter entra na sala. Antes era preciso passar por todas as linhas para chegar ao detalhe.
- Dossiê das ideias: a tira é um grupo de abas com uma parada só, as setas trocam a ideia, e Enter só escolhe a
  ideia quando o foco não está num controle.
- Primeiros alvos do Tab (WCAG 2.4.1): "Pular para o conteúdo" em toda tela e, na sala, "Ligar o modo manual",
  os dois invisíveis até receberem o foco.
- Anel de foco (WCAG 2.4.7, 2.4.11, 1.4.11): contorno de 3 px afastado 2 px do controle, âmbar `#f2c14e` sobre o
  chassi (11,3:1 com o fundo) e azul `#1f5fbf` sobre o papel (5,65:1). Onde o controle está dentro de um grupo
  apertado, o anel fica por dentro, e sobre um botão ligado (fundo claro) ele fica escuro.

### Leitores de tela

- Uma camada de anúncios (`lib/announce.ts`, `ui/Announcer.tsx`, WCAG 4.1.3): duas regiões vivas montadas uma vez.
  Cada linha da sessão é anunciada uma vez, inteira, quando entra: quem fala, o cargo ou a instituição, o papel e,
  na réplica, a relação ("Rodrigo Agostinho, presidente do Ibama, governo, contradiz você: ..."). A fala da cadeira
  vaga vem com o veredito, a variação da coerência e a explicação. Avisos e o texto original, quando aberto, também
  passam por ela. Só a tréplica, que tem prazo, usa a região assertiva.
- O balão deixou de ser região viva. O texto que ainda está digitando fica escondido do leitor de tela, que lê o
  texto inteiro num trecho reservado a ele. Painel do veredito, cartão de relação e variação dos medidores também
  deixaram de ser regiões vivas, e o veredito passou a ser dito uma vez em vez de três.
- A sala 3D tem descrição (WCAG 1.1.1): o canvas é uma imagem com texto alternativo montado a partir do elenco
  ("Sala de comissão em 3D, vista da sua cadeira. Ao fundo, a mesa da presidência. Entre você e ela, 6 parlamentares
  sentados em arco...").
- Estrutura (WCAG 1.3.1, 2.4.2, 2.4.6): todas as telas estão dentro de `main`; a bancada é uma região nomeada;
  cada tela tem um `h1` (o nome da audiência na sala e no dossiê, o título na ata) e os painéis e as seções da ata têm
  `h2` e `h3`. O título da aba muda com a rota e com a fase ("Audiência 44, a palavra é sua - Don't Leave It
  Uai-Tchê").
- O papel por escrito: ao lado de cada marca de papel, o leitor de tela ouve "governo", "sociedade civil" e assim
  por diante. Termos do glossário no balão são botões com a explicação no nome.

### Tempo e ritmo

- Painéis pausam a sala (WCAG 2.2.2): com o caderno, o glossário, a ajuda, o histórico ou o painel Acessibilidade
  aberto, o modo automático não avança, a digitação para e o prazo da tréplica não corre.
- Sem limite de tempo (WCAG 2.2.1, GAG intermediário "dar tempo para decisões"): com o ajuste ligado, a tréplica
  espera a pessoa em vez de sumir depois de 6 segundos. O motor ganhou o parâmetro `holdOffers` no `tick`, coberto
  por teste de unidade, sem mexer nas constantes do `balance.ts` que o artigo cita.
- Virar sozinho para quem fala: a câmera acompanha cada nova fala. A atenção, que cai quando a câmera não olha
  para quem fala, deixa de ser uma pressão de tempo para quem não vê a sala ou não arrasta o mouse. Uma correção
  posterior, feita junto com o tutorial, tirou um defeito que atrapalhava justamente esse ajuste: quando a fala passava
  de um lado da mesa de debatedores para o outro, a câmera escolhia o caminho mais curto, que passa por trás da
  cadeira, e o limite de giro a prendia do lado errado. A atenção caía mesmo com a câmera automática ou com "olhar
  para quem fala". Agora o ângulo é medido a partir da frente da cadeira (`scene/SeatCamera.tsx`).
- Modo manual confortável: no manual o botão continuar fica sempre no balão; enquanto a página digita, ele a
  completa, e depois passa para a próxima. Espaço faz o mesmo. O modo manual pode ser ligado pelo atalho do topo, pela
  bancada ou pelo painel Acessibilidade, e fica lembrado.
- Histórico (`ui/History.tsx`, tecla R): tudo o que passou pelo balão na sessão, na ordem, com o texto original e a
  referência de cada trecho a um clique, os vereditos e os avisos. Rever o que já foi dito não conta como nova leitura
  para a regra de não repetir trechos: é a pessoa voltando ao que já leu.

### Visual

- Contraste (WCAG 1.4.3): os tons que falhavam foram escurecidos ou clareados o mínimo para passar de 4,5:1 em
  todos os fundos em que aparecem.

  | Token | Antes | Depois | Pior caso depois |
  |---|---|---|---|
  | `--ink-faint` (rótulos e referências no papel) | `#8a8077`, 3,14:1 | `#6c645d` | 4,56:1 sobre a etiqueta bege |
  | `--ink-soft` | `#6a6157`, 4,94:1 | `#5a5249` | 6,02:1 |
  | `--engrave` (rótulos gravados no chassi) | `#7d736a`, 3,58:1 | `#978b80` | 4,51:1 sobre o painel elevado |
  | `--mute-2` | `#8d8177`, 3,95:1 | `#9d9186` | 4,87:1 sobre o painel elevado |
  | rodapé, busca e número da audiência | `#6f665c`, 3,14:1 | `--engrave` | 5,32:1 |
  | "Enter pula" no prelúdio | `#4f4842`, 2,17:1 | `--mute-2` | 6,35:1 |
  | número antigo do veredito | até 2,4:1 | um tom por veredito | 4,56:1 |

  O botão Anotar deixou de usar a cor do papel no texto (setor privado dava 2,24:1): a cor ficou só no ícone. O texto
  do topo da sala ficava sobre um degradê que já tinha sumido na altura da linha de andamento, em cima da parede clara
  da cena. O véu agora fica opaco até o fim do texto: sobre uma parede branca, o pior caso é 4,76:1.
- Contraste não textual (WCAG 1.4.11): interruptor desligado, anel dos passos futuros e pontilhado dos termos do
  glossário passaram de 1,59 a 2,18:1 para pelo menos 3,14:1. As marcas de papel ganharam contorno escuro.
- A cor nunca sozinha (WCAG 1.4.1, GAG básico "não passar informação só pela cor"): cada papel tem uma forma
  (`ui/RoleDot.tsx`: círculo para parlamentar, quadrado para governo, triângulo para sociedade civil, losango para
  setor privado, hexágono para a mesa, anel para convidado), explicada na ajuda. Na trilha do topo, a vez de falar
  passada é cheia, a próxima tem anel e as futuras são vazias, e um texto diz em que ponto a sessão está e quantas
  vezes a palavra ainda vem. Um medidor baixo ganha a etiqueta "em baixa".
- Tamanho do texto (WCAG 1.4.4, GAG básico "texto de tamanho confortável" e intermediário "texto ajustável"):
  todas as fontes do `sim.css` passaram de `px` para `rem` (a 100% a tela continua idêntica pixel a pixel, conferido
  por captura), e o painel ajusta o texto de 100% a 200%. A bancada e o topo crescem com o texto; o resto da sala lê
  a altura real deles. O texto também acompanha o tamanho de fonte padrão do navegador.
- Reflow (WCAG 1.4.10): abaixo de 760 px de largura (contados em texto de tamanho normal, então 200% numa tela
  de 1440 px também conta), início, acervo, dossiê, ata e painéis passam a uma coluna, sem rolagem lateral. Na sala,
  a bancada quebra em linhas, o balão fica no alto na largura da tela e a vez de falar e o caderno ocupam a tela.
- Espaçamento de texto (WCAG 1.4.12): com entrelinha 1,5, letras a 0,12 em, palavras a 0,16 em e parágrafos a 2
  em forçados por CSS, nada é cortado. A bancada passou a quebrar linha em vez de sobrepor os medidores.
- Conteúdo em foco ou hover (WCAG 1.4.13): a dica de texto cortado, a explicação do glossário e a do modo guiado
  aceitam o ponteiro por cima, fecham com Esc sem mover o foco e ficam até o ponteiro ou o foco saírem. A dica de
  texto cortado também aparece no foco do teclado.
- Alto contraste: preto e branco nos dois materiais, fios de 2 px, véu sólido no topo.
- Fonte das falas e entrelinha: as falas ficam em Lexend, como todo o jogo, ou em Libron, uma serifa feita para
  leitura longa, para quem preferir. São três entrelinhas (normal, ampla, mais ampla) nos textos de leitura.

### Movimento

- Reduzir o movimento (WCAG 2.3.3, GAG básico "evitar ou permitir desligar movimento de fundo"): segue a
  preferência do sistema até a pessoa mexer no ajuste. Ligado, a câmera vira sem animação e sem o balanço da
  respiração, os bonecos e a plateia ficam parados (as mãos levantadas ainda mostram as palmas), o texto e o prelúdio
  aparecem de uma vez, os números saltam em vez de contar, e nenhuma transição de painel desliza. No modo
  automático, a fala que aparece de uma vez fica na tela o tempo que a digitação levaria, além da pausa de leitura
  (`lib/typing.ts`). Antes, sem a digitação para marcar o ritmo, as falas passavam rápido demais para ler.
- Efeitos visuais: desligados, a vinheta do pós-processamento sai e a tela não treme na contradição.
- Flashes (WCAG 2.3.1): nada pisca mais de três vezes por segundo, como já era.

### Som e voz

- Volume por canal (WCAG 1.4.2, GAG intermediário "volumes separados"): geral, máquina de escrever, palmas e sinais
  de relação e veredito, além do mudo (M). Nenhum som toca antes de um gesto da pessoa.
- Equivalentes visuais (GAG básico "nenhuma informação só por som"): as falas são texto, as palmas aparecem como
  "(Palmas)" no balão, os sinais de relação vêm com o cartão de relação e o de veredito com o painel do veredito.
- Leitura em voz alta (`lib/speech.ts`, opcional): lê cada linha com uma voz em português do navegador, na
  velocidade escolhida, e o modo automático espera a voz acabar. O texto lido é exatamente o da tela. A prévia da
  frase na vez de falar e as cartas do caderno ganham um botão "ouvir". Sem voz em português no aparelho, a opção
  fica indisponível e o painel diz por quê.

### Motor

- Virar sem arrastar (WCAG 2.5.7): três botões sobre a bancada (virar à esquerda, olhar para quem fala, virar à
  direita) e as setas do teclado, 30° por passo.
- Alvos (WCAG 2.5.8): os controles da bancada e dos painéis têm 44 px de altura; botões de texto (ver o que foi
  dito, Anotar, tirar, fechar, ordem do acervo) têm pelo menos 32 px.
- Nenhuma ação pede segurar tecla, repetir rápido ou acertar um tempo, desde que o ajuste "sem limite de tempo" esteja
  ligado para a tréplica.

### Cognição

- Progresso: o topo diz "53% da sessão, a palavra ainda vem 3 vezes" e é uma barra de progresso para o leitor de
  tela.
- Escolhas irreversíveis: "Devolver a palavra" pede confirmação, com o foco em "Ainda não". "Falar" mostra a frase
  exata antes e, com o ajuste "Confirmar antes de falar", pede um segundo clique. Os passos da decisão continuam
  desfazíveis pela trilha e pelo Esc.
- Tutorial "Como jogar" (`ui/Tutorial.tsx`): 12 passos curtos, cada um com uma imagem tirada do jogo e duas ou três
  frases. Na primeira visita, um convite pergunta se a pessoa quer vê-lo, uma vez só. Ele abre a qualquer hora pelo
  início, pelo acervo, pelo dossiê e pela sala, e é um diálogo como os outros: o foco entra no botão Próximo, o Tab
  fica preso, Esc fecha e o foco volta para quem o abriu. As setas para os lados trocam de passo, e cada troca é
  anunciada na região viva. Toda imagem tem texto alternativo que descreve o que importa para o passo, e o último
  passo troca a imagem por uma tabela de teclas lida do mapa atual, com as teclas trocadas. Na sala, a sessão para
  enquanto ele está aberto (inclusive a leitura em voz alta) e nenhum atalho dispara, nem os de ajuste. Com "Reduzir
  o movimento", a troca de passo não tem animação. Em tela estreita ou com texto grande ele ocupa a tela inteira.

### Libras

- VLibras (`lib/vlibras.ts`): o carregador oficial (versão 7.12) entra na página só quando a pessoa liga a opção. Ele
  cria sozinho o botão de acesso, na borda direita, e só baixa o avatar quando esse botão é clicado. Os endereços são
  absolutos (vlibras.gov.br, que redireciona para o jsDelivr), então o caminho base do GitHub Pages não interfere.
  Desligar esconde o botão e o avatar; tirar o script por completo exige recarregar a página.
- Limite: o VLibras traduz texto do DOM, por um avatar automático, e não alcança a cena 3D. Como toda fala, aviso
  e decisão também existe em texto na página (balão, histórico, painéis), o conteúdo do jogo fica ao alcance dele. A
  tradução não foi revisada por intérpretes.

### Painel Acessibilidade e declaração

O painel (`ui/SettingsPanel.tsx`) abre do início, do acervo, do dossiê e da sala, antes de qualquer audiência, e cada
mudança vale na hora, guardada em `localStorage` (chave `sim.a11y.v1`, com `try/catch`). Ele reúne tamanho do texto,
fonte das falas, entrelinha, alto contraste, reduzir o movimento, efeitos visuais, avanço das falas, velocidade, texto
do balão, sem limite de tempo, virar sozinho para quem fala, confirmar antes de falar, os quatro volumes, leitura em
voz alta, VLibras, atalhos ligados ou desligados e a troca de cada tecla. A declaração diz o que o jogo oferece, o
que ainda não funciona bem, as referências e onde avisar de um problema (as issues do repositório). Ela tem a rota
própria, `/acessibilidade`, e também abre do rodapé do painel como um diálogo por cima dele (`ui/StatementDialog.tsx`),
para quem está no meio de uma partida ler sem sair da sala. Esc volta ao painel.

## 3. Resultado depois das correções

### axe

O mesmo roteiro da auditoria (`npm run a11y:audit`), agora com as regras de boas práticas também, nos mesmos 14 estados:

| Estado | Antes | Depois |
|---|---:|---:|
| Início | 1 | 0 |
| Acervo | 8 | 0 |
| Acervo, dica de texto cortado | 9 | 0 |
| Dossiê das ideias | 11 | 0 |
| Prelúdio | 2 | 0 |
| Fala no balão | 15 | 0 |
| Texto original aberto | 18 | 0 |
| Caderno | 15 | 0 |
| Glossário | 22 | 0 |
| Legenda e ajuda | 15 | 0 |
| A vez de falar, passo 1 | 23 | 0 |
| A vez de falar, com a prévia | 20 | 0 |
| Veredito | 18 | 0 |
| Ata | 26 | 0 |
| **Total** | **203** | **0** |

O axe ainda deixa itens como "incompleto", que ele não consegue decidir sozinho, e eles foram conferidos à mão. São
de dois tipos. O contraste de texto sobre degradê, sobre fundo translúcido ou sobre a cena 3D (o topo da sala, a
bancada, o acervo com o véu do fim da lista): esses casos foram calculados pelo pior fundo possível, como descrito na
seção 2. E o nome dos botões de velocidade, que mostram "−" e "+" e se chamam "mais devagar" e "mais rápido": são
símbolos, e o nome escrito é o que o leitor de tela precisa.

### Testes que travam regressão

`web/tests/a11y.spec.ts` roda com `npm run test:e2e` e falha diante de qualquer violação do axe (a lista de exceções
está vazia). São sete testes:

1. axe no início, no acervo, na declaração e no painel Acessibilidade;
2. axe em cada estado da partida da 44 (dossiê, fala, original, caderno, glossário, ajuda, histórico, a vez de falar
   nos dois passos, veredito e ata);
3. uma partida inteira, do início à ata, só com o teclado: Tab até Jogar, busca no acervo, a lista com setas, Enter
   para entrar, a ideia com seta e Enter, Espaço para avançar, N para anotar, 1 e Enter na vez de falar, a confirmação
   de devolver a palavra, e o foco no título da ata no fim (cerca de 45 s);
4. os atalhos desligados não agem e não aparecem nos botões; uma tecla trocada passa a valer no lugar da antiga;
5. um painel recebe o foco, prende o Tab e devolve o foco ao botão que o abriu, e a declaração aberta do painel
   fica por cima dele sem sair da sala;
6. com movimento reduzido no modo automático, a fala fica na tela pelo menos o tempo que a digitação levaria;
7. a região viva recebe a fala inteira, uma vez, o balão não é região viva e a sala tem descrição.

`web/tests/tutorial.spec.ts` cobre o tutorial: o convite aparece uma vez e a resposta fica lembrada, o diálogo anda
para a frente e para trás, fecha com Esc e devolve o foco, passa no axe (convite, primeiro passo e tabela de teclas)
e, na sala, segura a sessão sem deixar atalho nenhum disparar.

O motor ganhou um teste de unidade para o prazo da tréplica que não corre (`run.test.ts`). O teste e2e da partida
completa (`sim.spec.ts`) continua passando, com a tecla do caderno trocada para C e a confirmação de devolver a
palavra.

### Percurso com teclado, depois

No rastreio de Tab da sala, seis Tabs a partir do título passam por histórico, acessibilidade, um termo do glossário,
ver o que foi dito, Anotar e continuar, todos com anel visível (âmbar no chassi, azul no papel). Antes, os seis
ficavam no `body`.

## 4. Testes manuais com tecnologia assistiva

Os testes automáticos não substituem uma pessoa usando leitor de tela de verdade. Os roteiros abaixo foram escritos
para quem for testar; cada passo diz o que deveria acontecer. Vale fazer com a audiência 44 e anotar o navegador, a
versão do leitor e qualquer passo em que o resultado foi outro.

### NVDA com Firefox ou Chrome, no Windows

1. Abra a página inicial e aperte Tab uma vez. Deve aparecer e ser lido "Pular para o conteúdo". Tab de novo chega a
   "Jogar"; mais um, a "Acessibilidade".
2. Em Acessibilidade, ligue "Reduzir o movimento" e, em Ritmo da sessão, escolha "manual". O NVDA deve anunciar cada
   grupo pelo nome ("Avanço das falas") e cada interruptor como alternância ligada ou desligada. Feche com Esc: o foco
   volta ao botão Acessibilidade.
3. Jogar leva ao acervo e o foco vai para o conteúdo. Com Tab, chegue à lista: ela deve ser lida como lista de
   opções, com a audiência escolhida. Setas para baixo e para cima trocam a audiência e a leitura acompanha. Enter
   numa audiência pronta entra na sala.
4. No dossiê, as setas para a direita e para a esquerda trocam a ideia; Tab até "Defender esta ideia" e Enter. Enter
   de novo pula o prelúdio.
5. Na sala, o foco vai para o título da audiência (nível 1). Em seguida o NVDA deve ler a primeira linha inteira uma
   única vez, com quem fala. Aperte Espaço: a próxima linha é lida inteira. Nenhuma linha deve ser lida aos pedaços
   durante a digitação.
6. Aperte N numa fala: deve haver o aviso de anotado ou o motivo de não ter anotado. Aperte C: o caderno abre como
   diálogo, com o título "Caderno"; Tab fica dentro dele; Esc fecha e o foco volta para onde estava.
7. Aperte R: o histórico abre com tudo o que foi dito, em ordem; "ver o que foi dito" abre o original de cada trecho.
8. Quando a presidência conceder a palavra, o foco deve entrar em "A palavra é sua" no primeiro movimento. Aperte 1,
   Enter numa anotação, e o foco deve chegar a "Falar". Antes de falar, Esc volta um passo. Ao falar, o NVDA lê a
   frase, o veredito e a variação da coerência.
9. Se aparecer a tréplica, o aviso deve ser imediato (região assertiva).
10. Ao fim, na ata, o foco vai para o título. Os títulos de seção devem aparecer na lista de títulos do NVDA (Insert
    mais F7).

### VoiceOver com Safari, no macOS

Repita os passos 1 a 10 com VO+setas e Tab. Confira em especial: o rotor de títulos e de marcos (deve haver um marco
principal e a região "Bancada"); se a imagem da sala é lida com a descrição; se as regiões vivas falam cada linha uma
vez; e se, com um diálogo aberto, o VoiceOver não escapa para o conteúdo de trás.

### VoiceOver no iOS e TalkBack no Android

Com gestos de deslizar, percorra o início, o painel Acessibilidade e a sala. Confira se cada botão tem nome, se os
interruptores dizem o estado e se tocar duas vezes em "continuar" avança a fala. O jogo ainda não tem leiaute próprio
para celular, então a sala fica apertada.

### Sem leitor de tela

- Teclado só: a partida inteira, do início à ata, sem mouse (o teste `a11y.spec.ts` faz isso em cerca de 45 s).
- Zoom do navegador em 200% e em 400%: nada deve sumir nem exigir rolagem lateral fora da sala.
- Texto em 200% pelo painel, com alto contraste: ler uma fala inteira e fazer uma jogada.
- Leitura em voz alta num navegador com voz em português (Chrome ou Edge no Windows, Safari no macOS): a voz lê a
  linha, e o modo automático só avança depois que ela termina.
- VLibras ligado: o botão aparece na borda direita; clicar num texto do balão deve fazer o avatar traduzir.

## 5. O que ainda falta

- A cena 3D é visual. A descrição em texto diz onde cada grupo está, mas não dá para explorar a sala pelo leitor
  de tela, e as placas da mesa e o painel do fundo (texturas no canvas) não crescem com o tamanho do texto.
- A atenção depende da câmera. Quem não vê a sala precisa ligar "Virar sozinho para quem fala" para não perder a
  atenção. O jogo não liga isso sozinho porque não há como detectar um leitor de tela.
- Modo automático com leitor de tela. As linhas entram na região viva no ritmo da partida e o leitor pode ficar
  para trás. O modo manual resolve, e o atalho do topo da sala o oferece, mas o padrão continua automático.
- Celular. A sala funciona a 320 px, mas fica apertada; não há leiaute para toque, e a dica de texto cortado não
  abre com toque.
- Alto contraste não muda as cores da cena 3D, só da interface.
- VLibras traduz por avatar automático, sem revisão de intérpretes, e não alcança a cena.
- Leitura em voz alta depende das vozes do aparelho; em Linux é comum não haver voz em português. Não foi testada
  com voz real nos testes automáticos.
- A marca "Uai-Tchê" da tela inicial alterna sem parar. Ela para com "Reduzir o movimento", que fica no botão ao
  lado de Jogar (o mecanismo que a WCAG 2.2.2 pede), mas não para sozinha.
- Integração contínua. O workflow do GitHub Pages roda typecheck, lint e testes de unidade, mas não o Playwright.
  Os testes de acessibilidade travam regressões só quando rodados localmente.
- Testes com pessoas. Nenhum teste com NVDA, JAWS, VoiceOver ou TalkBack foi feito por quem os usa no dia a dia.
  Os roteiros da seção 4 são o próximo passo.
