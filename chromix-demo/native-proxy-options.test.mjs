import assert from 'node:assert/strict';
import {restrictedSocksDnsArgs} from './native-proxy-options.mjs';
for(const scheme of ['socks5','socks5h'])assert.deepEqual(restrictedSocksDnsArgs({server:`${scheme}://198.51.100.7:1080`,username:'test',password:'not-a-real-password'}),['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 198.51.100.7']);
for(const proxy of [null,'http://198.51.100.7:8080','socks5://proxy.example:1080',{server:'socks5://198.51.100.7:1080',bypass:'example.com'}])assert.deepEqual(restrictedSocksDnsArgs(proxy),[]);
assert(!restrictedSocksDnsArgs('socks5://198.51.100.7:1080')[0].includes('"'));
console.log('PASS: canonical unquoted restrictive DNS rule; no credentials exposed; other proxy routes unchanged');
