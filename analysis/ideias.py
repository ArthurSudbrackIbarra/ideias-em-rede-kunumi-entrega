"""Composição setorial das ideias: o Resumo e a Seção 6.3 do artigo.

Para cada ideia (tese) das 100 audiências construídas, olha de que papéis vêm as cartas-chave e quem, por papel,
ficou do lado da ideia e do lado oposto. Lê:

- as anotações (data/sim/hearing-NNN.json): teses e cartas-chave, cartas de cada fala, papel, instituição e nível
  de governo dos oradores e os avisos do validador;
- as salas construídas (web/public/hearings/hearing-NNN.json): teses com defenders e opponents por papel;
- o contrato de anotação (src/sim/annotate_sim.py): a regra 22 e os níveis de governo.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

from common import Numero, annotations, built_ids, fmt_dec, fmt_int, fmt_pct, main, scenes
from sim.annotate_sim import GOV_LEVELS, SIDES, SYSTEM

TITULO = "Composição setorial das ideias (Resumo e Seção 6.3)"

ANN = "data/sim/hearing-NNN.json"
SALA = "web/public/hearings/hearing-NNN.json"
CONTRATO = "src/sim/annotate_sim.py"

# o aviso que annotate_sim.validate_response grava em "warnings" quando as cartas-chave vêm de um só papel
AVISO_UM_PAPEL = re.compile(r"^tese (\w+): todas as cartas-chave vêm de um só papel \((\w+)\)")
# o exemplo da Seção 6.3: dois órgãos do governo federal em lados opostos na audiência 44
EXEMPLO_44 = ("Ibama", "MME")


@dataclass
class Ideia:
    hid: int
    tese: dict              # a tese como a anotação a grava
    sala: dict              # a mesma tese no arquivo jogável (com defenders e opponents)
    papeis_chave: set[str]  # papéis dos oradores das cartas-chave
    defensores: set[str]    # oradores com carta do lado da ideia
    opositores: set[str]    # oradores com carta do lado oposto

    @property
    def nome(self) -> str:
        return f"{self.hid}/{self.tese['id']}"


def substantivas(ann: dict) -> list[dict]:
    """Só as falas substantivas têm cartas (é o que build_scene.py e o validador percorrem)."""
    return [f for f in ann["falas"] if f["kind"] == "substantive"]


def orador_da_carta(ann: dict) -> dict[str, str]:
    """Id da carta -> id do orador da fala em que ela está."""
    return {c["id"]: f["speaker"] for f in substantivas(ann) for c in f["claims"]}


def lados(ann: dict, tese: dict) -> tuple[set[str], set[str]]:
    """Oradores com carta do lado da tese e do lado oposto, nos temas em que a tese toma posição.

    É a regra com que build_scene.py monta defenders e opponents: cartas condicionais e neutras não contam.
    """
    defensores: set[str] = set()
    opositores: set[str] = set()
    for f in substantivas(ann):
        for c in f["claims"]:
            lado = tese["positions"].get(c["theme"])
            if lado is None or c["position"] not in SIDES:
                continue
            (defensores if c["position"] == lado else opositores).add(f["speaker"])
    return defensores, opositores


def ideias() -> list[Ideia]:
    out = []
    for h in built_ids():
        ann, sala = annotations()[h], {t["id"]: t for t in scenes()[h]["teses"]}
        if sorted(sala) != sorted(t["id"] for t in ann["teses"]):
            raise SystemExit(f"audiência {h}: a anotação e a sala construída não têm as mesmas teses")
        orador = orador_da_carta(ann)
        for t in ann["teses"]:
            papeis = {ann["speakers"][orador[cid]]["role"] for cid in t["claims_chave"]}
            out.append(Ideia(h, t, sala[t["id"]], papeis, *lados(ann, t)))
    return out


def orador(i: Ideia, sid: str) -> dict:
    """O orador `sid` da audiência da ideia, como a anotação o grava (role, org, gov_level...)."""
    return annotations()[i.hid]["speakers"][sid]


def governo_dos_dois_lados(i: Ideia) -> bool:
    """O papel governo aparece entre os defensores e entre os opositores da sala construída."""
    return "governo" in i.sala["defenders"] and "governo" in i.sala["opponents"]


def do_governo(i: Ideia, oradores: set[str], com_nivel: bool = False) -> set[str]:
    """Os oradores de papel governo (com nível federal, estadual ou municipal, se com_nivel) entre `oradores`."""
    return {s for s in oradores
            if orador(i, s)["role"] == "governo" and (not com_nivel or orador(i, s)["gov_level"] in GOV_LEVELS)}


def representantes_distintos(i: Ideia, com_nivel: bool = False) -> bool:
    """Há um orador do governo entre os defensores e OUTRO orador do governo entre os opositores."""
    a, b = do_governo(i, i.defensores, com_nivel), do_governo(i, i.opositores, com_nivel)
    return any(x != y for x in a for y in b)


def instituicoes_distintas(i: Ideia) -> bool:
    """Há uma instituição do governo entre os defensores e OUTRA entre os opositores (speakers[].org)."""
    a = {orador(i, s)["org"] for s in do_governo(i, i.defensores)}
    b = {orador(i, s)["org"] for s in do_governo(i, i.opositores)}
    return any(x != y for x in a for y in b)


def confere_sala(i: Ideia) -> bool:
    """Os papéis recalculados da anotação batem com defenders/opponents gravados na sala."""
    def contagem(oradores: set[str]) -> dict[str, int]:
        return dict(Counter(orador(i, s)["role"] for s in oradores))
    return contagem(i.defensores) == i.sala["defenders"] and contagem(i.opositores) == i.sala["opponents"]


def setores_sem_mesa(i: Ideia) -> set[str]:
    """Leitura alternativa de "setor": a mesa (deputado que preside) conta como parlamentar."""
    return {"parlamentar" if p == "mesa" else p for p in i.papeis_chave}


def pct(n: int, d: int) -> str:
    return f"{n}/{d} = {fmt_dec(100 * n / d, 4)}%"


def regra_cruzar_setores() -> str | None:
    """O trecho da regra 22 (teses) do contrato que pede ideias que cruzem setores, se existir."""
    regra = re.search(r"\n22\. TESES:(.*?)\n23\.", SYSTEM, re.S)
    achado = regra and re.search(r"Prefira teses que\s+CRUZAM setores", regra.group(1))
    return " ".join(achado.group(0).split()) if achado else None


def numeros() -> list[Numero]:
    todas = ideias()
    total = len(todas)
    multi = [i for i in todas if len(i.papeis_chave) >= 2]
    um_papel = [i for i in todas if len(i.papeis_chave) == 1]
    gov = [i for i in todas if governo_dos_dois_lados(i)]
    nums: list[Numero] = []

    # ---- Resumo
    sem_mesa = [i for i in todas if len(setores_sem_mesa(i)) >= 2]
    sem_mesa_conv = [i for i in todas if len(setores_sem_mesa(i) - {"convidado"}) >= 2]
    nums.append(Numero(
        "Resumo", "fração das ideias cujas cartas-chave vêm de oradores de dois ou mais papéis (carta-chave -> fala -> "
        "orador -> speakers[].role); setor = papel, como na Seção 6.3 e nas cores do jogo, com a mesa à parte de "
        "parlamentar; em inteiro", "89%", fmt_pct(len(multi) / total, 0),
        f"{pct(len(multi), total)}; com a mesa contada como parlamentar: {pct(len(sem_mesa), total)} "
        f"({fmt_pct(len(sem_mesa) / total, 0)}); e ainda ignorando convidado: {pct(len(sem_mesa_conv), total)}", ANN))
    nums.append(Numero(
        "Resumo; Seção 6.3", "ideias (teses) somadas nas audiências construídas", "552", fmt_int(total),
        f"{total} teses em {len(built_ids())} audiências, as mesmas na anotação e na sala", f"{ANN}; {SALA}"))

    # ---- Seção 6.3
    trecho = regra_cruzar_setores()
    nums.append(Numero(
        "Seção 6.3", "a regra 22 (teses) do contrato de anotação pede teses que cruzem setores; confere se o trecho "
        "estiver no texto da regra", "O contrato pede ideias que cruzem setores",
        f'regra 22: "{trecho}"' if trecho else "trecho não encontrado na regra 22", "SYSTEM, regra 22",
        CONTRATO, ok=trecho is not None))
    nums.append(Numero(
        "Seção 6.3", "fração das ideias cujas cartas-chave vêm de oradores de dois ou mais papéis", "89,1%",
        fmt_pct(len(multi) / total), pct(len(multi), total), ANN))
    nums.append(Numero(
        "Seção 6.3", "ideias cujas cartas-chave vêm de oradores de dois ou mais papéis", "492", fmt_int(len(multi)),
        f"papéis distintos por ideia: {dict(sorted(Counter(len(i.papeis_chave) for i in todas).items()))}", ANN))

    sala_ok = sum(1 for i in todas if confere_sala(i))
    gov_multi = [i for i in gov if len(i.papeis_chave) >= 2]
    nums.append(Numero(
        "Seção 6.3", "fração das 552 ideias com o papel governo tanto em defenders quanto em opponents da sala "
        "(oradores com carta do lado da ideia ou do lado oposto em algum tema dela; pode ser o mesmo orador, com "
        "cartas dos dois lados)", "18,8%", fmt_pct(len(gov) / total),
        f"{pct(len(gov), total)}; se 'delas' forem as 492: {pct(len(gov_multi), len(multi))}", SALA))
    nums.append(Numero(
        "Seção 6.3", "ideias com o papel governo tanto em defenders quanto em opponents da sala", "104",
        fmt_int(len(gov)), f"papéis recalculados das anotações conferem com defenders/opponents da sala em "
        f"{sala_ok} de {total} ideias", f"{SALA}; {ANN}"))

    nums.append(numero_representantes(gov, total, sala_ok == total))
    nums.append(numero_exemplo_44(gov))

    # ---- as ideias de um só papel
    por_papel = Counter(next(iter(i.papeis_chave)) for i in um_papel)
    nums.append(Numero(
        "Seção 6.3", "ideias cujas cartas-chave vêm todas de oradores de um mesmo papel", "60", fmt_int(len(um_papel)),
        f"{len(um_papel)} = {total} - {len(multi)}; papel: {dict(por_papel.most_common())}", ANN))
    hids = sorted({i.hid for i in um_papel})
    nums.append(Numero(
        "Seção 6.3", "audiências com ao menos uma ideia de cartas-chave de um só papel", "42", fmt_int(len(hids)),
        f"audiências: {', '.join(map(str, hids))}", ANN))
    nums.append(numero_avisos(um_papel))
    mantidas = [i for i in um_papel if i.sala["claims_chave"] == i.tese["claims_chave"]]
    nums.append(Numero(
        "Seção 6.3", "as ideias de um só papel estão nas salas construídas, com as mesmas cartas-chave; confere se "
        "estiverem todas", "elas foram mantidas", f"{len(mantidas)} de {len(um_papel)} nas salas",
        f"{len(mantidas)}/{len(um_papel)}", SALA, ok=len(mantidas) == len(um_papel)))
    return nums


def numero_representantes(gov: list[Ideia], total: int, sala_ok: bool) -> Numero:
    """A frase como está escrita: de cada lado, um representante do governo federal, estadual ou municipal, sendo quem
    defende e quem discorda pessoas diferentes. Diz por que cada ideia com governo dos dois lados fica de fora."""
    estritas = [i for i in gov if representantes_distintos(i, com_nivel=True)]
    distintas = [i for i in gov if representantes_distintos(i)]
    mesmo_orador = [i for i in gov if i not in distintas]
    sem_nivel = [i for i in distintas if i not in estritas]
    por_instituicao = [i for i in gov if instituicoes_distintas(i)]

    def orgs_sem_nivel(i: Ideia) -> str:
        todos = do_governo(i, i.defensores | i.opositores) - do_governo(i, i.defensores | i.opositores, com_nivel=True)
        return ", ".join(sorted(orador(i, s)["org"] for s in todos))

    niveis = Counter(nivel for i in gov
                     for nivel in {orador(i, s)["gov_level"] for s in do_governo(i, i.defensores | i.opositores)})
    contagem = ", ".join(f"{nivel or 'sem nível'} {niveis[nivel]}" for nivel in [*GOV_LEVELS, None] if niveis[nivel])
    return Numero(
        "Seção 6.3", "ideias, entre as que têm governo dos dois lados, com um orador do governo de nível federal, "
        "estadual ou municipal (speakers[].gov_level) entre os defensores e OUTRO orador do governo com nível entre os "
        "opositores; confere se forem todas", "há representantes do governo, federal, estadual ou municipal, tanto "
        "entre os que defenderam a ideia quanto entre os que discordaram",
        f"{fmt_int(len(estritas))} de {fmt_int(len(gov))} ideias ({fmt_pct(len(estritas) / total)} das {total})",
        f"{pct(len(estritas), total)}; de fora: {len(mesmo_orador)} em que o governo dos dois lados é um mesmo orador "
        f"({', '.join(i.nome for i in mesmo_orador)}); e {len(sem_nivel)} em que só há oradores distintos contando um "
        f"orador do governo sem nível ({'; '.join(f'{i.nome}: {orgs_sem_nivel(i)}' for i in sem_nivel)}); com oradores distintos, sem "
        f"exigir nível: {pct(len(distintas), total)}; com instituições distintas: {pct(len(por_instituicao), total)}; "
        f"ideias com cada nível entre os oradores do governo das {len(gov)}: {contagem}",
        f"{ANN}; {CONTRATO}", ok=sala_ok and len(estritas) == len(gov))


def numero_exemplo_44(gov: list[Ideia]) -> Numero:
    """Na audiência 44, ideias com o Ibama de um lado e o MME do outro, entre as que têm governo dos dois lados."""
    a, b = EXEMPLO_44
    achados = []
    for i in gov:
        if i.hid != 44:
            continue
        defendem = {orador(i, s)["org"] for s in do_governo(i, i.defensores)}
        discordam = {orador(i, s)["org"] for s in do_governo(i, i.opositores)}
        for x, y in ((a, b), (b, a)):
            if x in defendem and y in discordam:
                achados.append(f"{i.tese['id']}: {x} defende, {y} discorda")
    return Numero(
        "Seção 6.3", "na audiência 44, ideias com o governo dos dois lados em que um lado tem o Ibama e o outro o MME "
        "(speakers[].org de oradores de papel governo); confere se houver ao menos uma",
        "como o Ibama e o MME na audiência 44", "; ".join(achados) or "nenhuma",
        f"{len(achados)} ideia(s)", "data/sim/hearing-044.json", ok=bool(achados))


def numero_avisos(um_papel: list[Ideia]) -> Numero:
    """Os avisos de tese de um só papel gravados pelo validador, casados um a um com as ideias de um só papel."""
    avisos = [(h, m.group(1), m.group(2)) for h in built_ids() for w in annotations()[h]["warnings"]
              if (m := AVISO_UM_PAPEL.match(w))]
    esperados = {(i.hid, i.tese["id"], next(iter(i.papeis_chave))) for i in um_papel}
    casados = esperados & set(avisos)
    sobra = sorted(set(avisos) - esperados)
    falta = sorted(esperados - set(avisos))
    return Numero(
        "Seção 6.3", "avisos 'todas as cartas-chave vêm de um só papel' gravados em warnings, casados por (audiência, "
        "tese, papel) com as ideias de um só papel; confere se a correspondência for um para um",
        "o validador emitiu um aviso para cada uma",
        f"{len(avisos)} avisos para {len(um_papel)} ideias, {len(casados)} casados",
        f"avisos sem ideia: {sobra or 'nenhum'}; ideias sem aviso: {falta or 'nenhuma'}", f"{ANN}; {CONTRATO}",
        ok=len(avisos) == len(casados) == len(um_papel))


if __name__ == "__main__":
    main(TITULO, numeros)
