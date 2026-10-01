"""O prompt e a anotação (Resumo e Seções 5.1 a 5.4).

Reproduz o que o artigo diz sobre a divisão da transcrição em falas e sentenças (Seção 5.1), sobre o
prompt e a anotação (Seção 5.2): as 28 regras do contrato, o formato do JSON e os limites de tamanho, o
tamanho do bloco de sistema, o conteúdo do bloco do usuário, a estimativa de tokens, as datas das
anotações, a validação de cada resposta, e sobre a montagem (Seções 5.3 e 5.4): a recusa da resposta
inteira, o resumo sha256 da divisão que a montagem confere e a remontagem dos arquivos jogáveis.

Lê:
- src/sim/annotate_sim.py (SYSTEM, build_prompt, estimate_tokens, save);
- src/sim/hearing_text.py (divisão em falas e sentenças, rubricas, sentences_hash), que lê o dataset em
  data/publichearingbr/PublicHearingBR_LDS.jsonl;
- src/sim/build_scene.py (a montagem, rodada de novo para cada audiência, sem gravar nada);
- data/sim/hearing-NNN.json (as 100 anotações: model, created, warnings, sentences_hash e os índices);
- web/public/hearings/hearing-NNN.json (os arquivos jogáveis publicados, comparados com a remontagem).

Não se confere aqui o nome do modelo nem a ausência de controle de temperatura e de semente: nenhum
arquivo do repositório registra essas duas informações.

    uv run analysis/anotacao.py
"""
from __future__ import annotations

import ast
import copy
import inspect
import io
import json
import re
import tempfile
from contextlib import redirect_stdout
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from unittest.mock import patch

from common import ANN_DIR, ROOT, Numero, annotations, built_ids, fmt_dec, fmt_int, fmt_mil, main, read_json, scenes

from sim import annotate_sim, build_scene
from sim.annotate_sim import LIMITS, SAVED_KEYS, SYSTEM, build_prompt, estimate_tokens, save
from sim.hearing_text import all_ids, article_sentences, hearing_falas, sentences_hash

TITULO = "O prompt e a anotação (Resumo e Seções 5.1 a 5.4)"

ANNOTATE_SRC = "src/sim/annotate_sim.py"
TEXT_SRC = "src/sim/hearing_text.py"
BUILD_SRC = "src/sim/build_scene.py"
ANN_SRC = "data/sim/hearing-NNN.json"
CENA_SRC = "web/public/hearings/hearing-NNN.json"

MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
         "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
BRASILIA = timezone(timedelta(hours=-3))  # sem horário de verão desde 2019

# linhas do bloco do usuário (hearing_text.user_block)
LINHA_MATERIA = re.compile(r"^\[a\.(\d+)\] (.*)$", re.M)
LINHA_ORADOR = re.compile(r"^(s\d{2}) · (.+?) · ", re.M)
LINHA_SENTENCA = re.compile(r"^\[(b\d{3})\.(\d+)\] (.*)$", re.M)

# rubrica de palmas ou risos como a taquigrafia a escreve, com ou sem ponto, em qualquer caixa
RUBRICA = re.compile(r"\((?:Palmas|Risos?)\b[^()]*\)", re.I)

# limites de caracteres que o contrato usa fora do dicionário LIMITS
LIMITES_AVULSOS = ("QUOTE_MAX", "GIST_MAX", "PLAIN_MIN", "PLAIN_MAX")

# rótulo que o comando de importação grava no campo model de cada anotação
MARCA_IMPORT = "validada por annotate_sim.py --import"


# ------------------------------------------------------------------ prompt e divisão de cada audiência

@lru_cache(maxsize=None)
def prompt(hid: int) -> dict:
    return build_prompt(hid)


@lru_cache(maxsize=None)
def divisao(hid: int) -> tuple[dict, dict, list[dict]]:
    """(spec0, linha do dataset, falas) como hearing_text.py divide a audiência."""
    return hearing_falas(hid)


def de_total(contagem: int, total: int) -> str:
    """(100, 100) -> '100 de 100'."""
    return f"{contagem} de {total}"


def linha_do_codigo(arquivo: str, trecho: str) -> int:
    linhas = (ROOT / arquivo).read_text(encoding="utf-8").splitlines()
    return next(i for i, linha in enumerate(linhas, 1) if trecho in linha)


# ------------------------------------------------------------------ o bloco de sistema

def regras() -> list[int]:
    """Os números das regras do contrato: linhas do bloco de sistema que começam por 'N. '."""
    return [int(n) for n in re.findall(r"^(\d+)\. ", SYSTEM, flags=re.M)]


def interpolacoes_do_system() -> tuple[bool, list[str], list[str], set[str]]:
    """Lê annotate_sim.py com ast: (SYSTEM é f-string?, expressões interpoladas, nomes interpolados,
    nomes atribuídos no módulo)."""
    arvore = ast.parse((ROOT / ANNOTATE_SRC).read_text(encoding="utf-8"))
    atribuicoes = [n for n in arvore.body if isinstance(n, ast.Assign)]
    do_modulo = {x.id for n in atribuicoes for t in n.targets for x in ast.walk(t) if isinstance(x, ast.Name)}
    system = next(n.value for n in atribuicoes if any(isinstance(t, ast.Name) and t.id == "SYSTEM" for t in n.targets))
    campos = [v.value for v in ast.walk(system) if isinstance(v, ast.FormattedValue)]
    nomes = sorted({x.id for v in campos for x in ast.walk(v) if isinstance(x, ast.Name)})
    return isinstance(system, ast.JoinedStr), [ast.unparse(v) for v in campos], nomes, do_modulo


def molde_json() -> dict:
    """O molde da resposta que o bloco de sistema mostra: o objeto JSON que começa na primeira linha '{'."""
    inicio = SYSTEM.index("\n{\n") + 1
    return json.JSONDecoder().raw_decode(SYSTEM[inicio:])[0]


# ------------------------------------------------------------------ o bloco do usuário

def bloco_do_usuario(hid: int) -> dict:
    """Lê de volta o bloco do usuário: sentenças da matéria, oradores e sentenças numeradas de cada fala."""
    user = prompt(hid)["user"]
    falas: dict[str, list[tuple[int, str]]] = {}
    for fid, i, s in LINHA_SENTENCA.findall(user):
        falas.setdefault(fid, []).append((int(i), s))
    return {
        "materia": [(int(i), s) for i, s in LINHA_MATERIA.findall(user)],
        "oradores": LINHA_ORADOR.findall(user),
        "falas": falas,
        "ordem": user.index("## Matéria") < user.index("## Oradores") < user.index("## Falas"),
    }


def bloco_completo(hid: int) -> bool:
    """A matéria inteira (sentenças numeradas), todos os oradores e todas as falas com todas as
    sentenças, numeradas a partir de 0, nessa ordem."""
    spec0, row, falas = divisao(hid)
    lido = bloco_do_usuario(hid)
    materia = list(enumerate(article_sentences(row)))
    return (lido["ordem"] and len(materia) > 0 and lido["materia"] == materia
            and lido["oradores"] == [(s["id"], s["name"]) for s in spec0["speakers"]]
            and lido["falas"] == {f["id"]: list(enumerate(f["sentences"])) for f in falas})


def formula_de_tokens() -> str:
    """A conta de estimate_tokens, lida do código-fonte."""
    return re.search(r"return (.+)", inspect.getsource(estimate_tokens)).group(1).strip()


# ------------------------------------------------------------------ a divisão em falas e sentenças

def falas_bem_formadas(hid: int) -> bool:
    """Ids b001, b002, ... em sequência; cada fala é um bloco contíguo de turnos de uma mesma pessoa; os
    blocos cobrem todos os turnos; duas falas seguidas nunca são da mesma pessoa."""
    spec0, _row, falas = divisao(hid)
    dono = [t["speaker"] for t in spec0["turns"]]
    ids = [f["id"] for f in falas] == [f"b{i:03d}" for i in range(1, len(falas) + 1)]
    contiguas = ([f["turn"] for f in falas] == [0] + [f["last_turn"] + 1 for f in falas[:-1]]
                 and falas[-1]["last_turn"] == len(dono) - 1)
    uma_pessoa = all(set(dono[f["turn"]:f["last_turn"] + 1]) == {f["speaker_id"]} for f in falas)
    alternam = all(a["speaker_id"] != b["speaker_id"] for a, b in zip(falas, falas[1:]))
    return ids and contiguas and uma_pessoa and alternam


def indices_anotados(fala: dict) -> list[int]:
    """Índices de sentença da própria fala usados pela anotação: quote, cartas, posição e pergunta."""
    idx = list(fala.get("quote") or [])
    for c in fala.get("claims") or []:
        idx += c["sentences"]
    if fala.get("stance"):
        idx.append(fala["stance"]["sentence"])
    if fala.get("open_question") is not None:
        idx.append(fala["open_question"])
    return idx


def numeracao_de_zero(hid: int) -> tuple[bool, int, int]:
    """(no prompt toda fala numera as sentenças 0..n-1 e a anotação só usa índices nesse intervalo?,
    índices usados, quantos apontam a sentença 0)."""
    n_sent = {f["id"]: len(f["sentences"]) for f in divisao(hid)[2]}
    numerados = bloco_do_usuario(hid)["falas"]
    no_prompt = all([i for i, _ in sents] == list(range(n_sent[fid])) for fid, sents in numerados.items())
    usados = [(f["id"], i) for f in annotations()[hid]["falas"] for i in indices_anotados(f)]
    no_intervalo = all(0 <= i < n_sent[fid] for fid, i in usados)
    return no_prompt and no_intervalo, len(usados), sum(1 for _, i in usados if i == 0)


def rubricas(hid: int) -> tuple[int, int, int, list[str]]:
    """(rubricas de palmas e risos no texto bruto das falas, contadas como palmas, contadas como risos,
    sentenças onde alguma ficou no texto)."""
    spec0, _row, falas = divisao(hid)
    no_bruto = sum(len(RUBRICA.findall(f["raw"])) for f in falas)
    palmas = sum(t["stage"].get("palmas", 0) for t in spec0["turns"])
    risos = sum(t["stage"].get("risos", 0) for t in spec0["turns"])
    restos = [f"{f['id']}.{i}" for f in falas for i, s in enumerate(f["sentences"]) for _ in RUBRICA.findall(s)]
    return no_bruto, palmas, risos, restos


def hash_confere(hid: int) -> bool:
    """O resumo da divisão recalculado agora é igual ao gravado na anotação."""
    return sentences_hash([f["sentences"] for f in divisao(hid)[2]]) == annotations()[hid]["sentences_hash"]


def montagem_recusa(hid: int) -> bool:
    """Monta a audiência com o resumo da anotação trocado e confere que build_scene.build recusa."""
    adulterada = {**annotations()[hid], "sentences_hash": "0" * 16}
    with patch.object(build_scene, "load_annotations", return_value=adulterada):
        try:
            build_scene.build(hid)
        except SystemExit as e:
            return "outra divisão" in str(e)
    return False


# ------------------------------------------------------------------ a gravação de cada resposta (save)

def com_indice_fora(resposta: dict, hid: int) -> dict:
    """A mesma resposta com um único erro: a primeira carta aponta uma sentença que a fala não tem."""
    r = copy.deepcopy(resposta)
    fala = next(f for f in r["falas"] if f.get("claims"))
    fala["claims"][0]["sentences"] = [len(prompt(hid)["sentences"][fala["id"]])]
    return r


def rodar_save(hid: int, resposta: dict) -> tuple[dict | None, str, int]:
    """Roda save() num diretório temporário no lugar de data/sim: (o que gravou, ou None se recusou;
    a mensagem de recusa; quantos arquivos ficaram no diretório)."""
    with (tempfile.TemporaryDirectory() as tmp, patch.object(annotate_sim, "OUT_DIR", Path(tmp)),
          redirect_stdout(io.StringIO())):  # save() imprime os avisos
        try:
            gravado, erro = read_json(save(prompt(hid), resposta, "teste")), ""
        except SystemExit as e:
            gravado, erro = None, str(e)
        return gravado, erro, len(list(Path(tmp).iterdir()))


@lru_cache(maxsize=None)
def teste_save(hid: int) -> tuple[bool, bool, bool]:
    """save() com a resposta gravada na anotação e com a mesma resposta estragada num único índice:
    (aceita e grava todos os campos?, grava os mesmos avisos da anotação?, recusa a estragada sem gravar nada?)."""
    ann = annotations()[hid]
    resposta = {k: copy.deepcopy(ann[k]) for k in SAVED_KEYS}
    gravado, _, _ = rodar_save(hid, resposta)
    aceita = gravado is not None and all(gravado[k] == ann[k] for k in SAVED_KEYS)
    mesmos_avisos = gravado is not None and gravado["warnings"] == ann["warnings"]
    estragado, erro, arquivos = rodar_save(hid, com_indice_fora(resposta, hid))
    recusa = estragado is None and erro.startswith("resposta inválida") and arquivos == 0
    return aceita, mesmos_avisos, recusa


# ------------------------------------------------------------------ a montagem do arquivo jogável

def sem_carimbo(doc: dict) -> dict:
    """O arquivo jogável sem meta.built, a hora da montagem (o único campo que muda de uma vez para outra)."""
    return {**doc, "meta": {k: v for k, v in doc["meta"].items() if k != "built"}}


@lru_cache(maxsize=None)
def remontagem(hid: int) -> tuple[bool, tuple[str, ...]]:
    """Monta a audiência duas vezes com build_scene.build, sem gravar: (as duas saem iguais fora meta.built?,
    campos de primeiro nível em que a montagem difere do arquivo publicado)."""
    a, b = sem_carimbo(build_scene.build(hid)), sem_carimbo(build_scene.build(hid))
    publicado = sem_carimbo(scenes()[hid])
    return a == b, tuple(sorted(k for k in a.keys() | publicado.keys() if a.get(k) != publicado.get(k)))


# ------------------------------------------------------------------ datas

def instante(created: str) -> datetime:
    return datetime.strptime(created, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def periodo(d1: date, d2: date) -> str:
    """date(2026, 9, 13), date(2026, 9, 21) -> '13 e 21 de setembro de 2026'."""
    if (d1.year, d1.month) == (d2.year, d2.month):
        return f"{d1.day} e {d2.day} de {MESES[d1.month - 1]} de {d1.year}"
    return f"{d1.day} de {MESES[d1.month - 1]} de {d1.year} e {d2.day} de {MESES[d2.month - 1]} de {d2.year}"


def arquivos_de_anotacao() -> list[int]:
    return sorted(int(p.stem.split("-")[1]) for p in ANN_DIR.glob("hearing-[0-9][0-9][0-9].json"))


# ------------------------------------------------------------------ os números

def numeros() -> list[Numero]:
    ids = built_ids()
    n = len(ids)
    out: list[Numero] = []

    # Resumo e Seção 5.2: as regras do contrato
    rs = regras()
    em_sequencia = rs == list(range(1, len(rs) + 1))
    out.append(Numero(
        "Resumo; Seção 5.2",
        "regras numeradas do bloco de sistema (linhas que começam por 'N. '), contadas só se vão de 1 a N sem saltos",
        "28", fmt_int(len(rs)) if em_sequencia else f"{len(rs)} fora de sequência", f"regras {rs[0]} a {rs[-1]}",
        ANNOTATE_SRC))

    # Seção 5.1: segmentação
    ok_falas = [h for h in ids if falas_bem_formadas(h)]
    turnos = sum(len(divisao(h)[0]["turns"]) for h in ids)
    n_falas = sum(len(divisao(h)[2]) for h in ids)
    out.append(Numero(
        "Seção 5.1",
        "audiências em que as falas têm ids b001, b002, ... em sequência, cada fala junta turnos contíguos de uma "
        "só pessoa, as falas cobrem todos os turnos e duas falas seguidas nunca são da mesma pessoa; "
        "confere se vale em todas as construídas",
        "junta turnos consecutivos da mesma pessoa numa fala (b001, b002, …)", de_total(len(ok_falas), n),
        f"{fmt_int(turnos)} turnos viram {fmt_int(n_falas)} falas nas {n} audiências",
        TEXT_SRC, ok=len(ok_falas) == n))

    zero = {h: numeracao_de_zero(h) for h in ids}
    ok_zero = [h for h, (ok, _, _) in zero.items() if ok]
    usados = sum(u for _, u, _ in zero.values())
    em_zero = sum(z for _, _, z in zero.values())
    out.append(Numero(
        "Seção 5.1",
        "audiências em que o prompt numera as sentenças de toda fala como 0, 1, ..., n-1 e a anotação só usa índices "
        "nesse intervalo (quote, cartas, posição, pergunta); confere se vale em todas e se a sentença 0 é usada",
        "numera as sentenças de cada fala a partir de zero", de_total(len(ok_zero), n),
        f"{fmt_int(usados)} índices de sentença nas anotações, {fmt_int(em_zero)} apontam a sentença 0",
        f"{TEXT_SRC}; {ANN_SRC}", ok=len(ok_zero) == n and em_zero > 0))

    rub = {h: rubricas(h) for h in ids}
    no_bruto = sum(r[0] for r in rub.values())
    palmas, risos = sum(r[1] for r in rub.values()), sum(r[2] for r in rub.values())
    restos = {h: r[3] for h, r in rub.items() if r[3]}
    applause = sum(f["applause"] for h in ids for f in divisao(h)[2])
    onde_restos = "; ".join(f"{h}: {', '.join(refs)}" for h, refs in restos.items())
    out.append(Numero(
        "Seção 5.1",
        "rubricas de palmas e risos no texto bruto das falas ('(Palmas.)', '(risos)'..., com ou sem ponto, em "
        "qualquer caixa) que hearing_text.py tira do texto e conta nos contadores dos turnos; confere se nenhuma "
        "fica nas sentenças",
        "as rubricas da taquigrafia, como palmas e risos, saem do texto e viram contadores",
        f"{fmt_int(palmas + risos)} de {fmt_int(no_bruto)} saem do texto",
        f"contadas: {fmt_int(palmas)} palmas (soma de applause das falas = {fmt_int(applause)}) e {fmt_int(risos)} "
        f"risos; ficam {sum(len(r) for r in restos.values())} nas sentenças, sem o ponto final que STAGE_RE exige "
        f"ou em minúscula: {onde_restos}",
        TEXT_SRC, ok=not restos and palmas + risos == no_bruto))

    iguais = [h for h in ids if hash_confere(h)]
    out.append(Numero(
        "Seção 5.1",
        "anotações cujo sentences_hash gravado (16 primeiros dígitos hex do sha256 da divisão em sentenças) é igual "
        "ao recalculado agora por hearing_text.sentences_hash; confere se vale em todas",
        "um resumo sha256 dessa divisão fica gravado na anotação", de_total(len(iguais), n),
        f"exemplo, audiência {ids[0]}: {annotations()[ids[0]]['sentences_hash']}",
        f"{TEXT_SRC}; {ANN_SRC}", ok=len(iguais) == n))

    recusadas = [h for h in ids if montagem_recusa(h)]
    linha = linha_do_codigo(BUILD_SRC, '!= ann["sentences_hash"]')
    out.append(Numero(
        "Seção 5.1; Seção 5.4",
        "audiências cuja montagem (build_scene.build) termina com erro quando a anotação traz outro sentences_hash; "
        "confere se recusa em todas",
        "a montagem recusa anotações feitas sobre outra divisão", de_total(len(recusadas), n),
        "SystemExit 'foi anotado sobre outra divisão de sentenças'", f"{BUILD_SRC}:{linha}", ok=len(recusadas) == n))

    # Seção 5.2: o bloco de sistema
    eh_fstring, expressoes, nomes, do_modulo = interpolacoes_do_system()
    chaves = set(molde_json())
    limites = [f"LIMITS[{k!r}]" for k in LIMITS] + list(LIMITES_AVULSOS)
    limites_no_system = [x for x in limites if x in expressoes]
    out.append(Numero(
        "Seção 5.2",
        "o bloco de sistema traz um molde JSON (o objeto que começa na primeira linha '{') cujas chaves são as que "
        "save() grava (SAVED_KEYS), e interpola todo limite de caracteres do contrato (as chaves de LIMITS e "
        f"{', '.join(LIMITES_AVULSOS)})",
        "o formato do JSON de saída e os limites de tamanho",
        f"molde com {len(chaves)} chaves; {len(limites_no_system)} de {len(limites)} limites interpolados",
        f"chaves do molde = SAVED_KEYS: {'sim' if chaves == set(SAVED_KEYS) else 'não'}",
        ANNOTATE_SRC, ok=chaves == set(SAVED_KEYS) and len(limites_no_system) == len(limites)))

    out.append(Numero(
        "Seção 5.2",
        "SYSTEM é uma f-string e todo nome que ela interpola é uma constante atribuída no próprio módulo "
        "(lido com ast)",
        "gerado a partir de constantes do código",
        f"f-string com {len(expressoes)} interpolações de {len(nomes)} constantes",
        ", ".join(nomes), ANNOTATE_SRC, ok=eh_fstring and len(expressoes) > 0 and set(nomes) <= do_modulo))

    out.append(Numero(
        "Seção 5.2", "caracteres do bloco de sistema: len(SYSTEM)",
        "17.096", fmt_int(len(SYSTEM)), f"len(SYSTEM) = {len(SYSTEM)}", ANNOTATE_SRC))

    sistemas = {h: prompt(h)["system"] for h in all_ids()}
    distintos = set(sistemas.values())
    out.append(Numero(
        "Seção 5.2",
        "audiências do dataset (hearing_text.all_ids) para as quais build_prompt devolve o mesmo bloco de sistema, "
        "contadas só se há um único texto distinto",
        "206", fmt_int(len(sistemas)) if len(distintos) == 1 else f"{len(distintos)} blocos distintos",
        f"{len(distintos)} texto distinto em {len(sistemas)} prompts; é o próprio SYSTEM: "
        f"{'sim' if distintos == {SYSTEM} else 'não'}", ANNOTATE_SRC))

    # Seção 5.2: o bloco do usuário
    completos = [h for h in ids if bloco_completo(h)]
    l44 = bloco_do_usuario(44)
    out.append(Numero(
        "Seção 5.2",
        "audiências cujo bloco do usuário traz, nesta ordem, todas as sentenças da matéria numeradas, todos os "
        "oradores e todas as falas com todas as sentenças numeradas a partir de 0, iguais à divisão; "
        "confere se vale em todas",
        "a matéria da Agência Câmara, a lista de oradores e todas as falas, com as sentenças numeradas",
        de_total(len(completos), n),
        f"audiência 44: {len(l44['materia'])} sentenças da matéria, {len(l44['oradores'])} oradores, "
        f"{len(l44['falas'])} falas, {fmt_int(sum(len(s) for s in l44['falas'].values()))} sentenças",
        f"{TEXT_SRC}; {ANNOTATE_SRC}", ok=len(completos) == n))

    toks = {h: estimate_tokens(prompt(h)) for h in ids}
    media = sum(toks.values()) / n
    h_min, h_max = min(ids, key=toks.get), max(ids, key=toks.get)
    out.append(Numero(
        "Seção 5.2",
        "média, nas audiências construídas, da estimativa de tokens do prompt completo (sistema + usuário)",
        "30,5 mil", fmt_mil(media),
        f"{fmt_int(sum(toks.values()))}/{n} = {fmt_dec(media, 2)} tokens; estimate_tokens: {formula_de_tokens()}",
        ANNOTATE_SRC))
    out.append(Numero(
        "Seção 5.2", "menor estimativa de tokens do prompt completo entre as audiências construídas",
        "14,7 mil", fmt_mil(toks[h_min]), f"{fmt_int(toks[h_min])} tokens (audiência {h_min})", ANNOTATE_SRC))
    out.append(Numero(
        "Seção 5.2", "maior estimativa de tokens do prompt completo entre as audiências construídas",
        "73,1 mil", fmt_mil(toks[h_max]), f"{fmt_int(toks[h_max])} tokens (audiência {h_max})", ANNOTATE_SRC))

    # Seções 5.2 e 5.3: a gravação de cada resposta
    saves = {h: teste_save(h) for h in ids}
    recusa_inteira = [h for h, (_, _, recusa) in saves.items() if recusa]
    out.append(Numero(
        "Seção 5.2; Seção 5.3",
        "audiências em que save(), rodado num diretório temporário, recusa a resposta da anotação estragada num único "
        "índice de sentença (a primeira carta aponta uma sentença que a fala não tem) e não grava nenhum arquivo; "
        "confere se vale em todas",
        "é aceita ou recusada por inteiro", de_total(len(recusa_inteira), n),
        "SystemExit 'resposta inválida' e diretório vazio; a resposta inteira, sem o erro, é aceita e gravada",
        ANNOTATE_SRC, ok=len(recusa_inteira) == n))

    # Seção 5.2: as anotações
    arquivos = arquivos_de_anotacao()
    out.append(Numero(
        "Seção 5.2",
        "arquivos de anotação data/sim/hearing-NNN.json, contados só se são as mesmas audiências construídas "
        "(index.json)",
        "100", fmt_int(len(arquivos)) if arquivos == list(ids) else f"{len(arquivos)} arquivos, outras audiências",
        f"{len(arquivos)} arquivos; {len(ids)} audiências em index.json", ANN_SRC))

    criadas = sorted((instante(annotations()[h]["created"]), h) for h in ids)
    (c1, h1), (c2, h2) = criadas[0], criadas[-1]
    em_utc = periodo(c1.date(), c2.date())
    em_brasilia = periodo(c1.astimezone(BRASILIA).date(), c2.astimezone(BRASILIA).date())
    out.append(Numero(
        "Seção 5.2",
        "primeira e última data do campo created das anotações, em UTC e no horário de Brasília (UTC-3); "
        "as duas formas têm de dar o mesmo período",
        "13 e 21 de setembro de 2026", em_utc if em_utc == em_brasilia else f"{em_utc} (UTC); {em_brasilia} (Brasília)",
        f"{len(criadas)} anotações; primeira {c1:%Y-%m-%d %H:%M} UTC = {c1.astimezone(BRASILIA):%Y-%m-%d %H:%M} em "
        f"Brasília (audiência {h1}); última {c2:%Y-%m-%d %H:%M} UTC = {c2.astimezone(BRASILIA):%Y-%m-%d %H:%M} em "
        f"Brasília (audiência {h2})", ANN_SRC))

    aceitas = [h for h, (aceita, _, _) in saves.items() if aceita]
    rotuladas = [h for h in ids if MARCA_IMPORT in annotations()[h]["model"]]
    out.append(Numero(
        "Seção 5.2",
        "anotações que save() (o mesmo caminho do --import), rodado num diretório temporário, aceita hoje e grava "
        "com todos os campos; save() valida e não grava nada se houver erro (ver 'é aceita ou recusada por "
        "inteiro'); confere também o rótulo do comando no campo model",
        "cada resposta entrou no repositório por um comando que a valida antes de gravar", de_total(len(aceitas), n),
        f"campo model diz '{MARCA_IMPORT}' em {de_total(len(rotuladas), n)}",
        f"{ANNOTATE_SRC}; {ANN_SRC}", ok=len(aceitas) == n and len(rotuladas) == n))

    # Seções 5.2 e 5.4: o que vem depois da anotação
    remontadas = {h: remontagem(h) for h in ids}
    iguais_ao_publicado = [h for h, (_, dif) in remontadas.items() if not dif]
    por_campo: dict[str, list[int]] = {}
    for h, (_, dif) in remontadas.items():
        for campo in dif:
            por_campo.setdefault(campo, []).append(h)
    divergencias = "; ".join(f"{campo} difere em {len(hs)}: {', '.join(map(str, hs))}"
                             for campo, hs in por_campo.items())
    out.append(Numero(
        "Seção 5.2",
        "audiências em que build_scene.build, rodado agora sobre a anotação, dá o arquivo jogável publicado em "
        "web/public/hearings, campo a campo, fora meta.built (a hora da montagem); confere se vale em todas",
        "O que se reproduz é tudo o que vem depois dela", de_total(len(iguais_ao_publicado), n),
        divergencias or "nenhum campo difere", f"{BUILD_SRC}; {CENA_SRC}", ok=len(iguais_ao_publicado) == n))

    mesmos_avisos = [h for h, (_, avisos, _) in saves.items() if avisos]
    deterministicas = [h for h, (det, _) in remontadas.items() if det]
    out.append(Numero(
        "Seção 5.2; Seção 5.4",
        "audiências em que a validação rodada hoje (por save()) dá exatamente os avisos que save() gravou na anotação "
        "e duas montagens seguidas com build_scene.build saem iguais fora meta.built; confere se vale em todas",
        "a validação e a montagem do arquivo jogável são determinísticas",
        de_total(len(set(mesmos_avisos) & set(deterministicas)), n),
        f"avisos iguais aos gravados em {de_total(len(mesmos_avisos), n)}; duas montagens iguais em "
        f"{de_total(len(deterministicas), n)}",
        f"{ANNOTATE_SRC}; {BUILD_SRC}; {ANN_SRC}", ok=len(mesmos_avisos) == n and len(deterministicas) == n))

    return out


if __name__ == "__main__":
    main(TITULO, numeros)
