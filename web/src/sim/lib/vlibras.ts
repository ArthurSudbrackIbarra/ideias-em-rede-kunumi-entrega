/**
 * O VLibras, tradutor de Libras do governo federal, carregado só quando a pessoa liga a opção. O carregador (versão 7)
 * cria sozinho o botão de acesso, num shadow DOM preso ao `<body>`, e só baixa o avatar quando esse botão é clicado.
 * Os endereços são absolutos (vlibras.gov.br), então o caminho base do GitHub Pages não interfere. Desligar esconde o
 * botão e o avatar: o script não tem como ser descarregado sem recarregar a página.
 */

const SRC = 'https://vlibras.gov.br/app/vlibras-plugin.js'
const PARTS = ['vlibras-access-wrapper', 'vlibras-app-root']

let requested = false
let wanted = false

function setHidden(hidden: boolean) {
  for (const id of PARTS) {
    const el = document.getElementById(id)
    if (el) el.style.display = hidden ? 'none' : ''
  }
}

export function enableVLibras() {
  wanted = true
  setHidden(false)
  if (requested) return
  requested = true
  const s = document.createElement('script')
  s.src = SRC
  s.async = true
  s.dataset.vlibras = '1'
  s.onerror = () => {
    requested = false
  }
  // o botão nasce um instante depois do script: se a pessoa desligou nesse meio-tempo, ele já nasce escondido
  s.onload = () => setTimeout(() => setHidden(!wanted), 300)
  document.body.appendChild(s)
}

export function disableVLibras() {
  wanted = false
  setHidden(true)
}
