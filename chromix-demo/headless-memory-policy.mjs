import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// These are browser-chrome UI features. Web content, site isolation and media
// permissions are not changed. Apply only to explicitly headless low-memory runs.
export const headlessUIFeatures = Object.freeze([
  'WebUIOmniboxPopup', 'WebUIOmniboxAimPopup', 'PreloadTopChromeWebUI',
]);

// Prefer smaller idle allocator caches. Memory-safety/quarantine features stay
// at their existing values; this can trade allocation throughput for footprint.
export const headlessAllocatorCacheFeatures = Object.freeze([
  'PartitionAllocLargeThreadCacheSize', 'PartitionAllocLargeEmptySlotSpanRing',
]);

export function parsePlaywrightDisabledFeatures(source) {
  // Playwright 1.64 ships its server defaults in coreBundle.js. Fail closed if
  // the bundle shape changes instead of dropping defaults or evaluating code.
  const matches = [...source.matchAll(/(?:^|\n)\s*disabledFeatures = \[([\s\S]*?)\]\.filter\(Boolean\);/g)];
  if (matches.length !== 1) throw new Error('无法确认 Playwright 默认功能列表；未应用无头内存策略');
  const result = [];
  for (const line of matches[0][1].split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('//')) continue;
    const match = text.match(/^"([A-Za-z][A-Za-z0-9_-]*)",?$/);
    if (!match) throw new Error('Playwright 默认功能列表格式已变化；未应用无头内存策略');
    result.push(match[1]);
  }
  if (!result.length || new Set(result).size !== result.length) throw new Error('Playwright 默认功能列表无效');
  return result;
}
let defaults;
export function playwrightDisabledFeatures() {
  if (!defaults) {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve('playwright-core/package.json');
    defaults = parsePlaywrightDisabledFeatures(readFileSync(join(dirname(packagePath), 'lib/coreBundle.js'), 'utf8'));
  }
  return [...defaults];
}
export function applyHeadlessMemoryPolicy(args, { headless, lowMemory } = {}) {
  if (!headless || !lowMemory) return [...args];
  // Chromium uses the last value of duplicate switches. Merge Playwright's
  // existing defaults and caller choices so no unrelated disabled feature is lost.
  const disabled = new Set(playwrightDisabledFeatures());
  const remaining = [];
  for (const arg of args) {
    if (arg.startsWith('--disable-features=')) {
      for (const name of arg.slice('--disable-features='.length).split(',').filter(Boolean)) disabled.add(name);
    } else {
      if (arg.startsWith('--enable-features=')) {
        const conflicts = arg.slice('--enable-features='.length).split(',').map(x => x.split(/[<:]/)[0]);
        if (conflicts.some(x => [...headlessUIFeatures, ...headlessAllocatorCacheFeatures].includes(x))) throw new Error('无头内存策略与显式启用的功能冲突');
      }
      remaining.push(arg);
    }
  }
  for (const name of [...headlessUIFeatures, ...headlessAllocatorCacheFeatures]) disabled.add(name);
  return [...remaining, '--disable-features=' + [...disabled].join(',')];
}
