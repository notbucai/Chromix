// One credential submission per invocation. No retries or challenge solving.
export function classifyLoginResponse(text) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (/找不到使用该用户名的活跃\s*X\s*账号|(?:couldn.t|cannot|can.t|could not).{0,30}find.{0,100}(?:account|username)|no active X account/i.test(value)) return 'account-not-found';
  if (/(?:wrong|incorrect|invalid)\s+(?:username\s+or\s+)?password|password.{0,35}(?:incorrect|wrong|invalid)|密码.{0,12}(?:错误|不正确|不匹配)|(?:错误|不正确)的密码/i.test(value)) return 'invalid-password';
  if (/次数过多|尝试次数|请稍后重试|too many attempts|rate limit|try again later/i.test(value)) return 'rate-limited';
  if (/人机验证|安全验证|验证你的身份|确认你的身份|输入.{0,12}验证码|captcha|verify your identity|authenticate your account|two.factor/i.test(value)) return 'verification-required';
  if (/出错了|出现错误|发生错误|something went wrong|temporarily unavailable/i.test(value)) return 'site-error';
  return null;
}
export function matchesExpected(outcome, expected) {
  return outcome === expected || (expected === 'auth-error' && ['account-not-found', 'invalid-password'].includes(outcome));
}
async function observe(page) {
  const alerts = (await page.getByRole('alert').allTextContents()).map(x => x.trim()).filter(Boolean);
  const body = await page.locator('body').innerText({ timeout: 3000 });
  const recognized = body.split('\n').map(x => x.trim()).filter(x => classifyLoginResponse(x));
  return { outcome: classifyLoginResponse(alerts.join('\n')) || classifyLoginResponse(body), messages: [...new Set([...alerts, ...recognized])].map(x => x.slice(0, 500)).slice(0, 10) };
}
async function waitForResponse(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await observe(page);
    if (result.outcome) return result;
    await page.waitForTimeout(250);
  }
  return { outcome: 'no-recognized-response', messages: [] };
}
async function realPasswordInput(page) {
  const candidates = page.locator('input[type="password"]');
  for (let i = 0; i < await candidates.count(); i++) {
    const candidate = candidates.nth(i);
    const interactive = await candidate.evaluate(node => {
      if (node.disabled || node.readOnly || node.closest('[inert]')) return false;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      for (let element = node; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0 || style.pointerEvents === 'none') return false;
      }
      return true;
    });
    if (interactive && await candidate.isEditable()) return candidate;
  }
  return null;
}

export async function verifyLoginFlow(page, { username, password, expected = 'invalid-password', timeoutMs = 30000, result = {} }) {
  result.username = username;
  result.expected = expected;
  result.passwordSubmissionAttempts = 0;
  result.credentialsSubmitted = false;
  result.stage = 'username';
  const user = page.getByRole('textbox').first();
  await user.waitFor({ state: 'visible', timeout: timeoutMs });
  if (!await user.isEditable()) throw new Error('Username textbox is not editable');
  await user.fill(username);
  if (await user.inputValue() !== username) throw new Error('Username field did not retain the requested username');
  result.usernameVerified = true;
  result.usernameSubmissionAttempts = 0;
  let passwordInput = await realPasswordInput(page);
  result.formLayout = passwordInput ? 'combined' : 'two-step';
  if (result.formLayout === 'two-step') {
    if (await user.inputValue() !== username) throw new Error('Username changed before username submission');
    result.stage = 'username-submit';
    result.usernameSubmissionAttempts = 1;
    await page.getByRole('button', { name: /^(下一步|Next|继续|Continue)$/i }).click({ timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    while (!(passwordInput = await realPasswordInput(page))) {
      const response = await observe(page);
      if (response.outcome || Date.now() >= deadline) {
        Object.assign(result, response, { status: 'incomplete', stage: 'before-password' });
        return result; // An early username rejection does not prove the password flow.
      }
      await page.waitForTimeout(250);
    }
  }
  result.stage = 'password';
  await passwordInput.fill(password);
  if (await passwordInput.inputValue() !== password) throw new Error('Password field was not filled; refusing submission');
  if (result.formLayout === 'combined' && await user.inputValue() !== username) throw new Error('Username changed while filling password; refusing submission');
  result.passwordFieldVerified = true;
  if (result.passwordSubmissionAttempts !== 0) throw new Error('Refusing a second password submission');
  result.passwordSubmissionAttempts = 1;
  result.stage = 'submit';
  await page.getByRole('button', { name: /^(登录|Log in|继续|Continue)$/i }).click({ timeout: timeoutMs });
  result.credentialsSubmitted = true;
  result.stage = 'response';
  const response = await waitForResponse(page, timeoutMs);
  Object.assign(result, response);
  result.status = matchesExpected(response.outcome, expected) ? 'passed' : ['verification-required', 'rate-limited'].includes(response.outcome) ? 'blocked' : 'failed';
  result.stage = 'finished';
  return result;
}
