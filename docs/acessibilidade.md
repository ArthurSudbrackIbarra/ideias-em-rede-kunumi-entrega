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

- **axe-core 4.14** pelo `@axe-core/playwright`, com as regras `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `wcag22aa` e `best-practice`, em 14 estados: início, acervo, acervo com a dica de texto cortado, dossiê das ideias,
  prelúdio, fala no balão, texto original aberto, caderno, glossário, legenda e ajuda, a vez de falar no passo 1, a
  vez de falar com a prévia da frase, veredito e ata. O roteiro é `web/tests/a11y-audit.spec.ts` e roda com
  `npm run a11y:audit` (o relatório sai em `web/tests/a11y-report/`).
- **Percurso só com teclado**: o mesmo roteiro aperta Tab em cada tela e anota onde o foco para e se o anel de foco
  aparece. O resto do percurso (uma partida inteira da audiência 44, semente 20260912) foi feito lendo os
  manipuladores de tecla de cada componente e conferido no navegador.
- **Contraste**: calculado a partir das cores do `sim.css` com a fórmula de luminância relativa da WCAG, para cada par
  de texto e fundo usado. O axe não mede texto sobre o canvas 3D (marca como "incompleto"), então esses casos foram
  calculados à parte.
- **Reflow**: capturas a 320 px de largura (o equivalente a 400% de zoom numa tela de 1280 px).

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
