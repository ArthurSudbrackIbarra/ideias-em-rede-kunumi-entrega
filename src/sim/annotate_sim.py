"""Hearing simulator, stage 1: the single LLM pass per hearing (docs/simulador-audiencia-spec-v2.md §4).

Reads one PublicHearingBR hearing split into numbered falas and sentences (hearing_text.py) and asks a
model for everything the game needs: themes with their axis of disagreement (also in plain words),
roles, seats, bylines and a one-line explanation of each institution, the stance and the claims (the
cards) of every substantive fala — each card with a `gist` that completes "sustento o que disse X: que
…", its own `position` on the theme axis and a `plain` version in everyday Portuguese (always: a light
revision of punctuation and spelling when the original is already simple, a real simplification when it
is not) —, the procedural acts of the presiding table, the audience, relations,
consensus, open questions (also in plain words), facts, how the press framed it, 3–6 **teses** (ideas
that were actually defended, independent of sector) and a glossary. Everything from the transcript is
anchored to sentence indices, so the game never shows a word the person did not say; every free text
about what someone said is checked for fidelity here (numbers identical to the original, no 12-word
copies) before it is saved. The copy from indices to text happens later, in build_scene.py.

Usage (from the repo root):
    uv run src/sim/annotate_sim.py 44 --dump-prompt      # writes the exact prompt to data/sim/prompts/ (no network)
    uv run src/sim/annotate_sim.py 44                    # calls the Anthropic API (ANTHROPIC_API_KEY) -> data/sim/hearing-044.json
    uv run src/sim/annotate_sim.py 44 --import resp.json # validates a response produced elsewhere and saves it
    uv run src/sim/annotate_sim.py --all --estimate      # token/cost estimate for the 206 hearings, no calls
    uv run src/sim/annotate_sim.py --all                 # annotates every hearing that has no file yet

A response file may carry two private keys that are not part of the contract: `_model` (label saved as
`model`) and `_review` ({"pairs_read": n, "pairs_fixed": m}: how many original→plain pairs a person read
and fixed before importing; spec §4.5).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
from sim.hearing_text import all_ids, parse_json, user_block  # noqa: E402

OUT_DIR = ROOT / "data" / "sim"
PROMPT_DIR = OUT_DIR / "prompts"
DEFAULT_MODEL = "claude-sonnet-5"
# v3 (2026-09-13): `plain` obrigatório em toda carta; sem ponto e vírgula nos textos livres
# v4 (2026-09-15): `relations[].from_claim`/`to_claim` e `consensus[].claims` obrigatórios (a relação e o consenso
# apontam cartas, não só falas). Sem suporte a v3: as quatro anotações anteriores foram completadas por
# scripts/anchor_relations.py
VERSION = "sim-annotations-v4"

ROLES = ["mesa", "parlamentar", "governo", "sociedade_civil", "setor_privado", "convidado"]
KINDS = ["substantive", "procedural"]
RELATION_KINDS = ["apoia", "contradiz", "responde"]
POSITIONS = ["favoravel", "contrario", "condicional", "neutro"]
SIDES = ["favoravel", "contrario"]
QUESTION_POSITIONS = ["favoravel", "contrario", "neutro"]
CLAIM_TYPES = ["dado", "principio", "experiencia", "juridico", "economico", "precedente"]
STRENGTHS = ["forte", "media"]
TONES = ["tecnico", "emotivo", "juridico", "politico"]
SEATS = ["mesa", "bancada", "debatedores", "remoto"]
GOV_LEVELS = ["federal", "estadual", "municipal"]
MESA_MOVES = ["abre", "apresenta", "passa_palavra", "pede_conclusao", "corta", "anuncia_presenca",
              "audiodescricao", "ordem", "microfone", "cortesia", "encerra"]
CONFIDENCE = ["alta", "media", "baixa"]
ADDRESSEES = ["governo", "parlamentar", "sociedade_civil", "setor_privado", "mesa"]
THEMES_MIN, THEMES_MAX = 4, 8
CLAIMS_PER_FALA_MAX = 3
CLAIMS_TOTAL_MIN, CLAIMS_TOTAL_MAX = 8, 72
FACTS_MIN, FACTS_MAX = 3, 12
TESES_MIN, TESES_MAX = 3, 6
CLAIMS_CHAVE_MIN, CLAIMS_CHAVE_MAX = 3, 6
GLOSSARY_MIN, GLOSSARY_MAX = 6, 15
QUOTE_MAX = 600

# fidelidade (spec §4.4)
PLAIN_MIN, PLAIN_MAX = 20, 240
GIST_MAX = 140
COPY_WINDOW = 12  # palavras consecutivas da transcrição que nenhum texto livre pode reproduzir
NEUTRAL_CARDS_WARN = 0.40
LIMITS = {
    "synopsis_plain": 400, "stakes_plain": 200, "central_question_plain": 160, "axis_plain": 140,
    "byline": 60, "org_plain": 110, "tese_title": 60, "statement_plain": 220, "glossary_plain": 160,
    "question_plain": 160, "mesa_summary": 120,
}

# ------------------------------------------------------------------ prompt

SYSTEM = f"""Você é um analista de audiências públicas da Câmara dos Deputados. Vai ler a transcrição completa de UMA audiência,
já dividida em falas numeradas (b001, b002, ...) e, dentro de cada fala, em sentenças numeradas a partir de 0.
Também recebe a matéria da Agência Câmara sobre a mesma audiência, com sentenças numeradas.

Sua anotação alimenta uma simulação em que uma pessoa comum, que nunca assistiu a uma audiência, senta na sala e
participa. Ela lê cada trecho numa VERSÃO EM PALAVRAS SIMPLES escrita por você (o original verbatim fica sempre a um
clique), escolhe uma TESE entre as ideias que de fato apareceram na audiência e, na vez dela, SUSTENTA ou CONTESTA o
que pessoas reais disseram, por moldes fixos que usam o seu "gist" ("Eu sustento o que disse X, do Ibama: que ..."),
ou COBRA uma pergunta que ficou sem resposta. Por isso:
- tudo o que é da transcrição você devolve como ÍNDICES de sentenças, nunca como texto copiado;
- todo texto de sua autoria sobre o que alguém disse tem de ser FIEL ao trecho: mesmo sentido, mesmos números,
  mesmos nomes, nada acrescentado. O que você escrever vai aparecer na tela como o que a pessoa disse.

Devolva APENAS um objeto JSON (sem markdown, sem comentários) com esta forma:

{{
  "synopsis": "2 ou 3 sentenças dizendo o que estava em jogo nesta audiência e o que se pediu.",
  "stakes": "uma sentença: qual decisão concreta dependia desta audiência.",
  "central_question": "a pergunta que a audiência tenta responder, em forma de pergunta.",
  "synopsis_plain": "até {LIMITS['synopsis_plain']} caracteres: o que estava em jogo, em português do dia a dia, sem siglas soltas.",
  "stakes_plain": "até {LIMITS['stakes_plain']} caracteres: que decisão concreta dependia disto, em palavras simples.",
  "central_question_plain": "até {LIMITS['central_question_plain']} caracteres, termina com '?': a pergunta central em palavras simples.",
  "themes": [
    {{"id": "d1", "name": "nome curto do tema (2 a 5 palavras, substantivo, sem verbo)",
      "description": "uma sentença que explica o que se discute neste tema, para quem não assistiu",
      "axis": {{"pro": "a posição afirmativa, em uma oração", "contra": "a posição oposta, em uma oração",
               "pro_plain": "até {LIMITS['axis_plain']} caracteres: o lado 'pro' em palavras simples",
               "contra_plain": "até {LIMITS['axis_plain']} caracteres: o lado 'contra' em palavras simples"}},
      "contested": true}}
  ],
  "speakers": {{
    "s01": {{"role": "mesa|parlamentar|governo|sociedade_civil|setor_privado|convidado",
             "cargo": "cargo ou vínculo como apresentado na audiência, curto",
             "org": "sigla ou nome da instituição, ou null",
             "basis": "de onde tirou (ex.: 'apresentada pelo presidente em b001.14')",
             "seat": "mesa|bancada|debatedores|remoto",
             "gov_level": "federal|estadual|municipal|null (só quando role=governo)",
             "byline": "até {LIMITS['byline']} caracteres, começa em minúscula, como a pessoa é referida no meio de uma frase: 'do Ibama', 'da Petrobras', 'deputado federal pelo PSOL de São Paulo' (null só para a mesa)",
             "org_plain": "até {LIMITS['org_plain']} caracteres, ou null: o que é essa instituição, para quem nunca ouviu falar dela"}}
  }},
  "audience": {{"estimate": 40, "composition": [{{"role": "sociedade_civil", "share": 0.7}}],
                "basis": "de onde tirou", "confidence": "alta|media|baixa"}},
  "falas": [
    {{
      "id": "b004", "speaker": "s02", "kind": "substantive|procedural", "theme": "d2",
      "summary": "uma sentença, no máximo 30 palavras, começando pelo verbo: o que o orador defende, informa ou pede",
      "quote": [40, 41, 42], "covered": true, "evidence": [2, 13], "open_question": null,
      "stance": {{"position": "favoravel|contrario|condicional|neutro",
                  "claim": "a posição como proposição afirmativa, em uma oração, na sua voz", "sentence": 40}},
      "claims": [
        {{"id": "b004c1", "sentences": [40, 41], "type": "dado|principio|experiencia|juridico|economico|precedente",
          "theme": "d2", "strength": "forte|media",
          "position": "favoravel|contrario|condicional|neutro — a posição DESTA carta no eixo do tema DELA",
          "gist": "oração completada por 'que': minúscula inicial, sem ponto final, 3ª pessoa, presente, até {GIST_MAX} caracteres. Ex.: 'a produção brasileira cai a partir de 2029 e o país pode voltar a importar petróleo'",
          "plain": "SEMPRE preenchido: 1 ou 2 frases, {PLAIN_MIN} a {PLAIN_MAX} caracteres, na voz da pessoa, mesmo sentido do trecho, números e nomes idênticos, siglas explicadas, pontuação limpa"}}
      ],
      "tone": "tecnico|emotivo|juridico|politico",
      "interrupted": false,
      "mesa_move": null
    }}
  ],
  "relations": [
    {{"from": "b031", "to": "b008", "kind": "apoia|contradiz|responde", "from_sentence": 12, "to_sentence": 15,
      "from_claim": "b031c1", "to_claim": "b008c2", "strength": "forte|media",
      "note": "uma sentença dizendo o que liga as duas falas"}}
  ],
  "consensus": [
    {{"theme": "d1", "falas": ["b002", "b008", "b026"], "claims": ["b002c1", "b008c2", "b026c1"],
      "note": "uma sentença dizendo em que oradores de papéis diferentes concordam"}}
  ],
  "open_questions": [
    {{"id": "q1", "from": "b013", "sentence": 21, "addressed_to": "governo|parlamentar|sociedade_civil|setor_privado|mesa",
      "answered_by": null, "gist": "até 15 palavras: o que se cobrou",
      "plain": "a pergunta em palavras simples, até {LIMITS['question_plain']} caracteres, termina com '?'",
      "theme": "id do tema em que a pergunta se insere",
      "position": "favoravel|contrario|neutro — o lado que a pergunta pressiona, no eixo do tema (neutro quando só pede informação)"}}
  ],
  "facts": [
    {{"id": "f1", "fala": "b004", "sentence": 41, "gist": "até 12 palavras, com o número",
      "disputed_by": [{{"fala": "b011", "sentence": 30}}]}}
  ],
  "press": {{"themes_covered": ["d2"], "roles_quoted": ["parlamentar", "governo"],
             "angle": "uma sentença: o ângulo que a matéria escolheu",
             "omitted": "uma sentença: o que se discutiu na sala e não entrou na matéria"}},
  "teses": [
    {{"id": "t1",
      "title": "até {LIMITS['tese_title']} caracteres, um nome para a ideia. Ex.: 'Sem novas áreas, o Brasil volta a importar petróleo'",
      "statement_plain": "até {LIMITS['statement_plain']} caracteres: a ideia como afirmação, em palavras simples, que uma pessoa comum poderia dizer que defende",
      "core_theme": "id do tema central da ideia",
      "positions": {{"d2": "favoravel", "d3": "favoravel"}},
      "claims_chave": ["b004c1", "b030c2", "b055c2", "b034c1"],
      "note": "uma frase: por que isto é uma ideia e não um setor (quem de setores diferentes a defendeu, ou quem do mesmo setor a contestou)"}}
  ],
  "glossario": [
    {{"term": "termo exatamente como aparece na transcrição (ex.: 'AAAS')",
      "plain": "até {LIMITS['glossary_plain']} caracteres: o que significa, para quem nunca ouviu",
      "fala": "b007", "sentence": 33}}
  ]
}}

Regras:
1. THEMES: entre {THEMES_MIN} e {THEMES_MAX} temas que juntos cobrem TODAS as falas substantivas. Um tema é um assunto do debate,
   nunca um orador, um papel ou uma etapa da sessão. Ordene pela primeira aparição. "axis" dá os dois polos da
   divergência; "contested" é false quando ninguém sustentou o polo "contra".
2. SPEAKERS: para TODOS os oradores listados. "mesa" é quem preside a sessão (o registro "Presidente"); "parlamentar"
   deputados e senadores; "governo" servidores e representantes do Executivo, autarquias, Ministério Público, Defensoria,
   tribunais; "sociedade_civil" associações, movimentos, conselhos, academia, sindicatos, familiares e usuários;
   "setor_privado" empresas e entidades patronais; "convidado" só se a transcrição não permitir saber.
3. KIND: "procedural" quando a fala só cumprimenta, agradece, passa a palavra, anuncia presenças, faz audiodescrição,
   testa microfone, pede ordem ou encerra; "substantive" quando expressa posição, informação, demanda, relato ou pergunta
   sobre o assunto, mesmo que curta.
4. Para cada fala "substantive": theme, summary, quote (índices CONSECUTIVOS de 1 a 4 sentenças, o trecho mais citável,
   no máximo ~{QUOTE_MAX} caracteres). Para "procedural": theme null, quote [], stance null, claims [].
5. COVERED: true se a matéria relata o conteúdo desta fala; evidence = índices das sentenças da matéria que sustentam.
   Mencionar o nome sem relatar o que disse NÃO é cobertura.
6. OPEN_QUESTION (na fala): índice da sentença em que a fala faz uma pergunta ou cobrança dirigida a outra parte que
   NINGUÉM dessa parte responde até o fim; senão null. Perguntas retóricas ou técnicas nunca contam.
7. RELATIONS: pares de falas substantivas em que a posterior ("from") se liga a uma anterior ("to"). "responde" =
   responde a pergunta ou cobrança feita antes; "apoia" = defende a mesma posição ou cita em concordância; "contradiz" =
   sustenta o contrário, nega um fato ou uma conclusão. from_sentence e to_sentence apontam as sentenças que mostram a
   ligação. Só relações que um leitor reconheceria. Cubra todas as contradições claras e as respostas e apoios explícitos.
   "from_claim" e "to_claim" são OBRIGATÓRIOS: a carta de cada lado da relação. Quando a sentença (from_sentence ou
   to_sentence) pertence a uma carta, é essa carta. Quando não pertence, indique a carta daquela fala que diz o ponto
   ligado. Use null só quando a relação é com a fala inteira e nenhuma carta daquela fala representa o ponto (o jogo
   então trata a relação como dirigida à fala).
8. CONSENSUS: dentro de um tema, grupos de 2 ou mais falas de PAPÉIS DIFERENTES que concordam numa posição concreta.
   Um por tema no máximo. "claims" é OBRIGATÓRIO e lista as cartas em que esse acordo está escrito: 2 ou mais, todas no
   tema do consenso, do mesmo lado, e cada uma de uma fala listada em "falas". É a carta que o jogo marca como consenso.
   "falas" lista as falas que concordam (de papéis diferentes), inclusive uma fala que concorda sem ter carta no tema.
   Só registre o consenso quando ele estiver escrito em ao menos duas cartas do tema.
9. Use só ids que existem na entrada. Não invente sentenças: só índices.
10. STANCE: para toda fala substantiva, a posição no eixo do tema. "condicional" quando apoia com ressalva; "neutro" só
    quando informa sem defender. "claim" é a posição como proposição, na sua voz, nunca cópia da transcrição.
11. CLAIMS: de 1 a {CLAIMS_PER_FALA_MAX} por fala substantiva. Cada uma é um argumento inteiro e autossuficiente: um trecho
    CONSECUTIVO de sentenças (1 a 3) que, lido sozinho, sustenta um ponto. As cartas de uma mesma fala não se sobrepõem.
    "type": dado (número, medição), principio (valor, direito), experiencia (relato vivido), juridico (lei, norma,
    processo), economico (custo, emprego, receita), precedente (o que já aconteceu antes). Toda sentença usada em
    from_sentence de uma relação deve pertencer a uma carta da fala "from" (indique em from_claim).
12. SEAT: "mesa" quem preside; "bancada" deputados e senadores; "debatedores" convidados à mesa de expositores;
    "remoto" quem participa por vídeo (a transcrição costuma dizer).
13. AUDIENCE: estimar quantas pessoas assistem e a composição por papel, a partir das menções da mesa a delegações e
    entidades presentes e dos registros de palmas. Sem pista: estimate 20 e confidence "baixa". As shares somam 1.
14. MESA_MOVE: para toda fala "procedural", o ato: abre, apresenta, passa_palavra, pede_conclusao, corta,
    anuncia_presenca, audiodescricao, ordem, microfone, cortesia (só cumprimenta ou agradece), encerra.
15. OPEN_QUESTIONS: lista consolidada de cobranças dirigidas a outra parte. "answered_by" = a fala (posterior, de papel
    diferente) que respondeu, ou null quando ficou sem resposta; quando null, a fala de origem tem open_question preenchido.
16. FACTS: de {FACTS_MIN} a {FACTS_MAX} afirmações com número ou data, cada uma com a sentença de origem e, em disputed_by,
    a fala E a sentença de quem a contesta (lista vazia quando ninguém contesta).
17. PRESS: que temas a matéria cobriu, que papéis citou, o ângulo escolhido e o que ficou de fora.
18. INTERRUPTED: true quando a mesa pediu que a fala concluísse ou a cortou. TONE: o registro dominante da fala.
19. PLAIN (a versão em palavras simples). Para cada carta, "plain" diz EXATAMENTE o que a pessoa disse naquele trecho,
    para alguém que nunca assistiu a uma audiência. Regras: (a) mesmo sentido, nem mais forte nem mais fraco; ironia,
    dúvida e agressividade são parte do sentido e ficam; (b) NADA acrescentado — nenhum dado, nome, causa ou conclusão
    que não esteja no trecho; (c) nada omitido que mude o sentido; (d) números, datas, nomes e siglas IDÊNTICOS ao
    original — nunca converter "dez" em "10" nem arredondar; (e) siglas e termos técnicos ganham uma explicação curta
    entre vírgulas ou parênteses na primeira ocorrência ("a AAAS, a avaliação ambiental de toda a região"); (f) na VOZ
    da pessoa (mantém "eu", "nós", o tempo verbal e a pessoa a quem fala); pergunta continua pergunta; (g) frases
    curtas, ordem direta, sem gerúndio em cadeia, sem jargão jurídico; (h) 1 ou 2 frases, de {PLAIN_MIN} a {PLAIN_MAX}
    caracteres, em geral mais curto que o original; (i) nenhum adjetivo ou juízo do analista; (j) TODA CARTA TEM
    "plain", sem exceção: o jogo nunca mostra a transcrição bruta no balão, porque a fala oral transcrita vem com
    excesso de vírgulas, frases quebradas, repetições e aspas soltas. Quando o trecho já é curto e direto, "plain"
    é uma REVISÃO leve: mesmas palavras sempre que possível, pontuação arrumada, hesitações e repetições da fala
    oral removidas, siglas em maiúsculas escritas como se escreve (Ibama, Petrobras). Quando o trecho é médio ou
    difícil (sigla sem explicação, frase com mais de ~25 palavras, termo técnico ou jurídico, ordem inversa, várias
    ideias numa frase só, referência que só quem é do meio entende), "plain" simplifica de verdade. Se for
    impossível simplificar sem perder o sentido, escreva a frase mais próxima possível do original com as siglas
    explicadas — nunca invente. (k) Nunca use ponto e vírgula: separe em duas frases.
20. GIST: a oração que completa "sustento o que disse X: que ___" e "não concordo com X quando diz que ___". Começa em
    minúscula, sem ponto final, 3ª pessoa, presente do indicativo, até {GIST_MAX} caracteres, e obedece às mesmas regras
    de fidelidade do "plain". Ex.: "a produção brasileira cai a partir de 2029 e o país pode voltar a importar petróleo".
21. POSITION POR CARTA: cada carta tem a própria posição no eixo do TEMA DELA (que pode ser diferente do tema da fala).
    "condicional" quando apoia com ressalva; "neutro" quando só informa.
22. TESES: de {TESES_MIN} a {TESES_MAX} ideias que de fato foram defendidas na audiência. Uma tese é UMA IDEIA sobre a pergunta
    central ou sobre um tema — não um setor, não uma pessoa, não um bloco. "positions" lista SÓ os temas em que a ideia
    toma lado, com "favoravel" ou "contrario" (nunca condicional/neutro); pode ser um tema só ou vários. "claims_chave"
    tem de {CLAIMS_CHAVE_MIN} a {CLAIMS_CHAVE_MAX} cartas de PELO MENOS DUAS PESSOAS DIFERENTES, e cada uma tem de estar
    num tema da tese e do lado da tese. Pelo menos duas teses da lista precisam se opor em algum tema. Prefira teses que
    CRUZAM setores (um ministério e um sindicato; um deputado e uma ONG) e teses que DIVIDEM um setor (dois órgãos do
    mesmo governo em lados opostos): é isso que o jogo quer ensinar. "title" e "statement_plain" em palavras simples;
    "statement_plain" é uma afirmação que uma pessoa comum poderia dizer que defende.
23. GLOSSÁRIO: de {GLOSSARY_MIN} a {GLOSSARY_MAX} termos que uma pessoa comum não conhece (siglas, termos técnicos, jurídicos, nomes
    de instrumentos), cada um com explicação de até {LIMITS['glossary_plain']} caracteres e a primeira ocorrência (fala e
    sentença). "term" é grafado EXATAMENTE como aparece na transcrição.
24. TEXTOS DA AUDIÊNCIA EM PALAVRAS SIMPLES: "synopsis_plain", "stakes_plain", "central_question_plain",
    "axis.pro_plain"/"contra_plain" e "open_questions[].plain" seguem as regras da 19 (fidelidade ao que está na
    audiência, sem siglas soltas, frases curtas).
25. BYLINE e ORG_PLAIN: para todo orador que não seja a mesa: "byline" é como a pessoa é referida no meio de uma frase
    ("do Ibama", "da Petrobras", "deputado federal pelo Amapá", "professor da UENF"), em minúscula, até {LIMITS['byline']}
    caracteres. "org_plain" explica a instituição para quem nunca ouviu falar dela ("órgão federal que dá ou nega
    licenças ambientais"); null só para pessoas sem instituição. Para a mesa, byline null e org_plain com a comissão.
26. MESA: para falas "procedural", "summary" (até {LIMITS['mesa_summary']} caracteres) é o texto do cartão que o jogo mostra;
    quando quem fala é a presidência, começa por "A presidência…" ou "A mesa…"; quando é outra pessoa, em 3ª pessoa
    pelo papel ("O deputado pergunta quanto tempo tem."). O original fica acessível pela referência.
27. NUNCA COPIAR: nenhum texto livre ("plain", "gist", "statement_plain", "summary", notas…) pode reproduzir
    {COPY_WINDOW} ou mais palavras consecutivas da transcrição. Reutilizar expressões curtas e números é permitido e esperado.
28. Português do Brasil em todos os textos livres. Nenhum texto livre usa ponto e vírgula (;): onde ele caberia,
    termine a frase e comece outra, ou use vírgula.
"""


def build_prompt(hid: int) -> dict:
    """The hearing as the model receives it (hearing_text.user_block) plus this system block."""
    base = user_block(hid)
    user = base["user"]
    return {
        **base,
        "system": SYSTEM,
        "prompt_sha256": hashlib.sha256((SYSTEM + "\n" + user).encode("utf-8")).hexdigest(),
    }


# ------------------------------------------------------------------ fidelity guards

_NUM_SEP = re.compile(r"(?<=\d)[.,](?=\d)")
_WORD = re.compile(r"[a-z0-9áéíóúâêôãõçàüñ]+")


def numbers(text: str) -> set[str]:
    """Digit runs after dropping thousands/decimal separators: '2.880' -> '2880', '3,5' -> '35'."""
    return set(re.findall(r"\d+", _NUM_SEP.sub("", text or "")))


def words(text: str) -> list[str]:
    return _WORD.findall((text or "").lower())


class CopyGuard:
    """Every window of COPY_WINDOW consecutive words of the transcript; free texts must not contain one."""

    def __init__(self, sentences: dict[str, list[str]], window: int = COPY_WINDOW):
        self.window = window
        self.grams: set[tuple[str, ...]] = set()
        for sents in sentences.values():
            ws = words(" ".join(sents))
            for i in range(len(ws) - window + 1):
                self.grams.add(tuple(ws[i:i + window]))

    def copied(self, text: str) -> bool:
        ws = words(text)
        return any(tuple(ws[i:i + self.window]) in self.grams for i in range(len(ws) - self.window + 1))


def _is_consecutive(idx: list[int]) -> bool:
    return idx == list(range(idx[0], idx[0] + len(idx))) if idx else True


def _text(x, what: str, errs: list[str], limit: int | None = None) -> bool:
    if not isinstance(x, str) or not x.strip():
        errs.append(f"{what} ausente")
        return False
    if limit is not None and len(x) > limit:
        errs.append(f"{what}: {len(x)} caracteres, máximo {limit}")
    return True


def _digits_ok(text: str, originals: list[str], what: str, errs: list[str]) -> None:
    extra = numbers(text) - numbers(" ".join(originals))
    if extra:
        errs.append(f"{what}: número(s) {sorted(extra)} não aparecem no trecho original")


# ------------------------------------------------------------------ validation

def validate_response(resp: dict, prompt: dict) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings); the response can be saved only when there are no errors."""
    errs: list[str] = []
    warns: list[str] = []
    counts: dict[str, int] = prompt["sentence_counts"]
    sentences: dict[str, list[str]] = prompt.get("sentences", {})
    n_art = prompt["article_sentences"]
    guard = CopyGuard(sentences) if sentences else None
    free: list[tuple[str, str]] = []  # (path, text) checked against the copy guard at the end

    def sent(fid: str, i: int) -> str:
        return sentences.get(fid, [""] * counts[fid])[i] if 0 <= i < counts[fid] else ""

    for key in ("synopsis", "stakes", "central_question"):
        if _text(resp.get(key), key, errs):
            free.append((key, resp[key]))
    for key in ("synopsis_plain", "stakes_plain", "central_question_plain"):
        if _text(resp.get(key), key, errs, LIMITS[key]):
            free.append((key, resp[key]))
    cq = resp.get("central_question_plain")
    if isinstance(cq, str) and cq.strip() and not cq.strip().endswith("?"):
        errs.append("central_question_plain deve terminar com '?'")

    themes = resp.get("themes")
    if not isinstance(themes, list) or not (THEMES_MIN <= len(themes) <= THEMES_MAX):
        errs.append(f"themes: esperado lista com {THEMES_MIN}–{THEMES_MAX} itens")
        themes = themes if isinstance(themes, list) else []
    theme_ids: set[str] = set()
    for t in themes:
        if not isinstance(t, dict):
            errs.append(f"theme inválido: {t!r}"[:160])
            continue
        for k in ("id", "name", "description"):
            _text(t.get(k), f"theme.{k}", errs)
        ax = t.get("axis")
        if not isinstance(ax, dict):
            errs.append(f"theme {t.get('id')}: axis ausente")
        else:
            for k in ("pro", "contra"):
                if _text(ax.get(k), f"theme {t.get('id')}.axis.{k}", errs):
                    free.append((f"theme {t.get('id')}.axis.{k}", ax[k]))
            for k in ("pro_plain", "contra_plain"):
                if _text(ax.get(k), f"theme {t.get('id')}.axis.{k}", errs, LIMITS["axis_plain"]):
                    free.append((f"theme {t.get('id')}.axis.{k}", ax[k]))
        if not isinstance(t.get("contested"), bool):
            errs.append(f"theme {t.get('id')}: contested deve ser true/false")
        if isinstance(t.get("id"), str):
            if t["id"] in theme_ids:
                errs.append(f"theme id repetido: {t['id']}")
            theme_ids.add(t["id"])

    speakers = resp.get("speakers")
    if not isinstance(speakers, dict):
        errs.append("speakers: esperado objeto")
        speakers = {}
    role_of_speaker: dict[str, str] = {}
    for sid in prompt["speaker_ids"]:
        sp = speakers.get(sid)
        if not isinstance(sp, dict):
            errs.append(f"speakers.{sid} ausente")
            continue
        if sp.get("role") not in ROLES:
            errs.append(f"speakers.{sid}.role inválido: {sp.get('role')!r}")
        else:
            role_of_speaker[sid] = sp["role"]
        if sp.get("seat") not in SEATS:
            errs.append(f"speakers.{sid}.seat inválido: {sp.get('seat')!r}")
        gl = sp.get("gov_level")
        if gl is not None and gl not in GOV_LEVELS:
            errs.append(f"speakers.{sid}.gov_level inválido: {gl!r}")
        if sp.get("org") is not None and not isinstance(sp.get("org"), str):
            errs.append(f"speakers.{sid}.org deve ser string ou null")
        _text(sp.get("cargo"), f"speakers.{sid}.cargo", errs)
        if sp.get("role") != "mesa":
            bl = sp.get("byline")
            if _text(bl, f"speakers.{sid}.byline", errs, LIMITS["byline"]) and not bl[0].islower():
                errs.append(f"speakers.{sid}.byline deve começar em minúscula: {bl!r}")
            op = sp.get("org_plain")
            if op is None:
                if sp.get("org") is not None:
                    errs.append(f"speakers.{sid}.org_plain ausente (o orador tem org)")
            elif _text(op, f"speakers.{sid}.org_plain", errs, LIMITS["org_plain"]):
                free.append((f"speakers.{sid}.org_plain", op))
        else:
            op = sp.get("org_plain")
            if op is not None:
                _text(op, f"speakers.{sid}.org_plain", errs, LIMITS["org_plain"])
    for sid in speakers:
        if sid not in prompt["speaker_ids"]:
            errs.append(f"speakers.{sid} não existe na entrada")

    aud = resp.get("audience")
    if not isinstance(aud, dict):
        errs.append("audience ausente")
    else:
        if not isinstance(aud.get("estimate"), int) or aud["estimate"] < 0:
            errs.append("audience.estimate deve ser inteiro >= 0")
        if aud.get("confidence") not in CONFIDENCE:
            errs.append(f"audience.confidence inválido: {aud.get('confidence')!r}")
        comp = aud.get("composition")
        if not isinstance(comp, list) or not comp:
            errs.append("audience.composition: esperado lista não vazia")
        else:
            total = 0.0
            for c in comp:
                if not isinstance(c, dict) or c.get("role") not in ROLES or not isinstance(c.get("share"), (int, float)):
                    errs.append(f"audience.composition inválida: {c!r}"[:120])
                    continue
                total += float(c["share"])
            if abs(total - 1.0) > 0.05:
                errs.append(f"audience.composition soma {total:.2f}, esperado 1.0")

    falas = resp.get("falas")
    if not isinstance(falas, list):
        errs.append("falas: esperado lista")
        falas = []
    seen: set[str] = set()
    kind_of: dict[str, str] = {}
    theme_of: dict[str, str | None] = {}
    speaker_of: dict[str, str] = {}
    claim_sents: dict[str, dict[str, list[int]]] = {}  # fala -> claim id -> sentences
    claims_index: dict[str, dict] = {}  # claim id -> {fala, speaker, theme, position}
    n_claims = 0
    for f in falas:
        if not isinstance(f, dict) or f.get("id") not in counts:
            errs.append(f"fala desconhecida: {f!r}"[:160])
            continue
        fid = f["id"]
        if fid in seen:
            errs.append(f"fala repetida: {fid}")
        seen.add(fid)
        n = counts[fid]
        kind = f.get("kind")
        if kind not in KINDS:
            errs.append(f"{fid}.kind inválido: {kind!r}")
        kind_of[fid] = str(kind)
        theme_of[fid] = f.get("theme")
        if f.get("speaker") not in prompt["speaker_ids"]:
            errs.append(f"{fid}.speaker inválido: {f.get('speaker')!r}")
        else:
            speaker_of[fid] = f["speaker"]
        if _text(f.get("summary"), f"{fid}.summary", errs):
            free.append((f"{fid}.summary", f["summary"]))
        q = f.get("quote")
        if not isinstance(q, list) or not all(isinstance(i, int) and 0 <= i < n for i in q):
            errs.append(f"{fid}.quote: índices inválidos (a fala tem {n} sentenças): {q!r}")
        elif not _is_consecutive(q):
            errs.append(f"{fid}.quote: índices não consecutivos: {q!r}")
        if not isinstance(f.get("covered"), bool):
            errs.append(f"{fid}.covered deve ser true/false")
        ev = f.get("evidence", [])
        if not isinstance(ev, list) or not all(isinstance(i, int) and 0 <= i < n_art for i in ev):
            errs.append(f"{fid}.evidence: índices inválidos (a matéria tem {n_art} sentenças): {ev!r}")
        oq = f.get("open_question")
        if oq is not None and not (isinstance(oq, int) and 0 <= oq < n):
            errs.append(f"{fid}.open_question inválido: {oq!r}")
        if not isinstance(f.get("interrupted"), bool):
            errs.append(f"{fid}.interrupted deve ser true/false")
        claims = f.get("claims", [])
        if not isinstance(claims, list):
            errs.append(f"{fid}.claims: esperado lista")
            claims = []
        if kind == "substantive":
            if f.get("theme") not in theme_ids:
                errs.append(f"{fid}.theme inválido para fala substantiva: {f.get('theme')!r}")
            if not q:
                errs.append(f"{fid}.quote vazio numa fala substantiva")
            st = f.get("stance")
            if not isinstance(st, dict):
                errs.append(f"{fid}.stance ausente")
            else:
                if st.get("position") not in POSITIONS:
                    errs.append(f"{fid}.stance.position inválido: {st.get('position')!r}")
                if _text(st.get("claim"), f"{fid}.stance.claim", errs):
                    free.append((f"{fid}.stance.claim", st["claim"]))
                if not (isinstance(st.get("sentence"), int) and 0 <= st["sentence"] < n):
                    errs.append(f"{fid}.stance.sentence inválido: {st.get('sentence')!r}")
            if f.get("tone") not in TONES:
                errs.append(f"{fid}.tone inválido: {f.get('tone')!r}")
            if f.get("mesa_move") is not None:
                errs.append(f"{fid}: fala substantiva com mesa_move")
            if not (1 <= len(claims) <= CLAIMS_PER_FALA_MAX):
                errs.append(f"{fid}.claims: esperado de 1 a {CLAIMS_PER_FALA_MAX} cartas, veio {len(claims)}")
            used: set[int] = set()
            claim_sents[fid] = {}
            for c in claims:
                if not isinstance(c, dict):
                    errs.append(f"{fid}: carta inválida {c!r}"[:120])
                    continue
                cid = c.get("id")
                if not isinstance(cid, str) or not cid.startswith(fid):
                    errs.append(f"{fid}: id de carta deve começar pelo id da fala: {cid!r}")
                    cid = f"{fid}?{len(claim_sents[fid])}"
                if cid in claim_sents[fid]:
                    errs.append(f"{fid}: carta repetida {cid}")
                cs = c.get("sentences")
                if not isinstance(cs, list) or not cs or not all(isinstance(i, int) and 0 <= i < n for i in cs):
                    errs.append(f"{cid}.sentences inválidas: {cs!r}")
                    cs = []
                elif not _is_consecutive(cs):
                    errs.append(f"{cid}.sentences não consecutivas: {cs!r}")
                elif len(cs) > 3:
                    errs.append(f"{cid}: carta com mais de 3 sentenças")
                if used & set(cs):
                    errs.append(f"{cid}: sobrepõe outra carta da mesma fala")
                used |= set(cs)
                claim_sents[fid][cid] = cs
                if c.get("type") not in CLAIM_TYPES:
                    errs.append(f"{cid}.type inválido: {c.get('type')!r}")
                if c.get("strength") not in STRENGTHS:
                    errs.append(f"{cid}.strength inválido: {c.get('strength')!r}")
                if c.get("theme") not in theme_ids:
                    errs.append(f"{cid}.theme inválido: {c.get('theme')!r}")
                if c.get("position") not in POSITIONS:
                    errs.append(f"{cid}.position inválida: {c.get('position')!r}")
                originals = [sent(fid, i) for i in cs]
                gist = c.get("gist")
                if _text(gist, f"{cid}.gist", errs, GIST_MAX):
                    free.append((f"{cid}.gist", gist))
                    if not re.match(r"^[a-záéíóúâêôãõçàü0-9]", gist):
                        errs.append(f"{cid}.gist deve começar em minúscula (completa 'que ...'): {gist[:40]!r}")
                    if gist.rstrip().endswith("."):
                        errs.append(f"{cid}.gist não termina com ponto: {gist[-30:]!r}")
                    if sentences:
                        _digits_ok(gist, originals, f"{cid}.gist", errs)
                plain = c.get("plain")
                if not isinstance(plain, str) or not plain.strip():
                    errs.append(f"{cid}.plain ausente: toda carta tem versão em palavras simples (ou revisão leve) — regra 19(j)")
                else:
                    if not (PLAIN_MIN <= len(plain) <= PLAIN_MAX):
                        errs.append(f"{cid}.plain: {len(plain)} caracteres, esperado {PLAIN_MIN}–{PLAIN_MAX}")
                    free.append((f"{cid}.plain", plain))
                    if sentences:
                        _digits_ok(plain, originals, f"{cid}.plain", errs)
                claims_index[cid] = {"fala": fid, "speaker": f.get("speaker"), "theme": c.get("theme"), "position": c.get("position")}
                n_claims += 1
        elif kind == "procedural":
            if f.get("mesa_move") not in MESA_MOVES:
                errs.append(f"{fid}.mesa_move inválido numa fala procedimental: {f.get('mesa_move')!r}")
            if claims:
                errs.append(f"{fid}: fala procedimental com cartas")
            if f.get("stance") is not None:
                errs.append(f"{fid}: fala procedimental com stance")
            summ = f.get("summary")
            if isinstance(summ, str) and summ.strip():
                if len(summ) > LIMITS["mesa_summary"]:
                    errs.append(f"{fid}.summary: {len(summ)} caracteres, máximo {LIMITS['mesa_summary']} (cartão da mesa)")
                if role_of_speaker.get(f.get("speaker", "")) == "mesa" and not (summ.startswith("A presidência") or summ.startswith("A mesa")):
                    errs.append(f"{fid}.summary da presidência deve começar por 'A presidência' ou 'A mesa': {summ[:40]!r}")
    missing = [bid for bid in prompt["fala_ids"] if bid not in seen]
    if missing:
        errs.append(f"falas ausentes: {', '.join(missing[:12])}{'…' if len(missing) > 12 else ''}")
    substantive = {fid for fid, k in kind_of.items() if k == "substantive"}
    for tid in theme_ids - {theme_of[f] for f in substantive if f in theme_of}:
        errs.append(f"theme {tid} sem nenhuma fala")
    if substantive and not (CLAIMS_TOTAL_MIN <= n_claims <= CLAIMS_TOTAL_MAX):
        errs.append(f"total de cartas {n_claims}, esperado entre {CLAIMS_TOTAL_MIN} e {CLAIMS_TOTAL_MAX}")

    def order(fid: str) -> int:
        return prompt["fala_ids"].index(fid) if fid in prompt["fala_ids"] else -1

    rels = resp.get("relations", [])
    if not isinstance(rels, list):
        errs.append("relations: esperado lista")
        rels = []
    seen_pairs: set[tuple[str, str, str]] = set()
    n_rel_unanchored = 0
    for rl in rels:
        if not isinstance(rl, dict) or rl.get("from") not in substantive or rl.get("to") not in substantive:
            errs.append(f"relation com fala inexistente ou procedimental: {rl!r}"[:160])
            continue
        a, b = rl["from"], rl["to"]
        if a == b:
            errs.append(f"relation de {a} para si mesma")
        if order(a) < order(b):
            errs.append(f"relation {a}->{b}: from deve ser posterior a to")
        if rl.get("kind") not in RELATION_KINDS:
            errs.append(f"relation {a}->{b}: kind inválido {rl.get('kind')!r}")
        for key, bid in (("from_sentence", a), ("to_sentence", b)):
            v = rl.get(key)
            if not (isinstance(v, int) and 0 <= v < counts[bid]):
                errs.append(f"relation {a}->{b}: {key} inválido ({v!r})")
        if "from_claim" not in rl:
            errs.append(f"relation {a}->{b}: from_claim ausente (obrigatório desde a v4, pode ser null)")
        if "to_claim" not in rl:
            errs.append(f"relation {a}->{b}: to_claim ausente (obrigatório desde a v4, pode ser null)")
        fc = rl.get("from_claim")
        fs = rl.get("from_sentence")
        at_from = next((cid for cid, cs in claim_sents.get(a, {}).items() if isinstance(fs, int) and fs in cs), None)
        if fc is None and at_from is not None:
            errs.append(f"relation {a}->{b}: from_sentence {fs} pertence à carta {at_from}: indique from_claim")
        if fc is not None:
            if fc not in claim_sents.get(a, {}):
                errs.append(f"relation {a}->{b}: from_claim {fc!r} não existe na fala {a}")
            elif isinstance(rl.get("from_sentence"), int) and rl["from_sentence"] not in claim_sents[a][fc]:
                errs.append(f"relation {a}->{b}: from_sentence {rl['from_sentence']} fora da carta {fc}")
        # to_claim (regra 7, v4): quando to_sentence cai numa carta, tem de ser essa carta; null só sem carta
        tc = rl.get("to_claim")
        ts = rl.get("to_sentence")
        at_to = next((cid for cid, cs in claim_sents.get(b, {}).items() if isinstance(ts, int) and ts in cs), None)
        if tc is not None:
            if tc not in claim_sents.get(b, {}):
                errs.append(f"relation {a}->{b}: to_claim {tc!r} não existe na fala {b}")
            elif at_to is not None and tc != at_to:
                errs.append(f"relation {a}->{b}: to_sentence {ts} pertence à carta {at_to}, não a {tc}")
        elif at_to is not None:
            errs.append(f"relation {a}->{b}: to_sentence {ts} pertence à carta {at_to}: indique to_claim")
        else:
            n_rel_unanchored += 1
        if rl.get("strength") not in STRENGTHS:
            errs.append(f"relation {a}->{b}: strength inválido {rl.get('strength')!r}")
        if _text(rl.get("note"), f"relation {a}->{b}.note", errs):
            free.append((f"relation {a}->{b}.note", rl["note"]))
        key3 = (a, b, str(rl.get("kind")))
        if key3 in seen_pairs:
            errs.append(f"relation repetida: {key3}")
        seen_pairs.add(key3)
    if n_rel_unanchored:
        warns.append(f"{n_rel_unanchored} relação(ões) com to_claim null: o jogo as ancora na fala inteira")

    cons = resp.get("consensus", [])
    if not isinstance(cons, list):
        errs.append("consensus: esperado lista")
        cons = []
    for c in cons:
        if not isinstance(c, dict) or c.get("theme") not in theme_ids:
            errs.append(f"consensus com theme inválido: {c!r}"[:160])
            continue
        ids = c.get("falas")
        if not isinstance(ids, list) or len(ids) < 2 or any(i not in substantive for i in ids):
            errs.append(f"consensus {c['theme']}: falas inválidas {ids!r}")
            continue
        # consenso por carta (regra 8, v4): as cartas em claims são o que o jogo marca; as falas dizem quem concorda
        cl = c.get("claims")
        if not isinstance(cl, list) or len(cl) < 2:
            errs.append(f"consensus {c['theme']}: claims obrigatório, com ao menos duas cartas")
            cl = cl if isinstance(cl, list) else []
        unknown = [x for x in cl if x not in claims_index]
        if unknown:
            errs.append(f"consensus {c['theme']}: cartas inexistentes em claims: {unknown}")
            cl = [x for x in cl if x in claims_index]
        off_c = [x for x in cl if claims_index[x]["theme"] != c["theme"]]
        if off_c:
            errs.append(f"consensus {c['theme']}: cartas de outro tema em claims: {off_c}")
        sides_c = {claims_index[x]["position"] for x in cl} & set(SIDES)
        if len(sides_c) > 1:
            errs.append(f"consensus {c['theme']}: claims mistura cartas favoráveis e contrárias")
        stray = sorted({claims_index[x]["fala"] for x in cl} - set(ids))
        if stray:
            errs.append(f"consensus {c['theme']}: cartas em claims de falas fora do grupo: {stray}")
        roles = {role_of_speaker.get(speaker_of.get(i, ""), "?") for i in ids}
        if len(roles) < 2:
            errs.append(f"consensus {c['theme']}: precisa de falas de ao menos dois papéis diferentes")
        if _text(c.get("note"), f"consensus {c['theme']}.note", errs):
            free.append((f"consensus {c['theme']}.note", c["note"]))

    oqs = resp.get("open_questions", [])
    if not isinstance(oqs, list):
        errs.append("open_questions: esperado lista")
        oqs = []
    q_ids: set[str] = set()
    for q in oqs:
        if not isinstance(q, dict) or q.get("from") not in substantive:
            errs.append(f"open_question com fala inválida: {q!r}"[:160])
            continue
        qid = q.get("id")
        if not isinstance(qid, str) or qid in q_ids:
            errs.append(f"open_question id inválido ou repetido: {qid!r}")
        q_ids.add(str(qid))
        q_sent = ""
        if not (isinstance(q.get("sentence"), int) and 0 <= q["sentence"] < counts[q["from"]]):
            errs.append(f"open_question {qid}: sentence inválida")
        else:
            q_sent = sent(q["from"], q["sentence"])
        if q.get("addressed_to") not in ADDRESSEES:
            errs.append(f"open_question {qid}: addressed_to inválido {q.get('addressed_to')!r}")
        ab = q.get("answered_by")
        if ab is not None:
            if ab not in substantive:
                errs.append(f"open_question {qid}: answered_by {ab!r} não é fala substantiva")
            else:
                if order(ab) <= order(q["from"]):
                    errs.append(f"open_question {qid}: answered_by deve ser fala posterior")
                if role_of_speaker.get(speaker_of.get(ab, "")) == role_of_speaker.get(speaker_of.get(q["from"], "")):
                    errs.append(f"open_question {qid}: answered_by deve ser de papel diferente")
        if _text(q.get("gist"), f"open_question {qid}.gist", errs):
            free.append((f"open_question {qid}.gist", q["gist"]))
        pl = q.get("plain")
        if _text(pl, f"open_question {qid}.plain", errs, LIMITS["question_plain"]):
            free.append((f"open_question {qid}.plain", pl))
            if not pl.strip().endswith("?"):
                errs.append(f"open_question {qid}.plain deve terminar com '?'")
            if sentences and q_sent:
                _digits_ok(pl, [q_sent], f"open_question {qid}.plain", errs)
        if q.get("theme") not in theme_ids:
            errs.append(f"open_question {qid}: theme inválido {q.get('theme')!r}")
        if q.get("position") not in QUESTION_POSITIONS:
            errs.append(f"open_question {qid}: position inválida {q.get('position')!r}")

    facts = resp.get("facts", [])
    if not isinstance(facts, list):
        errs.append("facts: esperado lista")
        facts = []
    if substantive and not (FACTS_MIN <= len(facts) <= FACTS_MAX):
        errs.append(f"facts: {len(facts)} itens, esperado entre {FACTS_MIN} e {FACTS_MAX}")
    f_ids: set[str] = set()
    for fc in facts:
        if not isinstance(fc, dict) or fc.get("fala") not in substantive:
            errs.append(f"fact com fala inválida: {fc!r}"[:160])
            continue
        fid = fc.get("id")
        if not isinstance(fid, str) or fid in f_ids:
            errs.append(f"fact id inválido ou repetido: {fid!r}")
        f_ids.add(str(fid))
        if not (isinstance(fc.get("sentence"), int) and 0 <= fc["sentence"] < counts[fc["fala"]]):
            errs.append(f"fact {fid}: sentence inválida")
        db = fc.get("disputed_by", [])
        if not isinstance(db, list):
            errs.append(f"fact {fid}: disputed_by deve ser lista")
        else:
            for d in db:
                if not isinstance(d, dict) or d.get("fala") not in substantive:
                    errs.append(f"fact {fid}: disputed_by com fala inválida {d!r}"[:120])
                elif not (isinstance(d.get("sentence"), int) and 0 <= d["sentence"] < counts[d["fala"]]):
                    errs.append(f"fact {fid}: disputed_by {d['fala']} com sentence inválida")
                elif d["fala"] == fc["fala"]:
                    errs.append(f"fact {fid}: disputado pela própria fala")
        if _text(fc.get("gist"), f"fact {fid}.gist", errs):
            free.append((f"fact {fid}.gist", fc["gist"]))

    press = resp.get("press")
    if not isinstance(press, dict):
        errs.append("press ausente")
    else:
        tc = press.get("themes_covered")
        if not isinstance(tc, list) or any(t not in theme_ids for t in tc):
            errs.append(f"press.themes_covered inválido: {tc!r}")
        rq = press.get("roles_quoted")
        if not isinstance(rq, list) or any(r not in ROLES for r in rq):
            errs.append(f"press.roles_quoted inválido: {rq!r}")
        for k in ("angle", "omitted"):
            if _text(press.get(k), f"press.{k}", errs):
                free.append((f"press.{k}", press[k]))

    # ---- teses (spec §4.3 regra 22, §4.4)
    teses = resp.get("teses")
    if not isinstance(teses, list) or not (TESES_MIN <= len(teses) <= TESES_MAX):
        errs.append(f"teses: esperado lista com {TESES_MIN}–{TESES_MAX} itens")
        teses = teses if isinstance(teses, list) else []
    tese_ids: set[str] = set()
    tese_positions: dict[str, dict[str, str]] = {}
    for t in teses:
        if not isinstance(t, dict):
            errs.append(f"tese inválida: {t!r}"[:120])
            continue
        tid = t.get("id")
        if not isinstance(tid, str) or tid in tese_ids:
            errs.append(f"tese id inválido ou repetido: {tid!r}")
        tese_ids.add(str(tid))
        if _text(t.get("title"), f"tese {tid}.title", errs, LIMITS["tese_title"]):
            free.append((f"tese {tid}.title", t["title"]))
        if _text(t.get("statement_plain"), f"tese {tid}.statement_plain", errs, LIMITS["statement_plain"]):
            free.append((f"tese {tid}.statement_plain", t["statement_plain"]))
        if _text(t.get("note"), f"tese {tid}.note", errs):
            free.append((f"tese {tid}.note", t["note"]))
        pos = t.get("positions")
        if not isinstance(pos, dict) or not pos:
            errs.append(f"tese {tid}: positions deve ser objeto não vazio")
            pos = {}
        for th, side in pos.items():
            if th not in theme_ids:
                errs.append(f"tese {tid}: positions com tema inexistente {th!r}")
            if side not in SIDES:
                errs.append(f"tese {tid}: positions[{th}] deve ser favoravel|contrario, veio {side!r}")
        tese_positions[str(tid)] = pos
        if t.get("core_theme") not in pos:
            errs.append(f"tese {tid}: core_theme {t.get('core_theme')!r} não está em positions")
        ck = t.get("claims_chave")
        if not isinstance(ck, list) or not (CLAIMS_CHAVE_MIN <= len(ck) <= CLAIMS_CHAVE_MAX):
            errs.append(f"tese {tid}: claims_chave deve ter de {CLAIMS_CHAVE_MIN} a {CLAIMS_CHAVE_MAX} cartas")
            ck = ck if isinstance(ck, list) else []
        spk: set[str] = set()
        rls: set[str] = set()
        for cid in ck:
            info = claims_index.get(cid)
            if info is None:
                errs.append(f"tese {tid}: carta-chave {cid!r} não existe")
                continue
            spk.add(str(info["speaker"]))
            rls.add(role_of_speaker.get(str(info["speaker"]), "?"))
            if info["theme"] not in pos:
                errs.append(f"tese {tid}: carta-chave {cid} está no tema {info['theme']}, fora dos temas da tese")
            elif info["position"] != pos[info["theme"]]:
                errs.append(f"tese {tid}: carta-chave {cid} está do lado {info['position']!r}, a tese é {pos[info['theme']]!r} em {info['theme']}")
        if ck and len(spk) < 2:
            errs.append(f"tese {tid}: claims_chave de um só orador ({', '.join(sorted(spk))}); precisa de ao menos dois")
        elif ck and len(rls) < 2:
            warns.append(f"tese {tid}: todas as cartas-chave vêm de um só papel ({rls.pop()}); a tese pode ser um bloco disfarçado")
    if len(tese_positions) >= 2:
        opposed = any(
            a != b and any(pa.get(th) != pb.get(th) for th in pa if th in pb)
            for a, pa in tese_positions.items() for b, pb in tese_positions.items()
        )
        if not opposed:
            errs.append("teses: nenhum par de teses se opõe em algum tema")
    if claims_index and tese_positions:
        neutral = sum(
            1 for info in claims_index.values()
            if all(info["theme"] not in pos or info["position"] in ("condicional", "neutro") for pos in tese_positions.values())
        )
        if neutral / len(claims_index) > NEUTRAL_CARDS_WARN:
            warns.append(f"{neutral} de {len(claims_index)} cartas ({neutral / len(claims_index):.0%}) são neutras em relação a todas as teses")

    # ---- glossário (regra 23)
    glos = resp.get("glossario")
    if not isinstance(glos, list) or not (GLOSSARY_MIN <= len(glos) <= GLOSSARY_MAX):
        errs.append(f"glossario: esperado lista com {GLOSSARY_MIN}–{GLOSSARY_MAX} itens")
        glos = glos if isinstance(glos, list) else []
    seen_terms: set[str] = set()
    for g in glos:
        if not isinstance(g, dict):
            errs.append(f"glossário inválido: {g!r}"[:120])
            continue
        term = g.get("term")
        if not _text(term, "glossario.term", errs):
            continue
        if term.lower() in seen_terms:
            errs.append(f"glossário: termo repetido {term!r}")
        seen_terms.add(term.lower())
        if _text(g.get("plain"), f"glossario[{term}].plain", errs, LIMITS["glossary_plain"]):
            free.append((f"glossario[{term}].plain", g["plain"]))
        fid = g.get("fala")
        if fid not in counts:
            errs.append(f"glossário {term!r}: fala {fid!r} inexistente")
        elif not (isinstance(g.get("sentence"), int) and 0 <= g["sentence"] < counts[fid]):
            errs.append(f"glossário {term!r}: sentence inválida")
        elif sentences and term.lower() not in sent(fid, g["sentence"]).lower():
            errs.append(f"glossário {term!r}: não aparece em {fid}.{g['sentence']}")

    # ---- guarda de cópia (regra 27) e ponto e vírgula (regra 28), sobre todo texto livre
    for path, text in free:
        if guard and guard.copied(text):
            errs.append(f"{path}: reproduz {COPY_WINDOW} ou mais palavras consecutivas da transcrição")
        if ";" in text:
            errs.append(f"{path}: usa ponto e vírgula; separe em duas frases (regra 28)")
    return errs, warns


# ------------------------------------------------------------------ save / load

SAVED_KEYS = ("synopsis", "stakes", "central_question", "synopsis_plain", "stakes_plain", "central_question_plain",
              "themes", "speakers", "audience", "falas", "relations", "consensus", "open_questions", "facts", "press",
              "teses", "glossario")
LIST_KEYS = ("relations", "consensus", "open_questions", "facts")


def save(prompt: dict, resp: dict, model: str, review: dict | None = None) -> Path:
    errs, warns = validate_response(resp, prompt)
    if errs:
        raise SystemExit("resposta inválida:\n  " + "\n  ".join(errs))
    for w in warns:
        print(f"  aviso: {w}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"hearing-{prompt['id']:03d}.json"
    doc = {
        "version": VERSION, "id": prompt["id"], "model": model,
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prompt_sha256": prompt["prompt_sha256"], "sentences_hash": prompt["sentences_hash"],
        "review": review, "warnings": warns,
    }
    for key in SAVED_KEYS:
        doc[key] = resp.get(key, []) if key in LIST_KEYS else resp[key]
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def load_annotations(hid: int) -> dict | None:
    p = OUT_DIR / f"hearing-{hid:03d}.json"
    if not p.exists():
        return None
    doc = json.loads(p.read_text(encoding="utf-8"))
    if doc.get("version") != VERSION:
        raise SystemExit(f"{p.relative_to(ROOT).as_posix()}: versão {doc.get('version')!r} não suportada "
                         f"(esperado {VERSION}); anote de novo: uv run src/sim/annotate_sim.py {hid} --dump-prompt")
    return doc


# ------------------------------------------------------------------ API

def call_anthropic(prompt: dict, model: str) -> tuple[dict, str]:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY não definida. Alternativas:\n"
                         f"  uv run src/sim/annotate_sim.py {prompt['id']} --dump-prompt   (gera o prompt para rodar em outro lugar)\n"
                         f"  uv run src/sim/annotate_sim.py {prompt['id']} --import resp.json")
    try:
        import anthropic
    except ImportError as e:  # pragma: no cover
        raise SystemExit("pacote anthropic ausente: uv add anthropic") from e
    client = anthropic.Anthropic()
    parts: list[str] = []
    with client.messages.stream(model=model, max_tokens=32000, temperature=0, system=prompt["system"],
                                messages=[{"role": "user", "content": prompt["user"]}]) as stream:
        for text in stream.text_stream:
            parts.append(text)
        final = stream.get_final_message()
    return parse_json("".join(parts)), f"{final.model} (API, temperature=0)"


def estimate_tokens(prompt: dict) -> int:
    # ~3.6 characters per token for Portuguese prose; good enough to size a batch
    return int((len(prompt["system"]) + len(prompt["user"])) / 3.6)


# ------------------------------------------------------------------ CLI

def main(argv: list[str]) -> None:
    model = argv[argv.index("--model") + 1] if "--model" in argv else DEFAULT_MODEL
    import_path = Path(argv[argv.index("--import") + 1]) if "--import" in argv else None
    ids = all_ids() if "--all" in argv else ([int(a) for a in argv if a.isdigit()] or [44])

    if "--estimate" in argv:
        tot_in = 0
        for hid in ids:
            try:
                p = build_prompt(hid)
            except SystemExit as e:
                print(f"audiência {hid}: {e}")
                continue
            tot_in += estimate_tokens(p)
        out_tokens = 12000 * len(ids)
        print(f"{len(ids)} audiências · ~{tot_in:,} tokens de entrada · ~{out_tokens:,} de saída")
        print(f"a US$ 3/M entrada e US$ 15/M saída: ~US$ {tot_in / 1e6 * 3 + out_tokens / 1e6 * 15:.2f}")
        return

    for hid in ids:
        if "--all" in argv and (OUT_DIR / f"hearing-{hid:03d}.json").exists():
            continue
        try:
            prompt = build_prompt(hid)
        except SystemExit as e:
            print(f"audiência {hid}: {e}")
            continue
        if "--dump-prompt" in argv:
            PROMPT_DIR.mkdir(parents=True, exist_ok=True)
            (PROMPT_DIR / f"hearing-{hid:03d}.system.md").write_text(prompt["system"], encoding="utf-8")
            (PROMPT_DIR / f"hearing-{hid:03d}.user.md").write_text(prompt["user"], encoding="utf-8")
            (PROMPT_DIR / f"hearing-{hid:03d}.meta.json").write_text(
                json.dumps({k: v for k, v in prompt.items() if k not in ("system", "user", "sentences")}, ensure_ascii=False, indent=1),
                encoding="utf-8")
            print(f"prompt da audiência {hid}: {len(prompt['system'])} + {len(prompt['user'])} caracteres "
                  f"(~{estimate_tokens(prompt):,} tokens), {len(prompt['fala_ids'])} falas")
            print(f"  -> {(PROMPT_DIR / f'hearing-{hid:03d}.user.md').relative_to(ROOT).as_posix()}  (sha256 {prompt['prompt_sha256'][:12]})")
            continue
        review = None
        if import_path:
            resp = parse_json(import_path.read_text(encoding="utf-8"))
            label = resp.pop("_model", None) or f"importado de {import_path.name}"
            review = resp.pop("_review", None)
        else:
            resp, label = call_anthropic(prompt, model)
        out = save(prompt, resp, label, review)
        n_sub = sum(1 for f in resp["falas"] if f["kind"] == "substantive")
        cards = [c for f in resp["falas"] for c in f.get("claims", [])]
        print(f"audiência {hid}: {len(resp['themes'])} temas, {n_sub}/{len(resp['falas'])} falas substantivas, "
              f"{len(cards)} cartas, todas em palavras simples, {len(resp.get('relations', []))} relações, "
              f"{len(resp.get('consensus', []))} consensos, {len(resp.get('open_questions', []))} cobranças, "
              f"{len(resp.get('facts', []))} fatos, {len(resp['teses'])} teses, {len(resp['glossario'])} termos no glossário")
        print(f"  -> {out.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main(sys.argv[1:])
