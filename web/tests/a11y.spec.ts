import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Acessibilidade que não pode regredir: o axe em cada estado da partida, uma partida inteira jogada só com o
 * teclado, os atalhos que se desligam e se trocam, o foco que volta para quem abriu um painel e o leitor de tela que
 * ouve cada fala uma vez, inteira. As exceções aceitas estão em EXCEPTIONS, cada uma com o motivo.
 */

const SEED = '20260912'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Exceções documentadas em docs/acessibilidade.md. Vazio: nenhuma violação é aceita. */
const EXCEPTIONS: string[] = []

async function axe(page: Page, state: string) {
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const bad = r.violations.filter((v) => !EXCEPTIONS.includes(v.id))
  const report = bad.map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(report, `axe em "${state}"`).toEqual([])
}

/** Ajustes guardados antes de a página abrir, como se a pessoa já os tivesse escolhido. */
async function withSettings(page: Page, settings: Record<string, unknown>, autoplay = false) {
  await page.addInitScript(
    ([st, auto]) => {
      try {
        localStorage.setItem('sim.a11y.v1', JSON.stringify(st))
        localStorage.setItem('sim.autoplay', auto ? '1' : '0')
      } catch {
        /* sem armazenamento */
      }
    },
    [settings, autoplay] as const,
  )
}

/** Avança pelo motor até a fase pedida, anotando o que toma lado nos temas da tese (para os estados do axe). */
async function fastForward(page: Page, until: 'floor' | 'ata') {
  await page.evaluate((stop) => {
    const s = window.simStore!
    for (let guard = 0; guard < 3000; guard++) {
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

const active = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return { tag: el?.tagName.toLowerCase() ?? '', id: el?.id ?? '', testid: el?.dataset.testid ?? '', role: el?.getAttribute('role') ?? '', text: (el?.textContent ?? '').trim().slice(0, 60) }
  })

async function tabUntil(page: Page, match: (a: Awaited<ReturnType<typeof active>>) => boolean, max = 40) {
  const seen: string[] = []
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const a = await active(page)
    if (match(a)) return
    seen.push(`${a.tag}#${a.testid || a.id}`)
  }
  throw new Error(`o Tab não chegou ao elemento esperado. Passou por: ${seen.join(', ')}`)
}

test('axe: início, acervo, declaração e o painel Acessibilidade', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('home')).toBeVisible()
  await axe(page, 'início')
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('settings')).toBeVisible()
  await axe(page, 'painel Acessibilidade')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings')).toBeHidden()
  await page.goto('/audiencias')
  await expect(page.locator('.sim-catalog .row').first()).toBeVisible({ timeout: 20_000 })
  await axe(page, 'acervo')
  await page.goto('/acessibilidade')
  await expect(page.getByTestId('statement')).toBeVisible()
  await axe(page, 'declaração de acessibilidade')
})

test('axe: cada estado da partida da 44', async ({ page }) => {
  test.setTimeout(300_000)
  await withSettings(page, { reduceMotion: true, autoLook: true })
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await axe(page, 'dossiê das ideias')
  await page.getByTestId('tese-tab-t2').click()
  await page.getByTestId('choose-t2').click()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  for (let i = 0; i < 40 && (await page.evaluate(() => window.simStore!.getState().run.current?.kind)) !== 'fala'; i++) {
    await page.evaluate(() => window.simStore!.getState().advance())
  }
  await expect(page.getByTestId('balloon')).toBeVisible()
  await axe(page, 'fala no balão')
  await page.getByTestId('original-btn').click()
  await expect(page.getByTestId('original')).toBeVisible()
  await axe(page, 'texto original')
  await page.getByTestId('original-back').click()
  for (const [key, testid] of [['c', 'desk'], ['g', 'glossary'], ['h', 'sim-legend'], ['r', 'history']] as const) {
    await page.keyboard.press(key)
    await expect(page.getByTestId(testid)).toBeVisible({ timeout: 10_000 })
    await axe(page, testid)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId(testid)).toBeHidden({ timeout: 10_000 })
  }
  await fastForward(page, 'floor')
  await expect(page.getByTestId('floor')).toBeVisible()
  await axe(page, 'a vez de falar')
  await page.getByTestId('move-sustento').click()
  await page.locator('.sim-floor .hand [data-testid="card"]').first().click()
  await expect(page.getByTestId('preview')).toBeVisible()
  await axe(page, 'a vez de falar, com a prévia')
  await page.getByTestId('speak').click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 30_000 })
  await axe(page, 'veredito')
  await fastForward(page, 'ata')
  await expect(page.getByTestId('ata')).toBeVisible()
  await axe(page, 'ata')
})

test('teclado: uma partida inteira, do início à ata, sem mouse', async ({ page }) => {
  test.setTimeout(300_000)
  await withSettings(page, { reduceMotion: true, autoLook: true, noTimeLimits: true })

  // início: o primeiro Tab é o atalho para o conteúdo, e Jogar vem logo depois
  await page.goto('/')
  await expect(page.getByTestId('home')).toBeVisible()
  await page.keyboard.press('Tab')
  expect((await active(page)).testid).toBe('skip-link')
  await expect(page.getByTestId('skip-link')).toBeVisible()
  await tabUntil(page, (a) => a.testid === 'play')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/audiencias/)
  // a troca de rota leva o foco para o conteúdo novo
  await expect.poll(async () => (await active(page)).id).toBe('conteudo')

  // acervo: busca pelo teclado, a lista é uma parada só, Enter entra na sala
  await tabUntil(page, (a) => a.testid === 'search')
  await page.keyboard.type('Margem Equatorial')
  await tabUntil(page, (a) => a.role === 'option')
  expect((await active(page)).testid).toBe('hearing-44')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/sim\/44/)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await expect.poll(async () => (await active(page)).id).toBe('conteudo')

  // dossiê: a seta troca a ideia, Enter fora de um controle escolhe a ideia em foco
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('tese-select')).toContainText('Ideia 2 de')
  await tabUntil(page, (a) => a.testid === 'choose-t2')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  // na sala, o foco começa no título dela
  await expect.poll(async () => (await active(page)).id).toBe('room-title')

  // a sessão inteira: N anota, Espaço avança; na vez de falar, 1 escolhe sustentar, Enter escolhe a carta e fala
  let spoke = 0
  for (let guard = 0; guard < 900; guard++) {
    const st = await page.evaluate(() => {
      const s = window.simStore!.getState()
      const c = s.run.current?.page?.card ?? null
      return { phase: s.run.phase, card: c, notable: !!c && s.run.notable.includes(c) && !s.run.noted.includes(c), hand: s.run.hand.length, claims: s.run.hand.filter((id) => s.hearing!.deck.find((x) => x.id === id)?.kind === 'claim').length }
    })
    if (st.phase === 'ata') break
    if (st.phase === 'floor') {
      await expect(page.getByTestId('floor')).toBeVisible()
      if (st.claims > 0) {
        await page.keyboard.press('1')
        await expect.poll(async () => (await active(page)).testid).toBe('card')
        await page.keyboard.press('Enter')
        await expect.poll(async () => (await active(page)).testid).toBe('speak')
        await page.keyboard.press('Enter')
        spoke++
      } else {
        await tabUntil(page, (a) => a.testid === 'yield')
        await page.keyboard.press('Enter')
        await expect.poll(async () => (await active(page)).testid).toBe('confirm-no')
        await page.keyboard.press('Shift+Tab')
        expect((await active(page)).testid).toBe('confirm-yes')
        await page.keyboard.press('Enter')
      }
      await expect(page.getByTestId('floor')).toBeHidden({ timeout: 10_000 }).catch(() => undefined)
      continue
    }
    if (st.notable && st.hand < 6) await page.keyboard.press('n')
    await page.keyboard.press(' ')
    await page.waitForTimeout(20)
  }
  await expect(page.getByTestId('ata')).toBeVisible({ timeout: 30_000 })
  expect(spoke).toBeGreaterThan(0)
  await expect.poll(async () => (await active(page)).id).toBe('ata-title')
  await expect(page.getByTestId('moves-list').locator('li')).not.toHaveCount(0)
})

test('teclado: os atalhos de uma tecla se desligam e se trocam', async ({ page }) => {
  test.setTimeout(180_000)
  await withSettings(page, { reduceMotion: true, shortcuts: false })
  await page.goto(`/sim/44?seed=${SEED}`)
  await page.getByTestId('choose-t1').click()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  // desligados: C não abre o caderno, e a bancada não mostra teclas
  await page.keyboard.press('c')
  await page.waitForTimeout(600)
  await expect(page.getByTestId('desk')).toBeHidden()
  await expect(page.getByTestId('desk-btn').locator('kbd')).toHaveCount(0)
  // ligados e trocados: K abre o caderno, C não
  await page.getByTestId('open-settings').click()
  await page.getByTestId('shortcuts').check()
  await page.getByTestId('remap-desk').click()
  await page.keyboard.press('k')
  await expect(page.getByTestId('remap-desk')).toHaveAccessibleName(/hoje K/)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('settings')).toBeHidden()
  await page.keyboard.press('c')
  await page.waitForTimeout(600)
  await expect(page.getByTestId('desk')).toBeHidden()
  await page.keyboard.press('k')
  await expect(page.getByTestId('desk')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('desk-close')).toContainText('K')
})

test('foco: os painéis recebem o foco, prendem o Tab e o devolvem a quem os abriu', async ({ page }) => {
  test.setTimeout(180_000)
  await withSettings(page, { reduceMotion: true })
  await page.goto(`/sim/44?seed=${SEED}`)
  await page.getByTestId('choose-t1').click()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  const btn = page.getByTestId('glossary-btn')
  await btn.focus()
  await page.keyboard.press('Enter')
  const glossary = page.getByTestId('glossary')
  await expect(glossary).toBeVisible()
  await expect(glossary).toBeFocused()
  await expect(glossary).toHaveAttribute('role', 'dialog')
  await expect(glossary).toHaveAttribute('aria-modal', 'true')
  // o Tab dá a volta dentro do painel
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="glossary"]'))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(glossary).toBeHidden()
  await expect(btn).toBeFocused()
})

test('leitor de tela: cada fala chega inteira, uma vez, sem a digitação letra por letra', async ({ page }) => {
  test.setTimeout(180_000)
  await withSettings(page, {})
  await page.goto(`/sim/44?seed=${SEED}`)
  await page.getByTestId('tese-tab-t2').click()
  await page.getByTestId('choose-t2').click()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  for (let i = 0; i < 40 && (await page.evaluate(() => window.simStore!.getState().run.current?.kind)) !== 'fala'; i++) {
    await page.evaluate(() => window.simStore!.getState().advance())
  }
  const text = await page.evaluate(() => window.simStore!.getState().run.current!.text)
  const polite = page.getByTestId('announce-polite')
  await expect(polite).toContainText(text)
  expect(((await polite.innerText()).match(new RegExp(text.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(1)
  // o balão em si não é região viva, e o texto que digita fica escondido do leitor de tela
  await expect(page.getByTestId('balloon')).not.toHaveAttribute('aria-live', /.+/)
  // a sala 3D tem uma descrição em texto
  await expect(page.locator('.sim-canvas')).toHaveAttribute('role', 'img')
  await expect(page.locator('.sim-canvas')).toHaveAttribute('aria-label', /Sala de comissão/)
})
