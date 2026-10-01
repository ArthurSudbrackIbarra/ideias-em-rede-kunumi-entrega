"""A matéria da Agência Câmara e o jogo (Resumo, Introdução, Seções 3 e 6.2, Tabelas 3 e 5, Conclusão).

Reproduz a cobertura das matérias segundo a anotação (falas substantivas relatadas, temas tratados, papéis
citados), o que o jogo dá para ler em cada audiência (páginas, palavras em linguagem simples, cartões da mesa,
original a um clique), o tempo dessa leitura na velocidade padrão e a conferência de que o jogo apresenta todas
as falas substantivas, todos os temas e todos os papéis, com cada trecho ligado às sentenças de origem.

Lê:
- data/sim/hearing-NNN.json (anotação: falas[].kind e covered, press, speakers, themes);
- web/public/hearings/hearing-NNN.json (o arquivo jogável: timeline, deck, cast);
- web/public/hearings/catalog.json (palavras da transcrição, igual a len(transcricao.split()));
- data/publichearingbr/PublicHearingBR_LDS.jsonl (a matéria);
- as sentenças de cada fala, divididas por src/sim/hearing_text.py;
- o código do jogo, para o tempo de leitura: web/src/sim/engine/balance.ts, ui/Typewriter.tsx, SimPage.tsx e
  copy.ts (as constantes são lidas desses arquivos a cada execução).

Palavras. Os percentuais de palavras relativos à transcrição (Tabela 5, Seção 6.2) e as vezes o tamanho da matéria
são razões entre médias (média de palavras de A / média de palavras de B), como a Tabela 5 os imprime ao lado das
médias; a média das razões por audiência fica no campo exato, para comparação.

Tempo de leitura. Simula a partida com os padrões de balance.ts (velocidade f = SPEEDS[DEFAULT_SPEED_INDEX],
avanço automático, texto em palavras simples; o script recusa outros padrões) e percorre a timeline sem que o
jogador aja: as vezes do jogador (eventos "floor") e as reações aos seus movimentos ficam de fora, assim como o
prelúdio, a escolha da ideia e a ata. O tempo soma as páginas de fala e os cartões da mesa e o encerramento; o campo
exato mostra as duas parcelas.
- O texto de uma página é plain ?? original.text (engine/run.ts); cartões da mesa e o encerramento digitam o
  texto do evento; o encerramento sem texto vira a linha de sistema copy.mesa.encerrada.
- Typewriter.tsx digita TYPE_CPS·f caracteres por segundo. Depois de cada caractere das condições de pausa
  (. ? ! … : e , ;) espera a pausa correspondente (SENTENCE_PAUSE_MS ou COMMA_PAUSE_MS) dividida por f. A pausa do
  último caractere não acontece: no quadro seguinte o texto está completo e a linha termina.
- Terminada a digitação, SimPage.tsx espera e avança: página de fala, (READ_PAUSE_MS + min(READ_PAUSE_MAX_MS,
  caracteres·READ_PAUSE_PER_CHAR_MS) + palmas)/f, com as palmas só na última página de uma fala que as registra;
  cartão da mesa e encerramento com texto, MESA_CARD_MS/f; linha de sistema, a espera de sistema/f.
O modelo usa tempo contínuo e ignora a granularidade dos quadros de requestAnimationFrame (a ~60 quadros por
segundo, cada pausa termina na virada de um quadro, o que alonga a partida em poucos segundos).

    uv run analysis/cobertura.py
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from functools import lru_cache

from common import (ROOT, Numero, annotations, built_ids, catalog, falas, fmt_dec, fmt_int, fmt_pct, lds, main,
                    scenes, words)

TITULO = "A matéria da Agência Câmara e o jogo (Seções 3 e 6.2, Tabelas 3 e 5)"

ANN_SRC = "data/sim/hearing-NNN.json"
WEB_SRC = "web/public/hearings/hearing-NNN.json"
CAT_SRC = "web/public/hearings/catalog.json"
LDS_SRC = "data/publichearingbr/PublicHearingBR_LDS.jsonl"
TXT_SRC = "src/sim/hearing_text.py"
SIM_DIR = ROOT / "web" / "src" / "sim"
RITMO_SRC = "web/src/sim/engine/balance.ts; web/src/sim/ui/Typewriter.tsx; web/src/sim/SimPage.tsx; web/src/sim/copy.ts"

REF = re.compile(r"^(b\d{3})\.(\d+)(?:-(\d+))?$")  # bNNN.i ou bNNN.i-j: fala e sentenças de origem
TIPOS = {"fala", "mesa", "floor", "close"}  # os tipos de evento da timeline; "floor" é a vez do jogador


# ------------------------------------------------------------------ o que cada audiência tem

def media(valores: list[float]) -> float:
    return sum(valores) / len(valores)


def timeline(h: int, *tipos: str) -> list[dict]:
    return [e for e in scenes()[h]["timeline"] if e["kind"] in tipos]


def paginas(h: int) -> list[dict]:
    """As páginas de leitura: as páginas de todas as falas da timeline."""
    return [p for e in timeline(h, "fala") for p in e["pages"]]


def texto_da_pagina(p: dict) -> str:
    """O que o balão digita no modo padrão: p.plain ?? p.original.text (engine/run.ts)."""
    return p["plain"] if p["plain"] is not None else p["original"]["text"]


def encerramento_com_texto(e: dict) -> bool:
    """O encerramento vira cartão da mesa quando tem texto, orador e original (engine/run.ts)."""
    return bool(e["text"] and e["speaker"] and e["original"])


def substantivas(h: int) -> list[dict]:
    return [f for f in annotations()[h]["falas"] if f["kind"] == "substantive"]


def temas(h: int) -> set[str]:
    return {t["id"] for t in annotations()[h]["themes"]}


def papeis(h: int) -> set[str]:
    """Os papéis presentes entre os oradores da audiência (mesa, parlamentar, governo, sociedade civil...)."""
    return {sp["role"] for sp in annotations()[h]["speakers"].values()}


# ------------------------------------------------------------------ o que a matéria relata (pela anotação)

def materia_falas(h: int) -> tuple[int, int]:
    """(falas substantivas com covered = true, falas substantivas)."""
    sub = substantivas(h)
    return sum(1 for f in sub if f["covered"]), len(sub)


def materia_temas(h: int) -> tuple[int, int]:
    return len(set(annotations()[h]["press"]["themes_covered"]) & temas(h)), len(temas(h))


def materia_papeis(h: int) -> tuple[int, int]:
    return len(set(annotations()[h]["press"]["roles_quoted"]) & papeis(h)), len(papeis(h))


# ------------------------------------------------------------------ o que o jogo apresenta (pelo arquivo jogável)

def jogo_falas(h: int) -> tuple[int, int]:
    """(falas substantivas que viram fala com páginas na timeline, falas substantivas)."""
    lidas = {e["id"] for e in timeline(h, "fala") if e["pages"]}
    sub = {f["id"] for f in substantivas(h)}
    return len(sub & lidas), len(sub)


def jogo_temas(h: int) -> tuple[int, int]:
    """(temas com ao menos uma página lida, temas): o tema de uma página é o da carta que ela mostra."""
    deck = {c["id"]: c for c in scenes()[h]["deck"]}
    lidos = {deck[p["card"]]["theme"] for p in paginas(h)}
    return len(temas(h) & lidos), len(temas(h))


def mostra_texto(e: dict) -> bool:
    """O evento põe texto de um orador na tela: fala com páginas, cartão da mesa ou encerramento com texto."""
    if e["kind"] == "fala":
        return bool(e["pages"])
    return e["kind"] == "mesa" or encerramento_com_texto(e)


def jogo_papeis(h: int) -> tuple[int, int]:
    """(papéis com ao menos uma linha na timeline, por página de fala ou cartão da mesa, papéis presentes)."""
    papel = {m["id"]: m["role"] for m in scenes()[h]["cast"]}
    falam = {papel[e["speaker"]] for e in timeline(h, "fala", "mesa", "close") if mostra_texto(e) and e["speaker"]}
    return len(papeis(h) & falam), len(papeis(h))


def trecho_ligado(h: int, original: dict) -> bool:
    """O ref aponta para sentenças que existem na fala e o texto do original é o começo delas.

    O original pode vir cortado em QUOTE_MAX caracteres, terminando em '…' (build_scene.truncate)."""
    m = REF.match(original["ref"] or "")
    fala = falas(h).get(m[1]) if m else None
    if fala is None:
        return False
    i, j = int(m[2]), int(m[3] or m[2])
    if not 0 <= i <= j < len(fala["sentences"]):
        return False
    origem = " ".join(" ".join(fala["sentences"][i:j + 1]).split())
    texto = " ".join(original["text"].split()).removesuffix("…").rstrip(" ,;:")
    return bool(texto) and origem.startswith(texto)


def trechos(h: int) -> list[dict]:
    """Os originais que o jogo mostra: de cada página, de cada cartão da mesa e do encerramento."""
    out = [p["original"] for p in paginas(h)]
    out += [e["original"] for e in timeline(h, "mesa")]
    out += [e["original"] for e in timeline(h, "close") if encerramento_com_texto(e)]
    return out


# ------------------------------------------------------------------ o ritmo do jogo, lido do código

@dataclass(frozen=True)
class Ritmo:
    f: float                    # fator de velocidade padrão
    cps: float                  # caracteres por segundo a 1×
    pausas: dict[str, float]    # caractere -> pausa em segundos a 1×
    leitura: float              # pausa de leitura fixa, em segundos
    leitura_por_char: float
    leitura_max: float
    palmas: float
    mesa: float
    sistema: float
    encerrada: str              # a linha de sistema do encerramento sem texto
    texto_padrao: str
    autoplay: str


def ts_const(fonte: str, nome: str) -> str:
    """O valor de `export const NOME = ...` num arquivo TypeScript, sem o comentário de fim de linha."""
    m = re.search(rf"export const {nome}\b[^=]*=\s*(.+)", fonte)
    return m[1].split("//")[0].strip()


@lru_cache(maxsize=None)
def ritmo() -> Ritmo:
    balance = (SIM_DIR / "engine" / "balance.ts").read_text(encoding="utf-8")
    typewriter = (SIM_DIR / "ui" / "Typewriter.tsx").read_text(encoding="utf-8")
    simpage = (SIM_DIR / "SimPage.tsx").read_text(encoding="utf-8")
    copy = (SIM_DIR / "copy.ts").read_text(encoding="utf-8")

    def ms(nome: str) -> float:
        return float(ts_const(balance, nome)) / 1000

    speeds = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", ts_const(balance, "SPEEDS"))]
    # Typewriter.tsx: if (ch === '.' || ...) { pause.current = SENTENCE_PAUSE_MS ...
    pausas = {ch: ms(const)
              for cond, const in re.findall(r"if \(([^{]*)\) \{\s*pause\.current = (\w+)", typewriter)
              for ch in re.findall(r"ch === '(.)'", cond)}
    r = Ritmo(
        f=speeds[int(ts_const(balance, "DEFAULT_SPEED_INDEX"))],
        cps=float(ts_const(balance, "TYPE_CPS")),
        pausas=pausas,
        leitura=ms("READ_PAUSE_MS"),
        leitura_por_char=ms("READ_PAUSE_PER_CHAR_MS"),
        leitura_max=ms("READ_PAUSE_MAX_MS"),
        palmas=float(re.search(r"current\.applause > 0 \? (\d+) : 0", simpage)[1]) / 1000,
        mesa=ms("MESA_CARD_MS"),
        sistema=float(re.search(r"current\.kind === 'system'\) ms = (\d+)", simpage)[1]) / 1000,
        encerrada=re.search(r"encerrada: '([^']*)'", copy)[1],
        texto_padrao=ts_const(balance, "TEXT_MODE_DEFAULT").strip("'"),
        autoplay=ts_const(balance, "AUTOPLAY_DEFAULT"),
    )
    # tempo_de_leitura simula só o modo padrão: avanço automático e balão em palavras simples
    if (r.texto_padrao, r.autoplay) != ("plain", "true"):
        raise RuntimeError(f"padrões do jogo mudaram (TEXT_MODE_DEFAULT = {r.texto_padrao}, "
                           f"AUTOPLAY_DEFAULT = {r.autoplay}): o modelo de tempo de leitura precisa ser revisto")
    return r


def digitacao(texto: str, r: Ritmo) -> float:
    """Segundos para digitar o texto: caracteres a TYPE_CPS·f e as pausas de pontuação, menos a do último caractere."""
    pausas = sum(r.pausas.get(ch, 0.0) for ch in texto[:-1])
    return (len(texto) / r.cps + pausas) / r.f


def tempo_de_leitura(h: int, r: Ritmo) -> tuple[float, float]:
    """Segundos de avanço automático da audiência h, das linhas que não são do jogador:
    (páginas de fala, cartões da mesa e encerramento)."""
    desconhecidos = {e["kind"] for e in scenes()[h]["timeline"]} - TIPOS
    if desconhecidos:
        raise RuntimeError(f"hearing-{h:03d}: tipos de evento fora do modelo de tempo: {sorted(desconhecidos)}")
    pags = cartoes = 0.0
    for e in timeline(h, "fala", "mesa", "close"):
        if e["kind"] == "fala":
            for i, p in enumerate(e["pages"]):
                texto = texto_da_pagina(p)
                palmas = r.palmas if e["applause"] > 0 and i == len(e["pages"]) - 1 else 0.0
                leitura = r.leitura + min(r.leitura_max, len(texto) * r.leitura_por_char)
                pags += digitacao(texto, r) + (leitura + palmas) / r.f
        elif e["kind"] == "mesa" or encerramento_com_texto(e):
            cartoes += digitacao(e["text"], r) + r.mesa / r.f
        else:
            cartoes += digitacao(r.encerrada, r) + r.sistema / r.f
    return pags, cartoes


# ------------------------------------------------------------------ auxiliares de formatação

def soma(pares: list[tuple[int, int]]) -> tuple[int, int]:
    return sum(a for a, _ in pares), sum(b for _, b in pares)


def media_de_fracoes(pares: list[tuple[int, int]]) -> float:
    return media([a / b for a, b in pares])


def conta(pares: list[tuple[int, int]]) -> str:
    a, b = soma(pares)
    return (f"média por audiência = {fmt_pct(media_de_fracoes(pares), 4)}; "
            f"agregado {fmt_int(a)}/{fmt_int(b)} = {fmt_pct(a / b, 4)}")


def todas(pares: list[tuple[int, int]]) -> str:
    """'100%' só quando nada falta em nenhuma audiência; senão a fração agregada, com uma casa."""
    a, b = soma(pares)
    return "100%" if a == b else fmt_pct(a / b)


def conta_media(valores: list[float]) -> str:
    return f"{fmt_int(sum(valores))}/{len(valores)} = {fmt_dec(media(valores), 2)}"


def razao(num: list[float], den: list[float]) -> float:
    """Razão entre médias: média de num / média de den."""
    return media(num) / media(den)


def conta_razao(num: list[float], den: list[float], fmt=lambda x: fmt_pct(x, 4)) -> str:
    """A razão entre médias e, para comparação, a média das razões por audiência."""
    return (f"{fmt_dec(media(num), 2)}/{fmt_dec(media(den), 2)} = {fmt(razao(num, den))}; "
            f"média das razões por audiência = {fmt(media([a / b for a, b in zip(num, den)]))}")


# ------------------------------------------------------------------ os números, na ordem do artigo

def numeros() -> list[Numero]:
    ids = list(built_ids())
    r = ritmo()

    cob_falas = [materia_falas(h) for h in ids]
    cob_temas = [materia_temas(h) for h in ids]
    cob_papeis = [materia_papeis(h) for h in ids]
    jog_falas = [jogo_falas(h) for h in ids]
    jog_temas = [jogo_temas(h) for h in ids]
    jog_papeis = [jogo_papeis(h) for h in ids]
    ligados = [trecho_ligado(h, o) for h in ids for o in trechos(h)]

    m_falas = media_de_fracoes(cob_falas)
    m_temas = media_de_fracoes(cob_temas)
    m_papeis = media_de_fracoes(cob_papeis)

    n_paginas = [len(paginas(h)) for h in ids]
    com_plain = sum(1 for h in ids for p in paginas(h) if p["plain"])
    simples = [sum(words(texto_da_pagina(p)) for p in paginas(h)) for h in ids]
    originais = [sum(words(p["original"]["text"]) for p in paginas(h)) for h in ids]
    mesa = [sum(words(e["text"]) for e in timeline(h, "mesa", "close")) for h in ids]
    materia = [words(lds()[h]["materia"]) for h in ids]
    transcricao = [catalog()[h]["words"] for h in ids]
    tempos = [tempo_de_leitura(h, r) for h in ids]
    min_paginas = media([p / 60 for p, _ in tempos])
    min_cartoes = media([c / 60 for _, c in tempos])
    minutos = [(p + c) / 60 for p, c in tempos]

    m_simples, m_materia = media(simples), media(materia)
    r_materia = razao(materia, transcricao)
    r_simples = razao(simples, transcricao)
    r_originais = razao(originais, transcricao)
    vezes = razao(simples, materia)
    m_minutos = media(minutos)
    materia_5 = sum(1 for a, b in zip(materia, transcricao) if a / b >= 0.05)

    padroes = (f"f = {fmt_dec(r.f, 2)}×, avanço automático = {r.autoplay}, texto '{r.texto_padrao}', "
               f"{fmt_int(r.cps)} caracteres/s a 1×")
    so_paginas = f"{fmt_int(com_plain)}/{fmt_int(sum(n_paginas))} páginas com plain"
    entre_medias = "razão entre médias, não média das razões por audiência"
    cobertura_src = f"{ANN_SRC} (falas[].kind, falas[].covered)"
    jogo_src = f"{ANN_SRC}; {WEB_SRC}"

    return [
        Numero(
            "Resumo; Introdução",
            "média, por audiência, da fração de falas substantivas com covered = true (a matéria relata a fala)",
            "39%", fmt_pct(m_falas, 0), conta(cob_falas), cobertura_src),
        Numero(
            "Resumo; Seção 6.2; Tabela 5; Conclusão",
            "falas substantivas da anotação que aparecem como fala com páginas na timeline do arquivo jogável "
            "('o jogo apresenta todas')",
            "100%", todas(jog_falas), conta(jog_falas), jogo_src),
        Numero(
            "Seção 3; Tabela 5",
            "média, por audiência, da fração de falas substantivas com covered = true",
            "39,0%", fmt_pct(m_falas), conta(cob_falas), cobertura_src),
        Numero(
            "Seção 3; Tabela 5",
            "média, por audiência, de |press.themes_covered ∩ temas| / |temas|",
            "68,2%", fmt_pct(m_temas), conta(cob_temas), f"{ANN_SRC} (press.themes_covered, themes)"),
        Numero(
            "Seção 3; Tabela 5",
            "média, por audiência, de |press.roles_quoted ∩ R| / |R|, R = papéis de todos os oradores da audiência",
            "79,7%", fmt_pct(m_papeis), conta(cob_papeis), f"{ANN_SRC} (press.roles_quoted, speakers[].role)"),
        Numero(
            "Tabela 3",
            "média, por audiência, de páginas de leitura (páginas de todas as falas da timeline)",
            "46", fmt_int(media(n_paginas)), conta_media(n_paginas), WEB_SRC),
        Numero(
            "Tabela 3; Seção 6.2; Tabela 5",
            "média, por audiência, das palavras das páginas no texto que o balão digita (plain ?? original.text)",
            "1.446", fmt_int(m_simples), f"{conta_media(simples)}; {so_paginas}", WEB_SRC),
        Numero(
            "Tabela 3; Seção 6.2",
            "média, por audiência, do tempo simulado de avanço automático na velocidade padrão de tudo o que o jogo "
            "mostra fora das vezes do jogador: as páginas de fala e também os cartões da mesa e o encerramento "
            "(modelo na docstring), arredondado ao minuto",
            "cerca de 13 minutos", f"cerca de {fmt_int(m_minutos)} minutos",
            f"páginas {fmt_dec(min_paginas, 3)} min + cartões da mesa e encerramento {fmt_dec(min_cartoes, 3)} min = "
            f"{fmt_dec(m_minutos, 3)} min (de {fmt_dec(min(minutos), 2)} a {fmt_dec(max(minutos), 2)}); {padroes}",
            f"{WEB_SRC}; {RITMO_SRC}"),
        Numero(
            "Seção 6.2",
            "média de palavras da matéria / média de palavras da transcrição nas 100 construídas (razão entre médias, "
            "como o percentual da matéria na Tabela 5, não média das razões por audiência); confere se < 5%",
            "menos de 5%", fmt_pct(r_materia),
            f"{conta_razao(materia, transcricao)}; {materia_5}/{len(ids)} audiências com matéria ≥ 5% da transcrição",
            f"{LDS_SRC}; {CAT_SRC}", ok=r_materia < 0.05),
        Numero(
            "Seção 6.2",
            "média, por audiência, de |press.themes_covered ∩ temas| / |temas|, sem casa decimal",
            "68%", fmt_pct(m_temas, 0), conta(cob_temas), f"{ANN_SRC} (press.themes_covered, themes)"),
        Numero(
            "Seção 6.2; Conclusão",
            "100% menos a média, por audiência, da fração de falas substantivas com covered = true",
            "61%", fmt_pct(1 - m_falas, 0), f"1 - {fmt_pct(m_falas, 4)} = {fmt_pct(1 - m_falas, 4)}",
            cobertura_src),
        Numero(
            "Seção 6.2; Tabela 5",
            "temas da anotação com ao menos uma página lida no jogo (tema da carta da página)",
            "100%", todas(jog_temas), conta(jog_temas), jogo_src),
        Numero(
            "Seção 6.2; Tabela 5",
            "papéis presentes entre os oradores com ao menos uma página de fala ou cartão da mesa na timeline",
            "100%", todas(jog_papeis), conta(jog_papeis), jogo_src),
        Numero(
            "Seção 6.2",
            f"média de palavras em linguagem simples / média de palavras da matéria ({entre_medias}); quantas vezes "
            "o tamanho da matéria",
            "2,3", fmt_dec(vezes), conta_razao(simples, materia, lambda x: fmt_dec(x, 4)),
            f"{WEB_SRC}; {LDS_SRC}"),
        Numero(
            "Seção 6.2",
            f"média de palavras em linguagem simples / média de palavras da transcrição ({entre_medias}), sem casa "
            "decimal",
            "11%", fmt_pct(r_simples, 0), conta_razao(simples, transcricao), f"{WEB_SRC}; {CAT_SRC}"),
        Numero(
            "Seção 6.2; Tabela 5",
            "média, por audiência, das palavras do texto original (original.text) de todas as páginas",
            "2.255", fmt_int(media(originais)), conta_media(originais), WEB_SRC),
        Numero(
            "Tabela 5",
            "média de palavras da matéria nas 100 audiências construídas",
            "617", fmt_int(m_materia), conta_media(materia), LDS_SRC),
        Numero(
            "Tabela 5",
            f"média de palavras da matéria / média de palavras da transcrição nas 100 construídas ({entre_medias})",
            "4,7%", fmt_pct(r_materia), conta_razao(materia, transcricao), f"{LDS_SRC}; {CAT_SRC}"),
        Numero(
            "Tabela 5",
            f"média de palavras em linguagem simples / média de palavras da transcrição ({entre_medias})",
            "11,1%", fmt_pct(r_simples), conta_razao(simples, transcricao), f"{WEB_SRC}; {CAT_SRC}"),
        Numero(
            "Tabela 5",
            "média, por audiência, das palavras dos cartões da mesa e do texto do encerramento",
            "257", fmt_int(media(mesa)), conta_media(mesa), WEB_SRC),
        Numero(
            "Tabela 5",
            f"média de palavras do original das páginas / média de palavras da transcrição ({entre_medias})",
            "17,4%", fmt_pct(r_originais), conta_razao(originais, transcricao), f"{WEB_SRC}; {CAT_SRC}"),
        Numero(
            "Tabela 5",
            "originais de páginas, cartões da mesa e encerramento cujo ref (bNNN.i ou bNNN.i-j) aponta para "
            "sentenças existentes da fala e cujo texto é o começo delas",
            "todos", "todos" if all(ligados) else f"{sum(ligados)} de {len(ligados)}",
            f"{fmt_int(sum(ligados))}/{fmt_int(len(ligados))} trechos", f"{WEB_SRC}; {TXT_SRC}"),
        Numero(
            "Conclusão",
            "média, por audiência, das palavras em linguagem simples, arredondada à dezena",
            "cerca de 1.450", f"cerca de {fmt_int(10 * math.floor(m_simples / 10 + 0.5))}",
            conta_media(simples), WEB_SRC),
        Numero(
            "Conclusão",
            f"média de palavras em linguagem simples / média de palavras da matéria ({entre_medias}); 'pouco mais "
            "que o dobro' confere se a razão fica entre 2 e 2,5",
            "pouco mais que o dobro", f"{fmt_dec(vezes, 2)}×", conta_razao(simples, materia, lambda x: fmt_dec(x, 4)),
            f"{WEB_SRC}; {LDS_SRC}", ok=2 < vezes < 2.5),
    ]


if __name__ == "__main__":
    main(TITULO, numeros)
