import { useEffect, useId, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { copy } from '../copy'
import { SPEEDS } from '../engine/balance'
import { announce } from '../lib/announce'
import { actionLabel, isCharacterKey, KEY_ACTIONS, keyLabel, type KeyAction } from '../lib/keys'
import { onVoices, ptVoice } from '../lib/speech'
import { LINE_SPACINGS, reducedMotion, TEXT_SCALES, useSettings, type Volumes } from '../store/useSettings'
import { useSim } from '../store/useSim'
import { Dialog } from './Dialog'
import { StatementDialog } from './StatementDialog'

/**
 * O painel Acessibilidade: tudo vale na hora e fica guardado neste navegador. Aberto de qualquer tela (início,
 * acervo, dossiê e sala), por isso cada tela monta o seu. O ritmo da partida (automático ou manual, velocidade,
 * texto do balão) é o mesmo estado que a bancada mostra, então mudar aqui muda lá.
 */
export function SettingsPanel() {
  const open = useSettings((s) => s.open)
  return open ? <SettingsDialog /> : null
}

function SettingsDialog() {
  const st = useSettings()
  const autoplay = useSim((s) => s.autoplay)
  const speed = useSim((s) => s.speed)
  const textMode = useSim((s) => s.textMode)
  const [capturing, setCapturing] = useState<KeyAction | null>(null)
  const [voice, setVoice] = useState(() => ptVoice() !== null)
  const [statement, setStatement] = useState(false)
  const onStatementPage = useLocation().pathname === '/acessibilidade'
  const close = () => useSettings.getState().setOpen(false)

  useEffect(() => onVoices(() => setVoice(ptVoice() !== null)), [])

  // a próxima tecla de caractere vira o novo atalho; Tab desiste
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setCapturing(null)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || !isCharacterKey(e.key)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      useSettings.getState().remapKey(capturing, e.key)
      announce(`${copy.keys[capturing]}: ${keyLabel(e.key)}`)
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing])

  const vol = (ch: keyof Volumes, label: string) => <Range key={ch} label={label} value={st.volumes[ch]} onChange={(v) => st.setVolume(ch, v)} />

  return (
    <>
      <div className="sim-backdrop" onClick={close} aria-hidden="true" />
      <Dialog
        labelledBy="a11y-title"
        onEscape={() => (capturing ? setCapturing(null) : close())}
        className="sim-dock sim-settings"
        testId="settings"
      >
        <div className="plate dock-head">
          <h2 id="a11y-title">{copy.a11y.title}</h2>
          <button type="button" className="close" onClick={close} data-testid="settings-close">
            {copy.a11y.close} <kbd>Esc</kbd>
          </button>
        </div>
        <div className="paper sim-scroll">
          <p className="hint">{copy.a11y.intro}</p>

          <section aria-labelledby="a11y-reading">
            <h3 id="a11y-reading">{copy.a11y.reading}</h3>
            <Choice
              legend={copy.a11y.textSize}
              value={st.textScale}
              options={TEXT_SCALES.map((v) => [v, `${Math.round(v * 100)}%`])}
              onChange={(v) => st.set('textScale', v)}
              testId="text-size"
            />
            <Choice
              legend={copy.a11y.speechFont}
              value={st.speechFont}
              options={[
                ['lexend', copy.a11y.fontLexend],
                ['libron', copy.a11y.fontLibron],
              ]}
              onChange={(v) => st.set('speechFont', v)}
              testId="speech-font"
            />
            <Choice
              legend={copy.a11y.lineSpacing}
              value={st.lineSpacing}
              options={LINE_SPACINGS.map((v, i) => [v, copy.a11y.lineSpacings[i]])}
              onChange={(v) => st.set('lineSpacing', v)}
            />
            <Toggle label={copy.a11y.highContrast} hint={copy.a11y.highContrastHint} checked={st.highContrast} onChange={(v) => st.set('highContrast', v)} testId="high-contrast" />
          </section>

          <section aria-labelledby="a11y-motion">
            <h3 id="a11y-motion">{copy.a11y.motion}</h3>
            <Toggle label={copy.a11y.reduceMotion} hint={copy.a11y.reduceMotionHint} checked={reducedMotion(st)} onChange={(v) => st.set('reduceMotion', v)} testId="reduce-motion" />
            <Toggle label={copy.a11y.effects} hint={copy.a11y.effectsHint} checked={st.effects} onChange={(v) => st.set('effects', v)} />
          </section>

          <section aria-labelledby="a11y-pace">
            <h3 id="a11y-pace">{copy.a11y.pace}</h3>
            <Choice
              legend={copy.a11y.advance}
              hint={copy.a11y.advanceHint}
              value={autoplay ? 'auto' : 'manual'}
              options={[
                ['auto', copy.a11y.auto],
                ['manual', copy.a11y.manual],
              ]}
              onChange={(v) => useSim.getState().setAutoplay(v === 'auto')}
              testId="advance"
            />
            <Field label={copy.a11y.speed}>
              {(id) => (
                <select id={id} value={speed} onChange={(e) => useSim.getState().setSpeedIndex(Number(e.target.value))}>
                  {SPEEDS.map((x, i) => (
                    <option key={x} value={i}>
                      {copy.hud.speed(x)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Choice
              legend={copy.a11y.balloonText}
              value={textMode}
              options={[
                ['plain', copy.a11y.plain],
                ['verbatim', copy.a11y.original],
              ]}
              onChange={(v) => useSim.getState().setTextMode(v)}
            />
            <Toggle label={copy.a11y.noTimeLimits} hint={copy.a11y.noTimeLimitsHint} checked={st.noTimeLimits} onChange={(v) => st.set('noTimeLimits', v)} testId="no-time-limits" />
            <Toggle label={copy.a11y.autoLook} hint={copy.a11y.autoLookHint} checked={st.autoLook} onChange={(v) => st.set('autoLook', v)} testId="auto-look" />
            <Toggle label={copy.a11y.confirmSpeak} hint={copy.a11y.confirmSpeakHint} checked={st.confirmSpeak} onChange={(v) => st.set('confirmSpeak', v)} />
          </section>

          <section aria-labelledby="a11y-sound">
            <h3 id="a11y-sound">{copy.a11y.sound}</h3>
            <fieldset className="ranges">
              <legend>{copy.a11y.volume}</legend>
              {vol('master', copy.a11y.master)}
              {vol('typewriter', copy.a11y.typewriter)}
              {vol('applause', copy.a11y.applause)}
              {vol('cues', copy.a11y.cues)}
            </fieldset>
            <Toggle
              label={copy.a11y.readAloud}
              hint={voice ? copy.a11y.readAloudHint : copy.a11y.noVoice}
              checked={voice && st.readAloud}
              disabled={!voice}
              onChange={(v) => st.set('readAloud', v)}
              testId="read-aloud"
            />
          </section>

          <section aria-labelledby="a11y-libras">
            <h3 id="a11y-libras">{copy.a11y.libras}</h3>
            <Toggle label={copy.a11y.vlibras} hint={st.vlibras ? copy.a11y.vlibrasHint : `${copy.a11y.vlibrasHint} ${copy.a11y.vlibrasOff}`} checked={st.vlibras} onChange={(v) => st.set('vlibras', v)} testId="vlibras" />
          </section>

          <section aria-labelledby="a11y-keys">
            <h3 id="a11y-keys">{copy.a11y.keys}</h3>
            <Toggle label={copy.a11y.shortcuts} hint={copy.a11y.shortcutsHint} checked={st.shortcuts} onChange={(v) => st.set('shortcuts', v)} testId="shortcuts" />
            {st.shortcuts && (
              <ul className="keymap" data-testid="keymap">
                {KEY_ACTIONS.map((a) => {
                  const label = actionLabel(a, st.keys)
                  return (
                    <li key={a}>
                      <span className="what">{copy.keys[a]}</span>
                      <kbd>{label}</kbd>
                      <button
                        type="button"
                        className={`change${capturing === a ? ' on' : ''}`}
                        onClick={() => setCapturing(capturing === a ? null : a)}
                        aria-label={capturing === a ? copy.a11y.waiting : copy.a11y.changeLabel(copy.keys[a], label)}
                        aria-pressed={capturing === a}
                        data-testid={`remap-${a}`}
                      >
                        {capturing === a ? copy.a11y.waiting : copy.a11y.change}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {st.shortcuts && Object.keys(st.keys).length > 0 && (
              <button type="button" className="btn soft" onClick={() => st.resetKeys()}>
                {copy.a11y.resetKeys}
              </button>
            )}
          </section>

          <footer>
            <button type="button" className="btn secondary" onClick={() => st.reset()} data-testid="settings-reset">
              {copy.a11y.reset}
            </button>
            {!onStatementPage && (
              <button type="button" className="textlink" onClick={() => setStatement(true)} data-testid="open-statement">
                {copy.a11y.statement}
              </button>
            )}
          </footer>
        </div>
      </Dialog>
      {statement && <StatementDialog onClose={() => setStatement(false)} />}
    </>
  )
}

/** Um grupo de opções exclusivas: rádios nativos dentro de um fieldset, desenhados como segmentos. */
function Choice<T extends string | number>({ legend, hint, value, options, onChange, testId }: { legend: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void; testId?: string }) {
  const name = useId()
  const hintId = `${name}-hint`
  return (
    <fieldset className="choice" aria-describedby={hint ? hintId : undefined} data-testid={testId}>
      <legend>{legend}</legend>
      <div className="opts">
        {options.map(([v, label]) => (
          <label key={String(v)} className={v === value ? 'on' : ''}>
            <input type="radio" name={name} checked={v === value} onChange={() => onChange(v)} />
            {label}
          </label>
        ))}
      </div>
      {hint && (
        <p className="sub" id={hintId}>
          {hint}
        </p>
      )}
    </fieldset>
  )
}

function Toggle({ label, hint, checked, onChange, disabled, testId }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; testId?: string }) {
  const id = useId()
  return (
    <div className={`toggle${disabled ? ' disabled' : ''}`}>
      <label htmlFor={id}>
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} data-testid={testId} />
        <span className="sw" aria-hidden="true" />
        <span className="t">{label}</span>
      </label>
      {hint && (
        <p className="sub" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId()
  const pct = Math.round(value * 100)
  return (
    <div className="range">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={0} max={100} step={10} value={pct} aria-valuetext={`${pct}%`} onChange={(e) => onChange(Number(e.target.value) / 100)} />
      <output htmlFor={id}>{pct}%</output>
    </div>
  )
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  )
}
