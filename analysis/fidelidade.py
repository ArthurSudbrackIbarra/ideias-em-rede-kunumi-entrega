"""Fidelidade das reescritas e texto reproduzido: Seções 5.4, 5.6 e 6.4 do artigo.

Reproduz o limite de 600 caracteres por trecho verbatim, a fração de cada transcrição que os arquivos
jogáveis reproduzem literalmente, a releitura dos pares original/versão simples (regra 19 do contrato)
e as cartas cujo original exibido é menor que o trecho anotado.

Lê: as anotações (data/sim/hearing-NNN.json: `review`, as sentenças de cada carta e as perguntas), as sentenças de
cada fala (src/sim/hearing_text.py sobre a transcrição do dataset), os arquivos jogáveis
(web/public/hearings/hearing-NNN.json) e as constantes SYSTEM e QUOTE_MAX de src/sim/annotate_sim.py.
"""
from __future__ import annotations

import re

from common import Numero, annotations, built_ids, falas, fmt_int, fmt_pct, lds, main, scenes, words
from sim.annotate_sim import QUOTE_MAX, SYSTEM

TITULO = "Fidelidade das reescritas e texto reproduzido (Seções 5.4, 5.6 e 6.4)"

# referência de um trecho verbatim no arquivo jogável: fala.sentença ou fala.primeira-última (ex.: b009.52-53)
REF = re.compile(r"^(b\d{3})\.(\d+)(?:-(\d+))?$")
RETICENCIAS = "…"

# os critérios da regra 19 como o artigo os resume -> como o contrato (SYSTEM) os escreve
CRITERIOS_19 = {
    "mesmo sentido": "mesmo sentido",
    "nada acrescentado": "nada acrescentado",
    "nada essencial omitido": "nada omitido que mude o sentido",
    "números e nomes idênticos": "números, datas, nomes e siglas idênticos",
    "a voz de quem falou": "na voz da pessoa",
    "pergunta mantida como pergunta": "pergunta continua pergunta",
}


def _norm(texto: str) -> str:
    return " ".join(texto.split()).lower()


def regras_do_contrato() -> dict[int, str]:
    """As regras numeradas do bloco de sistema (depois de 'Regras:'), com espaços normalizados e em minúsculas."""
    corpo = SYSTEM.split("\nRegras:\n", 1)[1]
    achadas = re.findall(r"^(\d+)\. (.*?)(?=^\d+\. |\Z)", corpo, re.M | re.S)
    return {int(n): _norm(texto) for n, texto in achadas}


def trechos_verbatim(no, saida: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Todo par {text, ref} do arquivo jogável cuja ref aponta sentenças da transcrição (cartas, páginas, mesa,
    reações, fatos, respostas)."""
    if isinstance(no, dict):
        if isinstance(no.get("text"), str) and isinstance(no.get("ref"), str) and REF.match(no["ref"]):
            saida.append((no["text"], no["ref"]))
        for v in no.values():
            trechos_verbatim(v, saida)
    elif isinstance(no, list):
        for v in no:
            trechos_verbatim(v, saida)
    return saida


def palavras_reproduzidas(hid: int) -> int:
    """Palavras da transcrição que o arquivo jogável reproduz literalmente, contando cada sentença uma vez.

    Uma sentença conta inteira se o texto completo dela aparece em algum trecho que a referencia. Quando só vai
    a primeira sentença cortada com reticências, conta o maior prefixo publicado dela."""
    sentencas = {fid: f["sentences"] for fid, f in falas(hid).items()}
    inteiras: set[tuple[str, int]] = set()
    prefixo: dict[tuple[str, int], int] = {}
    for texto, ref in trechos_verbatim(scenes()[hid], []):
        fid, a, b = REF.match(ref).groups()
        a, b = int(a), int(b or a)
        for i in range(a, b + 1):
            if sentencas[fid][i] in texto:
                inteiras.add((fid, i))
            elif i == a and texto.endswith(RETICENCIAS):
                assert sentencas[fid][i].startswith(texto[:-1]), ref  # o trecho cortado é um prefixo da sentença
                prefixo[(fid, i)] = max(prefixo.get((fid, i), 0), words(texto[:-1]))
    n_inteiras = sum(words(sentencas[fid][i]) for fid, i in inteiras)
    n_prefixos = sum(n for chave, n in prefixo.items() if chave not in inteiras)
    return n_inteiras + n_prefixos


def classe_da_carta(sents: list[str], exibido: str) -> str:
    """Compara o original exibido de uma carta com o trecho anotado, seguindo build_scene.text_of: as sentenças
    entram enquanto o total cabe em QUOTE_MAX; se nem a primeira cabe, ela é cortada com reticências."""
    anotado = " ".join(sents)
    if len(anotado) <= QUOTE_MAX:
        assert exibido == anotado
        return "inteira"
    if len(sents[0]) > QUOTE_MAX:
        assert exibido.endswith(RETICENCIAS) and sents[0].startswith(exibido[:-1])
        return "primeira cortada"
    assert exibido in {" ".join(sents[:k]) for k in range(1, len(sents))}
    return "finais omitidas"


def numeros() -> list[Numero]:
    ids = built_ids()
    anns, cenas = annotations(), scenes()

    # ---- limite de 600 caracteres (Seções 5.4, 5.6 e 6.4)
    meta_quote_max = {cenas[h]["meta"]["quote_max"] for h in ids}
    assert meta_quote_max == {QUOTE_MAX}, f"arquivos jogáveis montados com outro limite: {meta_quote_max}"
    trechos = [(h, t, r) for h in ids for t, r in trechos_verbatim(cenas[h], [])]
    maior_h, maior_texto, maior_ref = max(trechos, key=lambda x: len(x[1]))
    maior = len(maior_texto)

    # ---- texto reproduzido (Seção 5.6)
    reproduzidas = {h: palavras_reproduzidas(h) for h in ids}
    transcricao = {h: words(lds()[h]["transcricao"]) for h in ids}
    media_repr = sum(reproduzidas[h] / transcricao[h] for h in ids) / len(ids)
    pooled_repr = sum(reproduzidas.values()) / sum(transcricao.values())

    # ---- regra 19 (Seção 6.4)
    regras = regras_do_contrato()
    com_todos = [n for n, texto in sorted(regras.items()) if all(frase in texto for frase in CRITERIOS_19.values())]
    achados = [f"'{artigo}' ~ '{contrato}'" for artigo, contrato in CRITERIOS_19.items() if contrato in regras.get(19, "")]

    # ---- releitura dos pares (Seção 6.4): os pares que a regra 19 rege são as cartas ("Para cada carta, plain...")
    lidos_h = {h: anns[h]["review"]["pairs_read"] for h in ids}
    cartas_h = {h: sum(len(f["claims"]) for f in anns[h]["falas"]) for h in ids}
    perguntas_h = {h: sum(1 for q in anns[h]["open_questions"] if q.get("plain")) for h in ids}
    lidos, ajustados = sum(lidos_h.values()), sum(anns[h]["review"]["pairs_fixed"] for h in ids)
    iguais = [h for h in ids if lidos_h[h] == cartas_h[h]]
    cobertas = [h for h in ids if lidos_h[h] >= cartas_h[h]]
    diferentes = "; ".join(f"audiência {h}: {lidos_h[h]} pares relidos para {cartas_h[h]} cartas e {perguntas_h[h]} "
                           "perguntas" for h in ids if h not in iguais)
    detalhe_lidos = (f"pairs_read = nº de cartas em {len(iguais)} audiências; {diferentes}; soma {fmt_int(lidos)} "
                     f"contra {fmt_int(sum(cartas_h.values()))} cartas (e {fmt_int(sum(perguntas_h.values()))} "
                     "perguntas com versão simples)")

    # ---- cartas com original exibido menor que o trecho anotado (Seção 6.4)
    classes: dict[str, int] = {"inteira": 0, "finais omitidas": 0, "primeira cortada": 0}
    for h in ids:
        fs = falas(h)
        exibido = {c["id"]: c["text"] for c in cenas[h]["deck"] if c["kind"] == "claim"}
        pagina = {p["card"]: p["original"]["text"] for e in cenas[h]["timeline"] if e["kind"] == "fala"
                  for p in e["pages"] if p["kind"] == "claim"}
        for f in anns[h]["falas"]:
            for c in f["claims"]:
                assert pagina[c["id"]] == exibido[c["id"]]  # o balão mostra o mesmo original da carta
                sents = [fs[f["id"]]["sentences"][i] for i in c["sentences"]]
                classes[classe_da_carta(sents, exibido[c["id"]])] += 1
    cartas = sum(classes.values())
    omitidas, cortadas = classes["finais omitidas"], classes["primeira cortada"]
    menores = omitidas + cortadas

    fonte_cartas = "data/sim/; web/public/hearings/; src/sim/hearing_text.py; src/sim/build_scene.py"
    return [
        Numero("Seção 5.4; Seção 5.6; Seção 6.4",
               "limite de caracteres de um trecho verbatim: QUOTE_MAX, que build_scene.py usa para montar e cortar o "
               "original", "600", fmt_int(QUOTE_MAX),
               f"QUOTE_MAX = {QUOTE_MAX}; meta.quote_max = {', '.join(map(str, sorted(meta_quote_max)))} "
               f"nos {len(ids)} arquivos jogáveis",
               "src/sim/annotate_sim.py; src/sim/build_scene.py"),
        Numero("Seção 5.4; Seção 5.6",
               "maior trecho verbatim (todo par {text, ref} com ref de sentença) nos arquivos jogáveis; confere se "
               "nenhum passa de QUOTE_MAX caracteres",
               "no máximo 600 caracteres por trecho", f"maior trecho: {fmt_int(maior)} caracteres",
               f"{len(trechos)} trechos; o maior é {maior_ref} da audiência {maior_h}",
               "web/public/hearings/", ok=maior <= QUOTE_MAX),
        Numero("Seção 5.6",
               "média, por audiência, de palavras reproduzidas literalmente / palavras da transcrição (split); cada sentença "
               "conta uma vez, inteira se aparece completa em algum trecho {text, ref}, ou pelo maior prefixo "
               "publicado se só vai cortada com reticências (só os trechos originais {text, ref}; uma versão simples "
               "que por acaso repete uma sentença não conta)",
               "20,5%", fmt_pct(media_repr),
               f"média por audiência = {fmt_pct(media_repr, 4)}; agregado = {sum(reproduzidas.values())}/"
               f"{sum(transcricao.values())} = {fmt_pct(pooled_repr, 4)}",
               "web/public/hearings/; data/publichearingbr/; src/sim/hearing_text.py"),
        Numero("Seção 6.4",
               "afirmação de que cada par foi relido: os pares da regra 19 são as cartas; confere se review.pairs_read "
               "é pelo menos o número de cartas em toda audiência",
               "cada par de original e versão simples foi relido",
               f"pairs_read ≥ cartas em {len(cobertas)} de {len(ids)} audiências", detalhe_lidos,
               "data/sim/", ok=len(cobertas) == len(ids)),
        Numero("Seção 6.4",
               "número da regra do contrato (SYSTEM) cujo texto contém os seis critérios que o artigo cita: mesmo "
               "sentido, nada acrescentado, nada essencial omitido, números e nomes idênticos, voz de quem falou, "
               "pergunta mantida como pergunta",
               "19", ", ".join(map(str, com_todos)) or "nenhuma",
               f"{len(regras)} regras; na 19: " + "; ".join(achados),
               "src/sim/annotate_sim.py"),
        Numero("Seção 6.4", "soma de review.pairs_fixed: pares original/versão simples ajustados na releitura",
               "1.383", fmt_int(ajustados), str(ajustados), "data/sim/"),
        Numero("Seção 6.4", "soma de review.pairs_read: pares original/versão simples relidos",
               "4.119", fmt_int(lidos), f"{lidos}; {detalhe_lidos}", "data/sim/"),
        Numero("Seção 6.4", "pares ajustados / pares relidos, somados em todas as anotações",
               "33,6%", fmt_pct(ajustados / lidos), f"{ajustados}/{lidos} = {fmt_pct(ajustados / lidos, 4)}",
               "data/sim/"),
        Numero("Seção 6.4",
               "cartas cujo original exibido (texto da carta no arquivo jogável) é menor que o trecho anotado "
               "(as sentenças da carta juntas passam de QUOTE_MAX)",
               "159", fmt_int(menores), f"{omitidas} com sentenças finais omitidas + {cortadas} com a primeira cortada",
               fonte_cartas),
        Numero("Seção 6.4", "cartas em todas as anotações (claims das falas)",
               "4.145", fmt_int(cartas), f"{classes['inteira']} exibidas inteiras + {menores} menores", "data/sim/"),
        Numero("Seção 6.4", "cartas com original menor que o trecho anotado / cartas",
               "3,8%", fmt_pct(menores / cartas), f"{menores}/{cartas} = {fmt_pct(menores / cartas, 4)}", fonte_cartas),
        Numero("Seção 6.4",
               "cartas em que o jogo omite as sentenças finais: a primeira sentença cabe em QUOTE_MAX, mas o trecho "
               "inteiro não, e o original exibido é um prefixo de sentenças inteiras",
               "138", fmt_int(omitidas), str(omitidas), fonte_cartas),
        Numero("Seção 6.4",
               "cartas em que a primeira sentença sozinha passa de QUOTE_MAX e é cortada com reticências",
               "21", fmt_int(cortadas), str(cortadas), fonte_cartas),
        Numero("Seção 6.4", "cartas com a primeira sentença cortada / cartas",
               "0,5%", fmt_pct(cortadas / cartas), f"{cortadas}/{cartas} = {fmt_pct(cortadas / cartas, 4)}",
               fonte_cartas),
    ]


if __name__ == "__main__":
    main(TITULO, numeros)
