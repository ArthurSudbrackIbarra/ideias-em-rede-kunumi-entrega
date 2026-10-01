"""As 100 audiências construídas (Resumo, Contribuições, Tabela 1, Seção 3, Seção 4.3 e Seção 6.1).

Reproduz a Tabela 1 inteira (soma, média, mediana, mínimo e máximo por audiência), os totais que o Resumo
e as Contribuições repetem, as barreiras de acesso da Seção 3 (glossário, falas regimentais, oradores,
temas, relações e perguntas sem resposta), a página própria de cada pergunta (Seção 4.3) e a variedade
das audiências construídas (Seção 6.1).

Lê:
- data/sim/hearing-NNN.json (a anotação de cada audiência construída: oradores, falas, cartas, relações...);
- web/public/hearings/index.json (quais audiências foram construídas) e catalog.json (palavras e comissão);
- web/public/hearings/hearing-NNN.json (o arquivo jogável: as páginas de leitura de cada fala);
- src/sim/annotate_sim.py (o limite do glossário e o texto do contrato de anotação, SYSTEM);
- data/publichearingbr/PublicHearingBR_LDS.jsonl (transcrição e matéria, só para conferir as comissões).

    uv run analysis/construidas.py
"""
from __future__ import annotations

import re
import statistics
from collections import Counter
from functools import lru_cache

from common import (ANN_DIR, Numero, annotations, built_ids, catalog, fmt_dec, fmt_int, fmt_num, fmt_pct, lds, main,
                    scenes)
from sim.annotate_sim import GLOSSARY_MAX, SYSTEM

TITULO = "As 100 audiências construídas (Tabela 1 e barreiras de acesso da Seção 3)"

ANN_SRC = "data/sim/hearing-NNN.json"
CAT_SRC = "web/public/hearings/catalog.json"
IDX_SRC = "web/public/hearings/index.json"
CENA_SRC = "web/public/hearings/hearing-NNN.json"
CONTRATO_SRC = "src/sim/annotate_sim.py"
LDS_SRC = "data/publichearingbr/PublicHearingBR_LDS.jsonl"

# Tabela 1: o que cada linha conta numa audiência e os valores impressos no artigo
# (soma, média, mediana, mín, máx).
TABELA_1 = {
    "Palavras de transcrição": ("palavras da transcrição (words do catálogo = len(transcricao.split()))",
                                ("1.298.711", "12.987", "11.948", "4.437", "35.403")),
    "Oradores": ("oradores da anotação (len(speakers))", ("911", "9,1", "8", "3", "25")),
    "Falas": ("falas da anotação, substantivas e regimentais (len(falas))", ("3.761", "37,6", "31", "7", "328")),
    "Falas substantivas": ("falas com kind = substantive", ("1.768", "17,7", "16,5", "5", "68")),
    "Temas": ("temas (len(themes))", ("664", "6,6", "7", "4", "8")),
    "Cartas": ("cartas de argumento (soma de len(claims) das falas)", ("4.145", "41,5", "39", "12", "72")),
    "Relações": ("relações entre falas (len(relations))", ("2.187", "21,9", "20", "8", "52")),
    "Consensos": ("consensos (len(consensus))", ("473", "4,7", "5", "2", "8")),
    "Perguntas a outras partes": ("perguntas e cobranças a outra parte (len(open_questions))",
                                  ("489", "4,9", "5", "2", "12")),
    "Ideias": ("ideias (len(teses))", ("552", "5,5", "6", "3", "6")),
    "Termos de glossário": ("termos do glossário (len(glossario))", ("1.439", "14,4", "14,5", "13", "15")),
}
COLUNAS = {"soma": "soma nas audiências construídas", "média": "média por audiência",
           "mediana": "mediana por audiência", "mín": "mínimo por audiência", "máx": "máximo por audiência"}

# Atos regimentais que a Seção 3 nomeia: mesa_move da anotação -> (regra do contrato SYSTEM, como ela descreve a
# fala). A regra 14 lista os atos e só define cortesia; as outras descrições vêm da regra 3, que diz quando uma fala
# é procedural.
ATOS_CITADOS = {
    "passa_palavra": (3, "passa a palavra"),
    "ordem": (3, "pede ordem"),
    "cortesia": (14, "só cumprimenta ou agradece"),
    "microfone": (3, "testa microfone"),
}
# Para ordem e microfone o rótulo do artigo é mais largo que a redação do contrato. Estas palavras-chave mostram de
# que tratam de fato os resumos (summary) dessas falas; um resumo pode citar mais de um assunto.
ASSUNTOS = {
    "ordem": {
        "tempo": r"\btempo|minuto|prazo|conclu|cron[ôo]metro|\bhora",
        "questão de ordem": r"quest[ãa]o de ordem|pela ordem",
        "pedido ou uso da palavra": r"palavra|inscri",
    },
    "microfone": {
        "som": r"microfone|[áa]udio|\bsom\b|\bouv|escut",
        "imagem": r"v[íi]deo|imagem|tela|c[âa]mera|eslaide|apresenta[çc][ãa]o|compartilh",
        "conexão": r"conex|internet|\bcaiu\b|sinal|tecnologia",
    },
}

# Correções do catálogo. A regex de src/sim/catalog.py pega o primeiro "Comissão de/da/do ..." do começo da
# transcrição e não casa com "Comissão Externa" nem com "Comissão Especial". Na 59 ela pegou a filiação de um
# orador ("liderança dos pescadores e da Comissão de Atingidos"); a matéria diz que comissão da Câmara fez a
# audiência. audiência -> (nome no catálogo, nome na matéria), conferidos ao rodar.
CORRIGE_COMISSAO = {
    59: ("Comissão de Atingidos", "Comissão Externa sobre Fiscalização dos Rompimentos de Barragens"),
}

# Nomes diferentes que juntamos numa comissão só. A regex para na primeira vírgula ("Comissão de Ciência, Tecnologia
# e Inovação" vira "Comissão de Ciência"), há grafias diferentes ("Esportes"/"do Esporte"), e várias comissões foram
# renomeadas ou divididas em 2023 ("Direitos Humanos e Minorias" passou a "Direitos Humanos, Minorias e Igualdade
# Racial"; a antiga "Ciência e Tecnologia, Comunicação e Informática" deu origem à de Ciência e à de Comunicação).
# Juntar comissões que são formalmente diferentes só diminui a contagem, que assim fica um piso. Pelo mesmo corte na
# vírgula, a regex já junta sozinha a antiga "Desenvolvimento Econômico, Indústria, Comércio e Serviços" com a atual
# de Desenvolvimento Econômico, e a antiga "Trabalho, Administração e Serviço Público" com a atual de Trabalho.
MESMA_COMISSAO = {
    "Comissão de Ciência e Tecnologia": "Comissão de Ciência",
    "Comissão de Constituição e Justiça e de Cidadania": "Comissão de Constituição e Justiça",
    "Comissão de Direitos Humanos e Minorias": "Comissão de Direitos Humanos",
    "Comissão de Esportes": "Comissão do Esporte",
    "Comissão de Meio Ambiente e Desenvolvimento Sustentável": "Comissão de Meio Ambiente",
    "Comissão do Trabalho": "Comissão de Trabalho",
}


# ------------------------------------------------------------------ medidas por audiência

@lru_cache(maxsize=None)
def medidas(h: int) -> dict[str, int]:
    """O valor de cada linha da Tabela 1 numa audiência."""
    a = annotations()[h]
    falas = a["falas"]
    return {
        "Palavras de transcrição": catalog()[h]["words"],
        "Oradores": len(a["speakers"]),
        "Falas": len(falas),
        "Falas substantivas": sum(1 for f in falas if f["kind"] == "substantive"),
        "Temas": len(a["themes"]),
        "Cartas": sum(len(f["claims"]) for f in falas),
        "Relações": len(a["relations"]),
        "Consensos": len(a["consensus"]),
        "Perguntas a outras partes": len(a["open_questions"]),
        "Ideias": len(a["teses"]),
        "Termos de glossário": len(a["glossario"]),
    }


def por_audiencia(linha: str) -> dict[int, int]:
    return {h: medidas(h)[linha] for h in built_ids()}


def soma(linha: str) -> int:
    return sum(por_audiencia(linha).values())


def media(linha: str) -> float:
    v = por_audiencia(linha)
    return sum(v.values()) / len(v)


def paginas(h: int, tipo: str | None = None) -> list[dict]:
    """As páginas de leitura das falas no arquivo jogável ("claim" ou "pergunta"); todas quando tipo é None."""
    return [p for e in scenes()[h]["timeline"] if e["kind"] == "fala"
            for p in e["pages"] if tipo is None or p["kind"] == tipo]


def falas_regimentais() -> Counter:
    """Falas com kind = procedural, contadas por mesa_move."""
    return Counter(f["mesa_move"] for a in annotations().values() for f in a["falas"] if f["kind"] == "procedural")


def comissao(h: int) -> str | None:
    """A comissão de uma audiência: a do catálogo, ou a da matéria quando CORRIGE_COMISSAO corrige o catálogo."""
    nome = catalog()[h]["committee"]
    if h in CORRIGE_COMISSAO:
        no_catalogo, na_materia = CORRIGE_COMISSAO[h]
        materia = lds()[h]["materia"].replace(" da Câmara dos Deputados", "")
        if nome != no_catalogo or na_materia not in materia:
            raise ValueError(f"a correção da comissão da audiência {h} não confere com o catálogo e a matéria")
        nome = na_materia
    return nome


def comissoes() -> tuple[Counter, Counter, list[int]]:
    """(nomes como no catálogo, nomes corrigidos e com as variantes juntadas, audiências sem comissão no catálogo)."""
    crus = Counter(catalog()[h]["committee"] for h in built_ids() if catalog()[h]["committee"])
    nomes = {h: comissao(h) for h in built_ids()}
    juntos = Counter(MESMA_COMISSAO.get(c, c) for c in nomes.values() if c)
    return crus, juntos, [h for h, c in nomes.items() if c is None]


def comissao_especial(h: int) -> bool:
    """Se o começo da transcrição (o trecho em que a regex do catálogo procura) nomeia uma Comissão Especial."""
    return "Comissão Especial" in lds()[h]["transcricao"][:12000]


# ------------------------------------------------------------------ auxiliares

def quais(por_aud: dict[int, int], valor: int) -> str:
    """As audiências que têm esse valor (até cinco ids)."""
    ids = [h for h in sorted(por_aud) if por_aud[h] == valor]
    lista = ", ".join(map(str, ids[:5])) + (f" e mais {len(ids) - 5}" if len(ids) > 5 else "")
    return f"audiência{'s' if len(ids) > 1 else ''} {lista}"


def conta_media(linha: str) -> str:
    v = por_audiencia(linha)
    return f"{fmt_int(sum(v.values()))}/{len(v)} = {fmt_dec(media(linha), 4)}"


def celulas(linha: str) -> dict[str, tuple[str, str]]:
    """(valor formatado como na tabela, conta exata) de cada coluna de uma linha da Tabela 1."""
    por_aud = por_audiencia(linha)
    v = sorted(por_aud.values())
    n = len(v)
    meio = f"({fmt_int(v[n // 2 - 1])} + {fmt_int(v[n // 2])})/2" if n % 2 == 0 else f"{n // 2 + 1}º valor"
    # a média de palavras sai inteira; as outras com uma casa
    fmt_media = fmt_int if linha == "Palavras de transcrição" else fmt_dec
    return {
        "soma": (fmt_int(sum(v)), f"soma de {n} audiências"),
        "média": (fmt_media(media(linha)), conta_media(linha)),
        "mediana": (fmt_num(statistics.median(v)), meio),
        "mín": (fmt_int(v[0]), quais(por_aud, v[0])),
        "máx": (fmt_int(v[-1]), quais(por_aud, v[-1])),
    }


def regra(n: int) -> str:
    """O texto da regra n do contrato (SYSTEM), da linha "n. " até a regra seguinte, com os espaços normalizados."""
    m = re.search(rf"^{n}\. (.*?)(?=^{n + 1}\. |\Z)", SYSTEM, re.S | re.M)
    return " ".join(m.group(1).split())


def limite_glossario_no_contrato() -> tuple[int, int]:
    """(mínimo, máximo) de termos que a regra 23 do contrato pede ("GLOSSÁRIO: de 6 a 15 termos")."""
    m = re.search(r"GLOSSÁRIO: de (\d+) a (\d+) termos", regra(23))
    return int(m.group(1)), int(m.group(2))


def assuntos(move: str) -> str:
    """Quantos resumos (summary) das falas de um ato citam cada assunto de ASSUNTOS, e dois exemplos dos que não citam
    nenhum (os dois primeiros na ordem das audiências e das falas)."""
    resumos = [f["summary"] for h in built_ids() for f in annotations()[h]["falas"]
               if f["kind"] == "procedural" and f["mesa_move"] == move]
    chaves = ASSUNTOS[move]
    citam = ", ".join(f"{nome} {sum(1 for s in resumos if re.search(p, s, re.I))}" for nome, p in chaves.items())
    fora = [s for s in resumos if not any(re.search(p, s, re.I) for p in chaves.values())]
    exemplos = "; ".join(f"\"{s}\"" for s in fora[:2])
    return f"resumos que citam {citam}; {len(fora)} não citam nenhum desses assuntos, como {exemplos}"


# ------------------------------------------------------------------ os números, na ordem do artigo

def resumo() -> list[Numero]:
    anotadas = sorted(int(p.stem.removeprefix("hearing-")) for p in ANN_DIR.glob("hearing-*.json"))
    mesmas_ids = anotadas == list(built_ids())
    no_catalogo = set(built_ids()) <= set(catalog())
    construidas = Numero(
        "Resumo",
        "audiências construídas (entradas de index.json; confere que são as mesmas que têm anotação em data/sim e "
        "que estão todas no catálogo) e audiências do acervo (entradas de catalog.json)",
        "100 das 206", f"{fmt_int(len(built_ids()))} das {fmt_int(len(catalog()))}",
        f"{len(anotadas)} arquivos de anotação em data/sim, das mesmas audiências de index.json: "
        f"{'sim' if mesmas_ids else 'NÃO'}; todas as construídas no catálogo: {'sim' if no_catalogo else 'NÃO'}",
        f"{IDX_SRC}; {CAT_SRC}; {ANN_SRC}")
    construidas.ok = construidas.valor == construidas.artigo and mesmas_ids and no_catalogo

    relacoes = [r for h in built_ids() for r in annotations()[h]["relations"]]
    sem_origem = sum(1 for r in relacoes if r["from_claim"] is None)
    sem_destino = sum(1 for r in relacoes if r["to_claim"] is None)
    sem_nenhuma = sum(1 for r in relacoes if r["from_claim"] is None and r["to_claim"] is None)
    carta_a_carta = sum(1 for r in relacoes if r["from_claim"] is not None and r["to_claim"] is not None)
    return [
        construidas,
        Numero(
            "Resumo; Contribuições",
            "cartas de argumento nas audiências construídas (soma de len(claims) das falas anotadas)",
            "4.145", fmt_int(soma("Cartas")), conta_media("Cartas"), ANN_SRC),
        Numero(
            "Resumo; Contribuições",
            "relações nas audiências construídas (soma de len(relations)); o Resumo diz \"relações entre elas\" (as "
            "cartas), o que vale para a maioria: a regra 7 do contrato deixa uma ponta na fala inteira "
            "(from_claim ou to_claim nulo) quando nenhuma carta daquela fala representa o ponto ligado",
            "2.187", fmt_int(len(relacoes)),
            f"{fmt_int(carta_a_carta)} com carta nas duas pontas e {fmt_int(len(relacoes) - carta_a_carta)} com ao "
            f"menos uma ponta na fala inteira ({sem_origem} sem carta na origem e {sem_destino} sem carta no destino, "
            f"{sem_nenhuma} delas sem carta nas duas); média {conta_media('Relações')}", ANN_SRC),
        Numero(
            "Contribuições",
            "ideias nas audiências construídas (soma de len(teses))",
            "552", fmt_int(soma("Ideias")), conta_media("Ideias"), ANN_SRC),
        Numero(
            "Contribuições",
            "termos de glossário nas audiências construídas (soma de len(glossario))",
            "1.439", fmt_int(soma("Termos de glossário")), conta_media("Termos de glossário"), ANN_SRC),
    ]


def tabela_1() -> list[Numero]:
    nums = []
    for linha, (definicao, artigo) in TABELA_1.items():
        fonte = CAT_SRC if linha == "Palavras de transcrição" else ANN_SRC
        cel = celulas(linha)
        for (coluna, desc), esperado in zip(COLUNAS.items(), artigo):
            valor, exato = cel[coluna]
            nums.append(Numero(f"Tabela 1, {linha}, {coluna}", f"{desc} de {definicao}",
                               esperado, valor, exato, fonte))
    return nums


def barreiras() -> list[Numero]:
    """Seção 3, o parágrafo das barreiras de acesso (a média de 12.987 palavras está em acervo.py)."""
    n = len(built_ids())
    gloss = por_audiencia("Termos de glossário")
    gmin, gmax = limite_glossario_no_contrato()
    no_limite = [h for h in sorted(gloss) if gloss[h] == gmax]
    tamanhos = ", ".join(f"{c} com {t}" for t, c in sorted(Counter(gloss.values()).items(), reverse=True))

    falas, subst = soma("Falas"), soma("Falas substantivas")
    atos = falas_regimentais()
    regimentais = sum(atos.values())
    outras = {m: c for m, c in atos.most_common() if m not in ATOS_CITADOS}
    citados_sao_os_maiores = {m for m, _ in atos.most_common(len(ATOS_CITADOS))} == set(ATOS_CITADOS)

    def ato(move: str, rotulo: str, artigo: str) -> Numero:
        n_regra, trecho = ATOS_CITADOS[move]
        # a descrição abaixo cita o contrato; se ele mudar, o script para em vez de citar errado
        if trecho not in regra(n_regra) or not re.search(rf"\b{move}\b", regra(14)):
            raise ValueError(f"o contrato não descreve mais o ato {move} como \"{trecho}\" (regra {n_regra})")
        valor = fmt_int(atos[move])
        descricao = (f"\"{rotulo}\": falas com kind = procedural e mesa_move = {move}; o contrato descreve a fala "
                     f"que \"{trecho}\" (regra {n_regra})")
        exato = f"{valor} de {fmt_int(regimentais)} falas regimentais ({fmt_pct(atos[move] / regimentais)})"
        if move in ASSUNTOS:
            descricao += ("; o rótulo do artigo é uma glosa mais larga que essa redação, e o exato mostra de que "
                          "tratam os resumos dessas falas")
            exato += "; " + assuntos(move)
        return Numero("Seção 3", descricao, artigo, valor, exato, f"{ANN_SRC}; {CONTRATO_SRC}")

    relacoes = Counter(r["kind"] for a in annotations().values() for r in a["relations"])
    tipos = ("apoia", "contradiz", "responde")
    perguntas = [q for h in built_ids() for q in annotations()[h]["open_questions"]]
    sem_resposta = sum(1 for q in perguntas if not q["answered_by"])

    return [
        Numero(
            "Seção 3",
            "média por audiência de termos do glossário (len(glossario))",
            "14,4", fmt_dec(media("Termos de glossário")), conta_media("Termos de glossário"), ANN_SRC),
        Numero(
            "Seção 3",
            "audiências cujo glossário tem exatamente o máximo do contrato; confere se são metade das construídas",
            "metade", f"{len(no_limite)} de {n}", f"tamanhos do glossário: {tamanhos}",
            f"{ANN_SRC}; {CONTRATO_SRC}", ok=2 * len(no_limite) == n),
        Numero(
            "Seção 3",
            "máximo de termos do glossário pedido pela regra 23 do contrato (SYSTEM)",
            "15", fmt_int(gmax),
            f"regra 23: \"de {gmin} a {gmax} termos\"; GLOSSARY_MAX = {GLOSSARY_MAX}, que o validador aplica",
            CONTRATO_SRC),
        Numero(
            "Seção 3",
            "fração das falas que são substantivas (kind = substantive); confere se é menor que 50%",
            "Menos da metade", fmt_pct(subst / falas),
            f"{fmt_int(subst)}/{fmt_int(falas)} = {fmt_pct(subst / falas, 4)}", ANN_SRC, ok=subst / falas < 0.5),
        Numero(
            "Seção 3",
            "falas substantivas e total de falas das audiências construídas",
            "1.768 de 3.761", f"{fmt_int(subst)} de {fmt_int(falas)}",
            f"{fmt_int(falas - subst)} falas não substantivas", ANN_SRC),
        ato("passa_palavra", "concessões da palavra", "883"),
        ato("ordem", "questões de ordem e de tempo", "448"),
        ato("cortesia", "cumprimentos e agradecimentos", "295"),
        ato("microfone", "problemas de som e imagem", "169"),
        Numero(
            "Seção 3",
            "falas regimentais com os demais mesa_move; confere que existem e que, somadas às quatro citadas, "
            "dão todas as falas não substantivas",
            "entre outras", f"{fmt_int(sum(outras.values()))} falas em {len(outras)} outros atos",
            ", ".join(f"{m} {c}" for m, c in outras.items())
            + f"; os quatro citados são os mais frequentes: {'sim' if citados_sao_os_maiores else 'não'}",
            ANN_SRC, ok=sum(outras.values()) > 0 and regimentais == falas - subst),
        Numero(
            "Seção 3",
            "média por audiência de oradores (len(speakers))",
            "9,1", fmt_dec(media("Oradores")), conta_media("Oradores"), ANN_SRC),
        Numero(
            "Seção 3",
            "média por audiência de temas (len(themes))",
            "6,6", fmt_dec(media("Temas")), conta_media("Temas"), ANN_SRC),
        Numero(
            "Seção 3",
            "relações dos tipos apoia, contradiz ou responde, somadas nas audiências construídas",
            "2.187", fmt_int(sum(relacoes[t] for t in tipos)),
            ", ".join(f"{t} {fmt_int(relacoes[t])}" for t in tipos)
            + f"; {fmt_int(sum(relacoes.values()))} relações ao todo", ANN_SRC),
        Numero(
            "Seção 3",
            "perguntas e cobranças dirigidas a outra parte (open_questions), somadas",
            "489", fmt_int(len(perguntas)), conta_media("Perguntas a outras partes"), ANN_SRC),
        Numero(
            "Seção 3",
            "perguntas sem resposta até o fim da sessão (answered_by = null)",
            "276", fmt_int(sem_resposta), f"{fmt_int(len(perguntas) - sem_resposta)} respondidas", ANN_SRC),
        Numero(
            "Seção 3",
            "perguntas sem resposta sobre todas as perguntas, sem casa decimal",
            "56%", fmt_pct(sem_resposta / len(perguntas), 0),
            f"{fmt_int(sem_resposta)}/{fmt_int(len(perguntas))} = {fmt_pct(sem_resposta / len(perguntas), 4)}",
            ANN_SRC),
    ]


def pagina_por_pergunta() -> Numero:
    """Seção 4.3: toda pergunta ganha uma página no balão, tenha sido respondida ou não."""
    perguntas = {(h, q["id"]): q for h in built_ids() for q in annotations()[h]["open_questions"]}
    cartas = {(h, c["id"]): c for h in built_ids() for c in scenes()[h]["deck"] if c["kind"] == "pergunta"}
    pag = sorted((h, p["card"]) for h in built_ids() for p in paginas(h, "pergunta"))
    uma_por_pergunta = pag == sorted(perguntas)
    # respondida no jogo = a carta da pergunta no deck tem answered_by_real; na anotação = a pergunta tem answered_by
    respondida = {k: cartas[k]["answered_by_real"] is not None for k in pag}
    mesma_resposta = uma_por_pergunta and all(respondida[k] == bool(perguntas[k]["answered_by"]) for k in pag)
    n_resp = sum(respondida.values())
    sem_resposta = sum(1 for q in perguntas.values() if not q["answered_by"])
    return Numero(
        "Seção 4.3",
        "páginas \"pergunta\" das falas no arquivo jogável; confere que cada pergunta ou cobrança da anotação "
        "(open_questions) tem exatamente uma página, que cada página diz respondida ou não como a anotação, e que "
        "há páginas dos dois tipos",
        "Cada pergunta ou cobrança dirigida a outra parte também ganha uma página própria, tenha sido respondida "
        "depois ou não",
        f"{fmt_int(len(pag))} páginas para {fmt_int(len(perguntas))} perguntas: {fmt_int(n_resp)} respondidas e "
        f"{fmt_int(len(pag) - n_resp)} sem resposta",
        f"uma página por pergunta: {'sim' if uma_por_pergunta else 'NÃO'}; respondida como na anotação em todas: "
        f"{'sim' if mesma_resposta else 'NÃO'} (na anotação, {fmt_int(sem_resposta)} sem answered_by)",
        f"{CENA_SRC}; {ANN_SRC}", ok=mesma_resposta and 0 < n_resp < len(pag))


def variedade() -> list[Numero]:
    """Seção 6.1: a variedade das audiências construídas e as páginas de leitura."""
    oradores, falas = por_audiencia("Oradores"), por_audiencia("Falas")
    crus, juntos, sem_comissao = comissoes()
    especiais = [h for h in sem_comissao if comissao_especial(h)]
    n_comissoes = Numero(
        "Seção 6.1",
        "comissões distintas das audiências construídas: o committee de catalog.json, com a correção de "
        "CORRIGE_COMISSAO e os nomes de MESMA_COMISSAO juntados (grafias diferentes e comissões renomeadas ou "
        "divididas em 2023, juntadas para que a contagem seja um piso); audiências sem comissão no catálogo ficam "
        "fora; confere se são 28 ou mais",
        "pelo menos 28", fmt_int(len(juntos)),
        f"{len(crus)} nomes distintos no catálogo; {len(juntos)} depois de corrigir "
        + ", ".join(f"a {h} ({de} -> {para})" for h, (de, para) in sorted(CORRIGE_COMISSAO.items()))
        + f" e juntar os {len(MESMA_COMISSAO)} nomes de MESMA_COMISSAO; {len(sem_comissao)} audiências sem comissão "
        f"no catálogo ({', '.join(map(str, sem_comissao))}), das quais {len(especiais)} nomeiam uma Comissão Especial "
        "no começo da transcrição, que a regex do catálogo não captura: ficam fora da contagem, que por isso é um piso",
        f"{CAT_SRC}; {LDS_SRC}", ok=len(juntos) >= 28)

    tipos = Counter(p["kind"] for h in built_ids() for p in paginas(h))
    total_pag = sum(tipos.values())
    so_cartas_e_perguntas = total_pag == tipos["claim"] + tipos["pergunta"]
    n_pag = Numero(
        "Seção 6.1",
        "páginas de leitura (pages dos eventos de fala da timeline) somadas nas audiências construídas; confere "
        "que são só páginas de carta (claim) e de pergunta",
        "4.634", fmt_int(total_pag),
        " + ".join(f"{fmt_int(c)} {t}" for t, c in sorted(tipos.items())), CENA_SRC)
    n_pag.ok = n_pag.valor == n_pag.artigo and so_cartas_e_perguntas

    mesmas_da_tabela = tipos["claim"] == soma("Cartas") and tipos["pergunta"] == soma("Perguntas a outras partes")
    n_tipos = Numero(
        "Seção 6.1",
        "páginas de carta (kind = claim) e de pergunta (kind = pergunta) entre as páginas de leitura; confere que "
        "são as cartas e as perguntas da Tabela 1 (somas da anotação)",
        "4.145 cartas e 489 perguntas",
        f"{fmt_int(tipos['claim'])} cartas e {fmt_int(tipos['pergunta'])} perguntas",
        f"na anotação: {fmt_int(soma('Cartas'))} cartas e {fmt_int(soma('Perguntas a outras partes'))} perguntas",
        f"{CENA_SRC}; {ANN_SRC}")
    n_tipos.ok = n_tipos.valor == n_tipos.artigo and mesmas_da_tabela
    return [
        Numero(
            "Seção 6.1",
            "menor e maior número de oradores (len(speakers)) entre as audiências construídas",
            "3 a 25", f"{fmt_int(min(oradores.values()))} a {fmt_int(max(oradores.values()))}",
            f"mín: {quais(oradores, min(oradores.values()))}; máx: {quais(oradores, max(oradores.values()))}",
            ANN_SRC),
        Numero(
            "Seção 6.1",
            "menor e maior número de falas (len(falas)) entre as audiências construídas",
            "7 a 328", f"{fmt_int(min(falas.values()))} a {fmt_int(max(falas.values()))}",
            f"mín: {quais(falas, min(falas.values()))}; máx: {quais(falas, max(falas.values()))}",
            ANN_SRC),
        n_comissoes,
        n_pag,
        n_tipos,
    ]


def numeros() -> list[Numero]:
    return [*resumo(), *tabela_1(), *barreiras(), pagina_por_pergunta(), *variedade()]


if __name__ == "__main__":
    main(TITULO, numeros)
