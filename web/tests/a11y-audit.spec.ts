import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * Auditoria de acessibilidade sob demanda (`npm run a11y:audit`): passa o axe em cada tela e estado da partida e
 * grava o relatório em tests/a11y-report/. Não falha por violação: é o retrato que alimenta docs/acessibilidade.md.
 * O projeto do Playwright que roda este arquivo fica fora de `npm run test:e2e`.
 */

const OUT = process.env.A11Y_OUT ?? 'tests/a11y-report'
const SEED = '20260912'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

interface Scan {
  state: string
  violations: { id: string; impact: string | null; help: string; nodes: number; targets: string[] }[]
  incomplete: { id: string; help: string; nodes: number }[]
}

const scans: Scan[] = []
const tabs: Record<string, string[]> = {}

async function scan(page: Page, state: string) {
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  scans.push({
    state,
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 6).map((n) => n.target.join(' ')) })),
    incomplete: r.incomplete.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length })),
  })
}

/** Aperta Tab algumas vezes e anota onde o foco foi parar, e se dá para ver o foco. */
async function tabTrace(page: Page, state: string, n = 14) {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(80)
    out.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return '(body)'
        const cs = getComputedStyle(el)
        const ring = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' ? `outline ${cs.outlineWidth} ${cs.outlineColor}` : cs.boxShadow !== 'none' ? `shadow ${cs.boxShadow}` : 'SEM ANEL'
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50)
        const id = el.dataset.testid ? `#${el.dataset.testid}` : ''
        return `${el.tagName.toLowerCase()}${id} "${label}" [${ring}]`
      }),
    )
  }
  tabs[state] = out
}

const store = (page: Page) => page.evaluate(() => window.simStore!.getState().run.phase)

/** Avança a partida pelo motor até a fase pedida, anotando o que toma lado nos temas da tese. */
async function fastForward(page: Page, until: 'floor' | 'ata') {
  await page.evaluate((stop) => {
    const s = window.simStore!
    for (let guard = 0; guard < 2000; guard++) {
      const st = s.getState()
      if (st.run.phase === stop) return
      if (stop === 'ata' && st.run.phase === 'floor') {
        st.yieldFloor()
        continue
      }
      const c = st.run.current?.page?.card
      const h = st.hearing!
      const tese = h.teses.find((t) => t.id === st.run.tese)!
      if (c && st.run.notable.includes(c) && !st.run.noted.includes(c)) {
        const card = h.deck.find((x) => x.id === c)!
        if (card.kind === 'claim' && tese.positions[card.theme] !== undefined) st.note(c)
      }
      st.advance()
    }
  }, until)
}

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/axe.json`, JSON.stringify(scans, null, 2))
  writeFileSync(`${OUT}/tab.json`, JSON.stringify(tabs, null, 2))
  const lines = scans.map((s) => `${s.state}: ${s.violations.map((v) => `${v.id}(${v.impact},${v.nodes})`).join(' ') || 'sem violações'}`)
  writeFileSync(`${OUT}/resumo.txt`, `${lines.join('\n')}\n`)
})

test('início e acervo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('home')).toBeVisible()
  await scan(page, 'início')
  await tabTrace(page, 'início', 6)
  await page.goto('/audiencias')
  await expect(page.locator('.sim-catalog .row').first()).toBeVisible({ timeout: 20_000 })
  await scan(page, 'acervo')
  // dez Tabs vão do link de pular até Entrar na sala; mais um volta ao link, que em foco cobre o "início"
  await tabTrace(page, 'acervo', 10)
  // a dica de texto cortado
  await page.locator('.sim-catalog .row .name').first().hover()
  await page.waitForTimeout(600)
  await scan(page, 'acervo, dica de texto cortado')
})

test('a partida da 44', async ({ page }) => {
  test.setTimeout(600_000)
  // a câmera acompanha quem fala, para a atenção não cair enquanto o axe varre cada estado
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sim.a11y.v1', JSON.stringify({ autoLook: true, reduceMotion: true }))
    } catch {
      /* sem armazenamento */
    }
  })
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await scan(page, 'dossiê das ideias')
  await tabTrace(page, 'dossiê das ideias', 16)

  await page.getByTestId('tese-tab-t2').click()
  await page.getByTestId('choose-t2').click()
  await expect(page.getByTestId('prelude')).toBeVisible()
  await page.waitForTimeout(800)
  await scan(page, 'prelúdio')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  await page.waitForFunction(() => document.body.dataset.simReady === '1', null, { timeout: 30_000 })

  // manual, para o estado não fugir durante a varredura
  await page.evaluate(() => window.simStore!.getState().autoplay && window.simStore!.getState().toggleAutoplay())
  await page.waitForFunction(() => window.simStore!.getState().run.current?.kind === 'fala', null, { timeout: 60_000 }).catch(() => undefined)
  for (let i = 0; i < 40 && (await page.evaluate(() => window.simStore!.getState().run.current?.kind)) !== 'fala'; i++) {
    await page.evaluate(() => window.simStore!.getState().advance())
  }
  await page.evaluate(() => window.simStore!.getState().skipTyping())
  await page.waitForFunction(() => window.simStore!.getState().typingDone)
  await scan(page, 'fala no balão')
  await tabTrace(page, 'fala no balão (Tab)', 6)

  await page.getByTestId('original-btn').click()
  await expect(page.getByTestId('original')).toBeVisible()
  await scan(page, 'texto original aberto')
  await page.getByTestId('original-back').click()

  await page.evaluate(() => window.simStore!.getState().requestDesk(true))
  await expect(page.getByTestId('desk')).toBeVisible({ timeout: 10_000 })
  await scan(page, 'caderno')
  await page.evaluate(() => window.simStore!.getState().requestDesk(false))
  await expect(page.getByTestId('desk')).toBeHidden({ timeout: 10_000 })

  await page.keyboard.press('g')
  await expect(page.getByTestId('glossary')).toBeVisible()
  await scan(page, 'glossário')
  await page.keyboard.press('g')
  await page.keyboard.press('h')
  await expect(page.getByTestId('sim-legend')).toBeVisible()
  await scan(page, 'legenda e ajuda')
  await page.keyboard.press('h')

  await fastForward(page, 'floor')
  expect(await store(page)).toBe('floor')
  await expect(page.getByTestId('floor')).toBeVisible()
  await scan(page, 'a vez de falar, passo 1')
  await page.getByTestId('move-sustento').click()
  const first = page.locator('.sim-floor .hand [data-testid="card"]').first()
  if (await first.count()) await first.click()
  await scan(page, 'a vez de falar, com a prévia')
  await page.getByTestId('speak').click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 60_000 })
  await scan(page, 'veredito')

  await fastForward(page, 'ata')
  await expect(page.getByTestId('ata')).toBeVisible()
  await scan(page, 'ata')
  await tabTrace(page, 'ata', 10)
})
