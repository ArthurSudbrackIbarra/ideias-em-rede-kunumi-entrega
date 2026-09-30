"""Do dataset PublicHearingBR à entrada do modelo, sem LLM e sem rede.

Uma transcrição vira: turnos (regex sobre "O SR. NOME (Partido - UF) -"), oradores com um papel
institucional provisório (o modelo corrige depois), **falas** (turnos consecutivos do mesmo orador,
ids b001, b002, ...) e, dentro de cada fala, **sentenças numeradas** a partir de 0. Tudo o que o
modelo diz sobre a audiência é referido a esses índices; a cópia de índice para texto acontece só em
build_scene.py, e um digest da divisão (`sentences_hash`) detecta uma anotação feita sobre outro corte.

Determinístico: o mesmo .jsonl dá os mesmos ids, as mesmas sentenças e o mesmo hash.

    from sim.hearing_text import hearing_falas, user_block, split_sentences, parse_json
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
from dataset import LDS, require  # noqa: E402

ROLES = ["mesa", "parlamentar", "governo", "sociedade_civil", "setor_privado", "convidado"]

# "O SR. PRESIDENTE(Lucas Redecker. Bloco/PSDB - RS) - Muito boa tarde."
# "A SRA. ERIKA KOKAY (PT - DF) - ..."
TURN_RE = re.compile(
    r"^(?P<hon>O SR\.|A SRA\.)\s*(?P<name>[^\n(]+?)\s*(?:\((?P<paren>[^)\n]*)\))?\s*-\s+",
    re.MULTILINE,
)
PARTY_RE = re.compile(r"(Bloco/|\b[A-Z]{2,15}\b\s*-\s*[A-Z]{2}\b)")
STAGE_RE = re.compile(r"\((?P<txt>[A-ZÁ-Ú][^()]{2,80}\.)\)")
STAGE_KINDS = {
    "palmas": re.compile(r"^Palmas", re.I),
    "risos": re.compile(r"^Risos?\b", re.I),
    "pausa": re.compile(r"^Pausa", re.I),
    "plateia": re.compile(r"^Manifesta[çc][ãa]o (na plateia|no plen[áa]rio)", re.I),
    "libras": re.compile(r"LIBRAS", re.I),
    "lingua_indigena": re.compile(r"l[íi]ngua ind[íi]gena", re.I),
    "traducao": re.compile(r"l[íi]ngua estrangeira|Tradu[çc][ãa]o", re.I),
    "emocao": re.compile(r"se emociona", re.I),
}
GOV_KW = re.compile(r"minist[ée]rio|secretari|ag[êe]ncia|governo|procurador|defensor|tribunal|banco central|"
                    r"presidente d[ao] (anatel|aneel|anvisa|ibama|inss|caixa|bndes)|diretor[a]? d[ao] (departamento|"
                    r"agência)|coordenador[a]? geral|superintend", re.I)
CIVIL_KW = re.compile(r"associa[çc][ãa]o|federa[çc][ãa]o|sindicato|confedera[çc][ãa]o|conselho|ong\b|movimento|"
                      r"instituto|funda[çc][ãa]o|professor|pesquisador|universidade|f[óo]rum|coletivo|"
                      r"representante d[ao]s? (trabalhador|usu[áa]rio|famíli)|m[ãa]e|pai de|jornalista|"
                      r"advogad|cientista|m[ée]dic", re.I)
PRIVATE_KW = re.compile(r"empresa|ceo|diretor[a]? (executiv|comercial)|s\.?a\.?\b|ltda|123milhas|operadora|"
                        r"c[âa]mara (brasileira|de com[ée]rcio)|abras|abinee|febraban|confedera[çc][ãa]o nacional d[ao] "
                        r"(ind[úu]stria|com[ée]rcio|agricultura|transporte)|cni\b|cnc\b", re.I)

_SENT_SPLIT = re.compile(r"(?<=[.!?…])\s+(?=[\"“(\[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])")


# ------------------------------------------------------------------ sentenças

def split_sentences(text: str) -> list[str]:
    """Corte determinístico (parágrafos primeiro, depois pontuação seguida de maiúscula, número ou
    aspas). Nunca devolve lista vazia."""
    out: list[str] = []
    for para in re.split(r"\n\s*\n", text):
        para = " ".join(para.split())
        if not para:
            continue
        out.extend(s for s in _SENT_SPLIT.split(para) if s)
    return out or [" ".join(text.split()) or "(vazio)"]


def sentences_hash(per_fala: list[list[str]]) -> str:
    """Digest curto de toda a divisão em sentenças, para detectar anotação desatualizada."""
    h = hashlib.sha256()
    for sents in per_fala:
        h.update(str(len(sents)).encode())
        for s in sents:
            h.update(s.encode("utf-8"))
            h.update(b"\n")
    return h.hexdigest()[:16]


# ------------------------------------------------------------------ dataset

def load_hearing(hid: int) -> dict:
    with require(LDS).open(encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            if row["id"] == hid:
                return row
    raise SystemExit(f"audiência {hid} não existe no dataset")


def all_ids() -> list[int]:
    ids = []
    with require(LDS).open(encoding="utf-8") as fh:
        for line in fh:
            ids.append(json.loads(line)["id"])
    return sorted(ids)


# ------------------------------------------------------------------ turnos e oradores

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def role_from_cargo(cargo: str) -> str:
    if PRIVATE_KW.search(cargo):
        return "setor_privado"
    if GOV_KW.search(cargo):
        return "governo"
    if CIVIL_KW.search(cargo):
        return "sociedade_civil"
    if re.search(r"deputad|senador|vereador", cargo, re.I):
        return "parlamentar"
    return "convidado"


def classify_role(name: str, paren: str | None, metadados: dict) -> tuple[str, str | None]:
    """(papel provisório, pista de cargo). O modelo lê a apresentação feita pela mesa e corrige."""
    if "PRESIDENT" in name.upper():
        return "mesa", None
    if paren and PARTY_RE.search(paren):
        return "parlamentar", paren
    tokens = set(norm(name).split())
    best, best_overlap = None, 0
    for env in metadados.get("envolvidos", []):
        ov = len(tokens & set(norm(env["nome"]).split()))
        if ov > best_overlap:
            best, best_overlap = env, ov
    if best and best_overlap >= 1:
        return role_from_cargo(best.get("cargo", "")), best.get("cargo")
    if paren:
        return role_from_cargo(paren), paren
    return "convidado", None


def split_turns(text: str) -> list[dict]:
    turns = []
    matches = list(TURN_RE.finditer(text))
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        turns.append({
            "honorific": m.group("hon"),
            "speaker_raw": m.group("name").strip(),
            "paren": (m.group("paren") or "").strip() or None,
            "char_start": start,
            "text": text[start:end].strip(),
        })
    return turns


def stage_directions(body: str) -> tuple[Counter, str]:
    """Conta as marcações de palco ("(Palmas.)", "(Risos.)"...) e devolve o texto sem elas."""
    kinds: Counter = Counter()
    for m in STAGE_RE.finditer(body):
        txt = m.group("txt")
        for kind, rx in STAGE_KINDS.items():
            if rx.search(txt):
                kinds[kind] += 1
                break
    return kinds, STAGE_RE.sub("", body)


def build_spec0(row: dict) -> tuple[dict, list[dict]]:
    """Oradores (ids s01, s02, ... na ordem da primeira fala) e turnos com posição no tempo (t0 por
    palavras acumuladas). Devolve também os turnos brutos, para agrupar em falas."""
    text = row["transcricao"]
    meta = row["metadados"]
    raw_turns = split_turns(text)
    total_words = 0
    turns: list[dict] = []
    speakers: dict[str, dict] = {}
    for idx, t in enumerate(raw_turns):
        kinds, clean = stage_directions(t["text"])
        words = len(clean.split())
        total_words += words
        key = norm(t["speaker_raw"])
        if key not in speakers:
            role, cargo = classify_role(t["speaker_raw"], t["paren"], meta)
            speakers[key] = {"id": f"s{len(speakers) + 1:02d}", "name": t["speaker_raw"].title(),
                             "role": role, "cargo": cargo or t["paren"], "turns": 0, "words": 0}
        sp = speakers[key]
        sp["turns"] += 1
        sp["words"] += words
        turns.append({"i": idx, "speaker": sp["id"], "words": words, "stage": dict(kinds), "char_start": t["char_start"]})
    acc = 0
    for t in turns:
        t["t0"] = round(acc / max(total_words, 1), 4)
        acc += t["words"]
    date = re.search(r"(\d{2}/\d{2}/\d{4})", row["materia"])
    committee = re.search(r"Comiss[ãa]o d[eao]s? [A-ZÁ-Ú][^,.;\n(]{3,80}", text[:4000])
    spec0 = {
        "id": row["id"], "name": meta["assunto"],
        "date": date.group(1) if date else None,
        "committee": committee.group(0).strip() if committee else None,
        "words": total_words, "n_turns": len(turns),
        "speakers": list(speakers.values()), "turns": turns,
    }
    return spec0, raw_turns


def group_falas(spec0: dict, raw_turns: list[dict]) -> list[dict]:
    """Turnos consecutivos do mesmo orador viram uma fala (b001, b002, ...)."""
    speakers = {s["id"]: s for s in spec0["speakers"]}
    falas: list[dict] = []
    for t, raw in zip(spec0["turns"], raw_turns):
        kinds, clean = stage_directions(raw["text"])
        item = {
            "turn": t["i"], "turns": 1, "speaker_id": t["speaker"], "words": t["words"], "t0": t["t0"],
            "applause": kinds.get("palmas", 0), "char_start": t["char_start"], "text": clean, "raw": raw["text"],
        }
        if falas and falas[-1]["speaker_id"] == item["speaker_id"]:
            prev = falas[-1]
            prev["turns"] += 1
            prev["words"] += item["words"]
            prev["applause"] += item["applause"]
            prev["text"] += "\n" + item["text"]
            prev["raw"] += "\n" + item["raw"]
            prev["last_turn"] = item["turn"]
        else:
            item["last_turn"] = item["turn"]
            falas.append(item)
    for i, f in enumerate(falas):
        sp = speakers[f["speaker_id"]]
        f["id"] = f"b{i + 1:03d}"
        f["role"] = sp["role"]
        f["speaker"] = sp["name"]
        f["cargo"] = sp["cargo"]
        f["sentences"] = split_sentences(f["text"])
    return falas


def hearing_falas(hid: int) -> tuple[dict, dict, list[dict]]:
    """(spec0, linha do dataset, falas com sentenças numeradas) de uma audiência."""
    row = load_hearing(hid)
    spec0, raw_turns = build_spec0(row)
    return spec0, row, group_falas(spec0, raw_turns)


def article_sentences(row: dict) -> list[str]:
    _, clean = stage_directions(row["materia"])
    return split_sentences(clean)


# ------------------------------------------------------------------ o bloco `user` do prompt

def user_block(hid: int) -> dict:
    """A audiência inteira como o modelo a recebe: matéria numerada, oradores, falas e sentenças
    numeradas. Também devolve tudo o que a validação da resposta precisa (contagens, ids, textos)."""
    spec0, row, falas = hearing_falas(hid)
    art = article_sentences(row)
    lines = [f"# Audiência {hid}: {spec0['name']}",
             f"Data: {spec0['date']} · Comissão: {spec0['committee'] or '(não informada)'} · {spec0['words']} palavras · {len(falas)} falas candidatas",
             "", "## Matéria da Agência Câmara (sentenças numeradas)"]
    lines += [f"[a.{i}] {s}" for i, s in enumerate(art)]
    lines += ["", "## Oradores (id · nome como na ata · pista de cargo da ata ou do resumo do dataset)"]
    for s in spec0["speakers"]:
        lines.append(f"{s['id']} · {s['name']} · {s['cargo'] or '(sem pista)'} · {s['turns']} turnos, {s['words']} palavras")
    lines += ["", "## Falas (id · orador · palavras · momento) e sentenças numeradas"]
    for f in falas:
        head = f"### {f['id']} · {f['speaker_id']} {f['speaker']} · {f['words']} palavras · {f['t0']:.0%} da sessão"
        if f["applause"]:
            head += f" · (Palmas ×{f['applause']})"
        lines.append(head)
        lines += [f"[{f['id']}.{i}] {s}" for i, s in enumerate(f["sentences"])]
        lines.append("")
    return {
        "id": hid, "name": spec0["name"], "date": spec0["date"], "committee": spec0["committee"],
        "user": "\n".join(lines),
        "sentences_hash": sentences_hash([f["sentences"] for f in falas]),
        "fala_ids": [f["id"] for f in falas],
        "sentence_counts": {f["id"]: len(f["sentences"]) for f in falas},
        "sentences": {f["id"]: f["sentences"] for f in falas},
        "article_sentences": len(art),
        "speaker_ids": [s["id"] for s in spec0["speakers"]],
        "speaker_names": {s["id"]: s["name"] for s in spec0["speakers"]},
    }


def parse_json(text: str) -> dict:
    """Extrai o objeto JSON de uma resposta de modelo (tolera cerca de markdown e texto em volta)."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("resposta sem objeto JSON")
    return json.loads(text[start:end + 1])
