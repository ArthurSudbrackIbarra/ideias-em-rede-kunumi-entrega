"""Regras e parâmetros do jogo (Seções 4, 5.5 e 5.6 do artigo).

Reproduz as regras que o artigo descreve (caderno, atenção, vez de falar, apartes, tréplica, a Tabela 4 e os
bônus da coerência) a partir das constantes do motor, lidas na hora de web/src/sim/engine/balance.ts, e confere em
judge.ts e run.ts que cada constante é aplicada no caso que o artigo descreve. Nas 100 cenas construídas
(web/public/hearings/hearing-NNN.json) conta as vezes de falar, a participação por vídeo, a plateia e as palmas.
Confere ainda as cores da plateia, os rótulos da interface, as bibliotecas e os testes citados na Seção 5.6.

Lê: web/src/sim/engine/{balance,judge,rules,run}.ts, web/src/sim/copy.ts, web/src/sim/lib/hearing.ts,
web/src/sim/scene/{Audience.tsx,layout.ts}, web/src/sim/store/useSim.ts, web/src/sim/ui/{Balloon,RelationBadge}.tsx,
src/sim/build_scene.py, as cenas, web/package.json, web/vite.config.ts, web/playwright.config.ts, os arquivos de
teste, .python-version, pyproject.toml e .github/workflows/deploy.yml.
"""
from __future__ import annotations

import colorsys
import json
import math
import re
import statistics
import subprocess
import sys
import tomllib
from collections import Counter
from functools import lru_cache

from common import ROOT, Numero, fmt_dec, fmt_num, fmt_pct, main, scenes
from sim.build_scene import FLOOR_SLOTS, MOVES_PER_FLOOR  # src/ entra no sys.path com o import de common

TITULO = "Regras e parâmetros do jogo (Seções 4, 5.5 e 5.6)"

BALANCE = "web/src/sim/engine/balance.ts"
JUDGE = "web/src/sim/engine/judge.ts"
RULES = "web/src/sim/engine/rules.ts"
RUN = "web/src/sim/engine/run.ts"
COPY = "web/src/sim/copy.ts"
HEARING_TS = "web/src/sim/lib/hearing.ts"
AUDIENCE = "web/src/sim/scene/Audience.tsx"
LAYOUT = "web/src/sim/scene/layout.ts"
USESIM = "web/src/sim/store/useSim.ts"
BALLOON = "web/src/sim/ui/Balloon.tsx"
BADGE = "web/src/sim/ui/RelationBadge.tsx"
BUILD_SCENE = "src/sim/build_scene.py"
CENAS = "web/public/hearings/hearing-*.json"

# Tabela 4: a constante de balance.ts que judge() soma para cada movimento e alinhamento da carta com a ideia
# (ramos `move === 'sustento'` e `move === 'contesto'` de web/src/sim/engine/judge.ts); _tabela_4 confere cada par
# contra o código.
DELTA = {
    "sustentar": {"aliada": "COERENTE", "adversária": "CONTRADICAO", "consenso": "CONSENSO", "ressalva": "RESSALVA",
                  "evidência": "EVIDENCIA", "contraevidência": "EVIDENCIA_CONTRA", "fora do eixo": "NEUTRO"},
    "contestar": {"aliada": "CONTRADICAO", "adversária": "COERENTE", "consenso": "CONSENSO_CONTESTADO",
                  "ressalva": "RESSALVA", "evidência": "EVIDENCIA_CONTRA", "contraevidência": "EVIDENCIA",
                  "fora do eixo": "NEUTRO"},
}
# a Tabela 4 como o artigo a imprime, linha a linha, nas colunas de DELTA
TABELA_4 = {"sustentar": ["+8", "-12", "+5", "+4", "+6", "-6", "+2"],
            "contestar": ["-12", "+8", "-6", "+4", "-6", "+6", "+2"]}
MOVIMENTO = {"sustentar": "sustento", "contestar": "contesto", "cobrar": "cobro"}  # nome no artigo -> MoveKind
ALINHAMENTO = {"aliada": "aliada", "adversária": "adversaria", "consenso": "consenso", "ressalva": "ressalva",
               "evidência": "evidencia", "contraevidência": "contraevidencia", "fora do eixo": "fora"}  # -> Align

# Seção 5.5, cobrar uma pergunta: (o caso no artigo, a condição que judge() testa, a constante, o valor no artigo).
# Condição None é o caso que sobra no fim do ramo.
COBRAR = [
    ("quando ela pressiona a favor da ideia (carta aliada)", "a === 'aliada'", "COBRO", "+6"),
    ("quando ela pressiona o lado oposto (carta adversária)", "a === 'adversaria'", "COBRO_CONTRA", "-8"),
    ("nos demais casos", None, "COBRO_NEUTRO", "+3"),
    ("quando a resposta real já tocou na sessão", "ctx.spoken(answer.fala)", "COBRO_JA_RESPONDIDA", "-6"),
]

# Figuras 6 e 7a: a intervenção da partida da Seção 4 (audiência 44, ideia 2) contesta a carta de Carlos Agenor
# citando a de Suely Araújo; são as cartas da relação da Listagem 1
EXEMPLO = {"audiencia": 44, "tese": "t2", "contestada": "b007c2", "citada": "b011c2"}

SETORES = ("parlamentar", "governo", "sociedade_civil", "setor_privado")  # os quatro que o artigo cita na plateia
MATIZ = {"vermelho": (-15, 20), "amarelo": (40, 70), "verde": (90, 170), "azul": (190, 250)}  # faixas, em graus HSV
SATURACAO_CINZA = 0.25

CLAMP = r"function clamp\(v: number, lo = (-?\d+), hi = (-?\d+)\)"  # run.ts: limita coerência, atenção e paciência

_EXTENSO = ("zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze")


# ------------------------------------------------------------------ leitura do código-fonte

@lru_cache(maxsize=None)
def _texto(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def _literal_ts(bruto: str):
    """Um literal simples de TypeScript: número, lista de números ou, no resto, o texto cru."""
    bruto = bruto.split("//")[0].replace("as const", "").strip()
    if re.fullmatch(r"-?\d+(?:\.\d+)?", bruto):
        return float(bruto) if "." in bruto else int(bruto)
    if bruto.startswith("[") and bruto.endswith("]"):
        return [_literal_ts(x) for x in bruto[1:-1].split(",")]
    return bruto


@lru_cache(maxsize=None)
def balance() -> dict:
    """As constantes `export const NOME = valor` de balance.ts."""
    pares = re.findall(r"^export const (\w+)[^=\n]*=\s*(.+)$", _texto(BALANCE), re.M)
    return {nome: _literal_ts(bruto) for nome, bruto in pares}


def _bloco(rel: str, abertura: str) -> tuple[int, str]:
    """(posição, texto) do que está entre a primeira `{` depois da regex `abertura` e a `}` que a fecha."""
    txt = _texto(rel)
    m = re.search(abertura, txt, re.M)
    if not m:
        return 0, ""
    ini = txt.index("{", m.start())
    nivel = 0
    for i in range(ini, len(txt)):
        nivel += {"{": 1, "}": -1}.get(txt[i], 0)
        if nivel == 0:
            return ini + 1, txt[ini + 1:i]
    return 0, ""


def _textos(trecho: str) -> dict[str, str]:
    """Os pares `chave: 'texto'` de um trecho de TypeScript (vale o primeiro de cada chave)."""
    out: dict[str, str] = {}
    for chave, valor in re.findall(r"(\w+): '([^']*)'", trecho):
        out.setdefault(chave, valor)
    return out


def _linha(rel: str, padrao: str) -> str | None:
    """'arquivo:linha' da primeira linha de `rel` que casa com a regex `padrao`, ou None."""
    for i, linha in enumerate(_texto(rel).splitlines(), start=1):
        if re.search(padrao, linha):
            return f"{rel}:{i}"
    return None


def _no_judge(move: str, condicao: str | None, padrao: str) -> tuple[str | None, str]:
    """O que judge() faz no ramo `move === '<move>'` quando `condicao` vale, e em que linha.

    Devolve o primeiro casamento de `padrao` depois do texto `condicao`; sem condição, ou se o ramo não a testa,
    o último casamento do ramo, que é o caso que sobra. O bônus da citação (`if (cite)`) fica de fora.
    """
    ini, ramo = _bloco(JUDGE, rf"if \(move === '{move}' &&")
    ramo = ramo.split("if (cite)")[0]
    achados = [(m.start(), m.group(1)) for m in re.finditer(padrao, ramo)]
    pos = ramo.find(condicao) if condicao else -1
    escolha = next((a for a in achados if a[0] > pos), None) if pos >= 0 else (achados[-1] if achados else None)
    if escolha is None:
        return None, JUDGE
    return escolha[1], f"{JUDGE}:{_texto(JUDGE).count(chr(10), 0, ini + escolha[0]) + 1}"


def _delta_no_judge(move: str, condicao: str | None) -> tuple[str | None, str]:
    """A constante B.X que judge() soma ao movimento nesse caso."""
    return _no_judge(move, condicao, r"delta(?::| =) B\.(\w+)")


def _clamp() -> tuple[int, int] | None:
    """(lo, hi) padrão de clamp() em run.ts, ou None se a função mudou."""
    m = re.search(CLAMP, _texto(RUN))
    return (int(m.group(1)), int(m.group(2))) if m else None


# ------------------------------------------------------------------ formatação

def _extenso(n: float, feminino: bool = False) -> str:
    """Inteiro pequeno por extenso, como o artigo escreve ('sete', 'duas'); fora disso, o número."""
    if not float(n).is_integer() or not 0 <= n < len(_EXTENSO):
        return fmt_num(n)
    if feminino and n in (1, 2):
        return ("uma", "duas")[int(n) - 1]
    return _EXTENSO[int(n)]


def _sinal(x: float) -> str:
    """8 -> '+8', -12 -> '-12'."""
    return ("+" if x > 0 else "") + fmt_num(x)


def _vezes(x: float) -> str:
    """0.25 -> '0,25×', 2 -> '2×'."""
    return f"{x:g}".replace(".", ",") + "×"


def _lista(itens: list[str], conjuncao: str = "e") -> str:
    """['a', 'b', 'c'] -> 'a, b e c'."""
    return itens[0] if len(itens) == 1 else ", ".join(itens[:-1]) + f" {conjuncao} " + itens[-1]


def _cor(hexa: str) -> tuple[str, str]:
    """Nome da cor pela matiz HSV ('#3a6ea5' -> 'azul'; saturação baixa é 'cinza') e a conta ('211°, sat. 0,44')."""
    r, g, b = (int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, s, _v = colorsys.rgb_to_hsv(r, g, b)
    graus = 360 * h
    conta = f"{graus:.0f}°, sat. {fmt_dec(s, 2)}"
    if s < SATURACAO_CINZA:
        return "cinza", conta
    nome = next((n for n, (a, z) in MATIZ.items() if a <= graus < z or a <= graus - 360 < z), f"matiz {graus:.0f}°")
    return nome, conta


def _regra(onde: str, descricao: str, artigo: str, valor: str, usos: list[tuple[str, str]], exato: str = "",
           fontes: tuple[str, ...] = (BALANCE,)) -> Numero:
    """Um número de regra: `usos` lista (arquivo, regex) das linhas que aplicam a regra como o artigo descreve.

    A linha achada vai para a fonte; se alguma sumir do código, o valor ganha a marca e deixa de conferir.
    """
    achados = [_linha(rel, padrao) for rel, padrao in usos]
    faltam = [f"{rel} /{padrao}/" for (rel, padrao), a in zip(usos, achados) if a is None]
    if faltam:
        valor += f" (uso não encontrado: {'; '.join(faltam)})"
    return Numero(onde, descricao, artigo, valor, exato, "; ".join([*fontes, *(a for a in achados if a)]))


# ------------------------------------------------------------------ Introdução e Seção 4

def _caderno(bal: dict) -> Numero:
    return _regra(
        "Introdução; Seção 4.4",
        "espaços do caderno: HAND_MAX de balance.ts; run.ts recusa anotar quando a mão já tem HAND_MAX cartas",
        "sete", _extenso(bal["HAND_MAX"]), [(RUN, r"s\.hand\.length >= B\.HAND_MAX")], exato=f"{bal['HAND_MAX']}")


def _sala() -> list[Numero]:
    """Seção 4.2: participação por vídeo, tamanho e cores da plateia, palmas."""
    cenas = scenes()
    total = len(cenas)
    remotas = [h for h, d in sorted(cenas.items()) if any(m["remote"] for m in d["cast"])]
    plateia = [d["audience"]["estimate"] for d in cenas.values()]
    palmas = {h: sum(1 for e in d["timeline"] if e["kind"] == "fala" and e["applause"] > 0) for h, d in cenas.items()}

    cor_papel = _textos(_bloco(HEARING_TS, r"^export const ROLE_COLOR\b")[1])
    rotulo = {p: r.lower() for p, r in _textos(_bloco(HEARING_TS, r"^export const ROLE_LABEL\b")[1]).items()}

    # quem está de fato na plateia: a composição de cada cena, completada por Audience.tsx com o papel de
    # preenchimento até audience.estimate (layout.ts põe um boneco por unidade)
    pessoas, audiencias, com_outros, excede = Counter(), Counter(), 0, []
    preenche = re.search(r"roles\.push\('(\w+)'\)", _texto(AUDIENCE))
    for h, d in sorted(cenas.items()):
        comp = Counter()
        for c in d["audience"]["composition"]:
            comp[c["role"]] += c["count"]
        falta = d["audience"]["estimate"] - comp.total()
        if falta < 0:
            excede.append(h)  # Audience.tsx embaralharia e cortaria na estimativa: a contagem por papel não valeria
        elif falta > 0 and preenche:
            comp[preenche.group(1)] += falta
        comp = +comp  # sem papéis zerados
        pessoas.update(comp)
        audiencias.update(comp.keys())
        com_outros += any(p not in SETORES for p in comp)
    ordem = [p for p in (*SETORES, *(q for q in cor_papel if q not in SETORES)) if pessoas[p] > 0]
    vestem = _lista([f"{_cor(cor_papel[p])[0]} ({rotulo[p]})" for p in ordem], "ou")
    if excede:
        vestem += f" (composição maior que a plateia nas audiências {excede})"
    matizes = "; ".join(f"{p} {cor_papel[p]} = {_cor(cor_papel[p])[1]}" for p in ordem)
    fora = {p: n for p, n in sorted(pessoas.items()) if p not in SETORES}
    resumo_fora = ", ".join(f"{p} {n} (em {audiencias[p]} audiências)" for p, n in fora.items())
    if fora:
        resumo_fora = f"{sum(fora.values())} de {fmt_num(pessoas.total())} pessoas, em {com_outros} audiências: " \
                      + resumo_fora

    return [
        Numero("Seção 4.2", "cenas construídas com ao menos um orador de cast[].remote = true (participação por vídeo)",
               "80 das 100", f"{len(remotas)} das {total}", fonte=CENAS),
        _regra("Seção 4.2", "mínimo e máximo de audience.estimate nas cenas; layout.ts põe um boneco por unidade",
               "de 15 a 175", f"de {min(plateia)} a {max(plateia)}", [(LAYOUT, r"const n = h\.audience\.estimate")],
               fontes=(CENAS,)),
        Numero("Seção 4.2", "mediana de audience.estimate nas cenas construídas", "30",
               fmt_num(statistics.median(plateia)), exato=f"média {fmt_dec(statistics.mean(plateia), 2)}",
               fonte=CENAS),
        _regra("Seção 4.2",
               "cor de cada pessoa da plateia: ROLE_COLOR[papel] (hearing.ts, aplicada em Audience.tsx), para todo "
               "papel com pessoas na plateia das cenas (audience.composition, completada por Audience.tsx até "
               "audience.estimate); cor nomeada pela matiz HSV: vermelho < 20° ou ≥ 345°, amarelo 40–70°, verde "
               "90–170°, azul 190–250° (saturação < 0,25 é cinza); rótulo de ROLE_LABEL. Confere só se nenhum papel "
               "além dos quatro setores aparece",
               "azul (parlamentar), vermelho (governo), verde (sociedade civil) ou amarelo (setor privado)", vestem,
               [(AUDIENCE, r"color=\{ROLE_COLOR\[role\]\}"), (AUDIENCE, r"roles\.push\('\w+'\)")],
               exato=f"{matizes}; pessoas por papel: "
                     + ", ".join(f"{p} {n}" for p, n in pessoas.most_common())
                     + f"; fora dos quatro setores: {resumo_fora or 'nenhuma'}",
               fontes=(CENAS, HEARING_TS)),
        _regra("Seção 4.2", "eventos 'fala' (falas substantivas) das cenas com applause > 0; run.ts passa as palmas à "
               "última página da fala", "336", fmt_num(sum(palmas.values())),
               [(RUN, r"applause: last \? ev\.applause : 0")], fontes=(CENAS,)),
        Numero("Seção 4.2", "cenas com ao menos uma fala substantiva com applause > 0", "51",
               fmt_num(sum(1 for n in palmas.values() if n > 0)), fonte=CENAS),
    ]


def _leitura(bal: dict) -> list[Numero]:
    """Seção 4.3: velocidades de digitação."""
    velocidades = bal["SPEEDS"]
    padrao = velocidades[bal["DEFAULT_SPEED_INDEX"]]
    return [
        _regra("Seção 4.3", "menor e maior multiplicador de SPEEDS (balance.ts), que o balão passa à digitação",
               "0,25× a 2×", f"{_vezes(min(velocidades))} a {_vezes(max(velocidades))}",
               [(BALLOON, r"speed=\{speedFactor\(speed\)\}")], exato=f"SPEEDS = {velocidades}"),
        _regra("Seção 4.3", "velocidade padrão: SPEEDS[DEFAULT_SPEED_INDEX]", "0,5×", _vezes(padrao),
               [(USESIM, r"v === null \? DEFAULT_SPEED_INDEX")],
               exato=f"SPEEDS[{bal['DEFAULT_SPEED_INDEX']}] = {padrao}"),
    ]


def _atencao(bal: dict) -> list[Numero]:
    """Seção 4.4: o mínimo de atenção para anotar e quanto tempo de distração leva até ele."""
    faixa = _clamp()
    maxima = faixa[1] if faixa else bal["START_ATTENTION"]  # sem o clamp, a linha não confere (ok abaixo)
    segundos = (maxima - bal["ATTENTION_MIN_TO_NOTE"]) / bal["ATTENTION_LOSS"]
    queda = _linha(RUN, r"clamp\(s\.attention - B\.ATTENTION_LOSS \* dt\)")
    return [
        _regra("Seção 4.4", "atenção mínima para anotar: ATTENTION_MIN_TO_NOTE; run.ts recusa anotar abaixo dela",
               "25", fmt_num(bal["ATTENTION_MIN_TO_NOTE"]), [(RUN, r"s\.attention < B\.ATTENTION_MIN_TO_NOTE")]),
        Numero("Seção 4.4",
               "(atenção máxima − ATTENTION_MIN_TO_NOTE) / ATTENTION_LOSS, com a máxima = hi de clamp() em run.ts, que "
               "limita a atenção: segundos olhando para outro lado até a atenção cair do máximo ao mínimo para anotar; "
               "confere se está a até 0,5 s de 12",
               "cerca de doze segundos", f"{fmt_dec(segundos, 1)} segundos",
               exato=f"({maxima} − {bal['ATTENTION_MIN_TO_NOTE']}) / {bal['ATTENTION_LOSS']} por segundo = "
                     f"{str(segundos).replace('.', ',')} s exatos, no limite do critério de ±0,5 s; a atenção começa "
                     f"em START_ATTENTION = {bal['START_ATTENTION']}",
               fonte=f"{BALANCE}; {_linha(RUN, CLAMP)}; {queda}",
               ok=faixa is not None and queda is not None and abs(segundos - 12) <= 0.5),
    ]


def _vezes_esperadas(n: int) -> list[tuple[int, int]]:
    """(slot, falas substantivas antes) das vezes intermediárias de uma audiência com n falas, pela regra de
    build_scene.py: depois da fala ⌈f·n⌉, travada entre a 3ª e a penúltima; frações que caem na mesma fala ficam
    com a primeira."""
    vezes: dict[int, int] = {}
    for k, f in enumerate(FLOOR_SLOTS, start=1):
        vezes.setdefault(min(n - 1, max(3, math.ceil(f * n))), k)
    return sorted((k, antes) for antes, k in vezes.items())


def _vez_de_falar(bal: dict) -> list[Numero]:
    """Seção 4.5: quando o jogador recebe a palavra, quantos movimentos faz e os apartes."""
    cenas = scenes()
    total = len(cenas)
    por_cena, no_ponto, intermediarias, travadas, fora_da_regra, no_fim = {}, 0, 0, [], [], 0
    for h, d in sorted(cenas.items()):
        tl = d["timeline"]
        falas = [e["id"] for e in tl if e["kind"] == "fala"]
        n = len(falas)
        vezes = [(i, e) for i, e in enumerate(tl) if e["kind"] == "floor"]
        por_cena[h] = len(vezes)
        # (slot, quantas falas substantivas já passaram) de cada vez intermediária, contra ⌈fração · n⌉
        reais = [(e["slot"], sum(1 for x in tl[:i] if x["kind"] == "fala"))
                 for i, e in vezes if e["slot"] <= len(FLOOR_SLOTS)]
        intermediarias += len(reais)
        for k, antes in reais:
            alvo = math.ceil(FLOOR_SLOTS[k - 1] * n)
            no_ponto += antes == alvo
            if antes != alvo:
                travadas.append(f"audiência {h}, vez {k}: depois de {antes} de {n} falas (⌈f·n⌉ = {alvo})")
        sumidas = sorted(set(range(1, len(FLOOR_SLOTS) + 1)) - {k for k, _ in reais})
        travadas += [f"audiência {h}, vez {k}: cai na fala de outra vez e não existe" for k in sumidas]
        if reais != _vezes_esperadas(n):
            fora_da_regra.append(h)
        ultima = vezes[-1][1]
        no_fim += (ultima["slot"] == len(FLOOR_SLOTS) + 1 and ultima["after"] == falas[-1]
                   and vezes[-1][0] == len(tl) - 2 and tl[-1]["kind"] == "close")
    contagem = Counter(por_cena.values())
    moda, n_moda = contagem.most_common(1)[0]
    outras = [f"audiência {h}: {n}" for h, n in por_cena.items() if n != moda]

    por_vez = {d["player"]["moves_per_floor"] for d in cenas.values()}
    if por_vez == {MOVES_PER_FLOOR} == {bal["MOVES_PER_FLOOR"]}:
        movimentos = _extenso(MOVES_PER_FLOOR)
    else:
        movimentos = f"{sorted(por_vez)} nas cenas, {MOVES_PER_FLOOR} em build_scene.py, {bal['MOVES_PER_FLOOR']} " \
                     "em balance.ts"
    breve = re.search(r"low \? (\d+) :", _texto(RUN))
    vez_final = _linha(BUILD_SCENE, r'"slot": len\(FLOOR_SLOTS\) \+ 1')
    trava = _linha(BUILD_SCENE, r"pos = min\(n_sub - 2, max\(2, math\.ceil\(frac \* n_sub\) - 1\)\)")

    return [
        Numero("Seção 4.5", "FLOOR_SLOTS de build_scene.py: frações das falas substantivas depois das quais a cadeira "
               "vaga recebe a palavra; confere nas cenas que cada vez intermediária vem depois de ⌈f·n⌉ falas ou, nas "
               "audiências curtas, na trava de build_scene.py (entre a 3ª e a penúltima fala)",
               "30%, 60% e 85%", _lista([fmt_pct(f, 0) for f in FLOOR_SLOTS])
               + (f" (audiências fora da regra de build_scene.py: {fora_da_regra})" if fora_da_regra else ""),
               exato=f"FLOOR_SLOTS = {FLOOR_SLOTS}; nas cenas, {no_ponto} de {intermediarias} vezes intermediárias "
                     f"vêm logo depois de ⌈f·n⌉ falas; pela trava: {'; '.join(travadas) or 'nenhuma'}; fora da "
                     f"regra: {len(fora_da_regra)} audiências",
               fonte=f"{_linha(BUILD_SCENE, r'^FLOOR_SLOTS =')}; {trava}; {CENAS}"),
        Numero("Seção 4.5", "cenas cuja última vez de falar (slot len(FLOOR_SLOTS) + 1) vem depois da última fala "
               "substantiva, logo antes do encerramento", "ao fim da sessão",
               "ao fim da sessão" if no_fim == total else f"ao fim da sessão em {no_fim} das {total}",
               exato=f"{no_fim} das {total} cenas",
               fonte=f"{vez_final}; {CENAS}"),
        Numero("Seção 4.5", "número mais comum de eventos 'floor' por cena, e em quantas cenas ele ocorre",
               "quatro vezes em 99 das 100 audiências",
               f"{_extenso(moda, feminino=True)} vezes em {n_moda} das {total} audiências",
               exato="; ".join(outras) or "todas iguais", fonte=CENAS),
        _regra("Seção 4.5", "movimentos por vez de falar: player.moves_per_floor das cenas (que run.ts usa), igual a "
               "MOVES_PER_FLOOR de build_scene.py e de balance.ts", "dois", movimentos,
               [(RUN, r"Math\.max\(1, h\.player\.moves_per_floor\)")],
               exato=f"cenas {sorted(por_vez)}; build_scene.py {MOVES_PER_FLOOR}; balance.ts {bal['MOVES_PER_FLOOR']}",
               fontes=(CENAS, BUILD_SCENE, BALANCE)),
        _regra("Seção 4.5", "movimentos quando a coerência está baixa: o literal de `low ? N :` em grantFloor (run.ts)",
               "um", _extenso(int(breve.group(1))) if breve else "não encontrado", [(RUN, r"low \? \d+ :")],
               fontes=()),
        _regra("Seção 4.5", "limite de coerência baixa: LOW_CONVICTION (low = conviction < LOW_CONVICTION)", "30",
               fmt_num(bal["LOW_CONVICTION"]), [(RUN, r"const low = s\.conviction < B\.LOW_CONVICTION")]),
        _regra("Seção 4.5", "apartes por sessão: MAX_INTERJECTS; run.ts recusa o pedido quando já foram usados todos",
               "duas", _extenso(bal["MAX_INTERJECTS"], feminino=True),
               [(RUN, r"s\.interjectsUsed >= B\.MAX_INTERJECTS")]),
        _regra("Seção 4.5", "paciência mínima para pedir aparte: LOW_PATIENCE, testada em run.ts antes do sorteio",
               "30", fmt_num(bal["LOW_PATIENCE"]), [(RUN, r"s\.mesaPatience < B\.LOW_PATIENCE")]),
        _regra("Seção 4.5", "movimentos de um aparte concedido: MOVES_PER_INTERJECT", "um",
               _extenso(bal["MOVES_PER_INTERJECT"]), [(RUN, r"movesLeft: B\.MOVES_PER_INTERJECT")]),
    ]


def _alinhamento(tese: dict, carta: dict) -> str | None:
    """A primeira regra da Equação 2 (align, em judge.ts): carta favorável ou contrária num tema em que a ideia
    toma lado. As outras regras não são necessárias aqui (None)."""
    lado = tese["positions"].get(carta["theme"])
    if lado is None or carta["position"] not in ("favoravel", "contrario"):
        return None
    return "aliada" if carta["position"] == lado else "adversária"


def _contradiz(a: dict, b: dict) -> bool:
    """Há relação `contradiz` entre as duas cartas, em qualquer direção (edgeBetween, em judge.ts)."""
    def aponta(x: dict, y: dict) -> bool:
        return any(r["kind"] == "contradiz" and r["fala"] == y["fala"] and r["card"] in (None, y["id"])
                   for r in x["triggers"] + x["asserts"])
    return aponta(a, b) or aponta(b, a)


def _maior_recompensa(bal: dict) -> Numero:
    """Seção 4.6: o maior ganho de coerência num movimento vem de contestar com β_cert (a réplica certeira)."""
    com_cert = {f"contestar {a} + β_cert": bal[c] + bal["CERTEIRO"] for a, c in DELTA["contestar"].items()}
    sem_cert = {f"{m} {a}": bal[c] for m, linha in DELTA.items() for a, c in linha.items()}
    sem_cert["sustentar aliada + β_bloco"] = bal[DELTA["sustentar"]["aliada"]] + bal["ALEM_DO_BLOCO"]
    sem_cert |= {f"cobrar ({c})": bal[c] for _caso, _condicao, c, _artigo in COBRAR}
    melhor = max(com_cert, key=com_cert.get)
    rival = max(sem_cert, key=sem_cert.get)
    artigo = "A maior recompensa vem da réplica certeira"
    return _regra(
        "Seção 4.6",
        "maior variação de coerência num movimento: δ(m, α) da Tabela 4 mais os bônus de judge.ts (β_cert ao contestar "
        "citando carta com relação contradiz, β_bloco ao sustentar aliada de outro papel) e as quatro cobranças; "
        "confere se o máximo com β_cert supera todo movimento sem ele",
        artigo, artigo if com_cert[melhor] > sem_cert[rival] else f"A maior recompensa vem de {rival}",
        [(JUDGE, r"delta \+= B\.CERTEIRO"), (JUDGE, r"B\.COERENTE \+ \(alem \? B\.ALEM_DO_BLOCO : 0\)"),
         (RULES, r"if \(contradictsEdge\(c, target\)\) return c")],
        exato=f"{melhor} = {_sinal(com_cert[melhor])}; maior sem β_cert: {rival} = {_sinal(sem_cert[rival])}; a "
              f"tréplica, que cita uma anotação que contradiz a réplica (rules.ts) e por isso também é certeira, soma "
              f"TREPLICA: {_sinal(com_cert[melhor] + bal['TREPLICA'])}")


def _veredito(bal: dict) -> list[Numero]:
    """Figura 7 e Seção 4.6: os vereditos da figura, a etiqueta da réplica e a janela da tréplica."""
    rotulos = _textos(_bloco(COPY, r"^\s*verdict: \{")[1])
    rel = _textos(_bloco(COPY, r"^\s*rel: \{")[1])

    d = scenes()[EXEMPLO["audiencia"]]
    deck = {c["id"]: c for c in d["deck"]}
    nome = {m["id"]: m["name"] for m in d["cast"]}
    tese = next(t for t in d["teses"] if t["id"] == EXEMPLO["tese"])
    alvo, citada = deck[EXEMPLO["contestada"]], deck[EXEMPLO["citada"]]
    alin = _alinhamento(tese, alvo)
    certeira = _contradiz(alvo, citada)
    if alin is None:
        figura_a = "a carta contestada não é aliada nem adversária"
    else:
        delta = bal[DELTA["contestar"][alin]] + (bal["CERTEIRO"] if certeira else 0)
        figura_a = f"{rotulos['certeiro'] if certeira else 'sem réplica certeira'}, {_sinal(delta)}"
    tipo_b, linha_b = _no_judge("contesto", "a === 'aliada'", r"kind(?::| =) '(\w+)'")

    return [
        _maior_recompensa(bal),
        _regra("Figura 7a",
               f"audiência {EXEMPLO['audiencia']}, ideia {EXEMPLO['tese']}: contestar {alvo['id']} citando "
               f"{citada['id']} soma δ(contestar, alinhamento) + β_cert (CERTEIRO) quando há relação contradiz entre "
               "as cartas; rótulo do veredito certeiro em copy.ts",
               "Réplica certeira, +14", figura_a, [(JUDGE, r"delta \+= B\.CERTEIRO"), (JUDGE, r"kind = 'certeiro'")],
               exato=f"{nome[alvo['speaker']]}: {alvo['theme']} {alvo['position']}, a ideia é "
                     f"{tese['positions'].get(alvo['theme'])} em {alvo['theme']} → {alin}; "
                     f"{nome[citada['speaker']]} ({citada['id']}) contradiz {alvo['id']}: "
                     f"{'sim' if certeira else 'não'}; "
                     f"{DELTA['contestar'].get(alin)} + CERTEIRO",
               fontes=(BALANCE, CENAS, COPY)),
        Numero("Figura 7b", "rótulo (copy.ts) do veredito que judge.ts dá a contestar uma carta aliada, e δ(contestar, "
               "aliada)", '"Você se contradisse", -12',
               f'"{rotulos.get(tipo_b, tipo_b)}", {_sinal(bal[DELTA["contestar"]["aliada"]])}',
               exato=f"kind = '{tipo_b}'; {DELTA['contestar']['aliada']} = {bal[DELTA['contestar']['aliada']]}",
               fonte=f"{BALANCE}; {linha_b}; {COPY}"),
        _regra("Figura 7c; Seção 4.6", "etiqueta da réplica de quem contradisse o jogador: copy.rel.contradiz + "
               "copy.rel.you, montada em RelationBadge.tsx", "Contradiz você", f"{rel['contradiz']} {rel['you']}",
               [(BADGE, r"\$\{who\} \$\{copy\.rel\.you\}")], fontes=(COPY,)),
        _regra("Seção 4.6", "segundos em que o botão de tréplica fica disponível: TREPLICA_WINDOW_S; run.ts tira a "
               "oferta quando o relógio da sessão passa do prazo", "seis", _extenso(bal["TREPLICA_WINDOW_S"]),
               [(RUN, r"until: out\.clock \+ B\.TREPLICA_WINDOW_S"), (RUN, r"treplicaOffer\.until < clock")]),
    ]


# ------------------------------------------------------------------ Seção 5.5 e Tabela 4

def _valor_conferido(bal: dict, nome: str, usado: str | None) -> str:
    """O valor da constante `nome`, marcado quando judge.ts usa outra constante naquele caso."""
    valor = _sinal(bal[nome])
    return valor if usado == nome else f"{valor} (judge.ts usa {usado})"


def _coerencia(bal: dict) -> list[Numero]:
    """Seção 5.5: os bônus, a cobrança, a tréplica e os limites da coerência."""
    faixa = _clamp()
    nums = [
        _regra("Seção 5.5", "β_cert: CERTEIRO, somado por judge.ts quando há relação contradiz entre a carta "
               "contestada e a citada", "β_cert = 6", f"β_cert = {fmt_num(bal['CERTEIRO'])}",
               [(JUDGE, r"edgeBetween\(card, cite, \['contradiz'\]\)"), (JUDGE, r"delta \+= B\.CERTEIRO")]),
        _regra("Seção 5.5", "β_bloco: ALEM_DO_BLOCO, somado por judge.ts ao sustentar carta aliada de papel diferente "
               "do papel que mais defendeu a ideia", "β_bloco = 3", f"β_bloco = {fmt_num(bal['ALEM_DO_BLOCO'])}",
               [(JUDGE, r"card\.role !== majorityRole\(tese\)"), (JUDGE, r"alem \? B\.ALEM_DO_BLOCO : 0")]),
    ]
    for caso, condicao, constante, artigo in COBRAR:
        usado, linha = _delta_no_judge(MOVIMENTO["cobrar"], condicao)
        nums.append(Numero("Seção 5.5", f"cobrar uma pergunta {caso}: {constante}, conferida no ramo cobro de judge.ts",
                           artigo, _valor_conferido(bal, constante, usado), exato=f"{constante} = {bal[constante]}",
                           fonte=f"{BALANCE}; {linha}"))
    nums += [
        _regra("Seção 5.5", "bônus da tréplica: TREPLICA, que run.ts soma só quando o veredito prévio é coerente ou "
               "certeiro", "+5", _sinal(bal["TREPLICA"]),
               [(RUN, r"pre\.kind === 'coerente' \|\| pre\.kind === 'certeiro'\) \? B\.TREPLICA : 0")]),
        _regra("Seção 5.5", "coerência inicial: START_CONVICTION, em createRun (run.ts)", "50",
               fmt_num(bal["START_CONVICTION"]), [(RUN, r"conviction: B\.START_CONVICTION")]),
        _regra("Seção 5.5", "limites da coerência: lo e hi de clamp() em run.ts, aplicado a cada variação",
               "entre 0 e 100", f"entre {faixa[0]} e {faixa[1]}" if faixa else "clamp não encontrado",
               [(RUN, CLAMP), (RUN, r"conviction: clamp\(out\.conviction \+ d\.value\)")], fontes=()),
    ]
    return nums


def _tabela_4(bal: dict) -> list[Numero]:
    """Tabela 4: δ(m, α), com cada constante conferida no ramo do movimento em judge.ts."""
    nums = []
    for movimento, linha_tabela in DELTA.items():
        for (alinhamento, constante), artigo in zip(linha_tabela.items(), TABELA_4[movimento]):
            usado, linha = _delta_no_judge(MOVIMENTO[movimento], f"a === '{ALINHAMENTO[alinhamento]}'")
            nums.append(Numero("Tabela 4", f"δ({movimento}, {alinhamento}): {constante} de balance.ts, a constante que "
                               f"judge.ts soma no ramo {MOVIMENTO[movimento]} quando align() devolve "
                               f"'{ALINHAMENTO[alinhamento]}'",
                               artigo, _valor_conferido(bal, constante, usado), exato=f"{constante} = {bal[constante]}",
                               fonte=f"{BALANCE}; {linha}"))
    return nums


# ------------------------------------------------------------------ Seção 5.6

def _pacote(pkg: dict, npm: str, nome: str) -> Numero:
    versao = {**pkg["dependencies"], **pkg["devDependencies"]}.get(npm)
    return Numero("Seção 5.6", f"o pacote {npm} está nas dependências de web/package.json", nome,
                  nome if versao else f"{nome} ausente", exato=f"{npm} {versao}", fonte="web/package.json")


def _vitest() -> tuple[int, list[str]]:
    """Chamadas it(...)/test(...) nos arquivos que o vitest roda (o `include` de web/vite.config.ts)."""
    include = re.search(r"include: \[([^\]]*)\]", _texto("web/vite.config.ts")).group(1)
    arquivos = sorted({p for padrao in re.findall(r"'([^']+)'", include) for p in (ROOT / "web").glob(padrao)})
    n = sum(len(re.findall(r"^\s*(?:it|test)(?:\.(?:only|skip|each\(.*?\)))?\(", p.read_text(encoding="utf-8"), re.M))
            for p in arquivos)
    return n, [p.relative_to(ROOT).as_posix() for p in arquivos]


def _pytest() -> tuple[int | None, str]:
    """Testes que o pytest coleta. Só sem o pytest instalado conta as funções `def test_` em tests/; qualquer outra
    falha (erro de coleta, saída inesperada) devolve None, e a linha deixa de conferir."""
    try:
        r = subprocess.run([sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider"],
                           cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    except (OSError, subprocess.SubprocessError) as e:
        return None, f"pytest não rodou: {e}"
    m = re.search(r"^(\d+) tests? collected in ", r.stdout, re.M)
    if r.returncode == 0 and m:
        return int(m.group(1)), f"pytest --collect-only -q: {m.group(1)} tests collected"
    if "No module named pytest" in r.stderr:
        n = sum(len(re.findall(r"^\s*def test_", p.read_text(encoding="utf-8"), re.M))
                for p in sorted((ROOT / "tests").rglob("test_*.py")))
        return n, "contagem de `def test_` em tests/ (pytest não instalado)"
    ultima = ((r.stdout + r.stderr).strip().splitlines() or ["sem saída"])[-1]
    return None, f"pytest --collect-only falhou (código {r.returncode}): {ultima}"


def _playwright() -> tuple[list[str], list[str]]:
    """O texto de cada chamada test(...) (sem test.describe, test.setTimeout etc.) nos .spec.ts do testDir do
    Playwright, até a próxima chamada ou o fim do arquivo; e os arquivos."""
    pasta = re.search(r"testDir: '([^']+)'", _texto("web/playwright.config.ts")).group(1)
    arquivos = sorted((ROOT / "web" / pasta).rglob("*.spec.ts"))
    corpos = []
    for p in arquivos:
        txt = p.read_text(encoding="utf-8")
        inicios = [m.end(1) for m in re.finditer(r"^([ \t]*)test(?:\.(?:only|skip))?\(", txt, re.M)]
        corpos += [txt[a:b] for a, b in zip(inicios, [*inicios[1:], len(txt)])]
    return corpos, [p.relative_to(ROOT).as_posix() for p in arquivos]


def _titulo_teste(corpo: str) -> str:
    """O nome de um test(...) do Playwright, encurtado."""
    m = re.match(r"test(?:\.\w+)?\(\s*(['\"`])(.*?)\1", corpo)
    nome = m.group(2) if m else corpo.splitlines()[0]
    return nome if len(nome) <= 50 else nome[:49] + "…"


def _implementacao() -> list[Numero]:
    pkg = json.loads(_texto("web/package.json"))
    react = re.search(r"\d+", pkg["dependencies"]["react"]).group(0)
    python = _texto(".python-version").strip()
    sdk = [d for d in tomllib.loads(_texto("pyproject.toml"))["project"]["dependencies"] if d.startswith("anthropic")]
    pages = re.search(r"actions/deploy-pages@\S+", _texto(".github/workflows/deploy.yml"))
    n_vitest, arq_vitest = _vitest()
    n_pytest, como_pytest = _pytest()
    corpos, arq_e2e = _playwright()
    n_e2e = len(corpos)
    # jogar a partida inteira = o teste chega à ata, que só aparece no fim da sessão
    ata = [(_titulo_teste(c), "getByTestId('ata')" in c) for c in corpos]
    n_ata = sum(a for _t, a in ata)
    inteiras = "jogam partidas inteiras no navegador" if n_ata == n_e2e else \
        f"{_extenso(n_ata)} de {_extenso(n_e2e)} {'chega' if n_ata == 1 else 'chegam'} à ata"
    return [
        Numero("Seção 5.6", "o workflow de publicação usa actions/deploy-pages", "GitHub Pages",
               "GitHub Pages" if pages else "sem deploy-pages", exato=pages.group(0) if pages else "",
               fonte=".github/workflows/deploy.yml"),
        Numero("Seção 5.6", "versão principal do pacote react em web/package.json", "React 19", f"React {react}",
               exato=pkg["dependencies"]["react"], fonte="web/package.json"),
        _pacote(pkg, "typescript", "TypeScript"),
        _pacote(pkg, "three", "Three.js"),
        _pacote(pkg, "@react-three/fiber", "React Three Fiber"),
        _pacote(pkg, "zustand", "Zustand"),
        Numero("Seção 5.6", "versão do Python fixada em .python-version (a que o uv usa)", "Python 3.13",
               f"Python {python}", fonte=".python-version"),
        Numero("Seção 5.6", "o pacote anthropic está nas dependências de pyproject.toml", "SDK da Anthropic",
               "SDK da Anthropic" if sdk else "SDK ausente", exato=", ".join(sdk), fonte="pyproject.toml"),
        Numero("Seção 5.6", "chamadas it(...)/test(...) nos arquivos do include do vitest (web/vite.config.ts)", "31",
               fmt_num(n_vitest), exato=", ".join(arq_vitest), fonte="; ".join(["web/vite.config.ts", *arq_vitest])),
        Numero("Seção 5.6", "testes que o pytest coleta em tests/", "34",
               fmt_num(n_pytest) if n_pytest is not None else "coleta falhou", exato=como_pytest,
               fonte="tests/; pyproject.toml"),
        Numero("Seção 5.6", "chamadas test(...) nos .spec.ts do testDir do Playwright (web/playwright.config.ts)",
               "dois", _extenso(n_e2e), exato=f"{n_e2e} em {', '.join(arq_e2e)}",
               fonte="; ".join(["web/playwright.config.ts", *arq_e2e])),
        Numero("Seção 5.6", "testes Playwright que jogam uma partida inteira: o corpo do test(...) espera a ata "
               "(getByTestId('ata')), que só aparece no fim da sessão; confere se são todos os contados acima",
               "jogam partidas inteiras no navegador", inteiras,
               exato="; ".join(f"'{t}': {'chega à ata' if a else 'não chega à ata'}" for t, a in ata),
               fonte="; ".join(arq_e2e)),
    ]


def numeros() -> list[Numero]:
    bal = balance()
    return [
        _caderno(bal),
        *_sala(),
        *_leitura(bal),
        *_atencao(bal),
        *_vez_de_falar(bal),
        *_veredito(bal),
        *_coerencia(bal),
        *_tabela_4(bal),
        *_implementacao(),
    ]


if __name__ == "__main__":
    main(TITULO, numeros)
