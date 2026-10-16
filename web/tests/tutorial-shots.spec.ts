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
  page.setDefaultTimeout(30_000)
  mkdirSync(OUT, { recursive: true })
  // modo manual (nada anda sozinho entre um passo e outro do roteiro), câmera que acompanha quem fala, movimento
  // reduzido (a câmera chega na hora e o texto aparece inteiro) e tréplica sem limite de tempo
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sim.a11y.v1', JSON.stringify({ reduceMotion: true, autoLook: true, noTimeLimits: true }))
      localStorage.setItem('sim.autoplay', '0')
      localStorage.setItem('sim.tutorial.v1', 'dismissed')
    } catch {
      /* sem armazenamento */
    }
  })
  const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

  // temas: o acervo como abre, com assuntos de todo tipo
  await page.goto('/audiencias')
  await expect(page.locator('.sim-catalog .row').first()).toBeVisible({ timeout: 20_000 })
  await settle(page)
  await save(page, 'temas', { x: 40, y: 188, width: 704, height: 440 })

  // acervo: descida com as setas até a 44, e Entrar na sala
  await page.locator('.sim-catalog [role="listbox"]').focus()
  for (let i = 0; i < 100 && !(await page.locator('[data-testid="hearing-44"][aria-selected="true"]').count()); i++) await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('detail')).toContainText('Margem Equatorial')
  await blur()
  await settle(page)
  await highlight(page, ['[data-testid="enter"]'])
  await save(page, 'acervo', { x: 48, y: 30, width: 1184, height: 740 })
  await clearHighlight(page)

  // ideia: o dossiê inteiro, com a pergunta da sessão no alto, e Defender esta ideia
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await page.getByTestId('tese-tab-t2').click()
  await blur()
  await settle(page)
  await highlight(page, ['[data-testid="choose-t2"]'])
  await save(page, 'ideia', { x: 0, y: 0, width: W, height: H })
  await clearHighlight(page)

  await page.getByTestId('choose-t2').click()
  await expect(page.getByTestId('prelude')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  await page.waitForFunction(() => document.body.dataset.simReady === '1', null, { timeout: 30_000 })

  // balão: a primeira fala, com a explicação de um termo do glossário aberta e ver o que foi dito
  await toFala(page)
  await blur()
  await settle(page, 900)
  await page.locator('.sim-balloon .gl').first().hover()
  await expect(page.locator('.sim-balloon .gl-tip')).toBeVisible()
  await settle(page, 300)
  const b1 = (await page.getByTestId('balloon').boundingBox())!
  await highlight(page, ['[data-testid="original-btn"]'])
  await save(page, 'balao', crop(800, b1.x + b1.width / 2, b1.y + b1.height / 2 - 20), true)
  await clearHighlight(page)
  await page.mouse.move(40, 760)

  // original: a mesma fala, na transcrição
  await page.getByTestId('original-btn').click()
  await expect(page.getByTestId('original')).toBeVisible()
  await blur()
  await settle(page, 600)
  const b2 = (await page.getByTestId('balloon').boundingBox())!
  await save(page, 'original', crop(800, b2.x + b2.width / 2, b2.y + b2.height / 2), true)
  await page.getByTestId('original-back').click()

  // ritmo: automático ou manual, e a velocidade
  await blur()
  await settle(page, 400)
  await highlight(page, ['.sim-rail .seg:has([data-testid="manual"])'], ['.sim-rail .speed'])
  await save(page, 'ritmo', { x: 448, y: 280, width: 832, height: 520 }, true)
  await clearHighlight(page)

  // legenda: as cores dos papéis, na ajuda
  await page.keyboard.press('h')
  await expect(page.getByTestId('sim-legend')).toBeVisible()
  await page.locator('#legend-roles').scrollIntoViewIfNeeded()
  await blur()
  await settle(page, 600)
  await highlight(page, ['section[aria-labelledby="legend-roles"]'])
  await save(page, 'legenda', { x: 448, y: 220, width: 832, height: 520 }, true)
  await clearHighlight(page)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('sim-legend')).toBeHidden()

  // anotar: o Ibama na primeira fala dele, e o botão Anotar no balão
  await noteUntil(page, 's05')
  await blur()
  await settle(page, 900)
  const b3 = (await page.getByTestId('balloon').boundingBox())!
  await highlight(page, ['[data-testid="note-btn"]'])
  await save(page, 'anotar', crop(800, b3.x + b3.width / 2, b3.y + b3.height / 2), true)
  await clearHighlight(page)
  await page.getByTestId('note-btn').click()

  // atenção: a câmera virada para longe de quem fala, o aviso e o medidor em baixa
  await toFala(page, 's06')
  await settle(page, 600)
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.simStore!.getState().turn(-1))
  await page.waitForFunction(() => window.simStore!.getState().run.attention < 22, null, { timeout: 30_000 })
  await settle(page, 400)
  await highlight(page, ['[data-testid="notice"]'], ['.sim-rail .meter:nth-child(2)'])
  await save(page, 'atencao', { x: 0, y: 340, width: 736, height: 460 }, true)
  await clearHighlight(page)
  await page.evaluate(() => window.simStore!.getState().requestLook())
  await page.waitForFunction(() => window.simStore!.getState().run.attention > 90, null, { timeout: 30_000 })

  // caderno: o que já foi anotado, com o fio do debate ao lado
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
  await blur()
  await settle(page, 900)
  await highlight(page, ['.sim-desk .cols > .col:first-child'])
  await save(page, 'caderno', { x: 96, y: 120, width: 1088, height: 680 }, true)
  await clearHighlight(page)
  await page.evaluate(() => window.simStore!.getState().requestDesk(false))
  await expect(page.getByTestId('desk')).toBeHidden({ timeout: 10_000 })

  // palavra: os três movimentos
  await noteUntil(page, 'floor')
  await expect(page.getByTestId('floor')).toBeVisible()
  await blur()
  await settle(page)
  await highlight(page, ['[data-testid="moves"]'])
  await save(page, 'palavra', crop(1184, 640, 430))
  await clearHighlight(page)

  // veredito: sustentar o que Suely Araújo, do Observatório do Clima, disse, coerente com a ideia
  await page.getByTestId('move-sustento').click()
  await page.locator('.sim-floor .hand [data-card="b011c1"]').click()
  await expect(page.getByTestId('preview')).toBeVisible()
  await page.getByTestId('speak').click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 60_000 })
  await page.evaluate(() => window.simStore!.getState().skipTyping())
  await blur()
  await settle(page, 1200)
  await expect(page.getByTestId('verdict')).toContainText('Coerente')
  const b4 = (await page.getByTestId('balloon').boundingBox())!
  await highlight(page, ['[data-testid="verdict"]'])
  await save(page, 'veredito', crop(840, b4.x + b4.width / 2, b4.y + b4.height / 2), true)
  await clearHighlight(page)

  // réplica e tréplica: a Petrobras rebate, e o caderno tem outra anotação de Suely Araújo para responder
  await page.evaluate(() => window.simStore!.getState().advance())
  await page.waitForFunction(() => window.simStore!.getState().run.current?.kind === 'reaction')
  await page.evaluate(() => window.simStore!.getState().skipTyping())
  await expect(page.getByTestId('treplica')).toBeVisible()
  // o ponteiro ficou onde estava o botão Falar, e em cima da etiqueta de relação ele abriria a explicação dela
  await page.mouse.move(W - 4, 4)
  await blur()
  await settle(page, 900)
  // o balão e o cartão que explica a relação, juntos no recorte
  await expect(page.locator('.sim-relcard')).toBeVisible()
  const b5 = (await page.getByTestId('balloon').boundingBox())!
  const rc = (await page.locator('.sim-relcard').boundingBox())!
  const u = { x: Math.min(b5.x, rc.x), y: Math.min(b5.y, rc.y), r: Math.max(b5.x + b5.width, rc.x + rc.width), b: Math.max(b5.y + b5.height, rc.y + rc.height) }
  const uw = Math.min(W, Math.round(Math.max(u.r - u.x + 48, (u.b - u.y + 48) * 1.6)))
  await highlight(page, ['.sim-balloon .rel-tag'])
  await save(page, 'reacao', crop(uw, (u.x + u.r) / 2, (u.y + u.b) / 2), true)
  await highlight(page, ['[data-testid="treplica"]'])
  await save(page, 'treplica', { x: 232, y: 145, width: 1048, height: 655 }, true)
  await clearHighlight(page)

  // frase: o segundo movimento da vez, contestar o Ministério de Minas e Energia citando o Ibama, que disse o contrário
  await page.evaluate(() => {
    const s = window.simStore!
    for (let guard = 0; guard < 20 && s.getState().run.phase !== 'floor'; guard++) s.getState().advance()
  })
  await expect(page.getByTestId('floor')).toBeVisible()
  await page.getByTestId('move-contesto').click()
  await page.locator('.sim-floor .hand [data-card="b007c1"]').click()
  await page.locator('.sim-floor .field .cands [data-card="b009c1"]').click()
  await page.getByTestId('preview').scrollIntoViewIfNeeded()
  await blur()
  await settle(page)
  await highlight(page, ['[data-testid="preview"]'], ['[data-testid="speak"]'])
  await save(page, 'frase', crop(1184, 640, 430))
  await clearHighlight(page)
  await page.getByTestId('speak').click()
  await expect(page.getByTestId('verdict')).toBeVisible({ timeout: 60_000 })

  // sala e aparte: de volta à sessão, a pergunta de um deputado com a sala inteira à vista, e o botão de aparte
  await toFala(page, 's09')
  await blur()
  await settle(page, 900)
  expect(await page.evaluate(() => window.simStore!.getState().run.hand.length)).toBeGreaterThan(0)
  await save(page, 'sala', { x: 0, y: 0, width: W, height: H }, true)
  await highlight(page, ['[data-testid="interject"]'], ['.sim-rail .meter:nth-child(3)'])
  await save(page, 'aparte', { x: 0, y: 145, width: 1048, height: 655 }, true)
  await clearHighlight(page)

  // ata
  await page.evaluate(() => {
    const s = window.simStore!
    for (let guard = 0; guard < 3000 && s.getState().run.phase !== 'ata'; guard++) {
      if (s.getState().run.phase === 'floor') s.getState().yieldFloor()
      else s.getState().advance()
    }
  })
  await expect(page.getByTestId('ata')).toBeVisible()
  await settle(page, 1200)
  await save(page, 'ata', crop(1120, 640, 390))

  // lados: outra partida, agora com o modo guiado, em que o balão diz de que lado da ideia está cada fala. O
  // Ministério de Minas e Energia fala a favor do poço, e por isso do lado contrário ao da ideia escolhida
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
  await page.getByTestId('tese-tab-t2').click()
  await page.getByTestId('guided').check({ force: true })
  await page.getByTestId('choose-t2').click()
  await expect(page.getByTestId('prelude')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('prelude')).toBeHidden({ timeout: 30_000 })
  await page.waitForFunction(() => document.body.dataset.simReady === '1', null, { timeout: 30_000 })
  await page.evaluate(() => {
    const s = window.simStore!
    for (let guard = 0; guard < 400; guard++) {
      const cur = s.getState().run.current
      if (cur?.kind === 'fala' && cur.page?.card === 'b007c1') return
      s.getState().advance()
    }
    throw new Error('fala do MME não encontrada')
  })
  await page.evaluate(() => window.simStore!.getState().skipTyping())
  await blur()
  await settle(page, 900)
  await expect(page.locator('.sim-balloon .plate .side')).toBeVisible()
  const b6 = (await page.getByTestId('balloon').boundingBox())!
  await highlight(page, ['.sim-balloon .plate .side'])
  await save(page, 'lados', crop(800, b6.x + b6.width / 2, b6.y + b6.height / 2), true)
  await clearHighlight(page)
})
