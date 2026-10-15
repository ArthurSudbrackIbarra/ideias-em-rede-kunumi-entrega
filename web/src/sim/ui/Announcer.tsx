import { useAnnounce } from '../lib/announce'

/** As duas regiões vivas do jogo, montadas uma vez no App, antes de qualquer mensagem. */
export function Announcer() {
  const polite = useAnnounce((s) => s.polite)
  const assertive = useAnnounce((s) => s.assertive)
  return (
    <div className="sr-only" data-testid="announcer">
      <div role="log" aria-live="polite" aria-relevant="additions" data-testid="announce-polite">
        {polite.map((m) => (
          <p key={m.id}>{m.text}</p>
        ))}
      </div>
      <div aria-live="assertive" aria-relevant="additions" data-testid="announce-assertive">
        {assertive.map((m) => (
          <p key={m.id}>{m.text}</p>
        ))}
      </div>
    </div>
  )
}
