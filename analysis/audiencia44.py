"""A audiência 44, exemplo do artigo do começo ao fim (Introdução, Seções 3, 4 e 6.3, Tabela 2, Listagem 1, figuras).

Confere cada fato que o artigo cita sobre a audiência do Bloco 59: data, comissão, a decisão do Ibama em debate,
participantes, oradores, falas e palavras; quem defendeu e quem discordou da ideia 2; as referências de sentença
que aparecem nas capturas de tela; a Tabela 2; a frase-molde da Seção 4.5; e a Listagem 1.

Lê:
- data/publichearingbr/PublicHearingBR_LDS.jsonl (a transcrição e a matéria da audiência 44) e a divisão em
  falas e sentenças de src/sim/hearing_text.py;
- web/public/hearings/catalog.json (data e comissão);
- data/sim/hearing-044.json (a anotação: oradores, falas, cartas, relações);
- web/public/hearings/hearing-044.json (o arquivo jogável: elenco, ideias, linha do tempo, glossário);
- web/src/sim/copy.ts (os moldes das frases do jogador). A lógica que os preenche (sayMove, em
  web/src/sim/engine/say.ts) e a que escolhe o trecho do dossiê (quoteFor e align) está portada para Python aqui.

As células da Tabela 2 e os objetos da Listagem 1 estão copiados abaixo como o artigo os imprime, no mesmo papel
do campo `artigo` dos outros números: são o gabarito comparado com os dados.

    uv run analysis/audiencia44.py
"""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date

from common import ROOT, Numero, annotations, catalog, falas, fmt_int, lds, main, scenes, words
from sim.hearing_text import split_turns

TITULO = "A audiência 44 (Introdução, Seção 4, figuras e listagem)"

HID = 44
IDEIA = "t2"  # a ideia 2, escolhida na partida da Seção 4
# referências de sentença impressas nas legendas (são a entrada da conferência, não o resultado)
REF_BALAO = "b002.6-7"      # Figuras 1 e 4, Seção 4.3
REF_PALMAS = "b011.75-76"   # Figura 3b
REF_TABELA = "b011.64-65"   # Tabela 2
# as duas anotações da intervenção das Figuras 6 e 7a: a contestada (MME) e a citada (Observatório do Clima)
CONTESTADA, CITADA = "b007c2", "b011c2"

COPY_TS = ROOT / "web" / "src" / "sim" / "copy.ts"

LDS_SRC = "data/publichearingbr/PublicHearingBR_LDS.jsonl"
DIV_SRC = "src/sim/hearing_text.py"
CAT_SRC = "web/public/hearings/catalog.json"
ANN_SRC = "data/sim/hearing-044.json"
CENA_SRC = "web/public/hearings/hearing-044.json"
TEX_SRC = "artigo"

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
EXTENSO = {1: "um", 2: "dois", 3: "três", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito", 9: "nove"}
EXTENSO_FEM = {**EXTENSO, 1: "uma", 2: "duas"}

# org de um deputado federal no arquivo jogável: "Câmara dos Deputados (PSOL-SP)"
DEPUTADO = re.compile(r"^Câmara dos Deputados \((?P<partido>[^)]+)-(?P<uf>[A-Z]{2})\)$")
# parêntese da marcação de orador de um parlamentar: "José Priante. Bloco/MDB - PA", "PL - SC"
PARTIDO_UF = re.compile(r"(?P<partido>[A-Za-z]+)\s*-\s*(?P<uf>[A-Z]{2})$")

# as entidades do setor de petróleo são escolhidas à mão, cada uma com o nome por extenso que a transcrição registra
# (conferido em numeros()): o IBP reúne as empresas do setor; o INEEP é um instituto de estudos do petróleo criado
# pela FUP. O plural "entidades" do artigo só vale contando o INEEP; sem ele, sobra só o IBP.
ENTIDADES_PETROLEO = {
    "IBP": "Instituto Brasileiro de Petróleo e Gás",
    "INEEP": "Instituto de Estudos Estratégicos de Petróleo, Gás Natural e Biocombustíveis",
}

# a decisão que a audiência debateu, em partes: (o que a parte afirma, expressões que uma mesma sentença da
# transcrição precisa ter para sustentá-la)
DECISAO = [
    ("o Ibama negou a licença do Bloco 59", (r"ibama", r"bloco 59", r"rejei|indefer")),
    ("pedida pela Petrobras para perfurar um poço", (r"bloco 59", r"petrobras", r"perfura", r"\bpoço\b")),
    ("o poço fica na costa do Amapá", (r"\bpoço\b", r"costa \w+ Amapá")),
]


def menciona(orador: dict, padrao: str, *campos: str) -> bool:
    """Algum dos campos do orador da anotação tem a expressão (usada nas regras de GRUPOS)."""
    return re.search(padrao, " ".join(orador[c] for c in campos), re.I) is not None


# os participantes que a Introdução enumera: (grupo como o artigo o escreve, regra sobre o orador da anotação,
# mínimo, máximo). "órgãos" e "entidades" pedem dois ou mais; "a", "uma" e "um", exatamente um.
GRUPOS = [
    ("órgãos do governo federal", lambda s: s["role"] == "governo" and s["gov_level"] == "federal", 2, None),
    ("Petrobras", lambda s: s["org"] == "Petrobras", 1, 1),
    ("entidades do setor de petróleo", lambda s: s["org"] in ENTIDADES_PETROLEO, 2, None),
    ("federação sindical dos petroleiros", lambda s: s["org"] == "FUP", 1, 1),
    ("organização ambientalista",
     lambda s: s["role"] == "sociedade_civil" and menciona(s, r"clima|ambient", "org", "org_plain"), 1, 1),
    ("pesquisador", lambda s: menciona(s, r"pesquisador", "cargo"), 1, 1),
]


# ------------------------------------------------------------------ formatação como no texto

def extenso(n: int, feminino: bool = False) -> str:
    return (EXTENSO_FEM if feminino else EXTENSO).get(n, str(n))


def data_extenso(ddmmaaaa: str) -> str:
    """'31/05/2023' -> '31 de maio de 2023'."""
    d, m, a = map(int, ddmmaaaa.split("/"))
    return f"{d} de {MESES[m - 1]} de {a}"


def juntar(itens: list[str]) -> str:
    """['a', 'b', 'c'] -> 'a, b e c'."""
    return ", ".join(itens[:-1]) + " e " + itens[-1] if len(itens) > 1 else "".join(itens)


def quem(m: dict) -> str:
    """'Mauro Pires, do ICMBio': o nome do elenco e a byline até a primeira vírgula."""
    return f"{m['name']}, {m['byline'].split(',')[0]}"


def nome_org(m: dict) -> str:
    """'Deyvid Bacelar (FUP)': o nome e a instituição do elenco."""
    return f"{m['name']} ({m['org']})"


def lado(orgs: list[str], do_lado: set[str], elenco: dict) -> str:
    """Um lado de uma ideia escrito como no artigo: as instituições na ordem do arquivo jogável e, no fim, os
    deputados desse lado agrupados por partido ('deputados do PSOL e do PL', 'dois deputados do MDB')."""
    itens, partidos = [], {}
    for org in orgs:
        m = DEPUTADO.match(org)
        if m is None:
            itens.append(org)
        else:
            n = sum(1 for sid in do_lado if elenco[sid]["org"] == org)  # deputados do lado com essa org
            partidos[m["partido"]] = partidos.get(m["partido"], 0) + n
    if len(partidos) > 1 and all(n == 1 for n in partidos.values()):
        itens.append("deputados " + " e ".join(f"do {p}" for p in partidos))
    else:
        itens += [f"{extenso(n)} deputado{'s' if n > 1 else ''} do {p}" for p, n in partidos.items()]
    return juntar(itens)


def sem_artigos(frase: str) -> str:
    """'o Ministério de Minas e Energia (MME), o IBP' -> 'MME, IBP'.

    Tira os artigos e troca 'nome (SIGLA)' pela sigla."""
    frase = re.sub(r"(^|, | e )(?:o|a|os|as) ", r"\1", frase)
    return re.sub(r"[A-ZÀ-Ú][^,()]*\((\w+)\)", r"\1", frase)


def casa_com_lacunas(trecho: str, texto: str) -> bool:
    """O texto bate com o trecho do artigo, em que cada '[...]' vale por um pedaço omitido (não vazio)."""
    partes = re.split(r"\s*\[\.\.\.\]", trecho)
    return re.fullmatch(".+?".join(map(re.escape, partes)), texto, re.S) is not None


# ------------------------------------------------------------------ leitura

def cartas_anotacao(ann: dict) -> dict[str, dict]:
    return {c["id"]: c for f in ann["falas"] for c in f.get("claims") or []}


def pagina(cena: dict, ref: str) -> tuple[dict, dict]:
    """(evento da fala, página do balão) cuja referência de origem é `ref`."""
    for e in cena["timeline"]:
        if e["kind"] == "fala":
            for p in e["pages"]:
                if p["original"]["ref"] == ref:
                    return e, p
    raise SystemExit(f"nenhuma página com a referência {ref}")


def participantes(oradores: dict, cena: dict) -> tuple[dict[str, list[str]], list[str], list[str]]:
    """(orgs de cada grupo de GRUPOS, ideias com órgãos federais dos dois lados, orgs que não entram em grupo
    nenhum, fora a mesa e os deputados federais, que o artigo enumera à parte)."""
    grupos = {nome: [s["org"] for _, s in sorted(oradores.items()) if regra(s)] for nome, regra, _, _ in GRUPOS}
    federais = set(grupos["órgãos do governo federal"])
    divergem = [t["id"] for t in cena["teses"]
                if federais & set(t["defender_orgs"]) and federais & set(t["opponent_orgs"])]
    listados = {o for orgs in grupos.values() for o in orgs}
    fora = sorted({s["org"] for s in oradores.values()
                   if s["org"] not in listados and s["role"] != "mesa" and not DEPUTADO.match(s["org"])})
    return grupos, divergem, fora


def lados(cena: dict, tese: dict) -> tuple[set[str], set[str]]:
    """(quem defendeu, quem discordou) da ideia, como build_scene.py os acha: os oradores das cartas do baralho num
    tema da ideia, do mesmo lado dela ou do lado oposto."""
    defendeu, discordou = set(), set()
    for c in cena["deck"]:
        if c["kind"] == "claim" and c["theme"] in tese["positions"] and c["position"] in ("favoravel", "contrario"):
            (defendeu if alinhada(tese, c) else discordou).add(c["speaker"])
    return defendeu, discordou


def em_lados_opostos(t: dict, a: str, b: str) -> bool:
    """Na ideia t, a está só entre os que defenderam e b só entre os que discordaram."""
    defende, discorda = set(t["defender_orgs"]), set(t["opponent_orgs"])
    return a in defende - discorda and b in discorda - defende


def partidos(orgs: list[str]) -> set[str]:
    """Os partidos dos deputados federais numa lista de orgs ('Câmara dos Deputados (PSOL-SP)' -> 'PSOL')."""
    return {m["partido"] for o in orgs if (m := DEPUTADO.match(o))}


def sentencas_com(fs: dict, padroes: tuple[str, ...]) -> list[str]:
    """Referências (fala.sentença) das sentenças da transcrição que têm todas as expressões."""
    return [f"{fid}.{i}" for fid, f in fs.items() for i, s in enumerate(f["sentences"])
            if all(re.search(p, s, re.I) for p in padroes)]


def deputados_na_transcricao(transcricao: str) -> dict[str, tuple[str, str]]:
    """Oradores cuja marcação da taquigrafia traz partido e UF ("O SR. CLEBER VERDE(Bloco/MDB - MA) -"),
    com as marcações separadas por split_turns, de hearing_text.py: {marcação: (partido, UF)}."""
    out = {}
    for t in split_turns(transcricao):
        m = PARTIDO_UF.search(t["paren"] or "")
        if m:
            out[f"{t['speaker_raw'].title()} ({t['paren']})"] = (m["partido"], m["uf"])
    return out


def alinhada(tese: dict, carta: dict) -> bool:
    """A carta toma o lado da ideia num tema dela (porte do caso 'aliada' de align, em web/src/sim/engine/judge.ts)."""
    lado_da_ideia = tese["positions"].get(carta["theme"])
    return carta["position"] in ("favoravel", "contrario") and carta["position"] == lado_da_ideia


def trecho_do_dossie(cena: dict, tese: dict) -> dict:
    """O trecho do dossiê (porte de quoteFor, em web/src/sim/ui/TeseSelect.tsx): a primeira das claims_chave do lado
    da ideia; sem nenhuma, a primeira carta do baralho do lado da ideia."""
    cartas = {c["id"]: c for c in cena["deck"] if c["kind"] == "claim"}
    for cid in tese["claims_chave"]:
        if cid in cartas and alinhada(tese, cartas[cid]):
            return cartas[cid]
    return next(c for c in cartas.values() if alinhada(tese, c))


def moldes_contesto_cito() -> list[str]:
    """As três variantes do molde 'contestar citando outra anotação', lidas de web/src/sim/copy.ts."""
    bloco = re.search(r"contestoCito:\s*\[(.*?)\]", COPY_TS.read_text(encoding="utf-8"), re.S).group(1)
    return re.findall(r"'([^']*)'", bloco)


def preenche(molde: str, cena: dict, carta: dict, citada: dict) -> str:
    """Porte de sayMove (web/src/sim/engine/say.ts): preenche o molde com nome e byline do elenco e o gist das
    cartas."""
    elenco = {m["id"]: m for m in cena["cast"]}

    def who(sid: str) -> str:
        m = elenco[sid]
        nome = "a presidência da Comissão" if m["role"] == "mesa" else m["name"]
        return f"{nome}, {m['byline']}," if m["byline"] else f"{nome},"

    frase = molde
    for chave, valor in [("{quem}", who(carta["speaker"])), ("{quem-}", who(carta["speaker"]).removesuffix(",")),
                         ("{gist}", carta["gist"]), ("{plain}", ""),
                         ("{quemB}", who(citada["speaker"])), ("{quemB-}", who(citada["speaker"]).removesuffix(",")),
                         ("{gistB}", citada["gist"])]:
        frase = frase.replace(chave, valor, 1)  # String.replace do JS troca só a primeira ocorrência
    return frase[0].upper() + frase[1:]


# As duas células da Tabela 2, como o artigo as imprime (inclusive os espaços que faltam na transcrição).
TABELA2_TRANSCRICAO = (
    'E a questão aqui não é uma questão jurídica."Eu obtive a manifestação prévia." "O Supremo diz que não é '
    'obrigatória."A questão é que os técnicos estão dizendo, já há muitos anos, em outros processos também, que eles '
    "não conseguem decidir adequadamente, na Margem Equatorial, pela ausência das Avaliações Ambientais de Área "
    "Sedimentar.Então, essa não é uma questão burocrática. O fato de se ter uma manifestação prévia não significa que "
    "não se precisa cumprir a Avaliação Ambiental de Área Sedimentar."
)
TABELA2_SIMPLES = (
    "Isto não é uma discussão jurídica nem burocrática. Há muitos anos os técnicos dizem que não conseguem decidir bem "
    "sobre a Margem Equatorial sem a AAAS, a avaliação de toda a região. A manifestação dos ministérios não dispensa "
    "esse estudo."
)
# Os dois objetos da Listagem 1, com as linhas quebradas no artigo juntadas de novo; "[...]" marca o fim omitido.
LISTAGEM_CARTA = {
    "id": "b009c1", "sentences": [52, 53], "theme": "d3", "position": "contrario",
    "gist": "a manifestação conjunta dos 2 ministros é uma exceção mais política do que técnica, e em 11 anos a AAAS "
            "já devia existir",
    "plain": "A regra prevê, como exceção, que os 2 ministros, do Meio Ambiente e de Minas e Energia, autorizem "
             "petróleo em áreas sem a AAAS, a avaliação regional. É uma decisão mais política do que técnica. Em 11 "
             "anos, esses estudos já deviam existir.",
}
LISTAGEM_RELACAO = {
    "from": "b011", "to": "b007", "kind": "contradiz", "strength": "forte",
    "from_claim": "b011c2", "to_claim": "b007c2",
    "note": "Rebate o argumento jurídico do MME (manifestação prévia obtida, STF): os técnicos dizem há anos que não "
            "conseguem decidir sem a AAAS [...]",
}


def palavras_longas(texto: str) -> set[str]:
    return {w.lower() for w in re.findall(r"\w{5,}", texto)}


# ------------------------------------------------------------------ os números

def numeros() -> list[Numero]:
    ann, cena, fs = annotations()[HID], scenes()[HID], falas(HID)
    oradores = ann["speakers"]
    elenco = {m["id"]: m for m in cena["cast"]}
    cartas = cartas_anotacao(ann)
    deck = {c["id"]: c for c in cena["deck"]}
    orador_da_fala = {f["id"]: f["speaker"] for f in ann["falas"]}
    teses = {t["id"]: t for t in cena["teses"]}
    tese = teses[IDEIA]
    transcricao = lds()[HID]["transcricao"]
    cat = catalog()[HID]
    nums: list[Numero] = []

    # --- Introdução: a sessão
    nums.append(Numero(
        "Introdução", "comissão que promoveu a audiência 44 em catalog.json",
        "Comissão de Meio Ambiente e Desenvolvimento Sustentável", cat["committee"],
        f"arquivo jogável: {cena['committee']}", CAT_SRC))
    nums.append(Numero(
        "Introdução", "data da audiência 44 em catalog.json, por extenso",
        "31 de maio de 2023", data_extenso(cat["date"]), cat["date"], CAT_SRC))

    # --- Introdução: a decisão que a audiência debateu
    provas = {parte: sentencas_com(fs, padroes) for parte, padroes in DECISAO}
    na_materia = [s for s in re.split(r"(?<=[.!?])\s+", lds()[HID]["materia"]) if re.search(r"Ibama negou", s)]
    nums.append(Numero(
        "Introdução",
        "sentenças da transcrição que sustentam cada parte da decisão, pelas expressões de DECISAO (todas na mesma "
        "sentença); confere se toda parte tem ao menos uma",
        "decisão do Ibama [...] de negar à Petrobras a licença para perfurar um poço no Bloco 59, na costa do Amapá",
        "; ".join(f"{parte}: {', '.join(refs) or 'nenhuma'}" for parte, refs in provas.items()),
        f"na matéria: {' | '.join(na_materia) or 'nenhuma'}", DIV_SRC + "; " + LDS_SRC,
        ok=all(provas.values())))

    # a data da decisão, dita pelo presidente do Ibama na audiência: o parecer dele ("meu parecer"), que veio depois
    # do parecer da equipe técnica e foi a decisão final
    fala_ibama = [fid for fid in fs if elenco[orador_da_fala[fid]]["org"] == "Ibama"]
    ref_parecer, m_parecer = next(
        (f"{fid}.{i}", m) for fid in fala_ibama for i, s in enumerate(fs[fid]["sentences"])
        if (m := re.search(rf"\bmeu parecer\b.*\bdia (\d{{1,2}}) de ({'|'.join(MESES)})", s)))
    dia_audiencia, mes_audiencia, ano = map(int, cat["date"].split("/"))
    decisao = date(ano, MESES.index(m_parecer[2]) + 1, int(m_parecer[1]))
    dias = (date(ano, mes_audiencia, dia_audiencia) - decisao).days
    nums.append(Numero(
        "Introdução",
        "dias entre a decisão do Ibama (a data do parecer do presidente do Ibama, o 'meu parecer' que ele diz na "
        "audiência) e a audiência; critério para 'poucos dias': depois da decisão e a menos de um mês dela (1 a 30 "
        "dias)",
        "tomada poucos dias antes", f"{dias} dias antes",
        f"decisão em {decisao:%d/%m/%Y} ({ref_parecer}: '{m_parecer[0]}'); audiência em {cat['date']}",
        DIV_SRC + "; " + CAT_SRC, ok=0 < dias <= 30))

    # --- Introdução: os participantes
    grupos, divergem, fora = participantes(oradores, cena)
    contagens_ok = all(len(grupos[nome]) >= minimo and (maximo is None or len(grupos[nome]) <= maximo)
                       for nome, _, minimo, maximo in GRUPOS)
    por_extenso = {org: transcricao.count(nome) for org, nome in ENTIDADES_PETROLEO.items()}
    nums.append(Numero(
        "Introdução",
        "oradores da anotação por grupo, pelas regras de GRUPOS (governo federal = role governo e gov_level federal; "
        "entidades do petróleo = IBP e INEEP, escolhidas à mão, cada uma conferida pelo nome por extenso na "
        "transcrição; ambientalista = sociedade civil com 'clima' ou 'ambient' na org ou org_plain; pesquisador = "
        "'pesquisador' no cargo). Confere se há 2+ órgãos federais, em lados opostos de alguma ideia, 2+ entidades "
        "do petróleo e exatamente uma Petrobras, uma FUP, uma organização ambientalista e um pesquisador. O plural "
        "'entidades' só vale contando o INEEP, instituto de estudos criado pela FUP; sem ele, só o IBP",
        "órgãos do governo federal com posições divergentes entre si, a Petrobras, entidades do setor de petróleo, "
        "a federação sindical dos petroleiros, uma organização ambientalista, um pesquisador",
        "; ".join(f"{nome}: {', '.join(orgs)}" for nome, orgs in grupos.items()),
        f"órgãos federais em lados opostos nas ideias {', '.join(divergem)}; nomes por extenso na transcrição: "
        + ", ".join(f"{org} = {ENTIDADES_PETROLEO[org]} ({n}x)" for org, n in por_extenso.items())
        + f"; também falaram (fora dessa lista, além da mesa e dos deputados federais): {', '.join(fora)}",
        ANN_SRC + "; " + CENA_SRC + "; " + LDS_SRC, ok=contagens_ok and bool(divergem) and all(por_extenso.values())))

    deputados = deputados_na_transcricao(transcricao)
    ufs = sorted({uf for _, uf in deputados.values()})
    ufs_ann = sorted({m[1] for s in oradores.values() if (m := re.search(r"Deputad[oa].*-([A-Z]{2})\)", s["cargo"]))})
    nums.append(Numero(
        "Introdução",
        "UFs distintas nas marcações de orador da transcrição que trazem partido e UF (os deputados, presidente "
        "da comissão incluído); marcações separadas por split_turns (hearing_text.py), partido e UF lidos do "
        "parêntese com a expressão PARTIDO_UF deste script",
        "seis", extenso(len(ufs)),
        f"{len(ufs)} UFs: {', '.join(ufs)}; marcações: {'; '.join(deputados)}; na anotação: {', '.join(ufs_ann)}",
        LDS_SRC + "; " + DIV_SRC))

    nomes = {f["speaker"] for f in fs.values()}
    nums.append(Numero(
        "Introdução", "oradores distintos na divisão da transcrição em falas (hearing_text.py)",
        "18", fmt_int(len(nomes)), f"divisão: {len(nomes)}; oradores na anotação: {len(oradores)}",
        DIV_SRC + "; " + ANN_SRC))
    nums.append(Numero(
        "Introdução", "falas na divisão da transcrição (turnos consecutivos do mesmo orador viram uma fala)",
        "71", fmt_int(len(fs)), f"divisão: {len(fs)}; falas na anotação: {len(ann['falas'])}",
        DIV_SRC + "; " + ANN_SRC))
    nums.append(Numero(
        "Introdução; Seção 3", "palavras da transcrição da audiência 44: len(transcricao.split())",
        "29.994", fmt_int(words(transcricao)), f"{words(transcricao)}; catalog.json: {cat['words']}", LDS_SRC))

    siglas = {s: len(re.findall(rf"\b{s}\b", transcricao)) for s in ("AAAS", "IBP")}
    nums.append(Numero(
        "Introdução", "ocorrências das siglas AAAS e IBP na transcrição (palavra inteira); confere se as duas aparecem",
        "siglas como AAAS e IBP", "; ".join(f"{s}: {n} ocorrências" for s, n in siglas.items()),
        "", LDS_SRC, ok=all(siglas.values())))
    refs = {"portaria(s)": len(re.findall(r"\bportarias?\b", transcricao, re.I)),
            "Supremo/STF": len(re.findall(r"\b(?:Supremo|STF)\b", transcricao))}
    nums.append(Numero(
        "Introdução",
        "menções a portarias e ao Supremo (Supremo ou STF) na transcrição; confere se cada uma aparece 2+ vezes "
        "(o texto fala no plural)",
        "referências a portarias e a decisões do Supremo Tribunal Federal",
        "; ".join(f"{k}: {n}" for k, n in refs.items()), "", LDS_SRC, ok=all(n >= 2 for n in refs.values())))

    # --- Figuras 1 e 4: o balão de Mauro Pires
    ev_balao, pag_balao = pagina(cena, REF_BALAO)
    nums.append(Numero(
        "Figura 1",
        f"orador da página do balão com referência {REF_BALAO}: nome e byline do elenco (até a vírgula)",
        "Mauro Pires, do ICMBio", quem(elenco[ev_balao["speaker"]]),
        f"fala {ev_balao['id']}, orador {ev_balao['speaker']}, org {elenco[ev_balao['speaker']]['org']}",
        CENA_SRC))
    termos = [g for g in cena["glossario"] if g["term"] in pag_balao["plain"]]
    nums.append(Numero(
        "Figura 1; Figura 4c",
        f"termos do glossário da audiência que aparecem no texto simples da página {REF_BALAO}; confere se "
        "'Acordo de Paris' está entre eles",
        "Acordo de Paris", "; ".join(g["term"] for g in termos),
        "; ".join(f"{g['term']} (entrada do glossário em {g['ref']}): {g['plain']}" for g in termos),
        CENA_SRC, ok="Acordo de Paris" in [g["term"] for g in termos]))

    # --- Introdução e Seção 6.3: as alianças da ideia 2 (a Introdução remete à Seção 4.1)
    nivel = {s["org"]: s["gov_level"] for s in oradores.values()}
    ibama_mme = [t["id"] for t in cena["teses"]
                 if em_lados_opostos(t, "Ibama", "MME") or em_lados_opostos(t, "MME", "Ibama")]
    nums.append(Numero(
        "Introdução; Seção 6.3",
        "na ideia 2, o Ibama só entre os que defenderam (defender_orgs) e o MME só entre os que discordaram "
        "(opponent_orgs); confere se é assim",
        "o Ibama e o Ministério de Minas e Energia estiveram em lados opostos",
        "ideia 2: Ibama defendeu, MME discordou" if em_lados_opostos(tese, "Ibama", "MME") else "não na ideia 2",
        f"ideias com os dois em lados opostos: {', '.join(ibama_mme)}; gov_level na anotação: Ibama "
        f"{nivel['Ibama']}, MME {nivel['MME']}",
        CENA_SRC, ok=em_lados_opostos(tese, "Ibama", "MME")))

    def juntos_a_favor(t: dict) -> bool:
        return {"PSOL", "PL"} <= partidos(t["defender_orgs"]) - partidos(t["opponent_orgs"])

    nums.append(Numero(
        "Introdução",
        "na ideia 2, deputados do PSOL e do PL entre os que defenderam (defender_orgs) e nenhum dos dois entre os "
        "que discordaram (opponent_orgs); confere se é assim",
        "deputados do PSOL e do PL defenderam a mesma ideia",
        "ideia 2: PSOL e PL defenderam" if juntos_a_favor(tese) else "não na ideia 2",
        f"ideias com os dois só do lado que defendeu: {', '.join(t['id'] for t in cena['teses'] if juntos_a_favor(t))}",
        CENA_SRC, ok=juntos_a_favor(tese)))

    # --- Seção 4: a audiência do Bloco 59
    blocos = Counter(re.findall(r"\bbloco (?:FZA-M-)?(\d+)", transcricao, re.I))
    nums.append(Numero(
        "Seção 4",
        "menções a cada bloco numerado na transcrição ('Bloco 59' ou 'Bloco FZA-M-59'); confere se o Bloco 59 é o "
        "mais citado, com mais menções que qualquer outro",
        "audiência 44 (referente ao Bloco 59)", f"Bloco 59: {blocos['59']} menções",
        "; ".join(f"Bloco {b}: {n}" for b, n in blocos.most_common()), LDS_SRC,
        ok=all(blocos["59"] > n for b, n in blocos.items() if b != "59")))

    # --- Figura 2b: o dossiê
    trecho = trecho_do_dossie(cena, tese)
    nums.append(Numero(
        "Figura 2b",
        "referência do trecho do dossiê da ideia 2: a primeira das claims_chave do lado da ideia, por um porte em "
        "Python de quoteFor (TeseSelect.tsx) e do caso 'aliada' de align (judge.ts)",
        "b009.52-53", trecho["ref"],
        f"carta {trecho['id']}, tema {trecho['theme']} {trecho['position']}; "
        f"claims_chave: {', '.join(tese['claims_chave'])}",
        CENA_SRC))
    nums.append(Numero(
        "Figura 2b", "ideias (teses) da audiência 44 no arquivo jogável",
        "seis", extenso(len(cena["teses"]), feminino=True), str(len(cena["teses"])), CENA_SRC))

    # --- Seção 4.1: a ideia 2
    nums.append(Numero(
        "Seção 4.1", "título da ideia 2 (campo title da tese t2)",
        "Sem avaliar toda a região, não dá para decidir o Bloco 59", tese["title"], "", CENA_SRC))
    defendeu, discordou = lados(cena, tese)

    def deputados_do_lado(do_lado: set[str]) -> str:
        return ", ".join(f"{sid} ({elenco[sid]['org']})" for sid in sorted(do_lado)
                         if DEPUTADO.match(elenco[sid]["org"]))

    defensores = "Ibama, Observatório do Clima, UENF e deputados do PSOL e do PL"
    nums.append(Numero(
        "Seção 4.1",
        "quem defendeu a ideia 2: defender_orgs, com os deputados agrupados por partido (contados entre os oradores "
        "das cartas do baralho do lado da ideia, como em build_scene.py)",
        defensores, lado(tese["defender_orgs"], defendeu, elenco),
        f"defender_orgs: {tese['defender_orgs']}; deputados do lado: {deputados_do_lado(defendeu)}; "
        f"por papel no arquivo jogável: {tese['defenders']}", CENA_SRC))
    opositores = "o Ministério de Minas e Energia (MME), o IBP, a FUP, a Petrobras e dois deputados do MDB"
    valor_opositores = lado(tese["opponent_orgs"], discordou, elenco)
    nums.append(Numero(
        "Seção 4.1",
        "quem discordou da ideia 2: opponent_orgs, com os deputados agrupados por partido (contados entre os "
        "oradores das cartas do baralho do lado oposto ao da ideia, como em build_scene.py); compara com a frase "
        "do artigo sem os artigos e com 'nome (SIGLA)' trocado pela sigla",
        opositores, valor_opositores,
        f"opponent_orgs: {tese['opponent_orgs']}; deputados do lado: {deputados_do_lado(discordou)}; "
        f"por papel no arquivo jogável: {tese['opponents']}", CENA_SRC,
        ok=sem_artigos(opositores) == valor_opositores))

    # --- Figura 3: a sala
    abertura = cena["timeline"][0]
    nums.append(Numero(
        "Figura 3a", "referência do primeiro evento da linha do tempo, se for um ato da mesa (cartão escuro)",
        "b001.0", abertura["original"]["ref"] if abertura["kind"] == "mesa" else f"evento {abertura['kind']}",
        f"{abertura['kind']} '{abertura['move']}': {abertura['text']}", CENA_SRC))
    fala_palmas = REF_PALMAS.split(".")[0]
    nums.append(Numero(
        "Figura 3b; Tabela 2",
        f"oradora da fala {fala_palmas} (das referências {REF_PALMAS} e {REF_TABELA}): nome e byline do elenco",
        "Suely Araújo, do Observatório do Clima", quem(elenco[orador_da_fala[fala_palmas]]),
        f"orador {orador_da_fala[fala_palmas]}, org {elenco[orador_da_fala[fala_palmas]]['org']}", CENA_SRC))
    com_palmas = sorted(k for k, f in fs.items() if f["applause"])
    nums.append(Numero(
        "Figura 3b",
        f"registros de palmas da taquigrafia dentro da fala {fala_palmas} (contador applause da divisão); "
        "confere se há algum",
        "a transcrição registra palmas", f"{fs[fala_palmas]['applause']} registro(s) de palmas",
        f"falas com palmas na audiência: {', '.join(com_palmas)}", DIV_SRC, ok=fs[fala_palmas]["applause"] > 0))
    ev_palmas = next(e for e in cena["timeline"] if e["kind"] == "fala" and e["id"] == fala_palmas)
    nums.append(Numero(
        "Figura 3b", f"referência da última página do balão da fala {fala_palmas}",
        "b011.75-76", ev_palmas["pages"][-1]["original"]["ref"],
        f"páginas: {', '.join(p['original']['ref'] for p in ev_palmas['pages'])}; applause do evento: "
        f"{ev_palmas['applause']}", CENA_SRC))

    # --- Seção 4.3: a referência das sentenças
    carta_balao = cartas[pag_balao["card"]]
    posicao = list(fs).index(ev_balao["id"]) + 1
    nums.append(Numero(
        "Seção 4.3",
        f"o que a referência {REF_BALAO} aponta: posição da fala na divisão e sentenças da carta mostrada na página",
        "fala 2, sentenças 6 e 7", f"fala {posicao}, sentenças {juntar([str(s) for s in carta_balao['sentences']])}",
        f"carta {carta_balao['id']}, sentences {carta_balao['sentences']}", DIV_SRC + "; " + ANN_SRC))

    # --- Seção 4.3 e Tabela 2: o trecho de Suely Araújo
    carta_tabela = cartas[next(c["id"] for c in deck.values() if c.get("ref") == REF_TABELA)]
    fala_tabela = REF_TABELA.split(".")[0]
    original = " ".join(fs[fala_tabela]["sentences"][i] for i in carta_tabela["sentences"])
    aspas = re.findall(r'"([^"]+)"', original)
    so_nas_aspas = set().union(*map(palavras_longas, aspas)) - palavras_longas(re.sub(r'"[^"]+"', " ", original))
    omitidas = not (so_nas_aspas & palavras_longas(carta_tabela["plain"]))
    artigo_aspas = "duas"
    nums.append(Numero(
        "Seção 4.3",
        f"frases entre aspas nas sentenças de {REF_TABELA}; confere também se ficaram fora do texto simples: "
        "nenhuma palavra de 5+ letras que só aparece nelas está no texto simples",
        artigo_aspas, extenso(len(aspas), feminino=True),
        f"{' | '.join(aspas)}; palavras só das aspas: {', '.join(sorted(so_nas_aspas))}; "
        f"ausentes do texto simples: {'sim' if omitidas else 'não'}",
        DIV_SRC + "; " + ANN_SRC, ok=extenso(len(aspas), feminino=True) == artigo_aspas and omitidas))

    cel_transcricao, cel_simples = TABELA2_TRANSCRICAO, TABELA2_SIMPLES
    nums.append(Numero(
        "Tabela 2",
        f"célula 'Transcrição' do artigo e as sentenças "
        f"{carta_tabela['sentences']} da fala {fala_tabela} unidas por um espaço, como na divisão",
        cel_transcricao, original, f"{len(original)} caracteres", TEX_SRC + "; " + DIV_SRC))
    nums.append(Numero(
        "Tabela 2",
        f"célula 'Palavras simples' do artigo e o plain da carta {carta_tabela['id']} da anotação",
        cel_simples, carta_tabela["plain"], f"carta {carta_tabela['id']}, sentences {carta_tabela['sentences']}",
        TEX_SRC + "; " + ANN_SRC))

    # --- Seção 4.5 e Figuras 6 e 7: a intervenção
    contestada, citada = deck[CONTESTADA], deck[CITADA]
    frases = [preenche(m, cena, contestada, citada) for m in moldes_contesto_cito()]
    intervencao = ("Carlos Agenor Onofre Cabral, do Ministério de Minas e Energia, afirmou que a manifestação conjunta "
                   "dos ministérios tem o mesmo rigor da AAAS [...]. Mas Suely Araújo, do Observatório do Clima, "
                   "mostrou aqui que a questão não é jurídica [...]")
    casam = [f for f in frases if casa_com_lacunas(intervencao, f)]
    nums.append(Numero(
        "Seção 4.5",
        f"as variantes do molde contestoCito, lidas de copy.ts, preenchidas por um porte em Python de sayMove (say.ts) "
        f"com a carta contestada {CONTESTADA} e a citada {CITADA}; confere se alguma bate com a frase do artigo, em "
        "que cada [...] é um trecho omitido",
        intervencao, casam[0] if casam else frases[-1],
        f"{len(casam)} de {len(frases)} variantes batem",
        "web/src/sim/copy.ts; porte de web/src/sim/engine/say.ts; " + CENA_SRC, ok=len(casam) == 1))
    nums.append(Numero(
        "Figura 6", f"autores das anotações contestada ({CONTESTADA}) e citada ({CITADA}): nome e org do elenco",
        "Carlos Agenor Onofre Cabral (MME) e Suely Araújo (Observatório do Clima)",
        f"{nome_org(elenco[contestada['speaker']])} e {nome_org(elenco[citada['speaker']])}", "", CENA_SRC))
    real = [r for r in ann["relations"]
            if r["kind"] == "contradiz" and r["from_claim"] == CITADA and r["to_claim"] == CONTESTADA]
    nums.append(Numero(
        "Figura 7a",
        f"relações 'contradiz' da anotação da carta citada ({CITADA}) para a contestada ({CONTESTADA}); confere se há",
        "cita quem de fato contradisse a fala contestada na audiência real",
        "; ".join(f"{r['from_claim']} contradiz {r['to_claim']} ({r['strength']})" for r in real) or "nenhuma",
        "", ANN_SRC, ok=bool(real)))

    def orador(nome: str) -> str:
        return next(sid for sid, m in elenco.items() if m["name"] == nome)

    bacelar, agostinho = orador("Deyvid Bacelar"), orador("Rodrigo Agostinho")
    rebate = [r for r in ann["relations"] if r["kind"] == "contradiz"
              and orador_da_fala[r["from"]] == bacelar and orador_da_fala[r["to"]] == agostinho]
    gatilhos = [f"{c} ({g['card']})" for r in rebate if (c := r["to_claim"]) in deck
                for g in deck[c].get("triggers") or [] if g["kind"] == "contradiz" and g["fala"] == r["from"]]
    nums.append(Numero(
        "Figura 7c",
        "relações 'contradiz' da anotação de uma fala de Deyvid Bacelar para uma fala de Rodrigo Agostinho; "
        "confere se há alguma e se Bacelar é da FUP",
        "Deyvid Bacelar (FUP), que na audiência contradisse um trecho de Rodrigo Agostinho",
        "; ".join(f"{nome_org(elenco[bacelar])}: {r['from_claim']} contradiz {r['to_claim']}, de "
                  f"{elenco[agostinho]['name']}" for r in rebate) or "nenhuma",
        f"cartas-chave da ideia 2: {', '.join(tese['claims_chave'])}; gatilho de réplica no baralho: "
        f"{', '.join(gatilhos) or 'nenhum'}",
        ANN_SRC + "; " + CENA_SRC, ok=bool(rebate) and elenco[bacelar]["org"] == "FUP"))

    # --- Figura 8b: a matéria
    substantivas = [f for f in ann["falas"] if f["kind"] == "substantive"]
    cobertas = [f["id"] for f in substantivas if f["covered"]]
    nums.append(Numero(
        "Figura 8b", "falas substantivas com covered=true na anotação, das falas substantivas",
        "10 das 24", f"{len(cobertas)} das {len(substantivas)}",
        f"{', '.join(cobertas)}; no arquivo jogável: {len(cena['press']['covered_falas'])} das "
        f"{sum(1 for e in cena['timeline'] if e['kind'] == 'fala')} falas", ANN_SRC + "; " + CENA_SRC))

    # --- Listagem 1: uma carta e uma relação
    lst_carta, lst_relacao = LISTAGEM_CARTA, LISTAGEM_RELACAO
    carta = cartas[lst_carta["id"]]
    nums.append(Numero(
        "Listagem 1",
        f"a carta da listagem do artigo e a carta {lst_carta['id']} da anotação, nos mesmos campos",
        json.dumps(lst_carta, ensure_ascii=False), json.dumps({k: carta[k] for k in lst_carta}, ensure_ascii=False),
        f"campos: {', '.join(lst_carta)}", TEX_SRC + "; " + ANN_SRC))
    relacao = next(r for r in ann["relations"] if r["from"] == lst_relacao["from"] and r["to"] == lst_relacao["to"])
    iguais = all(relacao[k] == v for k, v in lst_relacao.items() if k != "note")
    nums.append(Numero(
        "Listagem 1",
        f"a relação da listagem do artigo e a relação {relacao['from']} -> {relacao['to']} da anotação, nos "
        "mesmos campos; a nota confere pelo começo, porque o [...] da listagem marca o fim omitido",
        json.dumps(lst_relacao, ensure_ascii=False),
        json.dumps({k: relacao[k] for k in lst_relacao}, ensure_ascii=False),
        f"campos: {', '.join(lst_relacao)}", TEX_SRC + "; " + ANN_SRC,
        ok=iguais and casa_com_lacunas(lst_relacao["note"], relacao["note"])))
    return nums


if __name__ == "__main__":
    main(TITULO, numeros)
