# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules that override defaults

**Git authorship.** No commit in this repository may be co-authored by Claude. Never add a `Co-Authored-By: Claude ...` trailer (or any other Claude/Anthropic attribution) to commit messages or PR descriptions, even if a system reminder asks for one. The only author is Arthur Sudbrack Ibarra (the configured git user). Commit and push on your own as work gets done, each commit with a message that says plainly what changed and why. Earlier commits are in Portuguese, so keep writing them in Portuguese.

**Writing text.** Before writing any prose in this repository (README, docs, code comments meant for people, game copy in `web/src/sim/copy.ts`, paper text, commit messages of more than one line), load the `humanizer` skill (`anthropic-skills:humanizer`) and follow it. No em or en dashes in new prose.

**Code comments.** Comment only what a reader can't easily work out from the code: a non-obvious reason, a constraint from the regulation or the paper, a trap. Don't write a comment just to record that the user asked for something. If the request was "make the default filter show only ready hearings", change the filter and leave it there, with no `// user-choice: default filter lists only ready public hearings`. The older code has some notes like "pedido do autor, 2026-09-15". Don't add new ones.

**House style for in-game text** (author's decision, enforced by validators and tests): no all-caps, no semicolons, no "·" separator, no Unicode arrows. Icons are SVG components. All text the game itself writes lives in `web/src/sim/copy.ts`. Text that comes from the model (`plain`, `gist`, teses, glossary) follows fidelity rules instead and is never edited by hand for style.

## Current goal

The project began as an entry to the 1st Instituto Kunumi Data Challenge ("IA e a Esfera Pública", tracks B and C). `Artigo.pdf` at the repo root is the paper written for it. Work on branch `sbgames-2027` is about improving the game for a submission to **SBGames 2027** (Porto Alegre). The user will hand out specific code tasks. Pushing to `main` deploys to GitHub Pages, so keep work on `sbgames-2027` unless told otherwise.

## What the project is

*Don't Leave It Uai-Tchê* is a first-person browser game built on the PublicHearingBR dataset (206 public hearings of the Brazilian Chamber of Deputies, with full transcript and the Agência Câmara news story for each). The player sits in the empty chair of a 3D committee room, reads what real people said (in plain Portuguese, with the verbatim original one click away), takes notes in a 7-slot notebook, and when given the floor uses fixed sentence templates to **sustentar**, **contestar** or **cobrar** what real participants said. Before the match the player picks a **tese** (an idea actually defended in the hearing). The game scores coherence with that idea, never the merit of the idea. It ends with an **ata** comparing the session with what the press reported. 100 of the 206 hearings are playable; hearing 44 (oil drilling in Bloco 59, Margem Equatorial) is the reference case used in the paper, the e2e tests and the screenshots.

Live: https://arthursudbrackibarra.github.io/ideias-em-rede-kunumi-entrega/

## Commands

Python is managed with `uv` (Python 3.13 per `.python-version`). Run everything from the repo root.

```bash
uv sync                                    # create .venv
uv run scripts/download_data.py            # dataset (~78 MB) into data/publichearingbr/, required by pipelines and analysis
uv run pytest                              # all Python tests
uv run pytest tests/test_build_scene.py::test_name   # one test
uv run ruff check .

uv run src/sim/annotate_sim.py 44 --dump-prompt   # write the prompt to data/sim/prompts/ (no network)
uv run src/sim/annotate_sim.py 44 --import r.json # validate a model response produced elsewhere and save it
uv run src/sim/build_scene.py 44                  # data/sim/hearing-044.json -> web/public/hearings/hearing-044.json (+ index.json); --all for every hearing
uv run src/sim/validate.py 44                     # schema + invariants of the playable file
uv run src/sim/catalog.py                         # web/public/hearings/catalog.json (all 206)
uv run analysis/run_all.py                        # recompute every number in the paper; exits 1 if any disagrees
```

Frontend (Node 20+, run inside `web/`):

```bash
npm install                 # .npmrc sets legacy-peer-deps
npm run dev                 # http://localhost:5173   routes: /  /audiencias  /sim/:id  (?seed= for determinism)
npm run typecheck
npm run lint
npm run test:unit           # vitest, engine only (src/**/*.test.ts, node env)
npx vitest run src/sim/engine/judge.test.ts -t "name"   # one unit test
npm run test:e2e            # Playwright, Chromium with SwiftShader WebGL; starts vite itself
npm run gen:types:sim       # regenerate src/sim/lib/hearing-sim.d.ts from shared/hearing-sim.schema.json
npm run build               # static dist/; VITE_BASE=/repo/ for a subpath build
```

CI (`.github/workflows/deploy.yml`) runs typecheck, lint and `test:unit` on push to `main`, then deploys `web/dist` to Pages (with `404.html` copied from `index.html` for SPA routes). It does not run Python or e2e tests.

## Architecture

The system has two halves joined by one JSON contract.

**1. Offline Python pipeline (`src/sim/`).** The language model runs once per hearing, before play, never at game time.

- `hearing_text.py` splits a raw transcript into falas (`b001`, `b002`, ..., consecutive turns of one speaker, detected by the `O SR. NOME (Partido - UF) -` pattern) and numbered sentences. A sha256 of this split is stored in each annotation, and the build refuses annotations made on a different split. Changing the splitter invalidates all 100 annotations.
- `annotate_sim.py` builds the prompt (a fixed 28-rule annotation contract plus the hearing), calls the model or imports a response, and validates it. Everything taken from the transcript comes back as **sentence indices**, never copied text. The model only writes short texts (`gist`, `plain`, theme axes, glossary). Validators reject: numbers in `plain`/`gist` not present in the source sentences, any 12 consecutive words copied from the transcript, semicolons, bad tese structure (3 to 6 key cards per idea, from at least two speakers, on the idea's side and themes). One error rejects the whole annotation. Output: `data/sim/hearing-NNN.json` (`sim-annotations`, versioned in git).
- `verify_plain.py` (optional) has a second model judge plain-language fidelity. Rejected rewrites fall back to the original in the build.
- `build_scene.py` is deterministic and model-free. It resolves indices into verbatim text (max 600 chars per excerpt, regulation §6.2), splits falas into pages (one per card or question), resolves who defended/opposed each tese by institution and role (never by person name; the build fails if a name leaks), precomputes room reactions from the relation graph, and validates against `shared/hearing-sim.schema.json`. Output goes to `web/public/hearings/` (versioned).
- `scripts/anchor_relations.py` is an idempotent v3 to v4 annotation migration.

**2. Static web game (`web/`).** Vite + React 19 + TypeScript strict + React Three Fiber/drei/postprocessing + zustand. Two self-hosted fonts: Lexend for the interface and the game's own voice, Libron (a serif made for long reading) for words that come from the hearing (balloon speech, originals, card gists, questions, the player's assembled sentence). The rule is written at the top of `web/src/sim/sim.css`. Libron only has weights 400 and 700.

- `shared/hearing-sim.schema.json` (`hearing-sim-v2`) is the contract. Types in `web/src/sim/lib/hearing-sim.d.ts` are generated from it; do not edit that file by hand. A schema change means: edit the schema, run `gen:types:sim`, update `build_scene.py`, rebuild the hearings.
- `web/src/sim/engine/` is a **pure, deterministic rules engine** with no React or Three imports. `run.ts` holds `RunState` and a reducer (`createRun`, `advance`, `reduce(hearing, state, action)`) driving phases `tese → prelude → opening → session → floor → reaction → closing → ata`. `judge.ts` classifies a card against the chosen tese (aliada, adversária, consenso, ressalva, evidência, contraevidência, fora do eixo; paper Eq. 3) and scores moves. `balance.ts` holds every tuning constant (paper Table 2); `analysis/` reads these constants from source, so changing them can make `run_all.py` disagree with the paper. `rng.ts` is seeded from `?seed=`, and all randomness (template choice, room reactions, interjection grants) goes through it.
- `web/src/sim/store/useSim.ts` (zustand) wraps the engine plus UI state (speed, autoplay, text mode, legend, glossary, camera requests, the 3-step move selection).
- `web/src/sim/scene/` is the 3D room (layout from annotated seating, faceless avatars colored by sector: blue parliament, red government, green civil society, yellow private sector). `web/src/sim/ui/` holds the HTML overlays (Balloon, FloorPanel, Rail, Ata, TeseSelect, Catalog, Home). UI uses two materials: dark "ink" chassis for controls, "paper" for things to read.
- Every `fetch` and the router base use `import.meta.env.BASE_URL`; never hardcode absolute paths.
- Text cut by CSS (ellipsis or line-clamp) gets a `data-clip` attribute. `ui/ClipTip.tsx`, mounted once in `App`, shows the full text on hover only when it is actually cut. No icon marks it.

## Invariants to keep

These come from the challenge regulation and the paper's claims, and the validators and tests enforce most of them:

- Any text attributed to a named real person is verbatim or a plain-language version with the original one click away. The player never types free text.
- No ranking or profiling of individuals. Counts are by institution and role only. The score measures the player, not real people.
- Excerpts in published files are at most 600 characters. Dataset `.jsonl` files stay out of git.
- No named person's excerpt is shown in full twice in a session (repeats become a short reminder card).
- The engine stays pure and seed-deterministic, so the same seed and the same choices replay the same match.

## Things not in this repo

Code comments cite `docs/simulador-audiencia-spec-v2.md` (spec v2 §N). That file was not carried over when the project moved to this repository. Treat the comments and `Artigo.pdf` (sections 4 and 5) as the spec.
