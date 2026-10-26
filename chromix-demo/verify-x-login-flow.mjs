import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchPersistentContext } from '@xiaoxiaofeihh/chromix';
import { root, loadEnvironment, environmentOptions, prepareEnvironment } from './environments.mjs';
import { applyHeadlessMemoryPolicy } from './headless-memory-policy.mjs';
import { verifyLoginFlow } from './login-flow.mjs';

export function isLoginApiResponse(url) {
  const parsed = new URL(url);
  return /(^|\.)(x\.com|twitter\.com)$/.test(parsed.hostname) &&
    /onboarding|authenticate|login|\/task(?:[/.]|$)/i.test(parsed.pathname);
}

export function parseOptions(args) {
  const options = { username:'bucai001', profile:'env-lite', expected:'invalid-password', timeoutMs:30000,
    binary:process.env.CLOAKBROWSER_BINARY_PATH || resolve(root,process.platform === 'win32' ? '../.chromix-build-win/src/out/Chromix/chrome.exe' : '../chromix-kernel-build/src/out/ChromixRound2/Chromium.app/Contents/MacOS/Chromium') };
  const names = { '--username':'username', '--profile':'profile', '--binary':'binary', '--expected':'expected', '--timeout-ms':'timeoutMs' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') return { help:true };
    if (args[i] === '--screenshot') { options.screenshot=true; continue; }
    const key = names[args[i]];
    if (!key || !args[i+1] || args[i+1].startsWith('--')) throw new Error(`无效参数：${args[i]}`);
    options[key] = args[++i];
  }
  if (!options.username.trim() || options.username.length > 100) throw new Error('用户名无效');
  if (!['account-not-found','invalid-password','auth-error'].includes(options.expected)) throw new Error('--expected 必须为 account-not-found、invalid-password 或 auth-error');
  options.timeoutMs = Number(options.timeoutMs);
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000) throw new Error('--timeout-ms 必须在1000–120000之间');
  options.binary = resolve(options.binary);
  return options;
}
export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  if (options.help) {
    console.log('npm run x:login:check -- [--binary 路径] [--profile env-lite] [--username bucai001] [--expected invalid-password|account-not-found|auth-error] [--timeout-ms 30000] [--screenshot]');
    return;
  }
  const runId = new Date().toISOString().replace(/[:.]/g,'-') + '-' + randomBytes(3).toString('hex');
  const outputRoot = resolve(root,'artifacts/login-flow-regression');
  const output = join(outputRoot,runId);
  await mkdir(output,{recursive:true,mode:0o700});
  const report = { schemaVersion:1, startedAt:new Date().toISOString(), status:'running', username:options.username,
    expected:options.expected, binary:options.binary, environment:options.profile, headless:true,
    temporaryProfile:true, originalUserDataTouched:false, passwordSubmissionAttempts:0,
    randomPasswordSaved:false, reportPath:join(output,'report.json') };
  const password = 'ChromixTest-' + randomBytes(24).toString('base64url') + '!9a';
  let context, profile;
  try {
    await access(options.binary,constants.X_OK);
    const config = await loadEnvironment(options.profile);
    report.environmentConfigSha256 = createHash('sha256').update(await readFile(resolve(root,'environments',options.profile+'.json'))).digest('hex');
    report.fingerprintSeed = config.seed;
    report.nativeLowMemory = true;
    report.compactHeadlessPolicy = config.memoryMode === 'low';
    profile = await mkdtemp(join(tmpdir(),'chromix-login-regression-'));
    const launch = environmentOptions(config,profile);
    launch.args.push('--uxr-low-memory');
    launch.args = applyHeadlessMemoryPolicy(launch.args,{headless:true,lowMemory:config.memoryMode === 'low'});
    launch.launchOptions = {...launch.launchOptions,executablePath:options.binary};
    context = await launchPersistentContext({...launch,headless:true});
    await prepareEnvironment(context,config);
    const browserCDP = await context.browser().newBrowserCDPSession();
    report.browserVersion = await browserCDP.send('Browser.getVersion');
    const page = context.pages()[0] || await context.newPage();
    const response = await page.goto('https://x.com/login',{waitUntil:'domcontentloaded',timeout:60000});
    report.httpStatus = response?.status();
    if (report.httpStatus !== 200) throw new Error(`登录页返回HTTP ${report.httpStatus}`);
    report.loginApiResponses = [];
    page.on('response', response => {
      if (response.request().method() !== 'POST' || !isLoginApiResponse(response.url())) return;
      const url = new URL(response.url());
      report.loginApiResponses.push({ url:url.origin+url.pathname, status:response.status(), phase:report.stage });
    });
    await verifyLoginFlow(page,{username:options.username,password,expected:options.expected,timeoutMs:options.timeoutMs,result:report});
    report.loginApiResponseObserved = report.loginApiResponses.length > 0;
    if (report.status === 'passed' && !report.loginApiResponseObserved) { report.status='failed';report.error='未观察到登录API响应，不能仅凭界面提示判定通过'; }
    report.finalUrl = page.url().split('?')[0];
    if (options.screenshot) {
      report.screenshotPath=join(output,'response.png');
      await page.screenshot({path:report.screenshotPath,fullPage:false});
    }
  } catch (error) {
    report.status = 'failed';
    report.error = String(error.message || error).replaceAll(password,'[random-test-password]');
  } finally {
    try { await context?.close(); } catch (error) { report.cleanupError=String(error.message||error);report.status='failed'; }
    if (profile) {
      try { await rm(profile,{recursive:true,force:true}); } catch (error) { report.cleanupError=String(error.message||error);report.status='failed'; }
    }
    report.finishedAt = new Date().toISOString();
    const serialized = JSON.stringify(report,null,2)+'\n';
    await writeFile(report.reportPath,serialized,{mode:0o600});
    const pending = join(outputRoot,`.latest-${runId}.json`);
    await writeFile(pending,serialized,{mode:0o600});
    await rename(pending,join(outputRoot,'latest.json'));
  }
  console.log(`${report.status === 'passed' ? 'PASS' : report.status.toUpperCase()}: ${report.outcome || report.error || report.stage}`);
  for (const message of report.messages || []) console.log(message);
  console.log(`密码提交尝试：${report.passwordSubmissionAttempts}；报告：${report.reportPath}`);
  process.exitCode = report.status === 'passed' ? 0 : ['blocked','incomplete'].includes(report.status) ? 2 : 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode=2; });
}
