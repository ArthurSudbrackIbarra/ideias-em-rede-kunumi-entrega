"""Validates web/public/hearings/hearing-NNN.json against shared/hearing-sim.schema.json and checks
the invariants the schema cannot express (ids resolve, pages point at deck cards, teses point at existing
cards and never name a person, refs match text).

    uv run src/sim/validate.py 44
    uv run src/sim/validate.py --all
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
from sim.build_scene import WEB_OUT, validate  # noqa: E402

REF = re.compile(r"^(b\d{3})\.(\d+)(?:-(\d+))?$")


def check(doc: dict) -> list[str]:
    errs: list[str] = []
    cast = {m["id"]: m for m in doc["cast"]}
    themes = {t["id"] for t in doc["themes"]}
    falas = {e["id"] for e in doc["timeline"] if e["kind"] == "fala"}
    cards = {c["id"]: c for c in doc["deck"]}
    for e in doc["timeline"]:
        if e["kind"] in ("mesa", "fala") and e["speaker"] not in cast:
            errs.append(f"{e['id']}: orador {e['speaker']} fora do elenco")
        if e["kind"] == "mesa" and not e["text"].strip():
            errs.append(f"{e['id']}: cartão da mesa vazio")
        if e["kind"] == "fala":
            if e["theme"] not in themes:
                errs.append(f"{e['id']}: tema {e['theme']} inexistente")
            for p in e["pages"]:
                c = cards.get(p["card"])
                if c is None:
                    errs.append(f"{e['id']}: página aponta para carta inexistente {p['card']}")
                elif c["kind"] != p["kind"]:
                    errs.append(f"{e['id']}: página {p['card']} é {p['kind']} mas a carta é {c['kind']}")
                elif c["fala"] != e["id"]:
                    errs.append(f"{e['id']}: página {p['card']} pertence à fala {c['fala']}")
                if not REF.match(p["original"]["ref"]) or not p["original"]["text"].strip():
                    errs.append(f"{e['id']}: página {p['card']} com original inválido")
                if p["plain"] is not None and not p["plain"].strip():
                    errs.append(f"{e['id']}: página {p['card']} com plain vazio")
        if e["kind"] == "floor" and e["after"] not in falas:
            errs.append(f"floor {e['slot']}: fala {e['after']} inexistente")
    for c in doc["deck"]:
        if c["fala"] not in falas:
            errs.append(f"carta {c['id']}: fala {c['fala']} não está na linha do tempo")
        if c["theme"] not in themes:
            errs.append(f"carta {c['id']}: tema inexistente")
        if c["speaker"] not in cast:
            errs.append(f"carta {c['id']}: orador inexistente")
        if c["kind"] == "claim":
            for r in c["triggers"] + c["asserts"]:
                if r["speaker"] not in cast or r["fala"] not in falas:
                    errs.append(f"carta {c['id']}: reação com fala/orador inexistente")
        else:
            a = c["answered_by_real"]
            if a and (a["fala"] not in falas or (a["card"] and a["card"] not in cards)):
                errs.append(f"pergunta {c['id']}: resposta real aponta para fala/carta inexistente")
    names = [m["name"].lower() for m in doc["cast"] if m["name"].lower() != "presidente"]
    tese_ids = {t["id"] for t in doc["teses"]}
    for t in doc["teses"]:
        if t["core_theme"] not in t["positions"]:
            errs.append(f"tese {t['id']}: core_theme fora de positions")
        for th in t["positions"]:
            if th not in themes:
                errs.append(f"tese {t['id']}: tema {th} inexistente")
        for cid in t["claims_chave"]:
            c = cards.get(cid)
            if c is None or c["kind"] != "claim":
                errs.append(f"tese {t['id']}: carta-chave {cid} inexistente")
            elif c["theme"] not in t["positions"] or c["position"] != t["positions"][c["theme"]]:
                errs.append(f"tese {t['id']}: carta-chave {cid} fora do tema ou do lado da tese")
        for org in t["defender_orgs"] + t["opponent_orgs"]:
            if any(nm in org.lower() for nm in names):
                errs.append(f"tese {t['id']}: '{org}' contém nome de pessoa")
        for rv in t["rivals"]:
            if rv not in tese_ids:
                errs.append(f"tese {t['id']}: rival {rv} inexistente")
    for slot in doc["player"]["slots"]:
        if slot is not None and slot not in falas:
            errs.append(f"player.slots: fala {slot} inexistente")
    for g in doc["glossario"]:
        if not REF.match(g["ref"]):
            errs.append(f"glossário {g['term']}: ref inválida")
    if not any(e["kind"] == "floor" for e in doc["timeline"]):
        errs.append("linha do tempo sem nenhum momento de fala da cadeira vaga")
    return errs


def main(argv: list[str]) -> None:
    paths = sorted(WEB_OUT.glob("hearing-*.json")) if "--all" in argv else \
        [WEB_OUT / f"hearing-{int(a):03d}.json" for a in argv if a.isdigit()] or [WEB_OUT / "hearing-044.json"]
    bad = 0
    for p in paths:
        doc = json.loads(p.read_text(encoding="utf-8"))
        validate(doc)
        errs = check(doc)
        if errs:
            bad += 1
            print(f"{p.name}: {len(errs)} problemas\n  " + "\n  ".join(errs[:20]))
        else:
            print(f"{p.name}: ok")
    if bad:
        raise SystemExit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
