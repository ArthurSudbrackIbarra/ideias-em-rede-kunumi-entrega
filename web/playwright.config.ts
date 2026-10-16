import { defineConfig } from '@playwright/test'

// Um só navegador (Chromium) e WebGL por software (SwiftShader), para o teste rodar
// em máquinas sem GPU e em CI. `npm run test:e2e` sobe o `vite` sozinho.
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    // o convite do tutorial na primeira visita fica respondido em todo teste; tests/tutorial.spec.ts começa do zero
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [{ name: 'sim.tutorial.v1', value: 'dismissed' }] }] },
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' }, testIgnore: /a11y-audit|tutorial-shots/ },
    // o retrato do axe em cada estado da partida, só sob demanda (npm run a11y:audit)
    { name: 'a11y-audit', use: { browserName: 'chromium' }, testMatch: /a11y-audit/ },
    // as imagens do tutorial, só sob demanda (npm run tutorial:screenshots)
    { name: 'tutorial-shots', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, testMatch: /tutorial-shots/ },
  ],
})
