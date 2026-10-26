import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launchPersistentContext} from '@xiaoxiaofeihh/chromix';
import {root,loadEnvironment,environmentOptions} from './environments.mjs';
import {applyHeadlessMemoryPolicy} from './headless-memory-policy.mjs';
import {classifyLoginResponse,matchesExpected,verifyLoginFlow} from './login-flow.mjs';
import {parseOptions,isLoginApiResponse} from './verify-x-login-flow.mjs';

test('only credential rejections satisfy their explicit expectation',()=>{
 assert.equal(classifyLoginResponse('我们找不到使用该用户名的活跃 X 账号。'),'account-not-found');
 assert.equal(classifyLoginResponse("We couldn't find an active X account with that username."),'account-not-found');
 assert.equal(classifyLoginResponse('密码不正确。请重试。'),'invalid-password');
 assert.equal(classifyLoginResponse('Wrong password!'),'invalid-password');
 assert.equal(classifyLoginResponse('输入你的密码'),null);
 assert.equal(matchesExpected('verification-required','auth-error'),false);
 assert.equal(matchesExpected('rate-limited','auth-error'),false);
 assert.equal(matchesExpected('site-error','auth-error'),false);
 assert.equal(matchesExpected('invalid-password','account-not-found'),false);
 assert.equal(matchesExpected('account-not-found','invalid-password'),false);
 assert.equal(parseOptions([]).expected,'invalid-password');
 assert.equal(parseOptions([]).username,'bucai001');
 assert.equal(matchesExpected('account-not-found','auth-error'),true);
 assert.throws(()=>parseOptions(['--expected','success']));
 assert.throws(()=>parseOptions(['--unknown','x']));
 assert.throws(()=>parseOptions(['--timeout-ms','0']));
 assert.equal(parseOptions(['--screenshot']).screenshot,true);
 assert.equal(isLoginApiResponse('https://x.com/i/api/2/jf/task.json'),true);
 assert.equal(isLoginApiResponse('https://api.x.com/1.1/onboarding/task.json'),true);
 assert.equal(isLoginApiResponse('https://x.com/i/api/1.1/jot/client_event.json'),false);
 assert.equal(isLoginApiResponse('https://example.com/login'),false);
});

test('local real-browser form fixtures: combined, two-step, challenges and failures',async t=>{
 const server=createServer((req,res)=>{
  const mode=new URL(req.url,'http://localhost').pathname.slice(1);
  const twoStep=mode.startsWith('two-step') || ['decoy-two-step','username-rejected'].includes(mode);
  const message={combined:'我们找不到使用该用户名的活跃 X 账号。','two-step':'Wrong password!','two-step-default':'Wrong password!',challenge:'请完成安全验证',rate:'Too many attempts. Try again later.',site:'Something went wrong.',silent:'','two-step-challenge':'请完成安全验证','decoy-two-step':'Wrong password!','username-rejected':'我们找不到使用该用户名的活跃 X 账号。'}[mode]||'';
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><input name="username" autocomplete="username">${twoStep?(mode==='decoy-two-step'?'<input inert type="password" name="password" style="position:absolute;opacity:0;pointer-events:none;width:300px;height:30px">':''):'<input type="password" name="password">'}<button id="submit">${twoStep?'下一步':'继续'}</button><div role="alert" id="alert"></div><script>
  window.testState={next:0,submits:0};const mode=${JSON.stringify(mode)},message=${JSON.stringify(message)};const button=document.getElementById('submit');
  button.onclick=()=>{if((mode.startsWith('two-step')||['decoy-two-step','username-rejected'].includes(mode))&&!document.querySelector('input[type=password]:not([inert])')){testState.next++;if(['two-step-challenge','username-rejected'].includes(mode)){document.getElementById('alert').textContent=message;return;}const p=document.createElement('input');p.type='password';p.name='password';button.before(p);button.textContent='登录';return;}testState.submits++;document.getElementById('alert').textContent=message;};
  </script>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const temporary=await mkdtemp(join(tmpdir(),'chromix-login-fixture-'));let context;
 try{
  const options=environmentOptions(await loadEnvironment('env-lite'),temporary);
  options.args.push('--uxr-low-memory');options.args=applyHeadlessMemoryPolicy(options.args,{headless:true,lowMemory:true});
  options.launchOptions={executablePath:parseOptions([]).binary};
  context=await launchPersistentContext({...options,headless:true});
  for(const [mode,expected,status,outcome,attempts] of [
   ['combined','account-not-found','passed','account-not-found',1],
   ['two-step','invalid-password','passed','invalid-password',1],
   ['two-step-default',undefined,'passed','invalid-password',1],
   ['challenge','account-not-found','blocked','verification-required',1],
   ['rate','account-not-found','blocked','rate-limited',1],
   ['site','account-not-found','failed','site-error',1],
   ['silent','account-not-found','failed','no-recognized-response',1],
   ['two-step-challenge','account-not-found','incomplete','verification-required',0],
   ['decoy-two-step','invalid-password','passed','invalid-password',1],
   ['username-rejected','account-not-found','incomplete','account-not-found',0],
  ])await t.test(mode,async()=>{
   const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/${mode}`);
   const result=await verifyLoginFlow(page,{username:'fixture-user',password:'random-fixture-only',expected,timeoutMs:700});
   assert.equal(result.status,status);assert.equal(result.outcome,outcome);assert.equal(result.passwordSubmissionAttempts,attempts);
   const actual=await page.evaluate(()=>testState);assert.equal(actual.submits,attempts);assert(actual.next<=1);
   await page.close();
  });
 }finally{await context?.close();await new Promise(r=>server.close(r));await rm(temporary,{recursive:true,force:true});}
});
