import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../sim.css'
import { copy } from '../copy'
import { loadCatalog, loadHearingIndex, type CatalogEntry, type HearingEntry } from '../lib/hearing'
import { useTitle } from '../lib/useTitle'
import { useSettings } from '../store/useSettings'
import { Chevron, ChevronDown, ChevronLeft, Search } from './Icons'
import { SettingsPanel } from './SettingsPanel'
import { Tutorial, TutorialButton } from './Tutorial'

const PAGE = 24

interface Row extends CatalogEntry {
  /** a audiência já foi anotada e construída: abre a sala */
  prepared: HearingEntry | null
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** "31/05/2023" -> "20230531", para ordenar */
const dateKey = (d: string | null) => (d ? `${d.slice(6)}${d.slice(3, 5)}${d.slice(0, 2)}` : '')
const yearOf = (d: string | null) => (d ? d.slice(6) : null)

/**
 * Escolher a audiência (redesenho, tela 01b): mestre e detalhe sobre o acervo inteiro. A lista lê o catálogo
 * leve (catalog.json, uma linha por audiência) e o índice das preparadas (index.json). Busca, filtro e ordem
 * acontecem no cliente. O arquivo pesado de cada audiência só é buscado ao entrar na sala. Para o teclado, a lista é
 * uma só parada do Tab (uma listbox): as setas escolhem, Enter entra na sala, e o próximo Tab já cai no detalhe.
 */
export function Catalog() {
  useTitle(copy.titles.catalog)
  const navigate = useNavigate()
  /** a seleção mudou pelo teclado: o foco acompanha a linha escolhida */
  const keyed = useRef(false)
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null)
  const [index, setIndex] = useState<HearingEntry[]>([])
  const [q, setQ] = useState('')
  const [committee, setCommittee] = useState('all')
  const [year, setYear] = useState('all')
  // TEMPORÁRIO (2026-09-15): filtro "situação" para separar as audiências já preparadas das ~200 ainda não processadas.
  // Existe só para facilitar o teste enquanto o acervo não está todo anotado. Remover quando as 206 estiverem prontas.
  const [status, setStatus] = useState<string>(copy.catalog.statusReady)
  const [newest, setNewest] = useState(true)
  const [shown, setShown] = useState(PAGE)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    void Promise.all([loadCatalog(), loadHearingIndex()]).then(([c, i]) => {
      setIndex(i)
      // sem catálogo (build antiga), as preparadas bastam para a lista
      setCatalog(c.length ? c : i.map((e) => ({ id: e.id, name: e.name, date: e.date, committee: e.committee, words: e.words })))
    })
  }, [])

  const rows = useMemo<Row[]>(() => {
    if (!catalog) return []
    const byId = new Map(index.map((e) => [e.id, e]))
    return catalog.map((c) => {
      const p = byId.get(c.id) ?? null
      // a audiência preparada tem título, data e comissão conferidos pelo modelo: eles mandam
      return { ...c, name: p?.name ?? c.name, date: p?.date ?? c.date, committee: p?.committee ?? c.committee, prepared: p }
    })
  }, [catalog, index])

  const committees = useMemo(() => [...new Set(rows.map((r) => r.committee).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows])
  const years = useMemo(() => [...new Set(rows.map((r) => yearOf(r.date)).filter((y): y is string => !!y))].sort(), [rows])

  const filtered = useMemo(() => {
    const nq = norm(q.trim())
    const out = rows.filter((r) => {
      if (committee !== 'all' && r.committee !== committee) return false
      if (year !== 'all' && yearOf(r.date) !== year) return false
      if (status === copy.catalog.statusReady && !r.prepared) return false
      if (status === copy.catalog.statusPending && r.prepared) return false
      if (!nq) return true
      return norm(`${r.name} ${r.committee ?? ''} ${r.date ?? ''} ${r.id}`).includes(nq)
    })
    out.sort((a, b) => {
      const d = dateKey(a.date).localeCompare(dateKey(b.date)) || a.id - b.id
      return newest ? -d : d
    })
    return out
  }, [rows, q, committee, year, status, newest])

  useEffect(() => setShown(PAGE), [q, committee, year, status, newest])

  // a primeira audiência preparada da lista já vem selecionada, para a pessoa ver o dossiê sem procurar. Vem do topo
  // da lista filtrada porque a lista nunca rola sozinha até a seleção
  useEffect(() => {
    if (selected === null && rows.length) setSelected((filtered.find((r) => r.prepared) ?? filtered[0] ?? rows[0]).id)
  }, [rows, filtered, selected])

  const sel = rows.find((r) => r.id === selected) ?? null
  const visible = filtered.slice(0, shown)
  // a linha que o Tab alcança: a escolhida, se está na lista, senão a primeira
  const tabbable = visible.some((r) => r.id === selected) ? selected : visible[0]?.id ?? null

  useEffect(() => {
    if (!keyed.current) return
    keyed.current = false
    document.querySelector<HTMLElement>(`[data-testid="hearing-${selected}"]`)?.focus()
  }, [selected])

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = filtered.findIndex((r) => r.id === selected)
    const go = (j: number) => {
      const k = Math.min(filtered.length - 1, Math.max(0, j))
      if (k >= shown - 2) setShown((n) => Math.min(filtered.length, Math.max(n, k + PAGE)))
      keyed.current = true
      setSelected(filtered[k].id)
    }
    if (!filtered.length) return
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(filtered.length - 1)
    else if (e.key === 'PageDown') go(i + 10)
    else if (e.key === 'PageUp') go(i - 10)
    else if (e.key === 'Enter') {
      const r = filtered[i]
      if (r?.prepared) navigate(`/sim/${r.id}`)
    } else return
    e.preventDefault()
  }

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && shown < filtered.length) setShown((s) => Math.min(filtered.length, s + PAGE))
  }

  return (
    <main className="sim sim-catalog" id="conteudo" tabIndex={-1} data-testid="catalog">
      <div className="head">
        <div className="l">
          <Link to="/" className="back-link">
            <ChevronLeft /> {copy.catalog.back}
          </Link>
          <h1>{copy.catalog.title}</h1>
        </div>
        <div className="r">
          {catalog && <span className="count">{copy.catalog.count(rows.length)}</span>}
          <TutorialButton />
          <button type="button" className="a11y-btn" onClick={() => useSettings.getState().setOpen(true)} data-testid="open-settings">
            {copy.a11y.open}
          </button>
        </div>
      </div>

      <div className="tools">
        <label className="search">
          <Search />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={copy.catalog.search} aria-label={copy.catalog.search} data-testid="search" />
        </label>
        <Filter label={copy.catalog.committee} value={committee} all={copy.catalog.allCommittees} options={committees} onChange={setCommittee} />
        <Filter label={copy.catalog.year} value={year} all={copy.catalog.allYears} options={years} onChange={setYear} />
        <Filter label={copy.catalog.status} value={status} all={copy.catalog.allStatus} options={[copy.catalog.statusReady, copy.catalog.statusPending]} onChange={setStatus} testId="filter-status" />
      </div>

      <div className="main">
        <div className="list">
          <div className="list-head">
            <span className="engrave">{copy.catalog.showing(visible.length, filtered.length)}</span>
            <button type="button" className="order" onClick={() => setNewest((v) => !v)} aria-pressed={!newest}>
              {newest ? copy.catalog.newest : copy.catalog.oldest} <ChevronDown />
            </button>
          </div>
          <div className="scroll">
            <p className="sr-only" id="catalog-keys">
              {copy.catalog.listKeys}
            </p>
            {catalog === null ? (
              <p className="loading" role="status">{copy.catalog.loading}</p>
            ) : visible.length === 0 ? (
              <p className="none" role="status">{copy.catalog.none}</p>
            ) : (
              <div
                className="rows dark-scroll"
                onScroll={onScroll}
                onKeyDown={onListKey}
                role="listbox"
                aria-label={copy.catalog.listLabel}
                aria-describedby="catalog-keys"
                data-testid="rows"
              >
                {visible.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="option"
                    className={`row${r.id === selected ? ' on' : ''}`}
                    onClick={() => setSelected(r.id)}
                    onFocus={() => setSelected(r.id)}
                    onDoubleClick={() => r.prepared && navigate(`/sim/${r.id}`)}
                    aria-selected={r.id === selected}
                    tabIndex={r.id === tabbable ? 0 : -1}
                    data-testid={`hearing-${r.id}`}
                  >
                    <span className="when">
                      <span className="date">{r.date ?? ''}</span>
                      <span className="num">{copy.catalog.row(r.id)}</span>
                    </span>
                    <span className="what">
                      <span className="name" data-clip>{r.name}</span>
                      <span className="com" data-clip>{r.committee ?? copy.catalog.noCommittee}</span>
                    </span>
                    {!r.prepared && <span className="sr-only">, {copy.catalog.preparingShort}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="veil" />
          </div>
        </div>

        {sel ? (
          <div className="detail dark-scroll" data-testid="detail">
            <div className="dossier">
              <div className="plate">
                <span className="num">{copy.catalog.heading(sel.id)}</span>
                {sel.date && (
                  <>
                    <span className="vr" />
                    <span className="date">{sel.date}</span>
                  </>
                )}
              </div>
              <div className="paper">
                <div className="com">{sel.committee ?? copy.catalog.noCommittee}</div>
                <h2>{sel.name}</h2>
                <dl className="facts">
                  {sel.prepared ? (
                    <>
                      <div><dt>{copy.catalog.inRoom}</dt><dd>{copy.catalog.people(sel.prepared.cast)}</dd></div>
                      <div><dt>{copy.catalog.falas}</dt><dd>{copy.catalog.falasCards(sel.prepared.falas, sel.prepared.cards)}</dd></div>
                      <div><dt>{copy.catalog.ideas}</dt><dd>{sel.prepared.teses}</dd></div>
                    </>
                  ) : (
                    <div><dt>{copy.catalog.transcript}</dt><dd>{copy.catalog.words(sel.words)}</dd></div>
                  )}
                </dl>
                <div className="enter-row">
                  {sel.prepared ? (
                    <Link to={`/sim/${sel.id}`} className="btn primary enter" data-testid="enter">
                      {copy.catalog.enter} <Chevron />
                    </Link>
                  ) : (
                    <>
                      <span className="why">{copy.catalog.preparing}</span>
                      <button type="button" className="btn primary enter" disabled data-testid="enter">
                        {copy.catalog.enter}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <p className="note">{copy.catalog.note}</p>
          </div>
        ) : (
          <div className="detail empty">
            <span className="engrave">{copy.catalog.pick}</span>
          </div>
        )}
      </div>
      <SettingsPanel />
      <Tutorial ask />
    </main>
  )
}

/** Um filtro de lista: a pílula mostra "comissão todas", e o <select> nativo por cima cuida do teclado e do menu. */
function Filter({ label, value, all, options, onChange, testId }: { label: string; value: string; all: string; options: string[]; onChange: (v: string) => void; testId?: string }) {
  return (
    <label className="filter" data-clip data-clip-from="b">
      {label} <b>{value === 'all' ? all : value}</b>
      <ChevronDown />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-testid={testId}>
        <option value="all">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
