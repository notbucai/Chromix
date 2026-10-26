import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { restrictedSocksDnsArgs } from './native-proxy-options.mjs';

export const root = dirname(fileURLToPath(import.meta.url));
const directory = resolve(root, 'environments');
const displays = [
  { width: 1440, height: 900, viewportHeight: 780, deviceScaleFactor: 2 },
  { width: 1680, height: 1050, viewportHeight: 930, deviceScaleFactor: 2 },
  { width: 1920, height: 1080, viewportHeight: 960, deviceScaleFactor: 1 },
];
function configPath(name) {
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(name)) {
    throw new Error('环境名须为 1–48 位小写字母、数字、下划线或连字符，首位为字母或数字');
  }
  return resolve(directory, `${name}.json`);
}
export async function loadEnvironment(name) {
  const config = JSON.parse(await readFile(configPath(name), 'utf8'));
  if (config.name !== name || !/^[1-9][0-9]*$/.test(config.seed) || BigInt(config.seed) > 0xFFFFFFFFn) {
    throw new Error(`环境配置无效：${name}`);
  }
  return config;
}
export async function listEnvironments() {
  await mkdir(directory, { recursive: true });
  const files = (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
  return Promise.all(files.map(file => loadEnvironment(file.slice(0, -5))));
}
function defaultUserAgent(browserVersion) {
  // Match Chromium's reduced desktop UA; keep the browser major in sync.
  const major = browserVersion.replace(/^v/, '').split('.')[0];
  const platform = { darwin: 'Macintosh; Intel Mac OS X 10_15_7', win32: 'Windows NT 10.0; Win64; x64', linux: 'X11; Linux x86_64' }[process.platform];
  if (!platform || !/^[0-9]+$/.test(major)) throw new Error('无法为当前平台生成浏览器 UA');
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}
export async function createEnvironment(name, { lowMemory = false, disableVideoPlayback = false } = {}) {
  const path = configPath(name);
  await mkdir(directory, { recursive: true });
  const existing = await listEnvironments();
  if (existing.some(config => config.name === name)) throw new Error(`环境已存在：${name}`);
  let seed;
  // Adopt the original demo profile's seed when migrating it.
  try { seed = (await readFile(resolve(root, 'profiles', name, '.chromix-fingerprint-seed'), 'utf8')).trim(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!seed) {
    do { seed = String(randomBytes(4).readUInt32LE(0) || 1); }
    while (existing.some(config => config.seed === seed));
  }
  const display = name === 'demo' ? null : displays.find(candidate =>
    !existing.some(config => config.display?.width === candidate.width)
  ) || displays[existing.length % displays.length];
  const config = {
    name, seed, createdAt: new Date().toISOString(),
    browserVersion: process.env.CLOAKBROWSER_VERSION || '154.0.8037.57',
    locale: process.env.CHROMIX_LOCALE || 'zh-CN',
    timezone: process.env.CHROMIX_TIMEZONE || 'Asia/Shanghai',
    proxy: process.env.CHROMIX_PROXY || null,
    display: lowMemory ? { width: 1440, height: 900, viewportWidth: 1280, viewportHeight: 720, deviceScaleFactor: 1 } : display,
    ...(lowMemory ? { memoryMode: 'low' } : {}),
    ...(disableVideoPlayback ? { disableVideoPlayback: true } : {}),
    userAgent: defaultUserAgent(process.env.CLOAKBROWSER_VERSION || '154.0.8037.57'),
  };
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return config;
}
export function environmentOptions(config, userDataDir = resolve(root, 'profiles', config.name)) {
  if (existsSync(resolve(userDataDir, '.chromix-maintenance.lock'))) throw new Error('环境正在维护，请稍后启动');
  if (config.disableVideoPlayback !== undefined && typeof config.disableVideoPlayback !== 'boolean') {
    throw new Error('disableVideoPlayback 必须为布尔值');
  }
  if (config.disableGpu !== undefined && typeof config.disableGpu !== 'boolean') {
    throw new Error('disableGpu 必须为布尔值');
  }
  const display = config.display;
  return {
    userDataDir,
    ...(config.executablePath ? { launchOptions: { executablePath: config.executablePath } } : {}),
    browserVersion: config.browserVersion,
    ...(config.userAgent ? { userAgent: config.userAgent } : {}),
    locale: config.locale,
    timezone: config.timezone,
    args: [`--fingerprint=${config.seed}`, '--disable-blink-features=AutomationControlled',
      ...restrictedSocksDnsArgs(config.proxy),
      ...(config.disableVideoPlayback === true ? ['--uxr-disable-video-playback'] : []),
      ...((config.disableGpu === true || config.memoryMode === 'low') ? ['--disable-gpu', '--disable-software-rasterizer'] : []),
      ...(config.disableGpu === true ? ['--disable-webgl'] : []),
      ...(config.memoryMode === 'low' ? ['--enable-low-end-device-mode', '--renderer-process-limit=1', '--disk-cache-size=4194304', '--media-cache-size=1048576'] : []),
    ],
    ...(config.proxy ? { proxy: config.proxy } : {}),
    ...(display ? {
      viewport: { width: display.viewportWidth ?? display.width, height: display.viewportHeight },
      contextOptions: {
        screen: { width: display.width, height: display.height },
        deviceScaleFactor: display.deviceScaleFactor,
        ...(config.acceptLanguage ? { extraHTTPHeaders: { 'Accept-Language': config.acceptLanguage } } : {}),
      },
      startMaximized: false,
    } : {}),
  };
}
export async function prepareEnvironment(context, config) {
  if (config.memoryMode !== 'low') return;
  // This optional profile only supports the username/password login path.
  // Allow X's scripts and API requests; omit third-party sign-in documents.
  await context.route('**/*', async route => {
    const host = new URL(route.request().url()).hostname;
    if (/(^|\.)(google\.com|gstatic\.com|googleapis\.com|apple\.com)$/.test(host)) return route.abort();
    return route.continue();
  });
}
export async function inspectPage(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#a36'; ctx.fillRect(0, 0, 80, 30);
    ctx.fillStyle = '#123'; ctx.fillText('Chromix fingerprint', 5, 20);
    const hash = crypto.subtle
      ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canvas.toDataURL()))), b => b.toString(16).padStart(2, '0')).join('')
      : null;
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      webdriver: navigator.webdriver, userAgent: navigator.userAgent,
      userAgentData: navigator.userAgentData?.toJSON() ?? null,
      language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cpu: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
      screen: { width: screen.width, height: screen.height },
      viewport: { width: innerWidth, height: innerHeight }, deviceScaleFactor: devicePixelRatio,
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, canvasHash: hash,
    };
  });
}
