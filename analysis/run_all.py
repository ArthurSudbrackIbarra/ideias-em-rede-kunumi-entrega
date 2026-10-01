"""Recalcula todos os números do artigo a partir dos arquivos do repositório.

    uv run analysis/run_all.py

Imprime cada grupo de números, grava analysis/resultados.md e termina com erro (código 1)
se algum valor calculado não bater com o que o artigo escreve.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

from common import report

# a ordem segue a do artigo
MODULOS = ["acervo", "construidas", "cobertura", "ideias", "fidelidade", "anotacao", "jogo", "audiencia44"]
SAIDA = Path(__file__).with_name("resultados.md")


def main() -> None:
    partes = []
    total = falhas = 0
    for nome in MODULOS:
        mod = importlib.import_module(nome)
        nums = mod.numeros()
        total += len(nums)
        falhas += sum(1 for n in nums if not n.ok)
        partes.append(report(f"{mod.TITULO} (`analysis/{nome}.py`)", nums))
        print(f"{nome:12s} {len(nums):3d} números, {sum(1 for n in nums if not n.ok)} sem conferir")

    resumo = f"{total - falhas} de {total} números conferem com o artigo."
    texto = "\n".join([
        "# Números do artigo, recalculados",
        "",
        "Gerado por `uv run analysis/run_all.py` a partir dos arquivos do repositório. Não edite à mão.",
        "",
        f"**{resumo}**",
        "",
        *partes,
    ])
    SAIDA.write_text(texto, encoding="utf-8", newline="\n")
    print(f"\n{resumo}\nTabela completa em {SAIDA.relative_to(Path.cwd()) if SAIDA.is_relative_to(Path.cwd()) else SAIDA}")
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
