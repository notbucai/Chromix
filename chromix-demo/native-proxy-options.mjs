import {isIP} from 'node:net';
// Use a real argv value, not a shell-quoted string. Keep DNS fail-closed.
// Other routes retain Playwright's normal behavior and its warning.
export function restrictedSocksDnsArgs(proxy) {
  if (!proxy) return [];
  const config=typeof proxy==='string'?{server:proxy}:proxy;
  if (config.bypass && config.bypass!=='<-loopback>') return [];
  let url;
  try {url=new URL(config.server);} catch {return [];}
  if (!['socks:','socks5:','socks5h:'].includes(url.protocol) || isIP(url.hostname)!==4 || !url.port || Number(url.port)<1) return [];
  return [`--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${url.hostname}`];
}
