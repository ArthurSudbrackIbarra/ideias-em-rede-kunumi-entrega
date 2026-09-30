"""build_scene.py v2 sobre a audiência 44 real (precisa do dataset baixado e de data/sim/hearing-044.json)."""
from __future__ import annotations

import copy
import json

import pytest

from dataset import LDS
from sim import build_scene, validate as validate_mod
from sim.hearing_text import hearing_falas

pytestmark = pytest.mark.skipif(not LDS.exists(), reason="dataset não baixado (uv run scripts/download_data.py)")


@pytest.fixture(scope="module")
def doc() -> dict:
    return build_scene.build(44)


@pytest.fixture(scope="module")
def sentences() -> dict[str, list[str]]:
    _spec0, _row, falas = hearing_falas(44)
    return {f["id"]: f["sentences"] for f in falas}


def test_schema_and_invariants(doc):
    build_scene.validate(doc)
    assert validate_mod.check(doc) == []
    assert doc["version"] == "hearing-sim-v2"


def test_idempotent(doc):
    a = copy.deepcopy(doc)
    b = build_scene.build(44)
    a["meta"].pop("built")
    b["meta"].pop("built")
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def test_pages_are_verbatim(doc, sentences):
    for e in doc["timeline"]:
        if e["kind"] != "fala":
            continue
        for p in e["pages"]:
            fid, rng = p["original"]["ref"].split(".")
            lo, hi = (int(x) for x in rng.split("-")) if "-" in rng else (int(rng), int(rng))
            joined = " ".join(sentences[fid][lo:hi + 1])
            text = p["original"]["text"]
            assert joined.startswith(text.rstrip("…")) or text == joined, p["original"]["ref"]
            assert len(text) <= 600


def test_every_page_has_plain(doc):
    # v3: a transcrição bruta nunca vai ao balão; as cartas curtas ganharam uma revisão leve
    cards = {c["id"]: c for c in doc["deck"]}
    pages = [p for e in doc["timeline"] if e["kind"] == "fala" for p in e["pages"]]
    assert pages and all(p["plain"] for p in pages)
    assert all(c["plain"] for c in doc["deck"])
    assert cards["b030c3"]["plain"].startswith("Presidente, essa indústria vai investir 183 bilhões")
    assert doc["meta"]["plain_pages"] == len(pages)
    for c in doc["deck"]:
        assert ";" not in c["plain"] and ";" not in c["gist"], c["id"]


def test_verify_rejection_drops_plain():
    verify = {"model": "juiz-teste", "created": "2026-09-13T00:00:00Z", "pairs": [{"id": "b009c3", "fiel": False, "motivo": "teste"}]}
    d = build_scene.build(44, verify=verify)
    page = next(p for e in d["timeline"] if e["kind"] == "fala" for p in e["pages"] if p["card"] == "b009c3")
    assert page["plain"] is None
    assert next(c for c in d["deck"] if c["id"] == "b009c3")["plain"] is None
    assert d["meta"]["plain_dropped"] == 1
    assert d["meta"]["verify"] == {"model": "juiz-teste", "created": "2026-09-13T00:00:00Z"}
    build_scene.validate(d)


def test_teses_resolved_without_names(doc):
    names = [m["name"].lower() for m in doc["cast"] if m["name"].lower() != "presidente"]
    assert 3 <= len(doc["teses"]) <= 6
    for t in doc["teses"]:
        assert t["defender_orgs"] and t["opponent_orgs"], t["id"]
        for org in t["defender_orgs"] + t["opponent_orgs"]:
            assert not any(nm in org.lower() for nm in names), org
        assert sum(t["defenders"].values()) >= 2
    t2 = next(t for t in doc["teses"] if t["id"] == "t2")
    assert "t3" in t2["rivals"]
    # MME e Ibama, ambos governo, em lados opostos da t2
    assert "Ibama" in t2["defender_orgs"] and "MME" in t2["opponent_orgs"]


def test_question_cards(doc):
    qs = [c for c in doc["deck"] if c["kind"] == "pergunta"]
    assert len(qs) == 5
    q3 = next(q for q in qs if q["id"] == "q3")
    assert q3["answered_by_real"]["fala"] == "b065" and q3["answered_by_real"]["card"] == "b065c1"
    assert q3["plain"].endswith("?") and not q3["gist"].endswith("?")
    q1 = next(q for q in qs if q["id"] == "q1")
    assert q1["answered_by_real"] is None
    pages = [p for e in doc["timeline"] if e["kind"] == "fala" and e["id"] == "b057" for p in e["pages"]]
    assert any(p["kind"] == "pergunta" and p["card"] == "q3" for p in pages)


def test_player_and_floors(doc):
    assert doc["player"]["seat"] == "debatedores" and doc["player"]["moves_per_floor"] == 2
    floors = [e for e in doc["timeline"] if e["kind"] == "floor"]
    assert [f["slot"] for f in floors] == [1, 2, 3, 4]
    assert doc["player"]["slots"][:3] == [f["after"] for f in floors[:3]] and doc["player"]["slots"][3] is None


def test_fact_disputes_become_triggers(doc):
    b007c3 = next(c for c in doc["deck"] if c["id"] == "b007c3")
    notes = [t["note"] for t in b007c3["triggers"]]
    assert any(n.startswith("Disputa o dado:") for n in notes)
    assert all(t["ref"].startswith("b") for t in b007c3["triggers"])
    # f3 (b007.71) é disputado por b028.10, que está em b028c1: a disputa chega ancorada nessa carta
    dispute = next(t for t in b007c3["triggers"] if t["note"].startswith("Disputa o dado:") and t["fala"] == "b028")
    assert dispute["anchor"] == "carta" and dispute["card"] == "b028c1"


def test_triggers_are_anchored_per_card(doc):
    """2026-09-15 (relatório, fases 0 e 1): o gatilho de uma relação entra só na carta que ela aponta (to_claim, ou a
    carta de to_sentence); sem carta, entra em todas as cartas da fala, marcado anchor='fala'."""
    from sim.annotate_sim import load_annotations

    ann = load_annotations(44)
    claim_at = {(f["id"], i): c["id"] for f in ann["falas"] for c in f["claims"] for i in c["sentences"]}
    cards = {c["id"]: c for c in doc["deck"] if c["kind"] == "claim"}
    for rl in ann["relations"]:
        target = rl.get("to_claim") or claim_at.get((rl["to"], rl["to_sentence"]))
        def is_rel(t: dict) -> bool:  # o gatilho desta relação (a nota é dela), e não uma disputa de dado ou outra relação da mesma sentença
            return t["fala"] == rl["from"] and t["ref"] == f"{rl['from']}.{rl['from_sentence']}" and t["kind"] == rl["kind"] and t["note"] == rl["note"]

        carriers = [c["id"] for c in cards.values() if any(is_rel(t) for t in c["triggers"])]
        if target:
            assert carriers == [target], (rl["from"], rl["to"], carriers)
            t = next(t for t in cards[target]["triggers"] if is_rel(t))
            assert t["anchor"] == "carta"
            assert t["card"] == (rl.get("from_claim") or claim_at.get((rl["from"], rl["from_sentence"])))
        else:
            assert sorted(carriers) == sorted(c["id"] for c in cards.values() if c["fala"] == rl["to"])
            for cid in carriers:
                assert all(t["anchor"] == "fala" for t in cards[cid]["triggers"] if is_rel(t))
    # o índice mostra as relações anotadas, não a soma dos gatilhos
    assert doc["meta"]["relations"] == len(ann["relations"]) == 44
    assert sum(len(c["triggers"]) for c in cards.values()) < 2 * len(ann["relations"])


def test_consensus_by_cards(doc):
    """Grupo com `claims` marca exatamente essas cartas; grupo só com falas segue a regra legada (spec §20)."""
    cards = {c["id"]: c for c in doc["deck"] if c["kind"] == "claim"}
    by_theme = {g["theme"]: g for g in doc["consensus"]}
    assert by_theme["d2"]["cards"] == ["b004c1", "b004c2", "b004c3", "b030c3", "b055c2"]
    assert all(cards[cid]["consensus"] for cid in by_theme["d2"]["cards"])
    # o grupo d3 da 44 (capacidade técnica da Petrobras) não se escreve em carta nenhuma e saiu na migração v4
    assert "d3" not in by_theme
    assert by_theme["d1"]["cards"] == ["b002c1", "b002c2"] and cards["b002c1"]["consensus"]
    assert not cards["b009c1"]["consensus"]
    marked = {c["id"] for c in cards.values() if c["consensus"]}
    assert marked == {cid for g in doc["consensus"] for cid in g["cards"]}
