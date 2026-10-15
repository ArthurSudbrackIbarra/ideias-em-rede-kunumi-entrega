import { useEffect } from 'react'
import { copy } from '../copy'

/** O título da aba diz em que tela e em que fase a pessoa está (WCAG 2.4.2). */
export function useTitle(page: string | null) {
  useEffect(() => {
    document.title = page ? `${page} - ${copy.titles.suffix}` : copy.titles.suffix
  }, [page])
}
