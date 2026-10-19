// Teste visual: abre o Escritório num Chrome de verdade (sem tela) e confere o que um olho humano conferiria a cada build:
// a barra de modo aparece acima do feed sem sobrepor, o contador/botões existem, o painel do terminal abre pelo clique e
// nada transborda numa tela estreita. Guarda um print em VISUAL_OUT (padrão: pasta temporária).
// Roda com: node server/test/visual-check.mjs   (VISUAL_URL=http://127.0.0.1:4530 por padrão; CHROME_PATH se o Chrome estiver em outro lugar)
// Não faz parte do `npm run check` porque precisa de um servidor no ar e de um Chrome instalado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const URL_ = process.env.VISUAL_URL || 'http://127.0.0.1:4530';
const OUT = process.env.VISUAL_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'v2-visual-'));
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find((p) => fs.existsSync(p));
if (!CHROME) { console.log('visual-check: NÃO TESTADO (Chrome não encontrado; use CHROME_PATH)'); process.exit(2); }

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  for (const [name, w, h] of [['larga', 1920, 945], ['estreita', 800, 700]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForSelector('.cr-mode', { timeout: 15_000 });
    await page.waitForTimeout(2500);
    const [bar, feed] = await page.evaluate(() => [document.querySelector('.cr-mode'), document.querySelector('.ui-feed')].map((e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom, r: b.right }; }));
    assert.ok(bar && bar.w > 0 && bar.h > 0, `${name}: a barra de modo não apareceu`);
    assert.ok(bar.x >= 0 && bar.r <= w, `${name}: a barra passa da largura da tela (${bar.x}..${bar.r} de ${w})`);
    assert.ok(bar.b <= h && bar.y >= 0, `${name}: a barra saiu da tela`);
    if (feed && feed.h > 0) assert.ok(bar.b <= feed.y + 1 || bar.r <= feed.x || bar.x >= feed.r, `${name}: a barra sobrepõe o feed (barra até y=${bar.b}, feed a partir de y=${feed.y})`);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.cr-mode button')].map((b) => b.textContent));
    for (const want of ['Pedidos', 'Escritórios', 'Backup']) assert.ok(labels.includes(want), `${name}: falta o botão ${want} na barra`);
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(hscroll, false, `${name}: a página tem rolagem horizontal`);
    // o dono (JMAL), quando existe: nome em vermelho na lista
    const owner = await page.$('.ui-agent__name.is-owner');
    if (owner) {
      const color = await owner.evaluate((e) => getComputedStyle(e).color);
      assert.equal(color, 'rgb(255, 43, 58)', `${name}: o nome do JMAL não está em vermelho (${color})`);
    }
    await page.screenshot({ path: path.join(OUT, `escritorio-${name}.png`) });
    // painel de acompanhamento: abre pelo clique no agente de terminal (se houver algum aberto) e não cobre a barra
    if (name === 'larga') {
      const row = await page.$('.ui-agent[data-id^=".claude"]');
      if (row) {
        await row.click();
        await page.waitForSelector('.ui-term:not([hidden])', { timeout: 5000 });
        const [term, bar2] = await page.evaluate(() => [document.querySelector('.ui-term'), document.querySelector('.cr-mode')].map((e) => { const b = e.getBoundingClientRect(); return { y: b.y, b: b.bottom }; }));
        assert.ok(term.b <= bar2.y + 1, `painel do terminal cobre a barra (painel até y=${term.b}, barra em y=${bar2.y})`);
        await page.screenshot({ path: path.join(OUT, 'escritorio-painel.png') });
        await page.keyboard.press('Escape');
      } else console.log('visual-check: nenhum agente de terminal aberto: painel não testado');
    }
    await page.close();
  }
  console.log(`visual-check: ok (prints em ${OUT})`);
} catch (e) {
  console.error(`visual-check: FALHOU: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
