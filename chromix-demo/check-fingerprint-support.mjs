import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchPersistentContext } from '@xiaoxiaofeihh/chromix';
import { root, loadEnvironment, environmentOptions } from './environments.mjs';

const headed = process.argv.includes('--headed');
const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><title>Native fingerprint capability check</title><iframe src="about:blank"></iframe>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir(resolve(root, 'work'), { recursive: true });
const temporary = await mkdtemp(resolve(root, 'work/native-check-'));
const requestedA = { seed: '12345', cpu: 8, memory: 8, vendor: 'Diagnostic Vendor A', renderer: 'Diagnostic Renderer A' };
const requestedB = { seed: '67890', cpu: 12, memory: 4, vendor: 'Diagnostic Vendor B', renderer: 'Diagnostic Renderer B' };
const cases = [
  { name: 'baseline', requested: null },
  { name: 'public-a', requested: requestedA },
  { name: 'public-b', requested: requestedB },
  { name: 'public-a-restart', requested: requestedA },
  { name: 'internal-a', requested: requestedA, internal: true },
  { name: 'internal-b', requested: requestedB, internal: true },
];
const launches = [];
try {
  const config = await loadEnvironment('env-1');
  for (const test of cases) {
    const options = environmentOptions(config, resolve(temporary, test.name === 'public-a-restart' ? 'public-a' : test.name));
    const requested = test.requested;
    if (requested) {
      const prefix = test.internal ? 'uxr' : 'fingerprint';
      options.args = [
        `--fingerprint=${requested.seed}`, '--disable-blink-features=AutomationControlled',
        `--${prefix}-hardware-concurrency=${requested.cpu}`, `--${prefix}-device-memory=${requested.memory}`,
        `--${prefix}-gpu-backend=compatibility`, `--${prefix}-gpu-vendor=${requested.vendor}`,
        `--${prefix}-gpu-renderer=${requested.renderer}`, `--${prefix}-pixel-noise=seeded`,
        ...(test.internal ? [`--uxr-canvas-seed=${requested.seed}`] : []),
      ];
    }
    const context = await launchPersistentContext({ ...options, headless: !headed });
    try {
      const page = context.pages()[0] || await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const actual = await page.evaluate(async () => {
        const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
        const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 150;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 300, 150);
        gradient.addColorStop(0, '#284a96'); gradient.addColorStop(1, '#e39138');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 300, 150);
        ctx.font = '18px Arial'; ctx.fillStyle = '#eee'; ctx.fillText('Chromix native noise test', 12, 70);
        const raw = await digest(ctx.getImageData(0, 0, 300, 150).data);
        const png = await digest(new TextEncoder().encode(canvas.toDataURL()));
        const repeatedPng = await digest(new TextEncoder().encode(canvas.toDataURL()));
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        const blobHash = await digest(await blob.arrayBuffer());
        const gpu = {};
        for (const api of ['webgl', 'webgl2']) {
          const gl = document.createElement('canvas').getContext(api);
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          gpu[api] = ext ? {vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)} : null;
        }
        const workerURL = URL.createObjectURL(new Blob(['postMessage(navigator.hardwareConcurrency)'], { type: 'text/javascript' }));
        let workerCpu;
        try {
          workerCpu = await new Promise((resolve, reject) => {
            const worker = new Worker(workerURL);
            const timer = setTimeout(() => {worker.terminate();reject(new Error('worker timeout'));}, 5000);
            worker.onmessage = event => {clearTimeout(timer);worker.terminate();resolve(event.data);};
            worker.onerror = event => {clearTimeout(timer);worker.terminate();reject(new Error(event.message));};
          });
        } finally { URL.revokeObjectURL(workerURL); }
        return {
          cpu: navigator.hardwareConcurrency, memory: navigator.deviceMemory,
          iframeCpu: document.querySelector('iframe').contentWindow.navigator.hardwareConcurrency,
          workerCpu, gpu, canvas: { raw, png, repeatedPng, blobHash },
          userAgent: navigator.userAgent,
        };
      });
      launches.push({ name: test.name, requested, args: options.args, actual });
      console.log(test.name, JSON.stringify(actual));
    } finally { await context.close(); }
  }
  const a = launches.find(item => item.name === 'public-a');
  const b = launches.find(item => item.name === 'public-b');
  const restarted = launches.find(item => item.name === 'public-a-restart');
  const cpuMatches = [a, b].every(item => item.actual.cpu === item.requested.cpu && item.actual.iframeCpu === item.requested.cpu && item.actual.workerCpu === item.requested.cpu);
  const gpuMatches = [a, b].every(item => ['webgl', 'webgl2'].every(api => item.actual.gpu[api]?.vendor === item.requested.vendor && item.actual.gpu[api]?.renderer === item.requested.renderer));
  const canvasDifferent = ['raw', 'png', 'blobHash'].every(key => a.actual.canvas[key] !== b.actual.canvas[key]);
  const stable = JSON.stringify(a.actual) === JSON.stringify(restarted.actual);
  const report = {
    checkedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, headed,
    configuredBrowserVersion: config.browserVersion,
    binaryOverride: process.env.CLOAKBROWSER_BINARY_PATH || null,
    checks: { cpuMatches, gpuMatches, canvasDifferent, stableAcrossRestart: stable },
    supported: cpuMatches && gpuMatches && canvasDifferent && stable,
    launches,
  };
  const output = resolve(root, 'artifacts', headed ? 'native-fingerprint-support-headed.json' : 'native-fingerprint-support.json');
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('检测结果：', report.checks);
  console.log('当前浏览器完整支持：', report.supported);
  console.log('报告：', output);
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
