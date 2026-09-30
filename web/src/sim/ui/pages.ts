/** Divide uma sentença longa em páginas de balão (spec §7.2: no máximo ~280 caracteres por balão),
 *  cortando em pontuação forte, depois em vírgula, depois em espaço. */
export const PAGE_MAX = 280

export function paginate(text: string, max = PAGE_MAX): string[] {
  const t = text.trim()
  if (t.length <= max) return [t]
  const pages: string[] = []
  let rest = t
  while (rest.length > max) {
    const window = rest.slice(0, max)
    let cut = -1
    for (const re of [/[.!?…;:](?=\s)/g, /,(?=\s)/g, /\s/g]) {
      let m: RegExpExecArray | null
      let last = -1
      while ((m = re.exec(window)) !== null) if (m.index > max * 0.35) last = m.index
      if (last > 0) {
        cut = last + 1
        break
      }
    }
    if (cut <= 0) cut = max
    pages.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) pages.push(rest)
  return pages
}
