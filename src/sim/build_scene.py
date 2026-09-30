"""Hearing simulator, stage 2: resolve the model's sentence indices into verbatim text and write the
self-contained file the browser plays (docs/simulador-audiencia-spec-v2.md §6 and §11).

No model, no network, deterministic: running it twice gives the same bytes (except meta.built).
The dataset is not in git, so everything the game shows has to be inside the output file.

What v2 adds to the file: every fala becomes **pages** (one per card and one per open question), each
page carrying the version in plain words (or null, when the original is already simple or the
verification rejected the simplification) next to the verbatim original; the deck has claim cards and
question cards; the teses come resolved (who defended and who opposed them, by institution and role,
never by person); the player is the empty chair, not a role.

Usage (from the repo root):
    uv run src/sim/build_scene.py 44          # data/sim/hearing-044.json -> web/public/hearings/hearing-044.json (+ index.json)
    uv run src/sim/build_scene.py --all       # every annotated hearing
"""
from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
from sim.annotate_sim import OUT_DIR as ANN_DIR  # noqa: E402
from sim.annotate_sim import QUOTE_MAX, ROLES, load_annotations  # noqa: E402
from sim.hearing_text import hearing_falas, sentences_hash  # noqa: E402

WEB_OUT = ROOT / "web" / "public" / "hearings"
SCHEMA = ROOT / "shared" / "hearing-sim.schema.json"
BUILDER = "build_scene.py v2"
VERSION = "hearing-sim-v2"

CHARS_PER_SECOND = 32  # o texto é digitado a ~38 cps com pausas; isto é o que a pessoa vive
MIN_SECONDS = 4
MESA_CARD_SECONDS = 2
MESA_TEXT_MAX = 160
FLOOR_SLOTS = (0.30, 0.60, 0.85)  # fração das falas substantivas depois da qual a cadeira vaga recebe a palavra (+ uma ao fim)
MOVES_PER_FLOOR = 2
AUDIENCE_PER_ROW = 12
OPPOSITE = {"favoravel": "contrario", "contrario": "favoravel"}


def truncate(text: str, limit: int = QUOTE_MAX) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > limit * 0.6 else cut).rstrip(" ,;:") + "…"


def ref(fid: str, idx: list[int]) -> str:
    return f"{fid}.{idx[0]}" if len(idx) == 1 else f"{fid}.{idx[0]}-{idx[-1]}"


def seconds_of(text: str, minimum: int = MIN_SECONDS) -> int:
    return max(minimum, math.ceil(len(text) / CHARS_PER_SECOND))


def load_verify(hid: int) -> dict | None:
    """data/sim/hearing-NNN.verify.json, escrito por verify_plain.py (opcional)."""
    p = ANN_DIR / f"hearing-{hid:03d}.verify.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def build(hid: int, verify: dict | None = None) -> dict:
    ann = load_annotations(hid)
    if ann is None:
        raise SystemExit(f"faltando: data/sim/hearing-{hid:03d}.json\nrode:     uv run src/sim/annotate_sim.py {hid} --dump-prompt")
    spec0, _row, falas_txt = hearing_falas(hid)
    if sentences_hash([b["sentences"] for b in falas_txt]) != ann["sentences_hash"]:
        raise SystemExit(f"hearing-{hid:03d}.json foi anotado sobre outra divisão de sentenças; anote de novo")
    by_id = {b["id"]: b for b in falas_txt}
    sp_words = {s["id"]: s["words"] for s in spec0["speakers"]}
    speakers = ann["speakers"]
    falas = ann["falas"]
    fala_by_id = {f["id"]: f for f in falas}
    substantive = [f for f in falas if f["kind"] == "substantive"]
    role_of = {sid: sp["role"] for sid, sp in speakers.items()}
    if verify is None:
        verify = load_verify(hid)
    rejected = {p["id"] for p in (verify or {}).get("pairs", []) if p.get("fiel") is False}

    def sent(fid: str, i: int) -> str:
        return by_id[fid]["sentences"][i]

    def text_of(fid: str, idx: list[int]) -> str:
        out: list[str] = []
        for i in idx:
            cand = " ".join(out + [sent(fid, i)])
            if len(cand) > QUOTE_MAX:
                if not out:
                    return truncate(sent(fid, i))
                break
            out.append(sent(fid, i))
        return " ".join(out)

    # ---- cartas: índice por id e por sentença
    claims: dict[str, dict] = {}
    claim_at: dict[tuple[str, int], str] = {}
    for f in substantive:
        for c in f["claims"]:
            claims[c["id"]] = {**c, "fala": f["id"], "speaker": f["speaker"], "role": role_of[f["speaker"]]}
            for i in c["sentences"]:
                claim_at[(f["id"], i)] = c["id"]
    plain_dropped = 0

    def plain_of(cid: str) -> str | None:
        nonlocal plain_dropped
        c = claims[cid]
        if c.get("plain") is None:
            return None
        if cid in rejected:
            plain_dropped += 1
            return None
        return c["plain"]

    plain_cache: dict[str, str | None] = {cid: plain_of(cid) for cid in claims}

    def plain_at(fid: str, i: int) -> str | None:
        cid = claim_at.get((fid, i))
        return plain_cache.get(cid) if cid else None

    # ---- elenco: um boneco por orador, assento e índice estáveis
    seat_counters: dict[str, int] = {}
    cast = []
    for s in spec0["speakers"]:
        sid = s["id"]
        sp = speakers[sid]
        seat = sp["seat"]
        idx = seat_counters.get(seat, 0)
        seat_counters[seat] = idx + 1
        cast.append({
            "id": sid, "name": s["name"], "role": sp["role"], "cargo": sp["cargo"], "org": sp.get("org"),
            "byline": sp.get("byline"), "org_plain": sp.get("org_plain"),
            "seat": seat, "seat_index": idx, "remote": seat == "remoto",
            "falas": [f["id"] for f in substantive if f["speaker"] == sid], "words": sp_words[sid],
        })
    name_of = {m["id"]: m["name"] for m in cast}
    mesa_org = next((m["org"] for m in cast if m["role"] == "mesa" and m["org"] and m["org"].startswith("Comiss")), None)
    committee = spec0["committee"] or mesa_org

    # ---- plateia
    aud = ann["audience"]
    est = int(aud["estimate"])
    comp = [{"role": c["role"], "count": int(round(c["share"] * est))} for c in aud["composition"]]
    drift = est - sum(c["count"] for c in comp)
    if comp and drift:
        comp[0]["count"] = max(0, comp[0]["count"] + drift)
    audience = {"estimate": est, "rows": math.ceil(est / AUDIENCE_PER_ROW) if est else 0,
                "composition": comp, "confidence": aud["confidence"]}

    # ---- perguntas em aberto viram cartas de pergunta
    rels = ann.get("relations", [])
    questions: list[dict] = []
    q_page: dict[str, list[dict]] = {}  # fala -> perguntas dela (para as páginas)
    for q in ann.get("open_questions", []):
        f = fala_by_id[q["from"]]
        q_text = text_of(q["from"], [q["sentence"]])
        q_plain = q["plain"] if q["id"] not in rejected else None
        if q["id"] in rejected:
            plain_dropped += 1
        answered = None
        if q.get("answered_by"):
            af = fala_by_id[q["answered_by"]]
            rel = next((r for r in rels if r["from"] == q["answered_by"] and r["to"] == q["from"] and r["kind"] == "responde"), None)
            card = (rel or {}).get("from_claim") or (af["claims"][0]["id"] if af["claims"] else None)
            if rel:
                a_text, a_ref = text_of(af["id"], [rel["from_sentence"]]), ref(af["id"], [rel["from_sentence"]])
            elif card:
                a_text, a_ref = text_of(af["id"], claims[card]["sentences"]), ref(af["id"], claims[card]["sentences"])
            else:
                a_text, a_ref = text_of(af["id"], [0]), ref(af["id"], [0])
            answered = {"fala": af["id"], "card": card, "speaker": af["speaker"], "plain": plain_cache.get(card) if card else None,
                        "text": a_text, "ref": a_ref}
        gist = (q_plain or q["plain"]).strip().rstrip("?").strip()
        gist = gist[0].lower() + gist[1:] if gist else q["gist"]
        card_q = {
            "kind": "pergunta", "id": q["id"], "fala": q["from"], "speaker": f["speaker"], "role": role_of[f["speaker"]],
            "theme": q["theme"], "position": q["position"], "addressed_to": q["addressed_to"], "gist": gist,
            "plain": q_plain or q_text, "text": q_text, "ref": ref(q["from"], [q["sentence"]]),
            "seconds": seconds_of(q_plain or q_text), "answered_by_real": answered,
        }
        questions.append(card_q)
        q_page.setdefault(q["from"], []).append({"sentence": q["sentence"], "q": card_q, "plain": q_plain})

    # ---- linha do tempo
    n_sub = len(substantive)
    slot_after: dict[str, int] = {}
    for k, frac in enumerate(FLOOR_SLOTS, start=1):
        pos = min(n_sub - 2, max(2, math.ceil(frac * n_sub) - 1))
        slot_after.setdefault(substantive[pos]["id"], k)
    slots: list[str | None] = [None] * len(FLOOR_SLOTS) + [None]
    for fid, k in slot_after.items():
        slots[k - 1] = fid
    timeline: list[dict] = []
    close_ev = None
    plain_pages = 0
    for f in falas:
        b = by_id[f["id"]]
        if f["kind"] == "procedural":
            ev = {"kind": "mesa", "id": f["id"], "move": f["mesa_move"], "speaker": f["speaker"],
                  "text": truncate(f["summary"], MESA_TEXT_MAX),
                  "original": {"text": truncate(sent(f["id"], 0), MESA_TEXT_MAX), "ref": ref(f["id"], [0])},
                  "seconds": MESA_CARD_SECONDS}
            if f["mesa_move"] == "encerra":
                close_ev = ev
            else:
                timeline.append(ev)
            continue
        pages: list[tuple[int, dict]] = []
        for c in f["claims"]:
            orig = text_of(f["id"], c["sentences"])
            pl = plain_cache[c["id"]]
            if pl is not None:
                plain_pages += 1
            pages.append((c["sentences"][0], {
                "kind": "claim", "card": c["id"], "plain": pl,
                "original": {"text": orig, "ref": ref(f["id"], c["sentences"])}, "seconds": seconds_of(pl or orig),
            }))
        for item in q_page.get(f["id"], []):
            q = item["q"]
            if item["plain"] is not None:
                plain_pages += 1
            # a pergunta vem logo depois da carta que contém a sentença dela (ou na posição da sentença)
            pages.append((item["sentence"] + 0.5, {
                "kind": "pergunta", "card": q["id"], "plain": item["plain"],
                "original": {"text": q["text"], "ref": q["ref"]}, "seconds": q["seconds"],
            }))
        pages.sort(key=lambda p: p[0])
        page_list = [p for _, p in pages]
        timeline.append({
            "kind": "fala", "id": f["id"], "speaker": f["speaker"], "theme": f["theme"],
            "seconds": sum(p["seconds"] for p in page_list), "t0": round(float(b["t0"]), 4),
            "summary": f["summary"],
            "stance": {"position": f["stance"]["position"], "claim": f["stance"]["claim"], "ref": ref(f["id"], [f["stance"]["sentence"]])},
            "applause": int(b["applause"]), "covered": bool(f["covered"]), "interrupted": bool(f["interrupted"]),
            "tone": f["tone"], "pages": page_list,
        })
        if f["id"] in slot_after:
            timeline.append({"kind": "floor", "slot": slot_after[f["id"]], "after": f["id"]})
    # considerações finais: uma última vez depois da última fala
    timeline.append({"kind": "floor", "slot": len(FLOOR_SLOTS) + 1, "after": substantive[-1]["id"]})
    timeline.append({"kind": "close", "text": close_ev["text"] if close_ev else None,
                     "original": close_ev["original"] if close_ev else None,
                     "speaker": close_ev["speaker"] if close_ev else None})

    # ---- baralho de afirmações
    # Cada relação tem duas âncoras de carta (v4, spec §24): `from_claim` e `to_claim`, obrigatórias no contrato e
    # validadas contra as sentenças. Âncora null quer dizer relação com a fala inteira: o gatilho entra em todas as
    # cartas da fala com `anchor: "fala"`, para a interface dizer "respondeu a esta fala" em vez de "a este trecho".
    def from_anchor(rl: dict) -> str | None:
        return rl["from_claim"]

    def to_anchor(rl: dict) -> str | None:
        return rl["to_claim"]

    def reaction(rl: dict, side: str, card: str | None, anchor: str) -> dict:
        fid = rl[side]
        s_idx = rl["from_sentence"] if side == "from" else rl["to_sentence"]
        f = fala_by_id[fid]
        return {"kind": rl["kind"], "fala": fid, "speaker": f["speaker"], "role": role_of[f["speaker"]], "card": card, "anchor": anchor,
                "plain": plain_at(fid, s_idx), "text": text_of(fid, [s_idx]), "ref": ref(fid, [s_idx]),
                "note": rl["note"], "strength": rl["strength"]}

    facts_ann = ann.get("facts", [])
    fact_of: dict[tuple[str, int], dict] = {(fc["fala"], fc["sentence"]): fc for fc in facts_ann}
    groups = ann.get("consensus", [])

    # consenso por cartas (regra 8, v4): quem anotou disse exatamente quais cartas são o acordo
    consensus_ids: set[str] = {cid for g in groups for cid in g["claims"]}

    deck: list[dict] = []
    for f in substantive:
        for c in f["claims"]:
            cid = c["id"]
            triggers = [reaction(rl, "from", from_anchor(rl), "carta" if to_anchor(rl) == cid else "fala")
                        for rl in rels if rl["to"] == f["id"] and to_anchor(rl) in (None, cid)]
            for i in c["sentences"]:
                fc = fact_of.get((f["id"], i))
                if not fc:
                    continue
                for d in fc.get("disputed_by", []):
                    df = fala_by_id[d["fala"]]
                    triggers.append({"kind": "contradiz", "fala": d["fala"], "speaker": df["speaker"], "role": role_of[df["speaker"]],
                                     "card": claim_at.get((d["fala"], d["sentence"])), "anchor": "carta",
                                     "plain": plain_at(d["fala"], d["sentence"]), "text": text_of(d["fala"], [d["sentence"]]),
                                     "ref": ref(d["fala"], [d["sentence"]]), "note": f"Disputa o dado: {fc['gist']}", "strength": "forte"})
            asserts = [reaction(rl, "to", to_anchor(rl), "carta" if from_anchor(rl) == cid else "fala")
                       for rl in rels if rl["from"] == f["id"] and from_anchor(rl) in (None, cid)]
            fact = next((fact_of[(f["id"], i)]["id"] for i in c["sentences"] if (f["id"], i) in fact_of), None)
            text = text_of(f["id"], c["sentences"])
            deck.append({
                "kind": "claim", "id": cid, "fala": f["id"], "speaker": f["speaker"], "role": role_of[f["speaker"]],
                "theme": c["theme"], "type": c["type"], "strength": c["strength"], "position": c["position"],
                "consensus": cid in consensus_ids, "gist": c["gist"], "plain": plain_cache[cid],
                "text": text, "ref": ref(f["id"], c["sentences"]), "seconds": seconds_of(plain_cache[cid] or text),
                "fact": fact, "triggers": triggers, "asserts": asserts,
            })
    deck.extend(questions)

    # ---- fatos
    facts = []
    for fc in facts_ann:
        disputed = []
        for d in fc.get("disputed_by", []):
            df = fala_by_id[d["fala"]]
            disputed.append({"fala": d["fala"], "card": claim_at.get((d["fala"], d["sentence"])), "speaker": df["speaker"],
                             "role": role_of[df["speaker"]], "plain": plain_at(d["fala"], d["sentence"]),
                             "text": text_of(d["fala"], [d["sentence"]]), "ref": ref(d["fala"], [d["sentence"]])})
        facts.append({"id": fc["id"], "fala": fc["fala"], "speaker": fala_by_id[fc["fala"]]["speaker"],
                      "gist": fc["gist"], "text": text_of(fc["fala"], [fc["sentence"]]),
                      "ref": ref(fc["fala"], [fc["sentence"]]), "disputed_by": disputed})

    consensus = [{"theme": c["theme"], "falas": c["falas"], "cards": sorted(c["claims"]),
                  "roles": sorted({role_of[fala_by_id[i]["speaker"]] for i in c["falas"]}, key=ROLES.index),
                  "note": c["note"]} for c in groups]

    glossario = [{"term": g["term"], "plain": g["plain"], "ref": ref(g["fala"], [g["sentence"]])} for g in ann.get("glossario", [])]

    press = dict(ann["press"])
    press["covered_falas"] = [f["id"] for f in substantive if f["covered"]]

    # ---- teses resolvidas: quem defendeu e quem discordou, por papel e por instituição, nunca por pessoa
    speaker_order = [s["id"] for s in spec0["speakers"]]
    short_cargo = {m["id"]: (m["org"] or m["cargo"].split(",")[0].split(";")[0].strip()) for m in cast}
    teses = []
    for t in ann["teses"]:
        pos = t["positions"]
        aligned_sp: set[str] = set()
        opposed_sp: set[str] = set()
        aligned_cards = opposed_cards = 0
        for c in claims.values():
            side = pos.get(c["theme"])
            if side is None or c["position"] not in OPPOSITE:
                continue
            if c["position"] == side:
                aligned_sp.add(c["speaker"])
                aligned_cards += 1
            else:
                opposed_sp.add(c["speaker"])
                opposed_cards += 1

        def count(sps: set[str]) -> dict[str, int]:
            out: dict[str, int] = {}
            for sid in sps:
                out[role_of[sid]] = out.get(role_of[sid], 0) + 1
            return {r: out[r] for r in ROLES if r in out}

        def orgs(sps: set[str]) -> list[str]:
            seen: list[str] = []
            for sid in speaker_order:
                if sid in sps and short_cargo[sid] not in seen:
                    seen.append(short_cargo[sid])
            return seen

        rivals = [u["id"] for u in ann["teses"] if u["id"] != t["id"] and any(u["positions"].get(th) == OPPOSITE[s] for th, s in pos.items())]
        teses.append({
            "id": t["id"], "title": t["title"], "statement_plain": t["statement_plain"], "core_theme": t["core_theme"],
            "positions": pos, "claims_chave": t["claims_chave"], "note": t["note"],
            "defenders": count(aligned_sp), "opponents": count(opposed_sp),
            "defender_orgs": orgs(aligned_sp), "opponent_orgs": orgs(opposed_sp), "rivals": rivals,
            "aligned_cards": aligned_cards, "opposed_cards": opposed_cards,
        })
    for t in teses:
        for org in t["defender_orgs"] + t["opponent_orgs"]:
            for nm in name_of.values():
                if nm.lower() in org.lower() and nm.lower() not in ("presidente",):
                    raise SystemExit(f"tese {t['id']}: '{org}' contém o nome de uma pessoa ({nm}); use org ou cargo")

    player = {"seat": "debatedores", "seat_index": seat_counters.get("debatedores", 0), "slots": slots, "moves_per_floor": MOVES_PER_FLOOR}

    return {
        "version": VERSION, "id": hid, "name": spec0["name"], "date": spec0["date"], "committee": committee,
        "words": spec0["words"], "synopsis": ann["synopsis"], "stakes": ann["stakes"], "central_question": ann["central_question"],
        "synopsis_plain": ann["synopsis_plain"], "stakes_plain": ann["stakes_plain"], "central_question_plain": ann["central_question_plain"],
        "themes": ann["themes"], "cast": cast, "audience": audience, "player": player, "teses": teses,
        "timeline": timeline, "deck": deck, "facts": facts, "consensus": consensus, "glossario": glossario, "press": press,
        "meta": {"model": ann["model"], "created": ann["created"], "prompt_sha256": ann["prompt_sha256"],
                 "sentences_hash": ann["sentences_hash"], "builder": BUILDER, "quote_max": QUOTE_MAX,
                 "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "plain_pages": plain_pages, "plain_dropped": plain_dropped, "relations": len(rels),
                 "verify": {"model": verify["model"], "created": verify["created"]} if verify else None,
                 "review": ann.get("review")},
    }


def validate(doc: dict) -> None:
    import jsonschema
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator.check_schema(schema)
    jsonschema.Draft202012Validator(schema).validate(doc)


def write(doc: dict) -> Path:
    WEB_OUT.mkdir(parents=True, exist_ok=True)
    out = WEB_OUT / f"hearing-{doc['id']:03d}.json"
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    idx_path = WEB_OUT / "index.json"
    entries = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else []
    entries = [e for e in entries if e["id"] != doc["id"]]
    entries.append({
        "id": doc["id"], "name": doc["name"], "date": doc["date"], "committee": doc["committee"], "words": doc["words"],
        "cast": len(doc["cast"]), "falas": sum(1 for e in doc["timeline"] if e["kind"] == "fala"),
        "cards": sum(1 for c in doc["deck"] if c["kind"] == "claim"),
        # o número de relações anotadas (até 2026-09-15 era a soma dos gatilhos, inflada pela ancoragem por fala)
        "relations": doc["meta"]["relations"],
        "teses": len(doc["teses"]), "plain": True, "verified": doc["meta"]["verify"] is not None,
        "json": f"hearings/hearing-{doc['id']:03d}.json",
    })
    entries.sort(key=lambda e: e["id"])
    idx_path.write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def main(argv: list[str]) -> None:
    if "--all" in argv:
        ids = sorted(int(p.stem.split("-")[1]) for p in ANN_DIR.glob("hearing-*.json") if ".verify" not in p.name)
    else:
        ids = [int(a) for a in argv if a.isdigit()] or [44]
    for hid in ids:
        doc = build(hid)
        validate(doc)
        out = write(doc)
        n_fala = sum(1 for e in doc["timeline"] if e["kind"] == "fala")
        n_mesa = sum(1 for e in doc["timeline"] if e["kind"] == "mesa")
        n_pages = sum(len(e["pages"]) for e in doc["timeline"] if e["kind"] == "fala")
        total = sum(e.get("seconds", 0) for e in doc["timeline"])
        n_q = sum(1 for c in doc["deck"] if c["kind"] == "pergunta")
        print(f"audiência {hid}: {len(doc['cast'])} no elenco, plateia {doc['audience']['estimate']}, "
              f"{n_fala} falas em {n_pages} páginas ({doc['meta']['plain_pages']} simples) + {n_mesa} cartões da mesa (~{total // 60} min), "
              f"{len(doc['deck']) - n_q} cartas + {n_q} perguntas, {len(doc['teses'])} teses, {len(doc['glossario'])} termos")
        print(f"  -> {out.relative_to(ROOT).as_posix()} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1:])
