import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

interface Props {
  text: string
  /** largura do plano em metros; a altura segue a proporção do texto */
  width: number
  fontPx?: number
  color?: string
  background?: string | null
  align?: CanvasTextAlign
  letterSpacing?: number
  position: [number, number, number]
  rotation?: [number, number, number]
  lineHeight?: number
  maxLines?: number
  bold?: boolean
  /** família da fonte no canvas; a placa da comissão e as plaquinhas usam a serifa do documento */
  font?: string
}

/**
 * Texto num plano via CanvasTexture. Substitui o <Text> do drei (troika) na sala: a geração de
 * SDF do troika lê pixels da GPU e derruba o contexto WebGL em máquinas sem GPU e no navegador
 * embutido; aqui é só um canvas 2D virando textura.
 */
export function Label3D({ text, width, fontPx = 48, color = '#f3efe6', background = null, align = 'center', letterSpacing = 0, position, rotation = [0, 0, 0], lineHeight = 1.25, maxLines = 4, bold = false, font: family = 'Lexend, system-ui, sans-serif' }: Props) {
  // a fonte chega por @font-face: redesenha quando termina de carregar
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => alive && setFontsReady(true))
    return () => {
      alive = false
    }
  }, [])
  const { texture, aspect } = useMemo(() => {
    const W = 1024
    const pad = 24
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = `${bold ? 600 : 500} ${fontPx}px ${family}`
    ctx.font = font
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${letterSpacing}px`
    // quebra de linha simples por largura
    const lines: string[] = []
    for (const para of text.split('\n')) {
      let cur = ''
      for (const word of para.split(' ')) {
        const cand = cur ? `${cur} ${word}` : word
        if (ctx.measureText(cand).width > W - pad * 2 && cur) {
          lines.push(cur)
          cur = word
        } else cur = cand
      }
      lines.push(cur)
    }
    const shown = lines.slice(0, maxLines)
    const H = Math.ceil(pad * 2 + shown.length * fontPx * lineHeight)
    canvas.width = W
    canvas.height = H
    const c2 = canvas.getContext('2d')!
    if (background) {
      c2.fillStyle = background
      c2.fillRect(0, 0, W, H)
    }
    c2.font = font
    if ('letterSpacing' in c2) (c2 as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${letterSpacing}px`
    c2.fillStyle = color
    c2.textAlign = align
    c2.textBaseline = 'middle'
    const x = align === 'center' ? W / 2 : align === 'left' ? pad : W - pad
    shown.forEach((ln, i) => c2.fillText(ln, x, pad + fontPx * lineHeight * (i + 0.5)))
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearFilter
    texture.anisotropy = 4
    return { texture, aspect: H / W }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, fontPx, color, background, align, letterSpacing, lineHeight, maxLines, bold, family, fontsReady])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, width * aspect]} />
      <meshBasicMaterial map={texture} transparent={!background} toneMapped={false} />
    </mesh>
  )
}
