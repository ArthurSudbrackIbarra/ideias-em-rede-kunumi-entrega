import { useEffect, useRef } from 'react'
import { copy } from '../copy'
import { castById, type HearingSim } from '../lib/hearing'
import { useSim } from '../store/useSim'
import { spokenOf } from './describe'
import { Dialog } from './Dialog'
import { RoleDot } from './RoleDot'

/**
 * O histórico: tudo o que passou pelo balão nesta sessão, na ordem, para reler o que se perdeu. Cada fala aparece como
 * o balão a mostrou (a versão simples, ou o original no modo original), com o texto original a um clique e a
 * referência da sentença. É um diálogo, como o glossário, e abre já rolado até a fala mais recente.
 */
export function HistoryPanel({ hearing }: { hearing: HearingSim }) {
  const open = useSim((s) => s.panel === 'history')
  if (!open) return null
  return <HistoryDialog hearing={hearing} />
}

function HistoryDialog({ hearing }: { hearing: HearingSim }) {
  const log = useSim((s) => s.log)
  const textMode = useSim((s) => s.textMode)
  const list = useRef<HTMLDivElement>(null)
  const cast = castById(hearing)
  const close = () => useSim.getState().togglePanel('history', false)

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  return (
    <Dialog labelledBy="history-title" onEscape={close} keys={['history']} className="sim-dock sim-glossary sim-history" testId="history">
      <div className="plate dock-head">
        <h2 id="history-title">{copy.history.title}</h2>
        <button type="button" className="close" onClick={close}>
          {copy.history.close} <kbd>Esc</kbd>
        </button>
      </div>
      <div className="paper sim-scroll" ref={list} tabIndex={0} role="region" aria-labelledby="history-title">
        <p className="hint">{copy.history.hint}</p>
        {log.length === 0 ? (
          <p className="hint">{copy.history.empty}</p>
        ) : (
          <ol className="log">
            {log.map((item) => {
              if ('notice' in item) {
                return (
                  <li key={item.key} className="notice">
                    <span className="who">{copy.history.notice}</span>
                    <p>{item.notice}</p>
                  </li>
                )
              }
              const line = item.line
              const s = spokenOf(hearing, line, textMode)
              const m = line.speaker ? cast.get(line.speaker) : null
              const verbatim = textMode === 'verbatim' && line.plain !== null && line.original !== null
              const alt = line.kind === 'player' ? null : verbatim ? line.plain : line.plain !== null ? line.original?.text ?? null : null
              return (
                <li key={item.key} className={`k-${line.kind}`}>
                  {s.who && (
                    <span className="who">
                      <span className="name">
                        {m && <RoleDot role={m.role} label />} {s.who}
                        {s.relation && <span className="rel">, {s.relation.toLowerCase()}</span>}
                      </span>
                      {line.ref && <span className="ref">{line.ref}</span>}
                    </span>
                  )}
                  <p className={line.kind === 'fala' || line.kind === 'reaction' || line.kind === 'mesa' || line.kind === 'player' ? 'said' : ''}>{s.text}</p>
                  {line.kind === 'player' && line.verdict && (
                    <p className="verdict">
                      {copy.verdict.short(line.verdict.kind)}.{line.verdict.explanation ? ` ${line.verdict.explanation}` : ''}
                    </p>
                  )}
                  {alt && (
                    <details>
                      <summary>{verbatim ? copy.balloon.seePlain : copy.balloon.seeOriginal}</summary>
                      <blockquote>{alt}</blockquote>
                    </details>
                  )}
                  {line.kind === 'player' &&
                    line.sources.map((src) => (
                      <details key={src.card}>
                        <summary>
                          {copy.balloon.source}: {src.ref}
                        </summary>
                        <blockquote>{src.text}</blockquote>
                      </details>
                    ))}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Dialog>
  )
}
