# Números do artigo, reproduzíveis

Esta pasta recalcula, a partir dos arquivos do repositório, os números que o artigo
([Artigo.pdf](../Artigo.pdf)) apresenta: tamanhos do acervo, a Tabela 1, a cobertura da matéria da
Agência Câmara, a composição das ideias, a fidelidade das reescritas, o tamanho do prompt, os
parâmetros do jogo e os fatos da audiência 44 usados no texto e nas figuras.

Nenhum script chama modelo de linguagem nem usa rede. Todos leem só:

- o dataset PublicHearingBR baixado em `data/publichearingbr/` (transcrições, matérias, opiniões);
- as anotações versionadas em `data/sim/hearing-NNN.json`;
- os arquivos jogáveis em `web/public/hearings/` (`hearing-NNN.json`, `index.json`, `catalog.json`);
- o código do pipeline (`src/sim/`) e do jogo (`web/src/sim/`), de onde vêm as constantes.

## Como rodar

```bash
uv sync                              # uma vez: cria o .venv
uv run scripts/download_data.py      # uma vez: baixa o dataset (~78 MB), que não fica no git
uv run analysis/run_all.py           # recalcula tudo e grava analysis/resultados.md
```

`run_all.py` imprime um resumo por grupo, grava a tabela completa em [resultados.md](resultados.md) e
termina com código 1 se algum valor calculado não bater com o que o artigo escreve. Cada grupo também
roda sozinho, por exemplo `uv run analysis/cobertura.py`.

## O que cada script calcula

| Script | Parte do artigo | Lê |
|---|---|---|
| [acervo.py](acervo.py) | Resumo, Introdução e Seção 3: as 206 audiências, palavras da transcrição e da matéria, opiniões, o recorte das 100 audiências e as 106 restantes, os 11,89% do PublicHearingBR | dataset, `catalog.json`, `index.json` |
| [construidas.py](construidas.py) | Tabela 1, barreiras da Seção 3 (glossário, falas regimentais, perguntas sem resposta) e Seção 6.1 | anotações, arquivos jogáveis, `catalog.json` |
| [cobertura.py](cobertura.py) | Cobertura da matéria (39,0%, 68,2%, 79,7%), Tabelas 3 e 5, Seção 6.2 e o tempo de leitura | anotações, arquivos jogáveis, dataset, `balance.ts` |
| [ideias.py](ideias.py) | Resumo e Seção 6.3: papéis por trás de cada ideia | anotações, arquivos jogáveis |
| [fidelidade.py](fidelidade.py) | Seções 5.4, 5.6 e 6.4: releitura dos pares, limite de 600 caracteres, cartas truncadas, texto reproduzido | anotações, arquivos jogáveis, dataset, `src/sim/` |
| [anotacao.py](anotacao.py) | Resumo e Seções 5.1 a 5.4: regras do contrato, tamanho do prompt, datas, resumo sha256 da divisão, validação e montagem refeitas sobre as anotações | `src/sim/`, anotações, arquivos jogáveis, dataset |
| [jogo.py](jogo.py) | Seções 4, 5.5 e 5.6: caderno, atenção, vezes de falar, apartes, Tabela 4, plateia, palmas, testes | `web/src/sim/`, `src/sim/build_scene.py`, arquivos jogáveis |
| [audiencia44.py](audiencia44.py) | Introdução, Seção 4, Tabela 2, Listagem 1 e figuras: os fatos da audiência 44 | dataset, anotação e arquivo jogável da 44 |

[common.py](common.py) concentra a leitura dos arquivos, a formatação em português (`12.987`, `9,1`,
`39,0%`) e o registro de cada número: onde aparece no artigo, o que mede, o valor impresso no artigo,
o valor calculado, o valor exato sem arredondar e o arquivo de origem.

## Convenções

- **Palavras** são sempre contadas como `len(texto.split())`, na transcrição, na matéria e nos textos do jogo.
- **"Em média por audiência"** é a média das 100 razões, uma por audiência. Quando o artigo usa outra
  forma (razão das médias, total agregado), a descrição do número diz qual.
- **Constantes do jogo** são lidas do código-fonte (`web/src/sim/engine/balance.ts`, `src/sim/*.py`) na hora
  de rodar, e não copiadas para os scripts.
- O único lugar em que um valor do artigo aparece digitado é o campo `artigo` de cada número, que serve
  de gabarito para a conferência.
- Além dos números, os scripts conferem afirmações do texto que dá para checar nos arquivos (por exemplo, quem
  defendeu a ideia 2 da audiência 44, ou que nenhum trecho publicado passa de 600 caracteres). Quando o artigo e
  os dados discordam, a linha aparece com **NÃO** na coluna "Confere", com a explicação no campo "Exato".

## O que não se reproduz aqui

A anotação de cada audiência foi feita uma vez por um modelo de linguagem, sem controle de temperatura
nem de semente, e por isso não se repete bit a bit. Os scripts partem das anotações versionadas em
`data/sim/`; tudo o que vem depois delas (validação, montagem e estes números) é determinístico.

Alguns valores das figuras vêm de uma partida específica jogada para as capturas de tela (por exemplo,
os 85 pontos de coerência da ata na Figura 8), e não de uma contagem sobre os arquivos.
