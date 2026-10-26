import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { launchPersistentContext } from '@xiaoxiaofeihh/chromix';
import { loadEnvironment, createEnvironment, environmentOptions, inspectPage, prepareEnvironment } from './environments.mjs';
import { applyHeadlessMemoryPolicy } from './headless-memory-policy.mjs';

// Paths stay inside this project, regardless of where the script is started.
const root = dirname(fileURLToPath(import.meta.url));
const smoke = process.argv.includes('--smoke');
const headless = smoke || process.argv.includes('--headless');
const nativeLowMemory = process.argv.includes('--native-low-memory');
if (nativeLowMemory && !process.env.CLOAKBROWSER_BINARY_PATH) throw new Error('原生优化需要 CLOAKBROWSER_BINARY_PATH 指向已编译的新内核');
const args = process.argv.slice(2);
if (args.includes('--disable-video') && args.includes('--enable-video')) throw new Error('禁播与启用参数不能同时使用');
if (args.includes('--disable-video') && !process.env.CLOAKBROWSER_BINARY_PATH) throw new Error('禁播视频需要 CLOAKBROWSER_BINARY_PATH 指向含该补丁的新内核');
let name = 'demo';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--smoke' || args[i] === '--headless' || args[i] === '--native-low-memory' || args[i] === '--disable-video' || args[i] === '--enable-video') continue;
  if (args[i] === '--profile' && args[i + 1] && !args[i + 1].startsWith('--')) {
    name = args[++i];
  } else throw new Error('用法：npm start -- --profile 环境名 [--headless] [--native-low-memory] [--disable-video|--enable-video]');
}
let config;
try { config = await loadEnvironment(name); }
catch (error) {
  if (name !== 'demo' || error.code !== 'ENOENT') throw error;
  config = await createEnvironment('demo');
}
// Overrides apply only to this launch; never rewrite saved fingerprints/profile data.
if (args.includes('--disable-video')) config = { ...config, disableVideoPlayback: true };
if (args.includes('--enable-video')) config = { ...config, disableVideoPlayback: false };
const artifacts = resolve(root, 'artifacts', name);
await mkdir(artifacts, { recursive: true });
await mkdir(resolve(root, 'profiles'), { recursive: true });
const profile = smoke
  ? await mkdtemp(resolve(root, 'profiles/smoke-'))
  : resolve(root, 'profiles', name);
let context;
try {
  if (config.disableVideoPlayback) console.log('原生视频禁播已请求；必须使用含补丁的内核，视频及其声音不可用。');
  const options = environmentOptions(config, profile);
  if (nativeLowMemory) options.args.push('--uxr-low-memory');
  options.args = applyHeadlessMemoryPolicy(options.args, { headless, lowMemory: config.memoryMode === 'low' });
  context = await launchPersistentContext({ ...options, headless });
  await prepareEnvironment(context, config);
  if (config.memoryMode === 'low') console.log('低内存模式：禁用 GPU/WebGL，省略 Google/Apple 登录组件，使用 1280×720、DPR 1。');
  const page = context.pages()[0] || await context.newPage();
  const url = process.env.CHROMIX_URL || 'https://example.com';
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (response && !response.ok()) throw new Error(`页面返回 HTTP ${response.status()}`);
  console.log('网页标题：', await page.title());
  const actual = await inspectPage(page);
  console.log('环境：', name, '固定种子：', config.seed);
  console.log('浏览器环境：', actual);
  await writeFile(resolve(artifacts, 'fingerprint.json'), JSON.stringify({ name, seed: config.seed, actual }, null, 2) + '\n');
  if (config.memoryMode !== 'low') {
    const screenshot = resolve(artifacts, smoke ? 'smoke.png' : 'screenshot.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log('截图已保存：', screenshot);
  }
  if (!smoke) {
    console.log('浏览器数据保存在：', profile);
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    const controller = new AbortController();
    context.once('close', () => controller.abort());
    try {
      await terminal.question(headless ? '无头环境已启动；按回车关闭浏览器。\n' : '可以手动操作或登录；按回车关闭浏览器。\n', { signal: controller.signal });
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
    } finally {
      terminal.close();
    }
  }
} catch (error) {
  console.error('启动或访问失败：', error.message);
  console.error('请检查网络、.env 中的代理和浏览器路径配置。');
  process.exitCode = 1;
} finally {
  await context?.close();
  if (smoke) await rm(profile, { recursive: true, force: true });
}
