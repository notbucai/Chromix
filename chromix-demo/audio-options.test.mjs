import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentOptions } from './environments.mjs';
const config = { name: 'audio-fixture', seed: '2240654325', browserVersion: '154.0.8037.97', locale: 'en-US', timezone: 'America/New_York', disableGpu: true };
test('native audio remains the default and explicit native is reversible', () => {
 const normal=environmentOptions(config);
 assert.ok(!normal.args.some(arg=>arg.startsWith('--fingerprint-audio-')));
 assert.deepEqual(environmentOptions({...config,audioRender:'native'}),normal);
});
test('isolation reuses the fixed seed and changes only audio launch arguments', () => {
 const source=structuredClone(config),normal=environmentOptions(config),isolated=environmentOptions({...config,audioRender:'isolated'});
 assert.ok(isolated.args.includes('--fingerprint-audio-render=isolated'));
 assert.ok(isolated.args.includes('--fingerprint-audio-seed=2240654325'));
 assert.deepEqual({...isolated,args:isolated.args.filter(arg=>!arg.startsWith('--fingerprint-audio-'))},normal);
 assert.deepEqual(config,source);
});
test('unsupported modes are rejected', () => {
 for(const audioRender of ['random',true,null,'']) assert.throws(()=>environmentOptions({...config,audioRender}),/audioRender/);
});
