export default {
  testDir: '.',
  testMatch: 'capturar-manual.spec.mjs',
  timeout: 90000,
  use: { channel: 'msedge', headless: true, viewport: { width: 1440, height: 900 } },
};
