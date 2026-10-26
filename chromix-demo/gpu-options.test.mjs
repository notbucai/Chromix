import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentOptions } from './environments.mjs';
const config = { name: 'gpu-policy-fixture', seed: '12345', browserVersion: '154.0.8037.97', locale: 'en-US', timezone: 'America/New_York' };
test('GPU option leaves other profile policies untouched and is reversible', () => {
 const source = structuredClone(config), normal = environmentOptions(config);
 const disabled = environmentOptions({ ...config, disableGpu: true });
 const flags = ['--disable-gpu', '--disable-software-rasterizer', '--disable-webgl'];
 for (const flag of flags) assert.ok(disabled.args.includes(flag));
 assert.deepEqual({ ...disabled, args: disabled.args.filter(arg => !flags.includes(arg)) }, normal);
 assert.ok(!disabled.args.includes('--enable-low-end-device-mode'));
 assert.ok(!disabled.args.some(arg => arg.startsWith('--disk-cache-size=')));
 assert.deepEqual(environmentOptions({ ...config, disableGpu: false }), normal);
 assert.deepEqual(config, source);
});
test('existing low-memory flags are retained without duplicate GPU flags', () => {
 const args = environmentOptions({ ...config, memoryMode: 'low', disableGpu: true }).args;
 assert.equal(args.filter(arg => arg === '--disable-gpu').length, 1);
 assert.ok(args.includes('--enable-low-end-device-mode'));
});
test('disableGpu requires a JSON boolean', () => {
 for (const value of ['false', 'true', null, 1]) assert.throws(() => environmentOptions({ ...config, disableGpu: value }), /布尔值/);
});
