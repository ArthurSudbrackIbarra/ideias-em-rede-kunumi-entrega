import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// `base` vem de VITE_BASE quando o site é publicado num subcaminho (GitHub Pages serve o projeto em
// https://<usuario>.github.io/<repo>/). O código já lê import.meta.env.BASE_URL no router e nos fetch,
// então nada mais muda. Em desenvolvimento e sem a variável, o site fica na raiz.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 5173 },
  // testes do motor do simulador (puros, sem navegador); os de Playwright vivem em tests/
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
