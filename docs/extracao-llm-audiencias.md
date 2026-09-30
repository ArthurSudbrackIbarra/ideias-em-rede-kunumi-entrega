# O que o LLM extrai de cada audiência

Este diagrama mostra o caminho de uma audiência pública desde a transcrição bruta até o arquivo
que o Simulador de Audiência Pública lê. O único passo com modelo de linguagem é o do meio: o
LLM lê a transcrição inteira, já cortada em falas e sentenças numeradas, mais a matéria da
Agência Câmara, e devolve um único JSON que obedece a um contrato de anotação fixo, igual para
todas as audiências (definido em `src/sim/annotate_sim.py`, constante `SYSTEM`).

Tudo o que vem da transcrição é devolvido como índice de sentença, nunca como texto copiado.
Todo texto de autoria do modelo sobre o que alguém disse precisa ser fiel ao trecho: mesmo
sentido, mesmos números, mesmos nomes. O validador confere isso antes de salvar.

Versão editável no FigJam: <https://www.figma.com/board/QnIw0gbj6mhjeHM8TwTD8j>

Imagens: [`extracao-llm-audiencias.svg`](extracao-llm-audiencias.svg) e
[`extracao-llm-audiencias.png`](extracao-llm-audiencias.png).

## Cores

| cor | cluster | o que guarda |
|---|---|---|
| cinza azulado | Entrada | transcrição, corte em falas e sentenças, matéria da imprensa |
| amarelo | Modelo | a única chamada ao LLM |
| roxo | Visão geral | sinopse, o que estava em jogo, pergunta central, leitura da imprensa |
| laranja | Pessoas | oradores, setores, instituições, plateia |
| verde | Debate | temas com eixo pró e contra, falas, cartas e seus tipos |
| vermelho | Grafo de relações | quem apoia, contradiz ou responde a quem, consenso, perguntas em aberto, fatos contestados |
| azul | Ideias e vocabulário | teses defendidas na audiência e glossário |
| cinza claro | Saída | validador, JSON, montagem da cena e o jogo |

## Diagrama

```mermaid
flowchart LR
    subgraph IN["1. Entrada, sem LLM e determinística"]
        direction TB
        T["Transcrição bruta da audiência, dataset PublicHearingBR"]
        C["Corte em falas b001, b002... e sentenças numeradas a partir de 0"]
        M["Matéria da Agência Câmara sobre a mesma audiência, com sentenças numeradas"]
        T --> C
    end

    LLM(["2. Um LLM lê tudo e devolve UM JSON que segue um contrato de anotação fixo"])
    C --> LLM
    M --> LLM

    subgraph G1["Visão geral da audiência"]
        direction TB
        S["Sinopse, o que estava em jogo e a pergunta central"]
        SP["As mesmas três coisas em palavras simples"]
        P["Imprensa: temas cobertos, papéis citados, ângulo escolhido e o que ficou de fora"]
        S --> SP
    end

    subgraph G2["Pessoas"]
        direction TB
        SPK["Oradores: papel ou setor, cargo, instituição, assento, nível de governo"]
        RO["Setores: mesa, parlamentar, governo, sociedade civil, setor privado"]
        BY["Byline e explicação da instituição para quem nunca ouviu falar dela"]
        AUD["Plateia: quantas pessoas, composição por setor e confiança da estimativa"]
        SPK --> RO
        SPK --> BY
    end

    subgraph G3["Debate: temas, falas e cartas"]
        direction TB
        TH["4 a 8 temas, cada um com eixo pró e contra, também em palavras simples"]
        F["Falas: substantiva ou procedimental, tema, resumo, trecho citável por índices, posição, tom, interrupção, cobertura pela imprensa, ato da mesa"]
        CL["Cartas, 1 a 3 por fala: tipo, força, posição no tema, gist e versão em palavras simples"]
        TY["Tipos de carta: dado, princípio, experiência, jurídico, econômico, precedente"]
        TH --> F --> CL --> TY
    end

    subgraph G4["Grafo de relações"]
        direction TB
        R["Relações entre cartas: apoia, contradiz, responde"]
        CO["Consenso: cartas de setores diferentes que concordam numa posição do mesmo tema"]
        Q["Perguntas em aberto: quem cobrou, a quem, e quem respondeu, ou ninguém"]
        FA["Fatos com número ou data, sentença de origem e quem os contesta"]
    end

    subgraph G5["Ideias e vocabulário"]
        direction TB
        TE["Teses, 3 a 6: ideias de fato defendidas, posições por tema e cartas-chave de pelo menos duas pessoas"]
        GL["Glossário, 6 a 15 termos: explicação simples e primeira ocorrência"]
    end

    LLM --> S
    LLM --> SPK
    LLM --> TH
    LLM --> R
    LLM --> TE
    CL -.->|"as cartas ancoram relações, consensos e teses"| R

    V{"3. Validador: só índices que existem, números idênticos ao original, nenhuma cópia de 12 palavras, limites de caracteres"}
    P --> V
    AUD --> V
    TY --> V
    FA --> V
    GL --> V
    J[("data/sim/hearing-NNN.json")]
    B["build_scene.py copia índices para texto, sem LLM"]
    GAME["Simulador de Audiência Pública"]
    V --> J --> B --> GAME

    classDef entrada fill:#E2E8F0,stroke:#475569,color:#0F172A
    classDef modelo fill:#FDE68A,stroke:#B45309,color:#451A03
    classDef geral fill:#E9D5FF,stroke:#7E22CE,color:#3B0764
    classDef pessoas fill:#FED7AA,stroke:#C2410C,color:#431407
    classDef debate fill:#BBF7D0,stroke:#15803D,color:#052E16
    classDef grafo fill:#FECACA,stroke:#B91C1C,color:#450A0A
    classDef ideias fill:#BFDBFE,stroke:#1D4ED8,color:#172554
    classDef saida fill:#F5F5F4,stroke:#44403C,color:#1C1917

    class T,C,M entrada
    class LLM modelo
    class S,SP,P geral
    class SPK,RO,BY,AUD pessoas
    class TH,F,CL,TY debate
    class R,CO,Q,FA grafo
    class TE,GL ideias
    class V,J,B,GAME saida
```

## Leitura rápida, para o vídeo

1. A transcrição é cortada sem LLM em falas (b001, b002...) e sentenças numeradas. Isso é o
   sistema de coordenadas de tudo o que vem depois.
2. O LLM recebe a transcrição cortada e a matéria da imprensa e devolve um JSON só, seguindo um
   contrato fixo.
3. Desse JSON saem cinco famílias de informação: a visão geral da audiência, as pessoas e seus
   setores, o debate (temas, falas e cartas de argumento), o grafo de relações (quem apoia,
   contradiz ou responde a quem, consenso entre setores, perguntas sem resposta e fatos
   contestados) e as ideias (teses defendidas e glossário).
4. As cartas são a unidade que amarra o grafo: cada relação, cada consenso e cada tese apontam
   para cartas concretas, e cada carta aponta para sentenças concretas da transcrição.
5. O validador rejeita o que não bate com o original. Só então o JSON vira o arquivo jogável.
