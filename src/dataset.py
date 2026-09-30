"""Caminhos do PublicHearingBR e leitura com erro amigável.

Os .jsonl do dataset não estão no git (regulamento §6.2), então um clone novo não
tem os dados. Em vez de um FileNotFoundError cru, os pipelines param aqui com a
instrução do que rodar.

    from dataset import LDS, NLI, load_jsonl, require
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data" / "publichearingbr"
LDS = DIR / "PublicHearingBR_LDS.jsonl"
NLI = DIR / "PublicHearingBR_NLI.jsonl"

DOWNLOAD = "uv run scripts/download_data.py"


def require(path: Path, hint: str = DOWNLOAD) -> Path:
    """Garante que `path` existe e não está vazio; senão, encerra com instrução."""
    if not path.exists() or path.stat().st_size == 0:
        rel = path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else path
        raise SystemExit(f"faltando: {rel}\nrode:     {hint}")
    return path


def load_jsonl(path: Path, hint: str = DOWNLOAD) -> list[dict]:
    require(path, hint)
    with path.open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]
