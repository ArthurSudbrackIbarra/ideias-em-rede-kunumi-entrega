# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Download the PublicHearingBR dataset from Hugging Face into data/publichearingbr/.

The pipelines in src/ read the two .jsonl files directly and they are *not* in git
(regulamento §6.2: não redistribuir o dataset), so this is the first thing to run
after cloning the repository.

Usage (from the repo root):
    uv run scripts/download_data.py            # download whatever is missing
    uv run scripts/download_data.py --check    # verify only, never writes (exit 1 if incomplete)
    uv run scripts/download_data.py --force    # re-download everything
    uv run scripts/download_data.py --no-paper # skip the arXiv PDF

Downloads are atomic (written to a .part file, then renamed) and verified against
the size and the sha256 that Hugging Face advertises for each file, so an
interrupted run never leaves behind a truncated file that the next run mistakes
for a complete one.

Source: https://huggingface.co/datasets/unicamp-dl/PublicHearingBR
Paper:  https://arxiv.org/abs/2410.07495
"""
from __future__ import annotations

import argparse
import hashlib
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

REPO = "unicamp-dl/PublicHearingBR"
REVISION = "main"
BASE = f"https://huggingface.co/datasets/{REPO}/resolve/{REVISION}/"
PAPER_URL = "https://arxiv.org/pdf/2410.07495"

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "publichearingbr"
PAPER = ROOT / "docs" / "publichearingbr-paper.pdf"

UA = "ideias-em-rede-kunumi/1.0 (dataset downloader)"
TIMEOUT = 60
ATTEMPTS = 3
HEX = set("0123456789abcdef")


@dataclass(frozen=True)
class Asset:
    name: str
    note: str
    jsonl: bool = False

    @property
    def url(self) -> str:
        return BASE + self.name

    @property
    def path(self) -> Path:
        return DATA / self.name


ASSETS = [
    Asset("PublicHearingBR_LDS.jsonl", "206 audiências: transcrição + matéria + sumário", jsonl=True),
    Asset("PublicHearingBR_NLI.jsonl", "4.238 pares opinião/chunks com rótulo manual", jsonl=True),
    Asset("README.md", "cartão do dataset (inglês)"),
    Asset("README_PT.md", "cartão do dataset (português)"),
    Asset("load_dataset.py", "leitor de referência dos autores"),
]


# ---------------------------------------------------------------------- helpers

def human(n: int | None) -> str:
    if n is None:
        return "?"
    size = float(n)
    for unit in ("B", "KB", "MB"):
        if size < 1024:
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Keep the huggingface.co response instead of following it to the CDN.

    The size and the sha256 of an LFS/Xet file are in the X-Linked-* headers of
    that first response; the CDN it redirects to does not carry them.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def remote_meta(url: str) -> tuple[int | None, str | None]:
    """Return (size in bytes, sha256 hex) as advertised by Hugging Face.

    Only the two big .jsonl files are LFS/Xet objects and carry X-Linked-Size /
    X-Linked-ETag (a sha256). For the small text files the endpoint answers with
    a redirect whose Content-Length describes the redirect, not the file, and git
    may rewrite their line endings on checkout anyway — so both come back None
    and those files are only checked for existence.
    """
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        headers = opener.open(req, timeout=TIMEOUT).headers
    except urllib.error.HTTPError as exc:
        if exc.code not in (301, 302, 303, 307, 308):
            raise
        headers = exc.headers
    raw = headers.get("X-Linked-Size")
    size = int(raw) if raw and raw.isdigit() else None
    etag = (headers.get("X-Linked-ETag") or "").strip('"').lower()
    sha = etag if len(etag) == 64 and set(etag) <= HEX else None
    return size, sha


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def progress(done: int, total: int | None, started: float, label: str) -> None:
    elapsed = max(time.monotonic() - started, 1e-6)
    rate = done / elapsed / (1 << 20)
    if total:
        pct = 100.0 * done / total
        filled = int(pct // 4)
        bar = "#" * filled + "." * (25 - filled)
        line = f"  {label:28s} [{bar}] {pct:5.1f}%  {human(done)}/{human(total)}  {rate:.1f} MB/s"
    else:
        line = f"  {label:28s} {human(done)}  {rate:.1f} MB/s"
    sys.stderr.write("\r" + line.ljust(100))
    sys.stderr.flush()


def fetch(url: str, dest: Path, label: str, expect_size: int | None, expect_sha: str | None) -> None:
    """Download url into dest atomically, verifying size and sha256."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    last_error: Exception | None = None

    for attempt in range(1, ATTEMPTS + 1):
        digest = hashlib.sha256()
        done = 0
        started = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp, tmp.open("wb") as fh:
                total = expect_size
                if total is None:
                    length = resp.headers.get("Content-Length")
                    total = int(length) if length and length.isdigit() else None
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    fh.write(chunk)
                    digest.update(chunk)
                    done += len(chunk)
                    progress(done, total, started, label)
            sys.stderr.write("\n")

            if expect_size is not None and done != expect_size:
                raise OSError(f"tamanho inesperado: {done} bytes, esperado {expect_size}")
            if expect_sha is not None and digest.hexdigest() != expect_sha:
                raise OSError(f"sha256 não confere ({digest.hexdigest()[:16]} != {expect_sha[:16]})")

            tmp.replace(dest)
            return
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            last_error = exc
            tmp.unlink(missing_ok=True)
            if attempt < ATTEMPTS:
                wait = 2 ** attempt
                print(f"  ! {exc} - tentativa {attempt}/{ATTEMPTS}, repetindo em {wait}s", file=sys.stderr)
                time.sleep(wait)

    raise SystemExit(f"falha ao baixar {url}: {last_error}")


def count_lines(path: Path) -> int:
    with path.open("rb") as fh:
        return sum(block.count(b"\n") for block in iter(lambda: fh.read(1 << 20), b""))


# ------------------------------------------------------------------------- main

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--force", action="store_true",
                        help="baixar de novo mesmo se o arquivo já estiver no disco")
    parser.add_argument("--check", action="store_true",
                        help="apenas verificar o que está no disco; não escreve nada")
    parser.add_argument("--verify-hash", action="store_true",
                        help="recalcular o sha256 dos arquivos já presentes")
    parser.add_argument("--no-paper", action="store_true",
                        help="não baixar o PDF do paper (arXiv 2410.07495)")
    args = parser.parse_args(argv)

    print(f"PublicHearingBR - {REPO} @ {REVISION}")
    print(f"destino: {DATA.relative_to(ROOT).as_posix()}/\n")

    missing: list[str] = []
    for asset in ASSETS:
        local = asset.path
        try:
            size, sha = remote_meta(asset.url)
        except (urllib.error.URLError, TimeoutError) as exc:
            if args.check or not local.exists():
                print(f"  !!   {asset.name:28s} Hugging Face inacessível ({exc})")
                missing.append(asset.name)
                continue
            size, sha = None, None  # offline, but the file is here: keep it

        ok = local.exists() and local.stat().st_size > 0
        if ok and size is not None:
            ok = local.stat().st_size == size
        if ok and args.verify_hash and sha:
            ok = sha256_of(local) == sha

        if ok and not args.force:
            print(f"  ok   {asset.name:28s} {human(local.stat().st_size):>9s}  {asset.note}")
            continue
        if args.check:
            state = "faltando" if not local.exists() else "incompleto ou corrompido"
            print(f"  !!   {asset.name:28s} {state}")
            missing.append(asset.name)
            continue

        print(f"  get  {asset.name:28s} {human(size):>9s}  {asset.note}")
        fetch(asset.url, local, asset.name, size, sha)

    if not args.no_paper:
        if PAPER.exists() and PAPER.stat().st_size > 0 and not args.force:
            print(f"  ok   {PAPER.name:28s} {human(PAPER.stat().st_size):>9s}  paper (arXiv 2410.07495)")
        elif args.check:
            print(f"  !!   {PAPER.name:28s} faltando")
            missing.append(PAPER.name)
        else:
            print(f"  get  {PAPER.name:28s} {'?':>9s}  paper (arXiv 2410.07495)")
            fetch(PAPER_URL, PAPER, PAPER.name, None, None)

    if missing:
        print(f"\nfaltando: {', '.join(missing)}")
        print("rode `uv run scripts/download_data.py` para baixar.")
        return 1

    print()
    for asset in ASSETS:
        if asset.jsonl and asset.path.exists():
            print(f"  {asset.name}: {count_lines(asset.path)} linhas")
    print("\npronto. próximos passos:")
    print("  uv run src/sim/annotate_sim.py 44 --dump-prompt")
    print("  uv run src/sim/build_scene.py 44")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
