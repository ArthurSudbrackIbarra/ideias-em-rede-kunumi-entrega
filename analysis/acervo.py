"""O acervo PublicHearingBR e o recorte das 100 audiências (Resumo, Introdução, Seção 3, Seção 6.5 e Conclusão).

Reproduz o tamanho do acervo (audiências, período, palavras das transcrições e das matérias, opiniões),
a taxa de opiniões alucinadas que o próprio PublicHearingBR mediu, e como as 100 audiências construídas
se situam dentro das 206.

Lê:
- data/publichearingbr/PublicHearingBR_LDS.jsonl (transcrição, matéria e opiniões de cada audiência);
- data/publichearingbr/PublicHearingBR_NLI.jsonl (opiniões extraídas pelo ChatGPT, com verificação manual);
- src/sim/catalog.py (DATE_RE, a regra que acha a data de publicação no texto da matéria);
- web/public/hearings/catalog.json (confere que o catálogo do jogo traz as mesmas ids, palavras e datas);
- web/public/hearings/index.json (as 100 audiências construídas).

    uv run analysis/acervo.py
"""
from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from common import Numero, built_ids, catalog, fmt_dec, fmt_int, fmt_mil, fmt_pct, lds, main, nli, words
from sim.catalog import DATE_RE

TITULO = "O acervo PublicHearingBR e o recorte das 100 audiências"

LDS_SRC = "data/publichearingbr/PublicHearingBR_LDS.jsonl"
NLI_SRC = "data/publichearingbr/PublicHearingBR_NLI.jsonl"
CAT_SRC = "web/public/hearings/catalog.json"
IDX_SRC = "web/public/hearings/index.json"
DATA_SRC = f"{LDS_SRC}; src/sim/catalog.py; {CAT_SRC}"

# um dos três testes automáticos que o NLI guarda ao lado da verificação manual
PROMPT_1 = "prompt_1_gpt-4o-mini-2024-07-18"

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


# ------------------------------------------------------------------ medidas por audiência

def palavras_transcricao() -> dict[int, int]:
    return {h: words(r["transcricao"]) for h, r in sorted(lds().items())}


def palavras_materia() -> dict[int, int]:
    return {h: words(r["materia"]) for h, r in sorted(lds().items())}


def datas_publicacao() -> dict[int, date]:
    """Data de publicação da matéria de cada audiência: a primeira data dd/mm/aaaa do texto.

    O dataset não tem campo com a data da sessão. A primeira data da matéria é o carimbo de publicação
    no cabeçalho da Agência Câmara ("18/11/2021 - 19:06"), que usamos como aproximação da data da sessão.
    É a mesma regra (DATE_RE) com que src/sim/catalog.py preenche o campo "date" de catalog.json.
    """
    out = {}
    for h, r in sorted(lds().items()):
        m = DATE_RE.search(r["materia"])
        if not m:
            raise ValueError(f"audiência {h}: matéria sem data dd/mm/aaaa")
        d, mes, a = map(int, m.group(1).split("/"))
        out[h] = date(a, mes, d)
    return out


def verificacoes_nli() -> list[dict]:
    """O dict `verificacao_alucinacao` de cada opinião do NLI.

    `verificacao_manual` é a anotação manual de alucinação: true quando a opinião extraída não pode ser
    inferida dos trechos próximos da transcrição. A prosa do README do dataset é ambígua nesse ponto,
    mas o código de exemplo do próprio README imprime o campo como "Alucinação (manual)", e ele concorda
    com o campo `alucinacao` dos testes automáticos guardados ao lado (a conta sai no campo exato).
    """
    vs = [o["verificacao_alucinacao"]
          for amostra in nli()
          for env in amostra["metadados_extraidos"]["envolvidos"]
          for o in env["opinioes"]]
    if not all(isinstance(v["verificacao_manual"], bool) for v in vs):
        raise ValueError("verificacao_manual deveria ser booleana em todas as opiniões do NLI")
    return vs


# ------------------------------------------------------------------ auxiliares

def media(valores: list[int]) -> float:
    return sum(valores) / len(valores)


def conta_media(valores: list[int]) -> str:
    return f"{fmt_int(sum(valores))}/{len(valores)} = {fmt_dec(media(valores), 4)}"


def centena(x: float) -> int:
    """Arredonda à centena, meio para cima (627,72 -> 600)."""
    return int(Decimal(str(x)).quantize(Decimal("1E2"), rounding=ROUND_HALF_UP))


def mes_ano(d: date) -> str:
    return f"{MESES[d.month - 1]} de {d.year}"


def dma(d: date) -> str:
    return f"{d:%d/%m/%Y}"


# ------------------------------------------------------------------ os números, na ordem do artigo

def numeros() -> list[Numero]:
    pt = palavras_transcricao()
    pm = palavras_materia()
    todas = sorted(pt)
    construidas = sorted(built_ids())
    restantes = sorted(set(todas) - set(construidas))

    # o catálogo do jogo deve listar as mesmas audiências, com a mesma contagem de palavras
    cat = catalog()
    mesmas_ids = sorted(cat) == todas
    mesma_contagem = sum(1 for h in todas if h in cat and cat[h]["words"] == pt[h])

    # período e ano, pela data de publicação da matéria (datas_publicacao falha se faltar data em alguma)
    dt = datas_publicacao()
    mesma_data = sum(1 for h in todas if h in cat and cat[h]["date"] == dma(dt[h]))
    inicio = min(dt.items(), key=lambda kv: (kv[1], kv[0]))
    fim = max(dt.items(), key=lambda kv: (kv[1], kv[0]))
    em_2023 = sum(1 for d in dt.values() if d.year == 2023)

    # as 100 menores transcrições do acervo (desempate pelo id) e onde caem as construídas
    por_tamanho = sorted(todas, key=lambda h: (pt[h], h))
    menores = set(por_tamanho[:100])
    dentro = [h for h in construidas if h in menores]
    fora = sorted((h for h in construidas if h not in menores), key=lambda h: (pt[h], h))

    envolvidos = [env for r in lds().values() for env in r["metadados"]["envolvidos"]]
    opinioes = sum(len(env["opinioes"]) for env in envolvidos)
    vs = verificacoes_nli()
    manual = [v["verificacao_manual"] for v in vs]
    auto = [v[PROMPT_1]["alucinacao"] for v in vs]
    alucinadas, total_nli = sum(manual), len(manual)
    auto_sim = sum(1 for m, a in zip(manual, auto) if m and a)
    auto_nao = sum(1 for m, a in zip(manual, auto) if not m and a)

    tw = [pt[h] for h in todas]
    mw = [pm[h] for h in todas]
    tw_c = [pt[h] for h in construidas]
    mw_c = [pm[h] for h in construidas]
    tw_r = [pt[h] for h in restantes]

    n_transc = Numero(
        "Resumo; Introdução; Seção 3",
        "média de palavras da transcrição nas 206 audiências do LDS (e catalog.json traz a mesma contagem em todas)",
        "18.102", fmt_int(media(tw)),
        f"{conta_media(tw)}; catalog.json igual em {mesma_contagem} de {len(todas)}", f"{LDS_SRC}; {CAT_SRC}")
    n_transc.ok = n_transc.valor == n_transc.artigo and mesma_contagem == len(todas)

    n_acervo = Numero(
        "Resumo; Introdução; Seção 3",
        "número de audiências no LDS (e catalog.json lista as mesmas ids)",
        "206", fmt_int(len(todas)),
        f"{len(todas)} no LDS, {len({a['id'] for a in nli()})} ids no NLI, {len(cat)} no catalog.json",
        f"{LDS_SRC}; {CAT_SRC}")
    n_acervo.ok = n_acervo.valor == n_acervo.artigo and mesmas_ids

    def periodo(extremo: str, h: int, d: date, artigo: str) -> Numero:
        n = Numero(
            "Introdução; Seção 3",
            f"mês da {extremo} data de publicação da matéria da Agência Câmara (primeira data dd/mm/aaaa do texto), "
            "usada como aproximação da data da sessão; confere também que catalog.json traz a mesma data em todas",
            artigo, mes_ano(d),
            f"matéria da audiência {h} publicada em {dma(d)}; catalog.json igual em {mesma_data} de {len(todas)}",
            DATA_SRC)
        n.ok = n.valor == n.artigo and mesma_data == len(todas)
        return n

    return [
        n_transc,
        Numero(
            "Resumo",
            "média de palavras da matéria nas 206 audiências, arredondada à centena ('cerca de 600 palavras')",
            "cerca de 600", f"cerca de {fmt_int(centena(media(mw)))}",
            conta_media(mw), LDS_SRC),
        n_acervo,
        periodo("menor", *inicio, "novembro de 2021"),
        periodo("maior", *fim, "maio de 2024"),
        Numero(
            "Introdução; Seção 3",
            "média de palavras da matéria da Agência Câmara nas 206 audiências",
            "628", fmt_int(media(mw)),
            conta_media(mw), LDS_SRC),
        Numero(
            "Introdução",
            "opiniões do NLI com verificacao_manual = true (alucinação: não inferível dos trechos próximos), "
            "sobre todas as opiniões do NLI",
            "11,89%", fmt_pct(alucinadas / total_nli, 2),
            f"{fmt_int(alucinadas)}/{fmt_int(total_nli)} = {fmt_pct(alucinadas / total_nli, 4)}; o teste automático "
            f"do prompt 1 marca alucinação em {auto_sim} das {fmt_int(alucinadas)} e em {auto_nao} das "
            f"{fmt_int(total_nli - alucinadas)} restantes", NLI_SRC),
        Numero(
            "Seção 3",
            "audiências cuja matéria foi publicada em 2023 (data de publicação como aproximação da data da sessão); "
            "confere se são mais da metade das audiências do acervo",
            "a maioria em 2023", f"{em_2023} de {len(todas)} em 2023",
            f"{em_2023}/{len(todas)} = {fmt_pct(em_2023 / len(todas), 2)}", DATA_SRC, ok=em_2023 > len(todas) / 2),
        Numero(
            "Seção 3",
            "soma de len(opinioes) sobre metadados.envolvidos das 206 audiências do LDS",
            "2.203", fmt_int(opinioes),
            f"{fmt_int(opinioes)} opiniões de {fmt_int(len(envolvidos))} participantes", LDS_SRC),
        Numero(
            "Seção 3",
            "menor transcrição do acervo, em palavras",
            "4.437", fmt_int(min(tw)),
            f"audiência {por_tamanho[0]}", LDS_SRC),
        Numero(
            "Seção 3",
            "maior transcrição do acervo, em palavras",
            "147.728", fmt_int(max(tw)),
            f"audiência {por_tamanho[-1]}", LDS_SRC),
        Numero(
            "Seção 3",
            "audiências estruturadas para o jogo (entradas de index.json)",
            "100", fmt_int(len(construidas)),
            f"{len(construidas)} construídas, todas no LDS: {'sim' if set(construidas) <= set(todas) else 'NÃO'}",
            IDX_SRC),
        Numero(
            "Seção 3",
            "construídas que estão entre as 100 menores transcrições do acervo (ordem por palavras, desempate pelo id)",
            "80", fmt_int(len(dentro)),
            f"a 100ª menor tem {fmt_int(pt[por_tamanho[99]])} palavras, a 101ª {fmt_int(pt[por_tamanho[100]])}",
            f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Seção 3",
            "construídas fora das 100 menores transcrições",
            "20", fmt_int(len(fora)),
            "audiências " + ", ".join(map(str, fora)), f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Seção 3",
            "menor transcrição entre as construídas fora das 100 menores, em palavras",
            "16.241", fmt_int(pt[fora[0]]),
            f"audiência {fora[0]}", f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Seção 3",
            "maior transcrição entre as construídas fora das 100 menores, em palavras",
            "35.403", fmt_int(pt[fora[-1]]),
            f"audiência {fora[-1]}", f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Seção 3",
            "confere se a audiência 44, citada como exemplo, é uma das construídas fora das 100 menores "
            "(a contagem de palavras dela é conferida em audiencia44.py)",
            "como a própria audiência 44",
            f"audiência 44 {'está' if 44 in fora else 'NÃO está'} entre as {len(fora)}",
            f"{fmt_int(pt[44])} palavras; {por_tamanho.index(44) + 1}ª menor transcrição do acervo",
            f"{LDS_SRC}; {IDX_SRC}", ok=44 in fora),
        Numero(
            "Seção 3",
            "média de palavras da transcrição nas 100 audiências construídas, citada duas vezes na Seção 3 "
            "(a mesma célula da Tabela 1 está em construidas.py)",
            "12.987", fmt_int(media(tw_c)),
            conta_media(tw_c), f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Seção 3",
            "média de palavras da matéria nas 100 audiências construídas",
            "617", fmt_int(media(mw_c)),
            conta_media(mw_c), f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Seção 6.5; Conclusão",
            "audiências do acervo ainda não construídas (fora de index.json)",
            "106", fmt_int(len(restantes)),
            f"{len(todas)} - {len(construidas)}", f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Seção 6.5",
            "média de palavras da transcrição nas 106 audiências não construídas",
            "22.928", fmt_int(media(tw_r)),
            conta_media(tw_r), f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Seção 6.5",
            "maior transcrição entre as 106 audiências não construídas, em palavras",
            "147.728", fmt_int(max(tw_r)),
            f"audiência {max(restantes, key=lambda h: (pt[h], h))}", f"{LDS_SRC}; {IDX_SRC}"),
        Numero(
            "Conclusão",
            "média de palavras da transcrição nas 100 audiências construídas, em milhares sem casa decimal",
            "13 mil", fmt_mil(media(tw_c), 0),
            conta_media(tw_c), f"{LDS_SRC}; {IDX_SRC}"),
    ]


if __name__ == "__main__":
    main(TITULO, numeros)
