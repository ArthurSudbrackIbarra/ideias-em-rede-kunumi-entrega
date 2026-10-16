import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * O tutorial "Como jogar": o convite da primeira visita aparece uma vez e a resposta fica lembrada, o diálogo anda
 * para a frente e para trás, fecha com Esc e devolve o foco, abre pelo menu e, na sala, segura a sessão sem deixar
 * nenhum atalho disparar. Este arquivo começa com o armazenamento vazio: os outros testes já recebem o convite
 * respondido pela configuração do Playwright.
 */

const SEED = '20260912'
const KEY = 'sim.tutorial.v1'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test.use({ storageState: { cookies: [], origins: [] } })

async function axe(page: Page, state: string) {
  await page.waitForTimeout(300)
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const report = r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ')}`)
  expect(report, `axe em "${state}"`).toEqual([])
}

const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY)
const activeTestId = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? '')
const progress = (page: Page) => page.getByTestId('tutorial-progress')

async function answered(page: Page, value: string) {
  await page.addInitScript(([k, v]) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* sem armazenamento */
    }
  }, [KEY, value] as const)
}

test('convite: aparece uma vez na primeira visita, e "Agora não" fica lembrado', async ({ page }) => {
  await page.goto('/')
  const ask = page.getByTestId('tutorial-ask')
  await expect(ask).toBeVisible()
  await expect(ask).toContainText('Primeira vez por aqui?')
  expect(await activeTestId(page)).toBe('tutorial-yes')
  await axe(page, 'convite do tutorial')

  await page.getByTestId('tutorial-no').click()
  await expect(ask).toBeHidden()
  expect(await stored(page)).toBe('dismissed')

  await page.reload()
  await expect(page.getByTestId('home')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(ask).toHaveCount(0)
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await page.waitForTimeout(500)
  await expect(ask).toHaveCount(0)
})

test('convite na sala: quem chega direto à audiência é perguntado antes de a sessão começar', async ({ page }) => {
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await expect(page.getByTestId('tutorial-ask')).toBeVisible()
  expect(await page.evaluate(() => window.simStore!.getState().run.phase)).toBe('tese')

  // com o convite aberto, as setas não trocam a ideia do dossiê por trás dele
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('tese-t1')).toBeVisible()

  // Enter ativa o botão em foco, Ver o tutorial
  await page.keyboard.press('Enter')
  const tut = page.getByTestId('tutorial')
  await expect(tut).toBeVisible()
  await expect(page.getByTestId('tutorial-ask')).toHaveCount(0)
  expect(await stored(page)).toBe('seen')
  await expect(progress(page)).toHaveText('1 de 12')
  await expect(page.getByTestId('tutorial-prev')).toBeDisabled()
  expect(await activeTestId(page)).toBe('tutorial-next')

  // para a frente e para trás, com as setas e com os botões
  await page.keyboard.press('ArrowRight')
  await expect(progress(page)).toHaveText('2 de 12')
  await page.getByTestId('tutorial-next').click()
  await expect(progress(page)).toHaveText('3 de 12')
  await page.keyboard.press('ArrowLeft')
  await expect(progress(page)).toHaveText('2 de 12')
  await page.getByTestId('tutorial-prev').click()
  await expect(progress(page)).toHaveText('1 de 12')
  // o foco não fica preso num Voltar desligado
  expect(await activeTestId(page)).toBe('tutorial-next')

  // a imagem carrega, tem texto alternativo, e a troca de passo é anunciada
  const img = page.getByTestId('tutorial-image')
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1280)
  expect((await img.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(40)
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('announce-polite')).toContainText('2 de 12. Escolha a audiência.')

  await page.keyboard.press('Escape')
  await expect(tut).toBeHidden()
  await expect(page.getByTestId('tutorial-ask')).toHaveCount(0)
  expect(await page.evaluate(() => window.simStore!.getState().run.phase)).toBe('tese')
})

test('menu: Como jogar abre o tutorial, o foco volta ao botão, e Começar leva ao acervo', async ({ page }) => {
  await answered(page, 'dismissed')
  await page.goto('/')
  await expect(page.getByTestId('home')).toBeVisible()
  await expect(page.getByTestId('tutorial-ask')).toHaveCount(0)

  const open = page.getByTestId('open-tutorial')
  await open.focus()
  await page.keyboard.press('Enter')
  const tut = page.getByTestId('tutorial')
  await expect(tut).toBeVisible()
  await expect(progress(page)).toHaveText('1 de 12')
  await axe(page, 'tutorial, primeiro passo')

  // o Tab fica dentro do diálogo
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="tutorial"]'))).toBe(true)
  }

  await page.keyboard.press('Escape')
  await expect(tut).toBeHidden()
  expect(await activeTestId(page)).toBe('open-tutorial')

  // reabre de onde parou, e anda até o fim
  await page.keyboard.press('Enter')
  await expect(tut).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await expect(progress(page)).toHaveText('2 de 12')

  // nada de caixa alta, ponto e vírgula, separador ou seta nos textos dos passos
  for (let i = 2; i <= 12; i++) {
    await expect(progress(page)).toHaveText(`${i} de 12`)
    const text = await page.locator('.tut-body').innerText()
    expect(text, `passo ${i}`).not.toMatch(/[;·—–→←↑↓]/)
    expect(text, `passo ${i}`).not.toMatch(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{4,}\b/)
    if (i < 12) await page.keyboard.press('ArrowRight')
  }

  // o último passo mostra a tabela de teclas, com as teclas do mapa atual, e o botão Começar
  await expect(page.getByTestId('tutorial-keys')).toBeVisible()
  await expect(page.getByTestId('tutorial-keys')).toContainText('abrir e fechar o caderno')
  await expect(page.getByTestId('tutorial-next')).toContainText('Começar')
  await axe(page, 'tutorial, tabela de teclas')
  // a seta para a direita não passa do último passo
  await page.keyboard.press('ArrowRight')
  await expect(progress(page)).toHaveText('12 de 12')

  await page.getByTestId('tutorial-next').click()
  await expect(page).toHaveURL(/\/audiencias/)
  expect(await stored(page)).toBe('completed')
})

test('na sala: o tutorial segura a sessão, nenhum atalho dispara, e a sessão volta ao fechar', async ({ page }) => {
  test.setTimeout(180_000)
  await answered(page, 'completed')
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sim.a11y.v1', JSON.stringify({ reduceMotion: true, autoLook: true }))
      localStorage.setItem('sim.autoplay', '1')
      localStorage.setItem('sim.speed', '6')
    } catch {
      /* sem armazenamento */
    }
  })
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await expect(page.getByTestId('tutorial-ask')).toHaveCount(0)
  await page.getByTestId('tese-tab-t2').click()
  await page.getByTestId('choose-t2').click()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  await page.waitForFunction(() => document.body.dataset.simReady === '1', null, { timeout: 30_000 })
  await page.waitForFunction(() => window.simStore!.getState().run.current?.kind === 'fala', null, { timeout: 60_000 })

  // pela ajuda da sala
  await page.keyboard.press('h')
  await expect(page.getByTestId('sim-legend')).toBeVisible()
  await page.getByTestId('legend-tutorial').click()
  await expect(page.getByTestId('tutorial')).toBeVisible()
  await expect(page.getByTestId('tutorial-next')).toContainText('Próximo')

  const before = await page.evaluate(() => window.simStore!.getState().run.current?.id)
  for (const k of ['p', 'm', 'g', 'c', 'n', '+']) await page.keyboard.press(k)
  await page.waitForTimeout(5000)
  const st = await page.evaluate(() => {
    const s = window.simStore!.getState()
    return { id: s.run.current?.id, autoplay: s.autoplay, muted: s.muted, panel: s.panel, desk: s.deskView, hand: s.run.hand.length, speed: s.speed }
  })
  expect(st).toEqual({ id: before, autoplay: true, muted: false, panel: 'help', desk: false, hand: 0, speed: 6 })

  // Esc fecha só o tutorial, e o foco volta para o botão da ajuda que o abriu
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tutorial')).toBeHidden()
  expect(await activeTestId(page)).toBe('legend-tutorial')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('sim-legend')).toBeHidden()

  // a sessão segue
  await page.waitForFunction((id) => window.simStore!.getState().run.current?.id !== id, before, { timeout: 60_000 })

  // o topo da sala também abre o tutorial, com o botão final dizendo que volta à sessão
  await page.getByTestId('open-tutorial').click()
  await expect(page.getByTestId('tutorial')).toBeVisible()
  for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('tutorial-next')).toContainText('Voltar à sessão')
  await page.getByTestId('tutorial-next').click()
  await expect(page.getByTestId('tutorial')).toBeHidden()
  await expect(page).toHaveURL(/\/sim\/44/)
})
