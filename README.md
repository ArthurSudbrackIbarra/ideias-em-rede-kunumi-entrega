# Don’t Leave It Uai-Tchê - Ideias em Rede (Instituto Kunumi) - PublicHearingBR

> ## 🎮 Jogar agora, no navegador: **<https://arthursudbrackibarra.github.io/ideias-em-rede-kunumi-entrega/>**
>
> [![Jogar agora](https://img.shields.io/badge/%E2%96%B6%20JOGAR%20AGORA-no%20navegador-2ea44f?style=for-the-badge)](https://arthursudbrackibarra.github.io/ideias-em-rede-kunumi-entrega/)
> [![Trailer no YouTube](https://img.shields.io/badge/TRAILER-YouTube-c4302b?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/BYGZbZYzUZA)
> [![Artigo em PDF](https://img.shields.io/badge/ARTIGO-PDF-1f6feb?style=for-the-badge)](Artigo.pdf)
>
> ## 🎬 Trailer (demo do jogo): **<https://youtu.be/BYGZbZYzUZA>**
>
> [![Trailer do jogo no YouTube](https://img.youtube.com/vi/BYGZbZYzUZA/hqdefault.jpg)](https://youtu.be/BYGZbZYzUZA)
>
> ## 📄 Artigo escrito: **[Artigo.pdf](Artigo.pdf)** (na raiz do repositório)

Repositório do grupo para o desafio **"IA e a Esfera Pública"**. O dataset é o
[PublicHearingBR](https://huggingface.co/datasets/unicamp-dl/PublicHearingBR)
(Unicamp, [arXiv 2410.07495](https://arxiv.org/abs/2410.07495)): 206 audiências públicas da Câmara
dos Deputados, com a transcrição completa e a matéria da Agência Câmara sobre cada uma.

O projeto é um **jogo em primeira pessoa**. A pessoa senta numa cadeira da sala de comissão em 3D,
ouve os participantes reais e participa. Três ideias sustentam a versão atual (a **v2**):

- **Palavras simples, original a um clique.** Cada trecho dito por uma pessoa real aparece numa versão
  em português do dia a dia, gerada uma vez por um modelo de linguagem sob regras estritas de
  fidelidade; o texto verbatim da transcrição fica sempre a um clique ("ver o que foi dito"), com a
  referência da sentença de origem. Trechos que já são simples aparecem como estão.
- **Uma cadeira vaga, sem falas próprias.** A pessoa é um personagem fictício e anônimo. Ela anota o
  que ouve e, quando a presidência lhe concede a palavra, **sustenta**, **contesta** ou **cobra** o que
  as pessoas reais disseram, por moldes fixos ("Eu sustento o que disse Rodrigo Agostinho, do Ibama:
  que…"). Não há texto livre: ninguém nomeado diz nada que não tenha dito.
- **Defender uma ideia, não um setor.** No início a pessoa escolhe uma **tese** entre as ideias que de
  fato apareceram na audiência. O jogo não julga a tese; julga a **coerência** com ela. Teses cruzam
  setores (um ministério e um sindicato do mesmo lado) e dividem setores (dois órgãos do governo em
  lados opostos), que é o que a audiência real mostra.

O único passo com modelo de linguagem é uma passagem por audiência, antes do jogo. O que o modelo lê e o
que devolve está descrito em [docs/extracao-llm-audiencias.md](docs/extracao-llm-audiencias.md), com o
diagrama do caminho da transcrição bruta até o arquivo jogável.

## Setup

Dependências e ambiente Python são geridos com [uv](https://docs.astral.sh/uv/)
(`winget install astral-sh.uv` no Windows, `curl -LsSf https://astral.sh/uv/install.sh | sh` no Linux/macOS).
O frontend precisa de Node 20+ e npm.

```bash
uv sync                            # cria o .venv com o Python de .python-version
uv run scripts/download_data.py    # baixa o dataset (~78 MB) para data/publichearingbr/
```

O download é obrigatório: os `.jsonl` não estão no git (regulamento §6.2) e os pipelines param com uma
mensagem apontando para esse comando se faltarem. Ele é idempotente, atômico e confere tamanho e sha256
anunciados pelo Hugging Face; `--check` verifica sem escrever, `--force` rebaixa tudo.

## Pipeline (Python): uma passagem de LLM por audiência, nunca em tempo de jogo

```bash
uv run src/sim/annotate_sim.py 44 --dump-prompt   # escreve o prompt em data/sim/prompts/ (sem rede)
uv run src/sim/annotate_sim.py 44                 # com ANTHROPIC_API_KEY -> data/sim/hearing-044.json  (sim-annotations-v3)
uv run src/sim/annotate_sim.py 44 --import r.json # valida uma resposta produzida em outro lugar e grava
uv run src/sim/verify_plain.py 44                 # opcional, 2º modelo julga a fidelidade das versões simples
uv run src/sim/build_scene.py 44                  # índices -> texto verbatim -> web/public/hearings/hearing-044.json (hearing-sim-v2)
uv run src/sim/validate.py 44                     # schema + invariantes do arquivo jogável
uv run src/sim/catalog.py                         # web/public/hearings/catalog.json: as 206 audiências (número, título, data, comissão)
uv run pytest                                     # validadores, guardas e build
```

`hearing_text.py` divide a transcrição em falas (turnos consecutivos do mesmo orador, `b001`, `b002`…)
e sentenças numeradas; tudo o que o modelo devolve é referido a esses índices. `annotate_sim.py` pede,
numa só resposta: temas com eixo de divergência (e o eixo em palavras simples), papel e assento de cada
orador (mais `byline` e a explicação da instituição), a posição e as **cartas** de cada fala substantiva
(trechos consecutivos de 1 a 3 sentenças, cada uma com `gist`, `position` e a versão `plain`: uma
simplificação quando o trecho é difícil, uma revisão leve de pontuação quando já é simples, porque a
transcrição bruta nunca vai ao balão), os atos da mesa, a plateia, relações (apoia, responde, contradiz),
consensos, perguntas sem resposta, fatos com quem os disputa, o enquadramento da matéria, as **teses**
(3 a 6 ideias, cada uma com os temas em que toma lado e as cartas que a sustentam, de ao menos duas
pessoas) e um **glossário**. A validação recusa versões simples com números diferentes do original ou
com 12 palavras consecutivas copiadas, teses mal cortadas (carta fora do tema, do lado errado, de um só
orador, sem par oposto) e avisa quando a cobertura do `plain` foge de 30%–95%.

`build_scene.py` não chama modelo: resolve índices em texto verbatim (até 600 caracteres por trecho),
monta as **páginas** de cada fala (uma por carta, com `plain` e `original`), o baralho com cartas de
afirmação e de pergunta, as teses resolvidas (quem defendeu e quem discordou, por instituição e papel,
sem nomes de pessoas), o momento em que a cadeira vaga recebe a palavra e as reações pré-computadas do
grafo. Se existir `data/sim/hearing-NNN.verify.json`, toda versão simples reprovada cai para o original.

Cada anotação é produzida por um modelo de linguagem lendo o prompt de `--dump-prompt` e respondendo no formato
do contrato; a resposta entra por `--import`, que valida e grava, e `meta.model` registra a origem. Hoje **100 das
206 audiências** estão anotadas e jogáveis (a lista fica em `web/public/hearings/index.json`; as outras 106
aparecem no acervo, mas ainda sem sala). Na 44 (petróleo na Margem Equatorial): 6 temas, 24 falas substantivas
em 70 páginas (todas em palavras simples), 65 cartas + 5 perguntas, 44 relações, 12 fatos, 6 teses e 15 termos de
glossário. `meta.review` registra a leitura humana dos pares original → simples (70 lidos, 40 ajustados). O
validador recusa número trocado, cópia de 12 palavras da transcrição e ponto e vírgula. Com uma chave de API,
`--all` anota as restantes.

## Frontend (web/)

Vite + React 19 + TypeScript strict + React Three Fiber + drei + postprocessing + zustand. Uma fonte só,
[Lexend](https://www.lexend.com/), autohospedada. A interface segue o redesenho "direção B, tribuna"
(2026-09-14, acabada em 2026-09-15): um material para o que é controle (chassi de tinta: a bancada de 116px no
rodapé, botões, placas, painel de legenda) e outro para o que se lê (papel: fala, carta, caderno, glossário,
ata). Cor só onde significa algo, sempre com ícone e palavra. A escolha da ideia é um dossiê, uma ideia por
vez, com a tira das seis embaixo.

```bash
cd web
npm install                 # .npmrc já tem legacy-peer-deps (peers opcionais do R3F para react-native)
npm run dev                 # http://localhost:5173  ->  /  (início)  /audiencias  (o acervo)  /sim/44  (a sala)
npm run typecheck           # tsc --noEmit
npm run lint                # eslint .
npm run gen:types:sim       # regenera src/sim/lib/hearing-sim.d.ts a partir de shared/hearing-sim.schema.json
npm run test:unit           # vitest: motor puro (julgamento de coerência, determinismo, invariantes)
npx playwright install chromium   # uma vez
npm run test:e2e            # a partida inteira no navegador; screenshots em web/tests/screenshots/
npm run build               # dist/ estático
```

### Publicação (GitHub Pages)

O jogo é um site estático: `npm run build` gera `web/dist/` com os JSON de `web/public/hearings/` dentro, sem
servidor, sem Python e sem chave de API em tempo de jogo. O workflow
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) publica esse `dist/` no GitHub Pages a cada push
na `main` (ou à mão, pela aba Actions), depois de rodar typecheck, lint e os testes do motor.

Para ligar, uma vez só: em **Settings → Pages → Build and deployment**, escolha *Source: GitHub Actions*. O site
fica em `https://<usuario>.github.io/<repo>/`; o deste repositório está em
<https://arthursudbrackibarra.github.io/ideias-em-rede-kunumi-entrega/>. O workflow calcula o caminho base a partir do nome do repositório e
passa em `VITE_BASE` para o Vite; o código já lê `import.meta.env.BASE_URL` no router e nos `fetch`, então
nenhum caminho é fixo. Como o Pages não reescreve rotas, o `index.html` também é copiado como `404.html`: abrir
`/sim/44` direto entrega a aplicação e o React Router resolve a rota. Para testar o build de um subcaminho
localmente:

```bash
cd web
VITE_BASE=/meu-repo/ npm run build && npm run preview   # http://localhost:4173/meu-repo/
```

**Uma partida.** Escolha da tese em dossiê (a pergunta central em palavras simples e uma ideia por vez, com
quem a defendeu e quem discordou por instituição, e uma fala real da sala que a sustenta) → prelúdio (tela preta com o título e a data,
digitados) → a sala se povoa com o número certo de bonecos por papel → as falas tocam, página por página,
em palavras simples; `O` mostra o que foi dito; `N` anota → nas quatro vezes em que a presidência concede a
palavra (e em até dois apartes), a pessoa escolhe em três passos: o movimento (**sustentar** `1`,
**contestar** `2` ou **cobrar** `3` uma pergunta que ficou sem resposta), a anotação do caderno e, só ao
contestar, uma segunda anotação para citar (do mesmo tema, ou de outro tema quando a audiência registra que uma
respondeu à outra); a carta escolhida recebe a etiqueta "Você
contesta" e a citada "Você cita", e a frase exata aparece antes de Falar. O veredito de coerência vem logo
depois, com a explicação → a **ata**: a tese, cada intervenção julgada, quantas vezes o original foi
conferido, a audiência real e o que a Agência Câmara noticiou. Nenhum trecho de pessoa nomeada é lido por
inteiro duas vezes: se alguém já foi lido, a réplica vira um cartão que lembra o ponto.

**Controles.** Arrastar o mouse olha em volta (arrasta-se a cena); `Q`/`E` viram para quem fala; `Tab`
abre o caderno; `A` pede aparte; `T` tréplica; `Enter` acelera, `Esc` completa (e fecha o que estiver
aberto); `Espaço` continua no modo manual; `P` alterna automático/manual; `+`/`−` velocidade (0,25× a 2×,
padrão 0,5×); `M` som; `L` legenda; `G` glossário; `H` ajuda. Tudo também é clicável.

**O que o jogo garante.** Todo texto atribuído a uma pessoa nomeada é verbatim ou uma versão simples com
o original a um clique (a tela inicial e a de teses explicam que as falas foram reescritas); bonecos sem
rosto, iguais aos da plateia; a cadeira vaga fica no meio da mesa de debatedores; nenhum ranking de
indivíduos (contagens por instituição e papel); citações de até 600 caracteres; sem confete e sem vitória.
Nos textos do jogo não há caixa alta, ponto e vírgula, separador "·" nem seta em unicode. O motor de regras
é puro e determinístico por semente (`?seed=`).

## Restrições do regulamento que afetam o design da solução

- **§12.2 / §15.3(f)** — proibido criar perfis sensíveis de pessoas, classificar ou *ranquear
  indivíduos*, ou atribuir opiniões sem apoio claro nos documentos originais. Toda afirmação atribuída
  a alguém carrega o trecho verbatim que a sustenta (e a versão simples vem rotulada, com o original a
  um clique). Contagens de quem defendeu ou contestou uma tese são por **instituição e papel**
  (parlamentar, governo, sociedade civil, setor privado), nunca ordenadas por pessoa. A pontuação da
  partida mede o jogador, não as pessoas reais.
- **§6.2** — não redistribuir o dataset como próprio. Os `.jsonl` estão no `.gitignore`; use
  `uv run scripts/download_data.py`. Os arquivos em `web/public/hearings/` carregam só trechos de até
  600 caracteres por carta.
- **§15.3(d)** — citar o dataset, o paper e a Câmara dos Deputados.
- Até US$ 100 de infraestrutura por equipe, via Instituto.

## O dataset em números (medidos localmente)

| | |
|---|---|
| Audiências (LDS) | 206, Agência Câmara, nov/2021 – mai/2024 (141 de 2023) |
| Transcrição | média 18.102 palavras, mediana 16.424, máx. 147.728 |
| Matéria jornalística | média 627 palavras (≈4% da transcrição) |
| Envolvidos por audiência | 5,2 · opiniões: 10,7 (2.203 no total) |
| Pares NLI | 4.238 opiniões × 4 chunks; **11,9% alucinações** (504) anotadas manualmente |
| Vereditos automáticos | 3 prompts × 4 modelos (GPT-4o-mini, GPT-4o, DeepSeek-V3, Sabiá-3.1) com explicação |
| Falas marcadas | `O SR. NOME (Partido - UF) -` / `A SRA. ...` — diarização gratuita; ~89% das falas são `O SR.` |
| Baseline do paper (ChatGPT) | Recall 44,9% · Precisão 24,8% na extração de opiniões |

Estrutura: [data/publichearingbr/README.md](data/publichearingbr/README.md).
Paper do dataset: [arXiv 2410.07495](https://arxiv.org/abs/2410.07495).

## Documentos

- **[Jogo publicado](https://arthursudbrackibarra.github.io/ideias-em-rede-kunumi-entrega/)** — joga direto no navegador, sem instalar nada.
- **[Artigo.pdf](Artigo.pdf)** — o artigo escrito sobre o projeto.
- **[Trailer no YouTube](https://youtu.be/BYGZbZYzUZA)** — vídeo de demonstração do jogo.
- [analysis/](analysis/README.md) — scripts que recalculam todos os números do artigo a partir dos arquivos do
  repositório (`uv run analysis/run_all.py`); o resultado fica em [analysis/resultados.md](analysis/resultados.md).
- [docs/extracao-llm-audiencias.md](docs/extracao-llm-audiencias.md) — o que o modelo de linguagem extrai de cada
  audiência e como isso vira o arquivo jogável (diagrama em `.mmd`, `.svg` e `.png`).
- [shared/hearing-sim.schema.json](shared/hearing-sim.schema.json) — o contrato `hearing-sim-v2` entre o pipeline e o jogo.

## Layout

```
analysis/               scripts que recalculam os números do artigo (run_all.py -> resultados.md)
data/publichearingbr/   dataset (jsonl ignorados pelo git; baixar com o script)
data/sim/               hearing-NNN.json: anotação do simulador por audiência (versionado; 100 audiências)
data/sim/prompts/       prompts gerados por --dump-prompt (ignorados)
docs/                   diagrama e nota sobre o que o LLM extrai de cada audiência
shared/hearing-sim.schema.json  contrato hearing-sim-v2 entre build_scene.py e web/src/sim
src/dataset.py          caminhos do dataset + leitura com erro amigável
src/sim/                hearing_text.py [transcrição -> falas e sentenças] · annotate_sim.py [LLM, 1x por audiência]
                        · verify_plain.py [2º modelo, opcional] · build_scene.py [índices -> texto] · validate.py
tests/                  pytest: validadores da anotação e do build
web/                    Vite + React + R3F: /  (início)  /audiencias  (o acervo, mestre e detalhe)  /sim/:id  (a sala)
web/src/sim/            engine/ (motor puro + vitest) · scene/ (sala 3D) · ui/ · store/ · lib/ · assets/ (Lexend, Newsreader, sons) · copy.ts
web/public/hearings/    hearing-NNN.json + index.json gerados por build_scene.py; catalog.json por catalog.py (versionados)
web/tests/              Playwright (screenshots em web/tests/screenshots/, ignorados)
.github/workflows/      deploy.yml: publica web/dist no GitHub Pages a cada push na main
scripts/download_data.py   baixa o dataset do Hugging Face
scripts/anchor_relations.py  migração das anotações v3 -> v4 (idempotente)
pyproject.toml          projeto uv (jsonschema e anthropic em runtime; ruff e pytest no grupo dev)
uv.lock                 lock do uv (versionado)
```
