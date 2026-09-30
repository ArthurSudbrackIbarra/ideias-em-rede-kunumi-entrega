import { test, expect, type Page } from '@playwright/test'

const SHOTS = 'tests/screenshots'
const SEED = '20260912'

async function openSim(page: Page) {
  await page.goto(`/sim/44?seed=${SEED}`)
  await expect(page.getByTestId('tese-select')).toBeVisible()
}

/** id da linha atual, para saber quando o balão mudou */
const currentId = (page: Page) => page.evaluate(() => window.simStore!.getState().run.current?.id ?? null)

test('a porta de entrada tem uma ação só, a lista do acervo abre o dossiê da 44 e leva à escolha da tese', async ({ page }) => {
  // redesenho (2026-09-14): Início com Jogar, depois a tela de escolha da audiência (mestre e detalhe sobre as 206)
  await page.goto('/')
  await page.getByTestId('play').click()
  await expect(page).toHaveURL(/\/audiencias/)
  const catalog = page.getByTestId('catalog')
  await expect(catalog).toContainText('Escolha a audiência')
  await expect(catalog).toContainText('206 audiências')
  // a lista rola só na vertical: título e comissão são cortados com reticências, e o fio de cada linha
  // ocupa a largura inteira da coluna (2026-09-15)
  const widths = await page.evaluate(() => {
    const rows = document.querySelector('.sim-catalog .rows') as HTMLElement
    rows.scrollTop = 400
    const first = rows.firstElementChild as HTMLElement
    const name = first.querySelector('.name') as HTMLElement
    return {
      client: rows.clientWidth,
      scroll: rows.scrollWidth,
      row: Math.round(first.getBoundingClientRect().width),
      vertical: rows.scrollHeight > rows.clientHeight,
      ellipsis: getComputedStyle(name).textOverflow,
      nameDisplay: getComputedStyle(name).display,
    }
  })
  expect(widths.scroll).toBe(widths.client)
  expect(widths.row).toBe(widths.client)
  expect(widths.vertical).toBe(true)
  expect(widths.ellipsis).toBe('ellipsis')
  expect(widths.nameDisplay).toBe('block')
  // com quatro audiências preparadas (3, 5, 11 e 44), a 44 já não é a primeira selecionada: a busca a traz para a lista
  await page.getByTestId('search').fill('Margem Equatorial')
  const row = page.getByTestId('hearing-44')
  await expect(row).toBeVisible()
  await expect(row).toContainText('Margem Equatorial')
  await row.click()
  const detail = page.getByTestId('detail')
  await expect(detail).toContainText('Audiência 44')
  await expect(detail).toContainText('18 pessoas')
  // a busca recorta a lista no cliente
  await page.getByTestId('search').fill('petróleo')
  await expect(catalog).not.toContainText('Mostrando 24 de 206')
  await page.screenshot({ path: `${SHOTS}/sim-catalogo.png` })
  await page.getByTestId('enter').click()
  await expect(page).toHaveURL(/\/sim\/44/)
  await expect(page.getByTestId('tese-select')).toBeVisible()
})

test('audiência 44: tese, prelúdio, palavras simples, original, caderno, manual, a vez de falar, vereditos e ata', async ({ page }) => {
  // rodada 2 (2026-09-13): sem caixa alta, sem separador "·", sem ponto e vírgula nos textos do jogo; continuar só no balão
  // redesenho (2026-09-14): placa de tinta no balão, bancada de 116px, trilha de passos, veredito com antes e depois
  // rodada de 2026-09-15: tese em dossiê, uma fonte só, o medidor é a coerência
  test.setTimeout(720_000)
  await openSim(page)

  // 1. o dossiê mostra uma ideia por vez, e a tira diz quantas existem (3 a 6)
  const select = page.getByTestId('tese-select')
  await expect(select).toContainText('Margem Equatorial')
  await expect(select).toContainText(`semente ${SEED}`)
  expect(await select.innerText()).not.toContain('·')
  const strip = page.getByTestId('tese-strip')
  const nIdeas = await strip.locator('button').count()
  expect(nIdeas).toBeGreaterThanOrEqual(3)
  expect(nIdeas).toBeLessThanOrEqual(6)
  await expect(select).toContainText('Ideia 1 de')
  // a ideia e as listas de instituição não trazem nome de pessoa (§12.2): o nome só aparece na fala citada
  const names = await page.evaluate(() => window.simStore!.getState().hearing!.cast.filter((m) => m.name !== 'Presidente').map((m) => m.name))
  const idText = `${await strip.innerText()} ${await select.locator('.sheet h2').innerText()} ${await select.locator('.orgs').first().innerText()}`
  for (const name of names) expect(idText).not.toContain(name)
  // a fala citada vem com quem disse e a referência
  await expect(select.locator('.said .by')).toContainText(/b\d{3}\./)
  // 12. velocidade padrão numa sessão limpa: 0,5×
  expect(await page.evaluate(() => window.simStore!.getState().speed)).toBe(1)
  await page.screenshot({ path: `${SHOTS}/sim-044-teses.png`, fullPage: true })

  // 9. a tira leva à segunda ideia e Defender esta ideia abre o prelúdio preto, com o título digitado
  await strip.getByTestId('tese-tab-t2').click()
  await expect(select).toContainText('Ideia 2 de')
  await select.getByTestId('choose-t2').click()
  const prelude = page.getByTestId('prelude')
  await expect(prelude).toBeVisible()
  await expect(prelude).toContainText('Meio Ambiente', { timeout: 20_000 })
  await expect(prelude).toContainText('Margem Equatorial', { timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/sim-044-prelude.png` })
  await page.keyboard.press('Enter')
  await expect(prelude).toBeHidden({ timeout: 20_000 })
  await page.waitForFunction(() => document.body.dataset.simReady === '1', null, { timeout: 30_000 })
  expect(await page.evaluate(() => window.simStore!.getState().run.tese)).toBe('t2')

  // 2. o elenco tem o número certo de bonecos por papel
  const counts = await page.evaluate(() => {
    const h = window.simStore!.getState().hearing!
    const by: Record<string, number> = {}
    for (const m of h.cast) by[m.role] = (by[m.role] ?? 0) + 1
    return { by, audience: h.audience.estimate, remote: h.cast.filter((m) => m.remote).length }
  })
  expect(counts.by).toEqual({ mesa: 1, governo: 4, parlamentar: 7, sociedade_civil: 4, setor_privado: 2 })
  expect(counts.audience).toBe(40)
  expect(counts.remote).toBe(1)

  // a bancada: medidores à esquerda, controles com rótulo escrito à direita, e o topo com a tese
  const rail = page.getByTestId('rail')
  await expect(rail).toBeVisible()
  await expect(rail).toContainText('coerência')
  await expect(rail).toContainText('glossário')
  await expect(rail).toContainText('ajuda')
  await expect(page.getByTestId('progress')).toContainText('Você defende')

  // modo manual (10) para inspecionar o balão com calma
  await page.keyboard.press('p')
  expect(await page.evaluate(() => window.simStore!.getState().autoplay)).toBe(false)

  // 3. o balão digita a versão em palavras simples; o texto final é exatamente pages[i].plain
  const balloon = page.getByTestId('balloon')
  const toPlainPage = async () => {
    for (let guard = 0; guard < 80; guard++) {
      const ok = await page.evaluate(() => {
        const c = window.simStore!.getState().run.current
        return c?.kind === 'fala' && c.plain !== null
      })
      if (ok) return
      await page.keyboard.press('Escape') // completa a página
      await page.waitForFunction(() => window.simStore!.getState().typingDone, null, { timeout: 30_000 })
      await page.keyboard.press(' ') // continuar (modo manual)
      await page.waitForTimeout(150)
    }
    throw new Error('nenhuma página com plain apareceu')
  }
  await toPlainPage()
  await expect(balloon).toBeVisible()
  const expected = await page.evaluate(() => window.simStore!.getState().run.current!.text)
  await page.keyboard.press('Escape')
  await expect.poll(async () => ((await balloon.locator('.body .fala').first().textContent()) ?? '').trim()).toBe(expected)
  // 3b. toda página tem versão simples (v3): o balão não repete a etiqueta; a referência mora na placa
  expect(await balloon.innerText()).not.toContain('em palavras simples')
  expect(await balloon.innerText()).not.toContain(';')
  await expect(balloon.locator('.plate .ref')).toHaveCount(1)
  await expect(balloon.getByTestId('note-btn').locator('kbd')).toHaveText('N')
  // o botão de continuar mora no balão, nunca na bancada
  await expect(balloon.getByTestId('continue-balloon')).toBeVisible()
  await expect(page.getByTestId('actions').getByText('continuar')).toHaveCount(0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/sim-044-balao.png` })

  // 13. uma família só, Lexend, em tudo; 14. sem borda colorida no balão
  const fonts = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.sim-balloon .fala, .sim-balloon .plate .name, .sim-rail .ctl, .sim .ref, .sim-rail .meter .name')).map(
      (el) => getComputedStyle(el).fontFamily,
    ),
  )
  expect(fonts.length).toBeGreaterThan(0)
  for (const f of fonts) expect(f).toContain('Lexend')
  const style = await page.evaluate(() => {
    const b = document.querySelector('.sim-balloon')!
    const p = document.querySelector('.sim-balloon .plate')!
    const n = document.querySelector('.sim-balloon .plate .name')!
    return { border: getComputedStyle(b).borderLeftWidth, plateBg: getComputedStyle(p).backgroundImage, nameFont: getComputedStyle(n).fontFamily }
  })
  expect(style.border).toBe('0px')
  expect(style.plateBg).toContain('gradient')
  // uma fonte só (2026-09-15): o nome na placa também é Lexend
  expect(style.nameFont).toContain('Lexend')
  expect(style.nameFont).not.toContain('Newsreader')

  // 4. O mostra exatamente o original, com o ref; o relógio não anda enquanto aberto
  const original = await page.evaluate(() => window.simStore!.getState().run.current!.original!)
  await page.keyboard.press('o')
  const orig = page.getByTestId('original')
  await expect(orig).toBeVisible()
  const shownOrig = ((await orig.locator('.fala').textContent()) ?? '').trim()
  expect(original.text.startsWith(shownOrig)).toBe(true)
  await expect(balloon).toContainText(`texto original, ${original.ref}`)
  const clock1 = await page.evaluate(() => window.simStore!.getState().run.clock)
  await page.waitForTimeout(700)
  const clock2 = await page.evaluate(() => window.simStore!.getState().run.clock)
  expect(clock2).toBe(clock1)
  await page.screenshot({ path: `${SHOTS}/sim-044-original.png` })
  await page.keyboard.press('o')
  await expect(orig).toBeHidden()
  expect(await page.evaluate(() => window.simStore!.getState().run.originalsOpened.length)).toBe(1)

  // 5. anotar aumenta a mão em 1; Tab mostra o caderno com a tese no cabeçalho
  const before = await page.evaluate(() => window.simStore!.getState().run.hand.length)
  await balloon.getByTestId('note-btn').click({ force: true })
  await expect.poll(() => page.evaluate(() => window.simStore!.getState().run.hand.length)).toBe(before + 1)
  await expect(page.getByTestId('meters')).toContainText(`${before + 1}/7`)
  await page.keyboard.press('Tab')
  const desk = page.getByTestId('desk')
  await expect(desk).toBeVisible({ timeout: 10_000 })
  await expect(desk).toContainText('Você defende')
  await expect(desk).toContainText('Bloco 59')
  await expect(desk.getByTestId('card')).toHaveCount(before + 1)
  expect(await desk.locator('.paper').getAttribute('class')).toContain('sim-scroll')
  // com a câmera no caderno, a bancada troca "caderno" por "voltar à sala"
  await expect(page.getByTestId('desk-btn')).toContainText('voltar à sala')
  await page.screenshot({ path: `${SHOTS}/sim-044-caderno.png` })
  // 11. Esc fecha o caderno; com a legenda aberta, fecha a legenda
  await page.keyboard.press('Escape')
  await expect(desk).toBeHidden({ timeout: 10_000 })
  await page.keyboard.press('l')
  await expect(page.getByTestId('sim-legend')).toBeVisible()
  await expect(page.getByTestId('sim-legend')).toContainText('Legenda e ajuda')
  await page.screenshot({ path: `${SHOTS}/sim-044-legenda.png` })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('sim-legend')).toBeHidden()

  // 10. em modo manual a página não muda sozinha até Espaço
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.simStore!.getState().typingDone)
  const held = await currentId(page)
  await page.waitForTimeout(2500)
  expect(await currentId(page)).toBe(held)
  await page.keyboard.press(' ')
  await expect.poll(() => currentId(page)).not.toBe(held)

  // acelera, volta ao automático e anota, até a palavra ser concedida, só o que toma lado nos temas da tese
  // (o caderno tem 7 lugares; anotar tudo o encheria com cartas de temas em que a tese não se mete)
  await page.keyboard.press('p')
  for (let i = 0; i < 6; i++) await page.keyboard.press('+')
  await page.evaluate(() => {
    const store = window.simStore!
    const h = store.getState().hearing!
    const tese = h.teses.find((t) => t.id === store.getState().run.tese)!
    const cards = new Map(h.deck.map((c) => [c.id, c]))
    store.subscribe((s) => {
      const c = s.run.current?.page?.card
      if (!c || !s.run.notable.includes(c) || s.run.noted.includes(c)) return
      const card = cards.get(c)!
      if (card.kind === 'claim' && tese.positions[card.theme] !== undefined) store.getState().note(c)
    })
  })
  const floor = page.getByTestId('floor')
  await expect(floor).toBeVisible({ timeout: 300_000 })
  await expect(floor).toContainText('A palavra é sua')
  // a trilha dos três passos, com o terceiro anunciado como condicional
  await expect(floor.getByTestId('trail')).toContainText('a citação, se contestar')
  // Falar indisponível sempre vem com a frase que explica o que falta
  await expect(floor.getByTestId('speak')).toBeDisabled()
  await expect(floor).toContainText('liberar o botão Falar')

  // 6. sustentar uma carta aliada da tese ⇒ COERENTE; contestar uma aliada ⇒ VOCÊ SE CONTRADISSE
  const pickAliada = () =>
    page.evaluate(() => {
      const s = window.simStore!.getState()
      const h = s.hearing!
      const tese = h.teses.find((t) => t.id === s.run.tese)!
      const cards = new Map(h.deck.map((c) => [c.id, c]))
      return s.run.hand.find((id) => {
        const c = cards.get(id)!
        return c.kind === 'claim' && !c.consensus && tese.positions[c.theme] === c.position
      }) ?? null
    })
  const aliada = await pickAliada()
  expect(aliada).not.toBeNull()
  // 6a. o painel em passos: o movimento primeiro, a anotação depois; o passo cumprido mostra o que foi escolhido
  await floor.getByTestId('move-sustento').click()
  await expect(floor.getByTestId('trail')).toContainText('Sustentar')
  // o passo cumprido é um botão: volta ao passo 1 sem fechar o painel
  await floor.getByTestId('step-1').click()
  await expect(floor.getByTestId('moves')).toBeVisible()
  expect(await page.evaluate(() => window.simStore!.getState().selection.kind)).toBeNull()
  await floor.getByTestId('move-sustento').click()
  // cada anotação do caderno tem recheio e diz a que tema pertence
  const card = floor.locator('.hand [data-testid="card"]').first()
  const themeName = await page.evaluate(() => {
    const s = window.simStore!.getState()
    const c = s.hearing!.deck.find((x) => x.id === s.run.hand[0])!
    return s.hearing!.themes.find((t) => t.id === c.theme)!.name
  })
  await expect(floor.locator('.hand [data-testid="card"]').first()).toBeVisible()
  expect(await card.evaluate((el) => getComputedStyle(el).paddingLeft)).not.toBe('0px')
  await expect(floor.locator('.hand')).toContainText(themeName)
  await floor.locator(`.hand [data-card="${aliada}"]`).click()
  await expect(floor.getByTestId('slots')).toContainText('Você sustenta')
  await expect(page.getByTestId('preview')).toContainText('que')
  await page.screenshot({ path: `${SHOTS}/sim-044-palavra.png` })
  // modo manual: o balão da cadeira vaga fica parado enquanto o veredito e a Fonte são conferidos
  await page.keyboard.press('p')
  expect(await page.evaluate(() => window.simStore!.getState().autoplay)).toBe(false)
  await floor.getByTestId('speak').click()
  await expect(balloon).toContainText('Você, da cadeira vaga')
  const verdict = page.getByTestId('verdict')
  await expect(verdict).toContainText('Coerente com a sua tese', { timeout: 60_000 })
  // o antes e depois da coerência, dentro do balão
  await expect(verdict).toContainText('coerência')
  const meter = await page.evaluate(() => window.simStore!.getState().run.current!.meter!)
  await expect(verdict).toContainText(String(Math.round(meter.after)))
  await page.screenshot({ path: `${SHOTS}/sim-044-veredito.png` })
  // 7. a faixa Fonte traz o ref; abrir o original ali mostra deck[].text
  await expect(balloon.locator('.fonte .ref')).toHaveCount(1)
  await page.keyboard.press('o')
  const srcText = await page.evaluate(() => {
    const s = window.simStore!.getState()
    const c = s.hearing!.deck.find((x) => x.id === s.run.moves.at(-1)!.card)!
    return c.text
  })
  await expect(page.getByTestId('original')).toContainText(srcText.slice(0, 40))
  await page.keyboard.press('o')
  // de volta ao automático, para as réplicas correrem
  await page.keyboard.press('p')

  // volta ao painel para o segundo movimento desta vez
  await expect(floor).toBeVisible({ timeout: 120_000 })
  const aliada2 = await pickAliada()
  if (aliada2) {
    await floor.locator(`.hand [data-card="${aliada2}"]`).click()
    await floor.getByTestId('move-contesto').click()
    await expect(floor.getByTestId('slots')).toContainText('Você contesta')
    await page.keyboard.press('p')
    await floor.getByTestId('speak').click()
    await expect(verdict).toContainText('Você se contradisse', { timeout: 60_000 })
    const statement = await page.evaluate(() => {
      const s = window.simStore!.getState()
      return s.hearing!.teses.find((t) => t.id === s.run.tese)!.statement_plain
    })
    await expect(verdict).toContainText(statement.slice(1, 25))
    await page.screenshot({ path: `${SHOTS}/sim-044-contradicao.png` })
    await page.keyboard.press('p')
  } else {
    await floor.getByTestId('yield').click()
  }

  // 8. até o fim: devolve as próximas vezes e lê a ata
  await page.evaluate(() => {
    const store = window.simStore!
    store.subscribe((s) => {
      if (s.run.phase === 'floor') store.getState().yieldFloor()
    })
  })
  const ata = page.getByTestId('ata')
  await expect(ata).toBeVisible({ timeout: 480_000 })
  await expect(ata).toContainText(`semente ${SEED}`)
  await expect(ata.getByTestId('verdicts')).not.toBeEmpty()
  await expect(ata.getByTestId('moves-list').locator('li')).not.toHaveCount(0)
  await expect(ata.getByTestId('checked')).toContainText('trechos abertos no original')
  await expect(ata).toContainText('Coerência final')
  await expect(ata).toContainText('A audiência real')
  expect(await ata.getAttribute('class')).toContain('sim-scroll')
  expect(await ata.innerText()).not.toContain('·')
  // nenhum trecho de pessoa nomeada foi lido duas vezes nesta sessão
  const dup = await page.evaluate(() => {
    const s = window.simStore!.getState().run
    return s.shownCards.length !== new Set(s.shownCards).size
  })
  expect(dup).toBe(false)
  await page.screenshot({ path: `${SHOTS}/sim-044-ata.png`, fullPage: true })
})
