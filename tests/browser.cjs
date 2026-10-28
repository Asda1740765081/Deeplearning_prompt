// Real-browser acceptance checks; fixtures contain no private research material.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { prompts, renderPrompt } = require('../scripts/load-data.cjs')();
const examples = require('../examples/cases.json');
const root = path.join(__dirname, '..');
const port = 4189,
  base = `http://127.0.0.1:${port}`;
const capture = process.env.CAPTURE_DOCS === '1';
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${passed}: ${name}`);
}
async function fillExample(page, example) {
  await page.locator(`[data-open="${example.templateId}"]`).click();
  const p = prompts.find((p) => p.id === example.templateId);
  for (let i = 0; i < p.fields.length; i++) {
    await page.locator(`#field-${i}`).fill(example.values[p.fields[i][0]]);
  }
  return p;
}

(async () => {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  let browser;
  try {
    await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'exit').then(() => {
        throw Error('Preview server stopped');
      })
    ]);
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1060 },
      deviceScaleFactor: 1
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await check('all templates and research scenes render', async () => {
      assert.equal(await page.locator('.card').count(), 46);
      assert.equal(await page.locator('#researchNav button').count(), 7);
      assert.equal(await page.locator('#totalStat').innerText(), '46');
    });
    if (capture) await page.screenshot({ path: path.join(root, 'docs/screenshots/workspace.png') });
    await check('keyword and difficulty filters change actual results', async () => {
      await page.locator('#search').fill('三分钟速读');
      assert.equal(await page.locator('.card').count(), 1);
      await page.locator('#search').fill('');
      await page.locator('#difficulty').selectOption('专家');
      assert((await page.locator('.card').count()) > 0);
      assert(!(await page.locator('#grid').innerText()).includes('入门 ·'));
      await page.locator('#difficulty').selectOption('all');
    });
    await check('documented examples match the real browser preview', async () => {
      for (const example of examples) {
        const p = await fillExample(page, example);
        assert.equal(
          await page.locator('#preview').innerText(),
          renderPrompt(p, example.values, example.language)
        );
        if (capture && example.slug === 'training-diagnosis')
          await page.screenshot({ path: path.join(root, 'docs/screenshots/editor.png') });
        await page.locator('#closeEditor').click();
      }
    });
    await check('draft and language survive reload', async () => {
      await page.locator('[data-open="debug"]').click();
      await page.locator('#language').selectOption('English');
      await page.locator('#closeEditor').click();
      await page.reload();
      await page.locator('[data-open="debug"]').click();
      assert(
        (await page.locator('#preview').innerText()).startsWith(
          'Please respond in professional academic English.'
        )
      );
      assert((await page.locator('#draftStatus').innerText()).includes('恢复'));
      assert((await page.locator('#field-0').inputValue()).includes('CrossEntropyLoss'));
      await page.locator('#closeEditor').click();
    });
    await check('favorites survive reload and show only saved templates', async () => {
      await page.locator('[data-fav="paper-fast"]').click();
      await page.reload();
      await page.locator('[data-nav="favorite"]').click();
      assert.equal(await page.locator('.card').count(), 1);
      assert((await page.locator('#grid').innerText()).includes('三分钟速读'));
      await page.locator('[data-nav="all"]').click();
    });
    await check('Chinese custom variables are editable and HTML is escaped', async () => {
      await page.locator('#createBtn').click();
      await page.locator('#customTitle').fill('测试 <img src=x onerror=alert(1)>');
      await page.locator('#customTemplate').fill('分析 {{研究问题}}，原样保留 {{data}}。');
      await page.getByRole('button', { name: '保存模板', exact: true }).click();
      assert.equal(await page.locator('#grid img').count(), 0);
      await page.locator('[data-open]').click();
      await page.locator('#field-0').fill('{{data}} $&');
      await page.locator('#field-1').fill('原文');
      assert.equal(await page.locator('#preview').innerText(), '分析 {{data}} $&，原样保留 原文。');
      await page.locator('#editCustom').click();
      await page.locator('#customTitle').fill('可编辑的研究模板');
      await page.getByRole('button', { name: '保存模板', exact: true }).click();
      assert((await page.locator('#grid').innerText()).includes('可编辑的研究模板'));
    });
    await check('backup export/import restores personal state and deduplicates', async () => {
      await page.locator('[data-nav="all"]').click();
      await page.locator('[data-open="debug"]').click();
      await page.locator('[data-rate="4"]').click();
      await page.locator('#closeEditor').click();
      await page.locator('#backupBtn').click();
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#exportBtn').click();
      const download = await downloadPromise;
      const backup = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      assert.equal(backup.version, 3);
      assert.equal(backup.ratings.debug, 4);
      assert.equal(backup.customPrompts.length, 1);
      assert(backup.drafts.debug.values.symptom);
      const fresh = await browser.newContext();
      const p = await fresh.newPage();
      await p.goto(base);
      await p.locator('#backupBtn').click();
      const file = {
        name: 'backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup))
      };
      await p.locator('#importInput').setInputFiles(file);
      await p.locator('#toast').filter({ hasText: '新增 1 个模板' }).waitFor();
      await p.locator('#importInput').setInputFiles(file);
      await p.locator('#toast').filter({ hasText: '新增 0 个模板' }).waitFor();
      await p.locator('#importInput').setInputFiles({
        name: 'bad.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{bad')
      });
      await p.locator('#toast').filter({ hasText: '导入失败' }).waitFor();
      await p.locator('#closeManager').click();
      await p.reload();
      assert.equal(await p.locator('#totalStat').innerText(), '47');
      assert.equal(await p.locator('#favStat').innerText(), '1');
      await p.locator('[data-open="debug"]').click();
      assert.equal(await p.locator('[data-rate="4"]').getAttribute('aria-pressed'), 'true');
      assert((await p.locator('#field-0').inputValue()).includes('CrossEntropyLoss'));
      await fresh.close();
      await page.locator('#closeManager').click();
    });
    await check('sharing excludes filled research data and preserves existing drafts', async () => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.locator('[data-open="debug"]').click();
      await page.locator('#shareBtn').click();
      const url = await page.evaluate(() => navigator.clipboard.readText());
      assert(url.includes('#share='));
      assert(
        !Buffer.from(url.split('#share=')[1], 'base64').toString().includes('CrossEntropyLoss')
      );
      await page.goto(url);
      assert((await page.locator('#field-0').inputValue()).includes('CrossEntropyLoss'));
      await page.locator('#closeEditor').click();
      await page.locator('[data-nav="custom"]').click();
      await page.locator('[data-open]').click();
      await page.locator('#shareBtn').click();
      const customUrl = await page.evaluate(() => navigator.clipboard.readText());
      const fresh = await browser.newContext();
      const p = await fresh.newPage();
      await p.goto(customUrl);
      assert.equal(await p.locator('#editorTitle').innerText(), '可编辑的研究模板');
      await p.locator('#closeEditor').click();
      await p.goto(base);
      assert.equal(await p.locator('#totalStat').innerText(), '47');
      await fresh.close();
      await page.locator('#closeEditor').click();
      await page.locator('[data-nav="all"]').click();
    });
    await check('team view links to working role templates', async () => {
      await page.locator('[data-nav="team"]').click();
      assert.equal(await page.locator('.agent-card').count(), 7);
      for (const button of await page.locator('.agent-card').all()) {
        await button.click();
        assert(await page.locator('#editor').isVisible());
        await page.locator('#closeEditor').click();
      }
    });
    await check('mobile navigation and editor fit without horizontal overflow', async () => {
      const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1
      });
      const p = await mobile.newPage();
      await p.goto(base);
      await p.locator('#menuBtn').click();
      await p.locator('[data-nav="reading"]').click();
      assert(!(await p.locator('#sidebar').getAttribute('class')).includes('open'));
      assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await p.locator('[data-open="paper-fast"]').click();
      assert(
        await p.evaluate(
          () => document.querySelector('#editor').getBoundingClientRect().width <= window.innerWidth
        )
      );
      await p.locator('#closeEditor').click();
      if (capture) {
        await p.goto(base);
        await p.screenshot({ path: path.join(root, 'docs/screenshots/mobile.png') });
      }
      await mobile.close();
    });
    await check('storage failure is visible without crashing', async () => {
      const restricted = await browser.newContext();
      await restricted.addInitScript(() => {
        Storage.prototype.setItem = function () {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        };
      });
      const p = await restricted.newPage();
      await p.goto(base);
      await p.locator('[data-open="paper-fast"]').click();
      await p.locator('#field-0').fill('存储失败测试');
      assert((await p.locator('#draftStatus').innerText()).includes('未能保存'));
      await restricted.close();
    });
    await check('direct file opening remains functional', async () => {
      const local = await browser.newContext();
      const p = await local.newPage();
      await p.goto(pathToFileURL(path.join(root, 'index.html')).href);
      assert.equal(await p.locator('.card').count(), 46);
      await p.locator('[data-open="paper-fast"]').click();
      assert(await p.locator('#editor').isVisible());
      await local.close();
    });
    await check(
      'manuscript workflow and new research templates provide usable fields and guidance',
      async () => {
        await page.locator('[data-nav="all"]').click();
        assert(await page.locator('#writingStarter').isVisible());
        await page.locator('[data-writing-start="paper-first-draft"]').click();
        assert.equal(await page.locator('#editorTitle').innerText(), '基于证据的论文完整初稿');
        assert(await page.locator('#researchGuide').isVisible());
        assert.equal(await page.locator('#researchGuide a').count(), 2);
        const freshIds = [
          'search-strategy',
          'evidence-extraction',
          'claim-evidence-audit',
          'research-question',
          'analysis-plan',
          'reproducibility-audit',
          'results-discussion',
          'academic-translation',
          'manuscript-outline',
          'paper-introduction',
          'paper-methods',
          'paper-results',
          'paper-first-draft'
        ];
        await page.locator('#closeEditor').click();
        for (const id of freshIds) {
          const p = prompts.find((x) => x.id === id);
          await page.locator(`[data-open="${id}"]`).click();
          for (let i = 0; i < p.fields.length; i++)
            await page.locator(`#field-${i}`).fill('演示材料：此项需人工核验。');
          assert(!(await page.locator('#preview').innerText()).includes('[请填写：'));
          await page.locator('#closeEditor').click();
        }
      }
    );
    await check('sound is opt-in, persists, and reduced-motion suppresses animation', async () => {
      const sound = await browser.newContext({ reducedMotion: 'reduce' });
      await sound.addInitScript(() => {
        const Original = window.AudioContext;
        window.__toneCount = 0;
        window.AudioContext = class extends Original {
          createOscillator() {
            window.__toneCount++;
            return super.createOscillator();
          }
        };
      });
      const p = await sound.newPage();
      await p.goto(base);
      assert.equal(await p.locator('#soundBtn').getAttribute('aria-pressed'), 'false');
      await p.locator('#createBtn').click();
      await p.locator('#closeManager').click();
      assert.equal(await p.evaluate(() => window.__toneCount), 0);
      await p.locator('#soundBtn').click();
      assert.equal(await p.locator('#soundBtn').getAttribute('aria-pressed'), 'true');
      assert((await p.evaluate(() => window.__toneCount)) > 0);
      await p.reload();
      assert.equal(await p.locator('#soundBtn').getAttribute('aria-pressed'), 'true');
      assert.equal(await p.evaluate(() => window.__toneCount), 0);
      await p.locator('#soundBtn').click();
      await p.locator('#createBtn').click();
      assert.equal(await p.evaluate(() => window.__toneCount), 0);
      await p.locator('#closeManager').click();
      assert.equal(
        await p
          .locator('.card')
          .first()
          .evaluate((el) => getComputedStyle(el).animationName),
        'none'
      );
      await sound.close();
    });
    await check(
      'writing roadmap recommends order, preserves progress, and returns from templates',
      async () => {
        await page.goto(base);
        await page.locator('[data-nav="writing"]').click();
        assert(await page.locator('#writingFlow').isVisible());
        assert(!(await page.locator('#library').isVisible()));
        assert.equal(await page.locator('[data-flow-stage]').count(), 9);
        assert.equal(
          await page.locator('[aria-current="step"]').getAttribute('data-flow-stage'),
          'prepare'
        );
        assert(await page.locator('[data-flow-open="research-question"]').isVisible());
        await page.locator('[data-flow-open="research-question"]').click();
        assert(await page.locator('#writingHandoff').isVisible());
        await page.locator('#returnWritingStage').click();
        assert((await page.locator('#flowProgress').innerText()).includes('0 / 9'));
        await page.locator('#flowComplete').click();
        assert((await page.locator('#flowProgress').innerText()).includes('1 / 9'));
        await page.locator('#flowNext').click();
        assert(await page.locator('[data-flow-open="manuscript-outline"]').isVisible());
        await page.reload();
        await page.locator('[data-nav="writing"]').click();
        assert.equal(
          await page.locator('[aria-current="step"]').getAttribute('data-flow-stage'),
          'story'
        );
        assert((await page.locator('#flowProgress').innerText()).includes('1 / 9'));
        await page.locator('[data-flow-start="audit"]').click();
        assert(await page.locator('[data-flow-open="polish"]').isVisible());
        await page.locator('#flowBrowse').click();
        assert(await page.locator('#library').isVisible());
        assert.equal(
          await page.locator('.card').count(),
          prompts.filter((p) => p.cat === 'writing').length
        );
        await page.locator('#backToFlow').click();
        assert(await page.locator('#writingFlow').isVisible());
        await page.locator('[data-nav="all"]').click();
      }
    );
    await check(
      'mobile writing roadmap allows stage navigation without horizontal page overflow',
      async () => {
        const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const p = await mobile.newPage();
        await p.goto(base);
        await p.locator('#enterWritingFlow').click();
        assert(await p.locator('#writingFlow').isVisible());
        assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await p.locator('[data-flow-start="story"]').click();
        await p.locator('[data-flow-open="manuscript-outline"]').click();
        assert(await p.locator('#editor').isVisible());
        await p.locator('#returnWritingStage').click();
        await p.locator('#flowNext').click();
        assert(await p.locator('[data-flow-open="paper-methods"]').isVisible());
        if (capture)
          await p.screenshot({
            path: path.join(root, 'docs/screenshots/writing-flow-mobile.png'),
            fullPage: true
          });
        await mobile.close();
        if (capture) {
          await page.locator('[data-nav="writing"]').click();
          await page.locator('[data-flow-start="story"]').click();
          await page.screenshot({
            path: path.join(root, 'docs/screenshots/writing-flow.png'),
            fullPage: true
          });
          await page.locator('[data-nav="all"]').click();
        }
      }
    );
    await check('no uncaught page errors in the desktop acceptance flow', async () =>
      assert.deepEqual(errors, [])
    );
    await context.close();
    console.log(`${passed} browser acceptance checks passed.`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
