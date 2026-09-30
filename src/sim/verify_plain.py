"""Hearing simulator, stage 1b (optional): a second model judges the fidelity of every plain-words version
(docs/simulador-audiencia-spec-v2.md §5).

For each pair (original verbatim, plain) of a hearing — cards, questions and gists, only where `plain` is
not null — a judge model different from the annotator answers `fiel: true|false` with a reason. The
result goes to data/sim/hearing-NNN.verify.json; build_scene.py reads it and replaces every rejected
`plain` by the original (the page is then shown as "texto original"). Without an API key this stage
does not run and the game shows the discreet notice "versões simples ainda não verificadas por um
segundo modelo" (meta.verify = null).

    uv run src/sim/verify_plain.py 44
    uv run src/sim/verify_plain.py --all
    uv run src/sim/verify_plain.py 44 --model claude-opus-5
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
from sim.annotate_sim import OUT_DIR, load_annotations  # noqa: E402
from sim.hearing_text import hearing_falas, parse_json  # noqa: E402

VERSION = "sim-verify-v1"
DEFAULT_JUDGE = "claude-opus-5"  # tem de ser diferente do modelo que anotou
BATCH = 20

SYSTEM = """Você é um revisor de fidelidade. Recebe pares (ORIGINAL, SIMPLES): o ORIGINAL é um trecho verbatim de uma
audiência pública; o SIMPLES é uma reescrita em palavras simples que será mostrada como "o que a pessoa disse".
Para cada par, diga se o SIMPLES é FIEL ao ORIGINAL. É INFIEL quando: muda o sentido (mais forte, mais fraco, outro
alvo); acrescenta informação, nome, número, causa ou conclusão que não está no original; omite algo essencial; troca
número, data ou nome; troca quem faz o quê; transforma pergunta em afirmação ou o inverso; acrescenta juízo do revisor.
Explicar uma sigla ou um termo técnico entre vírgulas NÃO é acrescentar informação. Encurtar sem perder o sentido é fiel.
Devolva APENAS um JSON: {"pares": [{"id": "...", "fiel": true|false, "motivo": "uma frase"}]}, um item por par, na ordem."""


def pairs_of(hid: int) -> list[dict]:
    ann = load_annotations(hid)
    if ann is None:
        raise SystemExit(f"faltando: data/sim/hearing-{hid:03d}.json")
    _spec0, _row, falas = hearing_falas(hid)
    by_id = {b["id"]: b for b in falas}
    out: list[dict] = []
    for f in ann["falas"]:
        if f["kind"] != "substantive":
            continue
        for c in f["claims"]:
            original = " ".join(by_id[f["id"]]["sentences"][i] for i in c["sentences"])
            if c.get("plain"):
                out.append({"id": c["id"], "original": original, "plain": c["plain"]})
            out.append({"id": c["id"] + ":gist", "original": original, "plain": "que " + c["gist"]})
    for q in ann.get("open_questions", []):
        out.append({"id": q["id"], "original": by_id[q["from"]]["sentences"][q["sentence"]], "plain": q["plain"]})
    return out


def judge(pairs: list[dict], model: str) -> list[dict]:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY não definida: a verificação por segundo modelo é opcional e só roda com chave.")
    import anthropic
    client = anthropic.Anthropic()
    results: list[dict] = []
    for i in range(0, len(pairs), BATCH):
        batch = pairs[i:i + BATCH]
        user = "\n\n".join(f"### {p['id']}\nORIGINAL: {p['original']}\nSIMPLES: {p['plain']}" for p in batch)
        msg = client.messages.create(model=model, max_tokens=4000, temperature=0, system=SYSTEM,
                                     messages=[{"role": "user", "content": user}])
        resp = parse_json("".join(getattr(b, "text", "") for b in msg.content))
        got = {p["id"]: p for p in resp.get("pares", [])}
        for p in batch:
            r = got.get(p["id"])
            if not isinstance(r, dict) or not isinstance(r.get("fiel"), bool):
                raise SystemExit(f"juiz não respondeu ao par {p['id']}")
            results.append({"id": p["id"], "fiel": r["fiel"], "motivo": str(r.get("motivo", ""))})
    return results


def main(argv: list[str]) -> None:
    model = argv[argv.index("--model") + 1] if "--model" in argv else DEFAULT_JUDGE
    if "--all" in argv:
        ids = sorted(int(p.stem.split("-")[1]) for p in OUT_DIR.glob("hearing-*.json") if ".verify" not in p.name)
    else:
        ids = [int(a) for a in argv if a.isdigit()] or [44]
    for hid in ids:
        pairs = pairs_of(hid)
        results = judge(pairs, model)
        doc = {"version": VERSION, "id": hid, "model": model,
               "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "pairs": results}
        out = OUT_DIR / f"hearing-{hid:03d}.verify.json"
        out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        bad = [r for r in results if not r["fiel"]]
        print(f"audiência {hid}: {len(results)} pares julgados, {len(bad)} reprovados")
        for r in bad:
            print(f"  {r['id']}: {r['motivo']}")
        print(f"  -> {out.relative_to(ROOT).as_posix()}  (rode build_scene.py {hid} para aplicar)")


if __name__ == "__main__":
    main(sys.argv[1:])
