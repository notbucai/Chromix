import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentOptions } from './environments.mjs';
const config = { name: 'video-policy-fixture', seed: '12345', browserVersion: '155.0.8059.39', locale: 'en-US', timezone: 'Asia/Shanghai', proxy: null };
test('video remains enabled by default in both memory modes', () => {
  for (const memoryMode of [undefined, 'low']) {
    assert.ok(!environmentOptions({ ...config, memoryMode }).args.includes('--uxr-disable-video-playback'));
  }
});
test('explicit video policy is independent, reversible, and leaves configuration intact', () => {
  const original = structuredClone(config);
  for (const memoryMode of [undefined, 'low']) {
    const enabled = environmentOptions({ ...config, memoryMode });
    const disabled = environmentOptions({ ...config, memoryMode, disableVideoPlayback: true });
    assert.deepEqual(disabled.args.filter(arg => arg !== '--uxr-disable-video-playback'), enabled.args);
    assert.deepEqual({ ...disabled, args: enabled.args }, enabled);
    assert.deepEqual(environmentOptions({ ...config, memoryMode, disableVideoPlayback: false }), enabled);
  }
  assert.deepEqual(config, original);
});
test('string values cannot accidentally disable video', () => {
  for (const value of ['false', 'true', 1, null]) assert.throws(() => environmentOptions({ ...config, disableVideoPlayback: value }), /布尔值/);
});
