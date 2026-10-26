import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchPersistentContext } from '@xiaoxiaofeihh/chromix';
import { root, loadEnvironment, environmentOptions, inspectPage, prepareEnvironment } from './environments.mjs';

await mkdir(resolve(root, 'work'), { recursive: true });
const temporary = await mkdtemp(resolve(root, 'work/verify-'));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>Environment verification</title><iframe src="about:blank"></iframe>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const contexts = new Set();
const snapshots = [];
async function open(config) {
  const context = await launchPersistentContext({
    ...environmentOptions(config, resolve(temporary, config.name)), headless: true,
  });
  contexts.add(context);
  await prepareEnvironment(context, config);
  const page = context.pages()[0] || await context.newPage();
  await page.goto(url);
  return { context, page };
}
async function close(context) { await context.close(); contexts.delete(context); }
try {
  const a = await loadEnvironment(process.argv[2] || 'env-1');
  const b = await loadEnvironment(process.argv[3] || 'env-2');
  assert.notEqual(a.seed, b.seed);
  assert.notEqual(environmentOptions(a).userDataDir, environmentOptions(b).userDataDir);
  const first = await open(a);
  const second = await open(b);
  await first.page.evaluate(() => {
    document.cookie = 'environment=env-1; Max-Age=3600; Path=/';
    localStorage.setItem('environment', 'env-1');
  });
  assert.equal(await second.page.evaluate(() => document.cookie), '');
  assert.equal(await second.page.evaluate(() => localStorage.getItem('environment')), null);
  await second.page.evaluate(() => {
    document.cookie = 'environment=env-2; Max-Age=3600; Path=/';
    localStorage.setItem('environment', 'env-2');
  });
  const before = await inspectPage(first.page);
  const other = await inspectPage(second.page);
  assert.deepEqual(before.screen, { width: a.display.width, height: a.display.height });
  assert.deepEqual(other.screen, { width: b.display.width, height: b.display.height });
  assert.notDeepEqual(before.screen, other.screen);
  for (const current of [first, second]) {
    assert.equal(await current.page.evaluate(() => navigator.webdriver), false);
    assert.equal(await current.page.evaluate(() => document.querySelector('iframe').contentWindow.navigator.webdriver), false);
  }
  await close(first.context);
  const reopened = await open(a);
  assert.match(await reopened.page.evaluate(() => document.cookie), /environment=env-1/);
  assert.equal(await reopened.page.evaluate(() => localStorage.getItem('environment')), 'env-1');
  const after = await inspectPage(reopened.page);
  assert.deepEqual(after, before);
  await close(reopened.context);
  await close(second.context);
  const reopenedB = await open(b);
  assert.match(await reopenedB.page.evaluate(() => document.cookie), /environment=env-2/);
  assert.equal(await reopenedB.page.evaluate(() => localStorage.getItem('environment')), 'env-2');
  assert.deepEqual(await inspectPage(reopenedB.page), other);
  await close(reopenedB.context);
  snapshots.push({ name: a.name, seed: a.seed, actual: before }, { name: b.name, seed: b.seed, actual: other });
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await writeFile(resolve(root, 'artifacts/environments-verification.json'), JSON.stringify({
    passed: true, cookieIsolation: true, localStorageIsolation: true,
    persistenceAcrossRestarts: true, fingerprintStableAcrossRestarts: true,
    snapshots,
  }, null, 2) + '\n');
  console.log('通过：两个环境可同时运行，Cookie/localStorage 隔离且重启后保留；指纹配置重启后不变，屏幕尺寸不同，webdriver=false。');
  console.table(snapshots.map(({name, seed, actual}) => ({name,seed,screen: `${actual.screen.width}×${actual.screen.height}`,cpu:actual.cpu,memory:actual.memory,canvasHash:actual.canvasHash})));
} finally {
  await Promise.allSettled([...contexts].map(context => context.close()));
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
