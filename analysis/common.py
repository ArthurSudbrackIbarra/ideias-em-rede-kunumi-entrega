"""Base comum dos scripts que reproduzem os números do artigo.

Cada script desta pasta lê só arquivos do repositório (e o dataset baixado por
`uv run scripts/download_data.py`), calcula um grupo de números e devolve uma lista de
`Numero`: o valor calculado, formatado como o artigo o escreve, ao lado do valor impresso
no artigo. `run_all.py` junta todos e grava `resultados.md`.

    uv run analysis/run_all.py          # todos os números, com a conferência
    uv run analysis/acervo.py           # um grupo só
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dataset import LDS, NLI, load_jsonl  # noqa: E402
from sim.hearing_text import hearing_falas  # noqa: E402

ANN_DIR = ROOT / "data" / "sim"
WEB_DIR = ROOT / "web" / "public" / "hearings"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# ------------------------------------------------------------------ leitura dos arquivos do repositório

def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def index() -> dict[int, dict]:
    """web/public/hearings/index.json: as audiências construídas (jogáveis)."""
    return {e["id"]: e for e in read_json(WEB_DIR / "index.json")}


@lru_cache(maxsize=None)
def built_ids() -> tuple[int, ...]:
    return tuple(sorted(index()))


@lru_cache(maxsize=None)
def catalog() -> dict[int, dict]:
    """web/public/hearings/catalog.json: as 206 audiências do acervo (número, título, data, comissão, palavras)."""
    return {e["id"]: e for e in read_json(WEB_DIR / "catalog.json")}


@lru_cache(maxsize=None)
def annotations() -> dict[int, dict]:
    """data/sim/hearing-NNN.json: a anotação do modelo de linguagem de cada audiência construída."""
    return {h: read_json(ANN_DIR / f"hearing-{h:03d}.json") for h in built_ids()}


@lru_cache(maxsize=None)
def scenes() -> dict[int, dict]:
    """web/public/hearings/hearing-NNN.json: o arquivo jogável montado por build_scene.py."""
    return {h: read_json(WEB_DIR / f"hearing-{h:03d}.json") for h in built_ids()}


@lru_cache(maxsize=None)
def lds() -> dict[int, dict]:
    """PublicHearingBR_LDS.jsonl: transcrição, matéria e metadados das 206 audiências."""
    return {r["id"]: r for r in load_jsonl(LDS)}


@lru_cache(maxsize=None)
def nli() -> list[dict]:
    """PublicHearingBR_NLI.jsonl: as opiniões extraídas pelo ChatGPT, com a verificação manual."""
    return load_jsonl(NLI)


@lru_cache(maxsize=None)
def falas(hid: int) -> dict[str, dict]:
    """As falas de uma audiência como hearing_text.py as divide (b001, b002, ...), por id."""
    _spec0, _row, fs = hearing_falas(hid)
    return {f["id"]: f for f in fs}


def words(text: str | None) -> int:
    """Contagem de palavras usada em todo o artigo: tokens separados por espaço em branco."""
    return len((text or "").split())


# ------------------------------------------------------------------ formatação como no artigo (pt-BR)

def _round(x: float, casas: int) -> Decimal:
    return Decimal(str(x)).quantize(Decimal(1).scaleb(-casas), rounding=ROUND_HALF_UP)


def fmt_int(x: float) -> str:
    """1298711 -> '1.298.711' (arredonda meio para cima)."""
    return f"{int(_round(x, 0)):,}".replace(",", ".")


def fmt_dec(x: float, casas: int = 1) -> str:
    """9.11 -> '9,1'; com casas=0 equivale a fmt_int."""
    if casas == 0:
        return fmt_int(x)
    s = f"{_round(x, casas):,.{casas}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def fmt_num(x: float, casas: int = 1) -> str:
    """Como nas tabelas: inteiro sem casas ('8'), fração com `casas` casas ('16,5')."""
    return fmt_int(x) if float(x).is_integer() else fmt_dec(x, casas)


def fmt_pct(fracao: float, casas: int = 1) -> str:
    """0.389962 -> '39,0%'."""
    return fmt_dec(100 * fracao, casas) + "%"


def fmt_mil(x: float, casas: int = 1) -> str:
    """30530 -> '30,5 mil'."""
    return fmt_dec(x / 1000, casas) + " mil"


# ------------------------------------------------------------------ o registro de números

@dataclass
class Numero:
    onde: str        # onde o número aparece no artigo: "Resumo", "Seção 3", "Tabela 1", "Figura 8b"...
    descricao: str   # o que o número mede, numa linha
    artigo: str      # como o artigo escreve o número (o valor esperado)
    valor: str       # o valor calculado, formatado do mesmo jeito
    exato: str = ""  # o valor sem arredondar, ou a conta (ex.: "632/1768 = 38,9962%")
    fonte: str = ""  # de que arquivos do repositório o número sai
    ok: bool | None = None  # None: confere se valor == artigo; True/False: conferência feita pelo script

    def __post_init__(self) -> None:
        if self.ok is None:
            self.ok = self.valor == self.artigo


def report(titulo: str, nums: list[Numero]) -> str:
    """Tabela em Markdown de um grupo de números."""
    linhas = [f"## {titulo}", "", "| Onde | O que | No artigo | Calculado | Exato | Fonte | Confere |",
              "|---|---|---|---|---|---|---|"]
    for n in nums:
        cel = [n.onde, n.descricao, n.artigo, n.valor, n.exato, n.fonte, "sim" if n.ok else "**NÃO**"]
        linhas.append("| " + " | ".join(str(c).replace("|", "\\|").replace("\n", " ") for c in cel) + " |")
    return "\n".join(linhas) + "\n"


def main(titulo: str, numeros: Callable[[], list[Numero]]) -> None:
    """Ponto de entrada de cada script: imprime a tabela e sai com erro se algum número não conferir."""
    nums = numeros()
    print(report(titulo, nums))
    falhas = [n for n in nums if not n.ok]
    print(f"{len(nums) - len(falhas)} de {len(nums)} números conferem com o artigo.")
    sys.exit(1 if falhas else 0)
