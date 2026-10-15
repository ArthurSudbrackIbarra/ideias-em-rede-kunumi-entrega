import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import SimPage from '../sim/SimPage'
import { focusIfIdle } from '../sim/lib/dialogs'
import { disableVLibras, enableVLibras } from '../sim/lib/vlibras'
import { useSettings } from '../sim/store/useSettings'
import { Announcer } from '../sim/ui/Announcer'
import { Catalog } from '../sim/ui/Catalog'
import { ClipTip } from '../sim/ui/ClipTip'
import { Home } from '../sim/ui/Home'
import { Statement } from '../sim/ui/Statement'
import { SkipLinks } from './SkipLinks'

/** Numa troca de rota, o foco vai para o conteúdo novo, e o leitor de tela começa por ele. Na primeira carga, não. */
function useRouteFocus() {
  const { pathname } = useLocation()
  const prev = useRef(pathname)
  useEffect(() => {
    if (prev.current === pathname) return
    prev.current = pathname
    requestAnimationFrame(() => focusIfIdle(document.getElementById('conteudo')))
  }, [pathname])
}

/** O VLibras só carrega quando a pessoa liga a opção, e some quando ela desliga. */
function useVLibras() {
  useEffect(() => {
    if (useSettings.getState().vlibras) enableVLibras()
    return useSettings.subscribe((s, prev) => {
      if (s.vlibras !== prev.vlibras) (s.vlibras ? enableVLibras : disableVLibras)()
    })
  }, [])
}

export default function App() {
  useRouteFocus()
  useVLibras()
  return (
    <>
      <SkipLinks />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/audiencias" element={<Catalog />} />
        <Route path="/acessibilidade" element={<Statement />} />
        <Route path="/sim/:id" element={<SimPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ClipTip />
      <Announcer />
    </>
  )
}
