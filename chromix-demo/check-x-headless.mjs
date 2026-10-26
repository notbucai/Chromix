import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchPersistentContext } from '@xiaoxiaofeihh/chromix';
import { loadEnvironment, environmentOptions, root, prepareEnvironment } from './environments.mjs';

const name = process.argv[2] || 'env-1';
const config = await loadEnvironment(name);
const output = resolve(root, 'artifacts', name);
await mkdir(output, { recursive: true });
const results = [];
for (let run = 1; run <= 2; run++) {
  const directory = await mkdtemp(join(tmpdir(), 'chromix-x-headless-'));
  let context;
  try {
    context = await launchPersistentContext({ ...environmentOptions(config, directory), headless: true });
    await prepareEnvironment(context, config);
    const page = context.pages()[0] || await context.newPage();
    const navigation = [];
    page.on('response', response => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
        navigation.push({ url: response.url(), status: response.status() });
      }
    });
    await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const textbox = page.getByRole('textbox').first();
    await textbox.waitFor({ state: 'visible', timeout: 30000 });
    const actual = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      userAgentData: navigator.userAgentData?.toJSON() ?? null,
      webdriver: navigator.webdriver,
    }));
    assert.equal(navigation[0]?.status, 200);
    assert.equal(actual.userAgent, config.userAgent);
    assert.equal(actual.userAgent.includes('HeadlessChrome'), false);
    assert.equal(actual.webdriver, false);
    const result = { run, checkedAt: new Date().toISOString(), navigation,
      url: page.url(), title: await page.title(), loginTextboxVisible: true, actual };
    results.push(result);
    await page.screenshot({ path: resolve(output, `x-headless-${run}.png`) });
    console.log(JSON.stringify(result));
  } catch (error) {
    results.push({ run, passed: false, error: error.message });
    throw error;
  } finally {
    await context?.close();
    await rm(directory, { recursive: true, force: true });
    await writeFile(resolve(output, 'x-headless-check.json'), JSON.stringify(results, null, 2) + '\n');
  }
}
console.log('通过：两次全新无头会话均返回 200，登录输入框可见。');
