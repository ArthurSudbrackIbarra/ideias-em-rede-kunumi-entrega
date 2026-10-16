import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * As imagens do tutorial, tiradas do jogo de verdade (`npm run tutorial:screenshots`). Audiência 44, semente fixa,
 * janela de 1280x800 com densidade 2. Cada imagem é um recorte 16:10 da tela, gravado em WebP com 1280x800 em
 * public/tutorial/. O destaque de um controle usa o anel âmbar do foco do jogo e escurece o resto, e só existe durante
 * a captura. O WebP sai do próprio Chromium (canvas), sem dependência nova. A codificação roda na página do jogo: uma
 * segunda aba deixaria a sala em segundo plano, e com ela a cena e o relógio da sessão param.
 */

const OUT = 'public/tutorial'
const SEED = '20260912'
const W = 1280
const H = 800

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Um recorte 16:10 de largura `w`, centrado no ponto pedido e preso dentro da janela. */
function crop(w: number, cx: number, cy: number): Rect {
  const h = Math.round((w * 10) / 16)
  const x = Math.min(W - w, Math.max(0, Math.round(cx - w / 2)))
  const y = Math.min(H - h, Math.max(0, Math.round(cy - h / 2)))
  return { x, y, width: w, height: h }
}

/**
 * Destaca grupos de elementos: cada grupo (a união das caixas dos seletores) ganha o anel âmbar do foco do jogo, e o
 * resto da tela escurece. O véu é um SVG com um furo por grupo.
 */
async function highlight(page: Page, ...groups: string[][]) {
  await page.evaluate(
    ({ groups, pad }) => {
      document.querySelectorAll('[data-tut-hl]').forEach((e) => e.remove())
      const boxes = groups.map((selectors) => {
        const rects = selectors.flatMap((s) =>
          Array.from(document.querySelectorAll(s))
            .filter((el) => el.getClientRects().length > 0)
            .map((el) => el.getBoundingClientRect()),
        )
        if (!rects.length) throw new Error(`nada para destacar: ${selectors.join(', ')}`)
        const x = Math.min(...rects.map((r) => r.left)) - pad
        const y = Math.min(...rects.map((r) => r.top)) - pad
        return { x, y, w: Math.max(...rects.map((r) => r.right)) + pad - x, h: Math.max(...rects.map((r) => r.bottom)) + pad - y }
      })
      const r = 10
      const hole = (b: { x: number; y: number; w: number; h: number }) =>
        `M${b.x + r} ${b.y}H${b.x + b.w - r}A${r} ${r} 0 0 1 ${b.x + b.w} ${b.y + r}V${b.y + b.h - r}A${r} ${r} 0 0 1 ${b.x + b.w - r} ${b.y + b.h}` +
        `H${b.x + r}A${r} ${r} 0 0 1 ${b.x} ${b.y + b.h - r}V${b.y + r}A${r} ${r} 0 0 1 ${b.x + r} ${b.y}Z`
      const W = window.innerWidth
      const H = window.innerHeight
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.dataset.tutHl = ''
      svg.setAttribute('width', String(W))
      svg.setAttribute('height', String(H))
      Object.assign(svg.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '2147483647' })
      svg.innerHTML =
        `<path fill="rgba(12, 10, 8, 0.5)" fill-rule="evenodd" d="M0 0H${W}V${H}H0Z${boxes.map(hole).join('')}"/>` +
        boxes.map((b) => `<rect x="${b.x - 1.5}" y="${b.y - 1.5}" width="${b.w + 3}" height="${b.h + 3}" rx="${r + 1.5}" fill="none" stroke="#f2c14e" stroke-width="3"/>`).join('')
      document.body.appendChild(svg)
    },
    { groups, pad: 6 },
  )
}

const clearHighlight = (page: Page) => page.evaluate(() => document.querySelectorAll('[data-tut-hl]').forEach((e) => e.remove()))

/** Espera as fontes, dois quadros da cena e o fim de qualquer transição. */
async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}

/**
 * Tira o recorte em densidade 2, reduz para 1280x800 num canvas e grava o WebP. Com `scene`, confere que a cena 3D
 * desenhou de fato: a faixa do meio da imagem precisa ter variedade de cor (sem WebGL, ela sai lisa).
 */
async function save(page: Page, name: string, clip: Rect, scene = false) {
  const png = await page.screenshot({ clip, scale: 'device', animations: 'disabled', caret: 'hide' })
  const out = await page.evaluate(
    async ({ b64, w, h, scene }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')!
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, w, h)
      const band = g.getImageData(0, Math.round(h * 0.35), w, Math.round(h * 0.25)).data
      const colors = new Set<number>()
      for (let i = 0; i < band.length; i += 4 * 97) colors.add((band[i] << 16) | (band[i + 1] << 8) | band[i + 2])
      const url = c.toDataURL('image/webp', 0.8)
      return { type: url.slice(5, url.indexOf(';')), b64: url.slice(url.indexOf(',') + 1), colors: colors.size, scene }
    },
    { b64: png.toString('base64'), w: W, h: H, scene },
  )
  expect(out.type, `${name}: o navegador não codificou WebP`).toBe('image/webp')
  if (scene) expect(out.colors, `${name}: a cena 3D parece vazia`).toBeGreaterThan(60)
  const file = Buffer.from(out.b64, 'base64')
  writeFileSync(`${OUT}/${name}.webp`, file)
  console.log(`${name}.webp  ${Math.round(file.length / 1024)} KB  recorte ${clip.width}x${clip.height} em ${clip.x},${clip.y}`)
}

/** Avança pelo motor até a próxima fala de quem se pede (ou de qualquer um), devolvendo a palavra se ela vier. */
async function toFala(page: Page, speaker?: string) {
  await page.evaluate((who) => {
    const s = window.simStore!
    for (let guard = 0; guard < 400; guard++) {
      const st = s.getState()
      const cur = st.run.current
      if (st.run.phase === 'floor') st.yieldFloor()
      else if (cur?.kind === 'fala' && (!who || cur.speaker === who) && guard > 0) return
      else st.advance()
    }
    throw new Error(`fala não encontrada: ${who}`)
  }, speaker)
  await page.evaluate(() => window.simStore!.getState().skipTyping())
  await page.waitForFunction(() => window.simStore!.getState().typingDone)
}

/**
 * Avança anotando as afirmações dos temas em que a tese toma lado, como faria alguém atento à própria ideia. Para na
 * primeira fala de `speaker`, ou na vez de falar.
 */
async function noteUntil(page: Page, speaker: string | 'floor') {
  await page.evaluate((stop) => {
    const s = window.simStore!
    for (let guard = 0; guard < 2000; guard++) {
      const st = s.getState()
      const cur = st.run.current
      if (stop === 'floor' ? st.run.phase === 'floor' : guard > 0 && cur?.kind === 'fala' && cur.speaker === stop) return
      const c = cur?.page?.card
      const h = st.hearing!
      const tese = h.teses.find((t) => t.id === st.run.tese)!
      if (c && st.run.notable.includes(c) && !st.run.noted.includes(c)) {
        const card = h.deck.find((x) => x.id === c)!
        if (card.kind === 'claim' && tese.positions[card.theme] !== undefined) st.note(c)
      }
      st.advance()
    }
    throw new Error(`não chegou a ${stop}`)
  }, speaker)
  await page.evaluate(() => window.simStore!.getState().skipTyping())
}

test('imagens do tutorial', async ({ page }) => {
  test.setTimeout(600_000)
  mkdirSync(OUT, { recursive: true })
  // modo manual (nada anda sozinho entre um passo e outro do roteiro), câmera que acompanha quem fala e movimento
  // reduzido: a câmera chega na hora e o texto aparece inteiro
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sim.a11y.v1', JSON.stringify({ reduceMotion: true, autoLook: true }))
      localStorage.setItem('sim.autoplay', '0')
      localStorage.setItem('sim.tutorial.v1', 'dismissed')
    } catch {
      /* sem armazenamento */
    }
  })

  // 2. o acervo: a lista das prontas para jogar, descida com as setas até a 44, e Entrar na sala
  await page.goto('/audiencias')
  await expect(page.locator('.sim-catalog .row').first()).toBeVisible({ timeout: 20_000 })
  await page.locator('.sim-catalog [role="listbox"]').focus()
  for (let i = 0; i < 100 && !(await page.locator('[data-testid="hearing-44"][aria-selected="true"]').count()); i++) await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('detail')).toContainText('Margem Equatorial')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await settle(page)
  await highlight(page, ['[data-testid="enter"]'])
  await save(page, '02-acervo', { x: 48, y: 30, width: 1184, height: 740 })
  await clearHighlight(page)

  // 3. o dossiê: a ideia que a partida vai defender, e Defender esta ideia
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await page.getByTestId('tese-tab-t2').click()
  await settle(page)
  await highlight(page, ['[data-testid="choose-t2"]'])
  await save(page, '03-ideia', { x: 112, y: 140, width: 1056, height: 660 })
  await clearHighlight(page)

  await page.getByTestId('choose-t2').click()
  await expect(page.getByTestId('prelude')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  await page.waitForFunction(() => document.body.dataset.simReady === '1', null, { timeout: 30_000 })

  // 4. o balão: a primeira fala, e ver o que foi dito (o botão Anotar aparece ao lado)
  await toFala(page)
  await settle(page, 900)
  const b4 = (await page.getByTestId('balloon').boundingBox())!
  await highlight(page, ['[data-testid="original-btn"]'])
  await save(page, '04-balao', crop(720, b4.x + b4.width / 2, b4.y + b4.height / 2 + 10), true)
  await clearHighlight(page)

  // o que o Ministério de Minas e Energia disse vai para o caderno (é o que a vez de falar contesta), e a fala do
  // Ibama, que ela cita, também
  await noteUntil(page, 's05')
  await page.getByTestId('note-btn').click()

  // 6. a atenção: a câmera virada para longe de quem fala, o aviso e o medidor em baixa
  await toFala(page, 's06')
  await settle(page, 600)
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.simStore!.getState().turn(-1))
  await page.waitForFunction(() => window.simStore!.getState().run.attention < 22, null, { timeout: 30_000 })
  await settle(page, 400)
  await highlight(page, ['[data-testid="notice"]'], ['.sim-rail .meter:nth-child(2)'])
  await save(page, '06-olhar', { x: 0, y: 340, width: 736, height: 460 }, true)
  await clearHighlight(page)
  await page.evaluate(() => window.simStore!.getState().requestLook())
  await page.waitForFunction(() => window.simStore!.getState().run.attention > 90, null, { timeout: 30_000 })

  // 5. o caderno: o que já foi anotado, com o fio do debate ao lado
  await page.evaluate(() => {
    const s = window.simStore!
    for (let guard = 0; guard < 60 && s.getState().run.current?.speaker === 's06'; guard++) {
      const st = s.getState()
      const c = st.run.current?.page?.card
      if (c && st.run.notable.includes(c) && !st.run.noted.includes(c)) st.note(c)
      st.advance()
    }
  })
  await page.evaluate(() => window.simStore!.getState().requestDesk(true))
  await expect(page.getByTestId('desk')).toBeVisible({ timeout: 10_000 })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await settle(page, 900)
  await highlight(page, ['.sim-desk .cols > .col:first-child'])
  await save(page, '05-anotar', { x: 96, y: 120, width: 1088, height: 680 }, true)
  await clearHighlight(page)
  await page.evaluate(() => window.simStore!.getState().requestDesk(false))
  await expect(page.getByTestId('desk')).toBeHidden({ timeout: 10_000 })

  // 7. a palavra é sua: os três movimentos
  await noteUntil(page, 'floor')
  await expect(page.getByTestId('floor')).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await settle(page)
  await highlight(page, ['[data-testid="moves"]'])
  await save(page, '07-palavra', crop(1184, 640, 430))
  await clearHighlight(page)

  // 8. a frase: contestar o MME citando o Ibama, com a prévia e Falar
  await page.getByTestId('move-contesto').click()
  await page.locator('.sim-floor .hand [data-testid="card"]').first().click()
  await page.locator('.sim-floor .field .cands [data-testid="card"]').nth(1).click()
  await page.getByTestId('preview').scrollIntoViewIfNeeded()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await settle(page)
  await highlight(page, ['[data-testid="preview"]'], ['[data-testid="speak"]'])
  await save(page, '08-frase', crop(1184, 640, 430))
  await clearHighlight(page)

  // 9. o veredito, logo depois de falar
  await page.getByTestId('speak').click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 60_000 })
  await page.evaluate(() => window.simStore!.getState().skipTyping())
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await settle(page, 1200)
  const b9 = (await page.getByTestId('balloon').boundingBox())!
  await highlight(page, ['[data-testid="verdict"]'])
  await save(page, '09-veredito', crop(840, b9.x + b9.width / 2, b9.y + b9.height / 2), true)
  await clearHighlight(page)

  // 1 e 10. de volta à sessão: a pergunta de um deputado, com a sala inteira à vista, e o botão de aparte
  await toFala(page, 's09')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await settle(page, 900)
  expect(await page.evaluate(() => window.simStore!.getState().run.hand.length)).toBeGreaterThan(0)
  await save(page, '01-sala', { x: 0, y: 0, width: W, height: H }, true)
  await highlight(page, ['[data-testid="interject"]'])
  await save(page, '10-aparte', { x: 232, y: 145, width: 1048, height: 655 }, true)
  await clearHighlight(page)

  // 11. a ata
  await page.evaluate(() => {
    const s = window.simStore!
    for (let guard = 0; guard < 3000 && s.getState().run.phase !== 'ata'; guard++) {
      if (s.getState().run.phase === 'floor') s.getState().yieldFloor()
      else s.getState().advance()
    }
  })
  await expect(page.getByTestId('ata')).toBeVisible()
  await settle(page, 1200)
  await save(page, '11-ata', crop(1120, 640, 390))
})
