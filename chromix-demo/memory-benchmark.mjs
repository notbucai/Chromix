import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { launchPersistentContext } from '@xiaoxiaofeihh/chromix';
import { root, loadEnvironment, environmentOptions, prepareEnvironment } from './environments.mjs';
import { applyHeadlessMemoryPolicy } from './headless-memory-policy.mjs';

if (process.platform !== 'darwin') throw new Error('此命令使用 macOS footprint，仅支持 Mac');
const arguments_ = process.argv.slice(2);
let name = 'env-lite';
let binary;
let nativeLowMemory = false;
for (let i = 0; i < arguments_.length; i++) {
  if (arguments_[i] === '--binary' && arguments_[i + 1]) binary = resolve(arguments_[++i]);
  else if (arguments_[i] === '--native-low-memory') nativeLowMemory = true;
  else if (i === 0 && !arguments_[i].startsWith('--')) name = arguments_[i];
  else throw new Error('用法：memory:check [环境名] [--binary 路径] [--native-low-memory]');
}
if (nativeLowMemory && !binary) throw new Error('原生低内存验收必须指定待验证的新内核 --binary');
if (binary) await access(binary);
const runKind = binary ? (nativeLowMemory ? 'native-low-memory' : 'native-baseline') : 'memory';
const config = await loadEnvironment(name);
const directory = await mkdtemp(join(tmpdir(), 'chromix-memory-benchmark-'));
const output = resolve(root, 'artifacts', name, runKind);
await mkdir(output, { recursive: true });
let context;
const samples = [];
function browserProcesses() {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' }).trim().split('\n').map(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return match ? { pid: +match[1], parent: +match[2], rssKiB: +match[3], command: match[4] } : null;
  }).filter(Boolean);
  const browser = rows.find(row => row.parent === process.pid && row.command.includes('Chromium.app/Contents/MacOS/Chromium'));
  if (!browser) throw new Error('找不到本次启动的浏览器进程');
  const ids = new Set([browser.pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (ids.has(row.parent) && !ids.has(row.pid)) { ids.add(row.pid); changed = true; }
  }
  return rows.filter(row => ids.has(row.pid));
}
try {
  const options = environmentOptions(config, directory);
  if (binary) options.launchOptions = { ...options.launchOptions, executablePath: binary };
  if (nativeLowMemory) options.args.push('--uxr-low-memory');
  options.args = applyHeadlessMemoryPolicy(options.args, { headless:true, lowMemory:config.memoryMode === 'low' });
  context = await launchPersistentContext({ ...options, headless: true });
  const browserCDP = await context.browser().newBrowserCDPSession();
  const browserVersion = await browserCDP.send('Browser.getVersion');
  await prepareEnvironment(context, config);
  const page = context.pages()[0] || await context.newPage();
  const response = await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.equal(response.status(), 200);
  const input = page.getByRole('textbox').first();
  await input.waitFor({ state: 'visible', timeout: 30000 });
  const ready = Date.now();
  for (const [index, delay] of [5000, 10000, 15000].entries()) {
    await page.waitForTimeout(delay);
    // Check real interaction without submitting any login data.
    await input.fill('memory-check');
    assert.equal(await input.inputValue(), 'memory-check');
    await input.fill('');
    const rows = browserProcesses();
    const path = resolve(output, `sample-${index + 1}.json`);
    execFileSync('footprint', [...rows.flatMap(row => ['-p', String(row.pid)]), '-f', 'bytes', '--noCategories', '-j', path], { encoding: 'utf8', timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
    const footprint = JSON.parse(await readFile(path, 'utf8'));
    if (footprint.errors?.length) throw new Error(`footprint 不完整：${JSON.stringify(footprint.errors)}`);
    const sample = {
      secondsAfterReady: Math.round((Date.now() - ready) / 1000),
      footprintMiB: +(footprint['total footprint'] / 1024 ** 2).toFixed(1),
      rssMiB: +(rows.reduce((sum, row) => sum + row.rssKiB, 0) / 1024).toFixed(1),
      processCount: rows.length,
      loginTextboxVisible: await input.isVisible(),
      inputFunctional: true,
    };
    samples.push(sample);
    console.log(sample);
  }
  const actual = await page.evaluate(() => ({ userAgent: navigator.userAgent, webdriver: navigator.webdriver, webglAvailable: !!document.createElement('canvas').getContext('webgl'), deviceScaleFactor: devicePixelRatio, viewport: [innerWidth, innerHeight] }));
  const report = {
    checkedAt: new Date().toISOString(), binary: binary || null, nativeLowMemory, browserVersion, profile: name, memoryMode: config.memoryMode || 'normal',
    metric: 'macOS footprint for browser process and descendants; Node excluded',
    headless: true, status: response.status(), url: page.url(), targetMiB: 350,
    targetMet: samples.every(sample => sample.footprintMiB <= 350),
    minMiB: Math.min(...samples.map(sample => sample.footprintMiB)),
    maxMiB: Math.max(...samples.map(sample => sample.footprintMiB)), actual, samples,
    scope: 'Fresh profile, X login form with input interaction, not account submission or post-login workload; samples are not a startup peak measurement.',
  };
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`浏览器 footprint：${report.minMiB}–${report.maxMiB} MiB，不含 Node。350 MiB 目标${report.targetMet ? '达成' : '未达成'}。`);
  console.log('报告：', resolve(output, 'report.json'));
} finally {
  await context?.close();
  await rm(directory, { recursive: true, force: true });
}
