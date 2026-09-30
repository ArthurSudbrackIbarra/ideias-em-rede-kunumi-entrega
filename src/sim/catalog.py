"""
Catálogo leve do acervo para a tela "Escolha a audiência" (redesenho de 2026-09-14).

Lê o dataset inteiro uma vez e grava web/public/hearings/catalog.json com uma linha por audiência:
número, título (o assunto dos metadados), data, comissão e total de palavras. Nada de pessoa nomeada
entra aqui: é só o que a lista precisa para buscar, filtrar e ordenar no navegador. O arquivo pesado
de cada audiência (hearing-NNN.json) continua sendo buscado só quando a pessoa entra na sala.

    uv run src/sim/catalog.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hearing_text import LDS, require  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "hearings" / "catalog.json"

COMMITTEE_RE = re.compile(r"Comiss[ãa]o d[eao]s? [A-ZÁ-Ú][^,.;\n(]{3,80}")
DATE_RE = re.compile(r"(\d{2}/\d{2}/\d{4})")


STOP_RE = re.compile(r"\s+(da Câmara|nesta|neste|realiz|promov|debat|ouviu|aprov|discut|deve|vai|para|em \d).*$")


def trim_committee(s: str) -> str:
    """Corta o que a matéria emenda depois do nome ("... da Câmara nesta quarta-feira")."""
    return STOP_RE.sub("", s).strip()


def entry(row: dict) -> dict:
    text = row["transcricao"]
    date = DATE_RE.search(row["materia"])
    # a transcrição primeiro (é onde a presidência nomeia a comissão), a matéria como reserva
    committee = COMMITTEE_RE.search(text[:12000]) or COMMITTEE_RE.search(row["materia"])
    return {
        "id": row["id"],
        "name": row["metadados"]["assunto"].strip(),
        "date": date.group(1) if date else None,
        "committee": trim_committee(committee.group(0)) if committee else None,
        "words": len(text.split()),
    }


def main() -> None:
    entries: list[dict] = []
    with require(LDS).open(encoding="utf-8") as fh:
        for line in fh:
            entries.append(entry(json.loads(line)))
    entries.sort(key=lambda e: e["id"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8")
    n_date = sum(1 for e in entries if e["date"])
    n_com = sum(1 for e in entries if e["committee"])
    print(f"catálogo: {len(entries)} audiências, {n_date} com data, {n_com} com comissão -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
