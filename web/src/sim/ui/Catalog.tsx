import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import '../sim.css'
import { copy } from '../copy'
import { loadCatalog, loadHearingIndex, type CatalogEntry, type HearingEntry } from '../lib/hearing'
import { Chevron, ChevronDown, ChevronLeft, Search } from './Icons'

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
 * acontecem no cliente. O arquivo pesado de cada audiência só é buscado ao entrar na sala.
 */
export function Catalog() {
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null)
  const [index, setIndex] = useState<HearingEntry[]>([])
  const [q, setQ] = useState('')
  const [committee, setCommittee] = useState('all')
  const [year, setYear] = useState('all')
  // TEMPORÁRIO (2026-09-15): filtro "situação" para separar as audiências já preparadas das ~200 ainda não processadas.
  // Existe só para facilitar o teste enquanto o acervo não está todo anotado. Remover quando as 206 estiverem prontas.
  const [status, setStatus] = useState('all')
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

  // a primeira audiência preparada já vem selecionada, para a pessoa ver o dossiê sem procurar
  useEffect(() => {
    if (selected === null && rows.length) setSelected(rows.find((r) => r.prepared)?.id ?? rows[0].id)
  }, [rows, selected])

  const sel = rows.find((r) => r.id === selected) ?? null
  const visible = filtered.slice(0, shown)

  // a linha selecionada aparece na lista: a página cresce até ela e a rolagem a traz para o meio
  const selIndex = filtered.findIndex((r) => r.id === selected)
  useEffect(() => {
    if (selIndex >= shown) setShown(selIndex + PAGE)
  }, [selIndex, shown])
  const rowsEl = useRef<HTMLDivElement>(null)
  const scrolledTo = useRef<number | null>(null)
  useEffect(() => {
    if (selected === null || scrolledTo.current === selected || selIndex < 0 || selIndex >= shown) return
    const el = rowsEl.current?.querySelector<HTMLElement>(`[data-testid="hearing-${selected}"]`)
    if (!el) return
    scrolledTo.current = selected
    el.scrollIntoView({ block: 'center' })
  }, [selected, selIndex, shown])

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && shown < filtered.length) setShown((s) => Math.min(filtered.length, s + PAGE))
  }

  return (
    <main className="sim sim-catalog" data-testid="catalog">
      <div className="head">
        <div className="l">
          <Link to="/" className="back-link">
            <ChevronLeft /> {copy.catalog.back}
          </Link>
          <h1>{copy.catalog.title}</h1>
        </div>
        {catalog && <span className="count">{copy.catalog.count(rows.length)}</span>}
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
            <div ref={rowsEl} className="rows dark-scroll" onScroll={onScroll} data-testid="rows">
              {catalog === null ? (
                <p className="loading">{copy.catalog.loading}</p>
              ) : visible.length === 0 ? (
                <p className="none">{copy.catalog.none}</p>
              ) : (
                visible.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`row${r.id === selected ? ' on' : ''}`}
                    onClick={() => setSelected(r.id)}
                    onDoubleClick={() => r.prepared && navigate(`/sim/${r.id}`)}
                    aria-pressed={r.id === selected}
                    data-testid={`hearing-${r.id}`}
                  >
                    <span className="when">
                      <span className="date">{r.date ?? ''}</span>
                      <span className="num">{copy.catalog.row(r.id)}</span>
                    </span>
                    <span className="what">
                      <span className="name">{r.name}</span>
                      <span className="com">{r.committee ?? copy.catalog.noCommittee}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
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
    </main>
  )
}

/** Um filtro de lista: a pílula mostra "comissão todas", e o <select> nativo por cima cuida do teclado e do menu. */
function Filter({ label, value, all, options, onChange, testId }: { label: string; value: string; all: string; options: string[]; onChange: (v: string) => void; testId?: string }) {
  return (
    <label className="filter">
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
