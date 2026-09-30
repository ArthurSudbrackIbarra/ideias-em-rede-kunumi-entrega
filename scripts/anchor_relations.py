"""Migra as anotações sim-annotations-v3 (audiências 3, 5, 11 e 44) para a v4, sem reler a transcrição:
`relations[].from_claim`/`to_claim` obrigatórios e `consensus[].claims` obrigatório. Grupos de consenso que não
se escrevem em cartas do tema (DROP_CONSENSUS) são removidos, porque a v4 não os representa.

- `to_claim` sai da própria anotação quando `to_sentence` cai numa carta da fala `to` (58 das 118 relações das
  audiências 3, 5, 11 e 44). Para as outras, vale a decisão registrada em DECISIONS abaixo, tomada lendo só a
  sentença-alvo e os gists das cartas candidatas (RELATORIO-grafo-e-argumentacao.md, fase 1). `None` quer dizer:
  a relação é com a fala inteira, nenhuma carta a representa, e o jogo a ancora na fala.
- `claims` de cada consenso sai das cartas das falas do grupo, no tema do grupo, escolhidas pela nota do grupo
  (CONSENSUS_CLAIMS). Grupos sem entrada ficam como estavam (regra legada no build).

    uv run scripts/anchor_relations.py          # aplica em data/sim/hearing-0{03,05,11,44}.json e revalida
    uv run scripts/anchor_relations.py --check  # só mostra o que mudaria

Idempotente: o que já está na v4 não muda.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from sim.annotate_sim import OUT_DIR, VERSION, build_prompt, validate_response  # noqa: E402

# (audiência, from, to, kind) -> to_claim decidido à mão (None = fala inteira)
DECISIONS: dict[tuple[int, str, str, str], str | None] = {
    (3, "b024", "b008", "contradiz"): "b008c1",
    (3, "b029", "b008", "contradiz"): None,
    (3, "b029", "b016", "responde"): "b016c2",
    (3, "b045", "b044", "contradiz"): None,
    (3, "b059", "b055", "apoia"): None,
    (3, "b063", "b044", "contradiz"): None,
    (3, "b067", "b031", "responde"): None,
    (3, "b067", "b053", "responde"): "b053c2",
    (3, "b067", "b055", "responde"): "b055c2",
    (5, "b010", "b008", "apoia"): None,
    (5, "b020", "b014", "contradiz"): "b014c2",
    (5, "b020", "b004", "apoia"): "b004c3",
    (5, "b030", "b020", "apoia"): "b020c2",
    (5, "b042", "b020", "apoia"): "b020c3",
    (5, "b046", "b008", "contradiz"): "b008c2",
    (5, "b046", "b040", "apoia"): "b040c3",
    (5, "b051", "b008", "contradiz"): "b008c2",
    (11, "b008", "b002", "apoia"): "b002c1",
    (11, "b008", "b006", "contradiz"): "b006c2",
    (11, "b012", "b008", "apoia"): "b008c1",
    (11, "b014", "b012", "contradiz"): None,
    (11, "b016", "b014", "contradiz"): None,
    (11, "b016", "b008", "apoia"): None,
    (11, "b016", "b006", "apoia"): "b006c3",
    (11, "b020", "b018", "apoia"): None,
    (11, "b022", "b016", "apoia"): "b016c1",
    (11, "b022", "b014", "contradiz"): None,
    (11, "b023", "b012", "apoia"): None,
    (11, "b023", "b008", "apoia"): "b008c3",
    (11, "b023", "b016", "apoia"): "b016c3",
    (11, "b026", "b008", "responde"): "b008c3",
    (11, "b030", "b014", "contradiz"): None,
    (11, "b030", "b016", "responde"): None,
    (11, "b030", "b023", "apoia"): "b023c2",
    (44, "b011", "b009", "apoia"): "b009c1",
    (44, "b011", "b007", "contradiz"): "b007c2",
    (44, "b013", "b007", "apoia"): None,
    (44, "b013", "b011", "contradiz"): "b011c3",
    (44, "b028", "b009", "apoia"): "b009c1",
    (44, "b028", "b011", "apoia"): None,
    (44, "b030", "b028", "contradiz"): "b028c1",
    (44, "b030", "b007", "apoia"): None,
    (44, "b030", "b013", "apoia"): "b013c2",
    (44, "b032", "b013", "apoia"): "b013c2",
    (44, "b034", "b030", "apoia"): "b030c1",
    (44, "b036", "b009", "responde"): "b009c2",
    (44, "b036", "b011", "contradiz"): None,
    (44, "b042", "b009", "apoia"): None,
    (44, "b042", "b013", "contradiz"): "b013c3",
    (44, "b046", "b040", "apoia"): "b040c3",
    (44, "b055", "b040", "contradiz"): None,
    (44, "b057", "b009", "contradiz"): "b009c1",
    (44, "b063", "b057", "apoia"): "b057c3",
    (44, "b063", "b036", "apoia"): None,
    (44, "b063", "b040", "contradiz"): None,
    (44, "b064", "b055", "apoia"): None,
    (44, "b065", "b055", "responde"): "b055c1",
    (44, "b065", "b057", "responde"): "b057c1",
    (44, "b065", "b036", "responde"): None,
    (44, "b067", "b065", "responde"): "b065c2",
}

# (audiência, tema) -> cartas em que o acordo da nota está escrito (lidas pelos gists, contra a nota do grupo).
CONSENSUS_CLAIMS: dict[tuple[int, str], list[str]] = {
    (3, "d3"): ["b059c1", "b061c1", "b061c2"],
    (3, "d4"): ["b014c3", "b065c1"],
    (5, "d2"): ["b002c1", "b004c1", "b026c2"],
    (5, "d3"): ["b010c2", "b010c3", "b046c2"],
    (5, "d4"): ["b006c1", "b016c2", "b016c3"],
    (11, "d2"): ["b016c1", "b018c1", "b018c2", "b022c2"],
    (11, "d6"): ["b014c1", "b014c3", "b020c2"],
    (11, "d7"): ["b023c1", "b028c1"],
    (44, "d2"): ["b004c1", "b004c2", "b004c3", "b030c3", "b055c2"],
    (44, "d4"): ["b013c2", "b013c3", "b059c1", "b059c2"],
    (44, "d6"): ["b040c3", "b046c2", "b064c2"],
    (44, "d1"): ["b002c1", "b002c2"],
}

# (audiência, tema) -> grupos cuja nota não está escrita em nenhuma carta do tema: a v4 não tem como representá-los.
# 003 d1: a única carta do tema é b020c1, e o ministro (b029) concorda só na fala. 044 d3: "a Petrobras tem a maior
# capacidade técnica" não é carta de ninguém.
DROP_CONSENSUS: set[tuple[int, str]] = {(3, "d1"), (44, "d3")}

# grupos novos, que o contrato antigo recusava porque as falas têm tema diferente do das cartas (PROGRESSO.md,
# observação de 2026-09-15 sobre a 011). A nota é escrita a partir dos gists das cartas, que já são fiéis por contrato.
NEW_CONSENSUS: dict[int, list[dict]] = {
    11: [{
        "theme": "d4", "falas": ["b008", "b016", "b026"], "claims": ["b008c3", "b016c3", "b026c2"],
        "note": "O pesquisador, a rede do Semiárido e a Embrapa concordam que a biodiversidade da Caatinga é pouco aproveitada e precisa de mais ciência e de uso produtivo.",
    }],
}


def anchor(hid: int, doc: dict) -> list[str]:
    log: list[str] = []
    claim_at: dict[tuple[str, int], str] = {}
    claim_ids: set[str] = set()
    for f in doc["falas"]:
        for c in f["claims"]:
            claim_ids.add(c["id"])
            for i in c["sentences"]:
                claim_at[(f["id"], i)] = c["id"]
    for rl in doc["relations"]:
        # from_claim null com from_sentence dentro de carta: a v4 exige a carta
        at_from = claim_at.get((rl["from"], rl["from_sentence"]))
        if rl.get("from_claim") is None and at_from is not None:
            rl["from_claim"] = at_from
            log.append(f"  {rl['from']}->{rl['to']} {rl['kind']}: from_claim={at_from} (from_sentence)")
        if "to_claim" in rl:
            continue
        key = (hid, rl["from"], rl["to"], rl["kind"])
        at = claim_at.get((rl["to"], rl["to_sentence"]))
        if at is not None:
            tc, how = at, "to_sentence"
        elif key in DECISIONS:
            tc, how = DECISIONS[key], "decisão"
        else:
            raise SystemExit(f"{hid}: relação {key} sem carta na sentença e sem decisão registrada")
        if tc is not None and tc not in claim_ids:
            raise SystemExit(f"{hid}: to_claim {tc} não existe")
        # mantém a ordem das chaves do contrato: ... from_claim, to_claim, strength, note
        items = list(rl.items())
        pos = next((i for i, (k, _) in enumerate(items) if k == "from_claim"), len(items) - 2)
        items.insert(pos + 1, ("to_claim", tc))
        rl.clear()
        rl.update(items)
        log.append(f"  {rl['from']}->{rl['to']} {rl['kind']}: to_claim={tc} ({how})")
    for g in doc["consensus"]:
        key2 = (hid, g["theme"])
        if "claims" in g or key2 not in CONSENSUS_CLAIMS:
            continue
        cl = CONSENSUS_CLAIMS[key2]
        missing = [x for x in cl if x not in claim_ids]
        if missing:
            raise SystemExit(f"{hid}: consenso {g['theme']} com cartas inexistentes {missing}")
        items = list(g.items())
        pos = next(i for i, (k, _) in enumerate(items) if k == "falas")
        items.insert(pos + 1, ("claims", cl))
        g.clear()
        g.update(items)
        log.append(f"  consenso {g['theme']}: claims={cl}")
    before = len(doc["consensus"])
    doc["consensus"] = [g for g in doc["consensus"] if (hid, g["theme"]) not in DROP_CONSENSUS or "claims" in g]
    if len(doc["consensus"]) < before:
        log.append(f"  consenso removido: {sorted(t for (h, t) in DROP_CONSENSUS if h == hid)}")
    themes_done = {g["theme"] for g in doc["consensus"]}
    for g in NEW_CONSENSUS.get(hid, []):
        if g["theme"] in themes_done:
            continue
        doc["consensus"].append(g)
        log.append(f"  consenso NOVO {g['theme']}: {g['claims']}")
    return log


def main(argv: list[str]) -> None:
    check = "--check" in argv
    for hid in (3, 5, 11, 44):
        path = OUT_DIR / f"hearing-{hid:03d}.json"
        doc = json.loads(path.read_text(encoding="utf-8"))
        log = anchor(hid, doc)
        print(f"audiência {hid}: {len(log)} alterações")
        for ln in log:
            print(ln)
        prompt = build_prompt(hid)
        resp = {k: doc[k] for k in doc if k in ("synopsis", "stakes", "central_question", "synopsis_plain", "stakes_plain",
                                                 "central_question_plain", "themes", "speakers", "audience", "falas", "relations",
                                                 "consensus", "open_questions", "facts", "press", "teses", "glossario")}
        errs, warns = validate_response(resp, prompt)
        if errs:
            raise SystemExit(f"audiência {hid} inválida depois da ancoragem:\n  " + "\n  ".join(errs))
        for w in warns:
            print(f"  aviso: {w}")
        if not check:
            doc["version"] = VERSION
            doc["warnings"] = warns
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"  -> {path.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main(sys.argv[1:])
