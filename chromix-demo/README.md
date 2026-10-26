# Chromix Node.js 多环境示例

Node.js 22+。Chromix SDK + Playwright，依赖已安装，重新安装用 `npm ci`。

## 启动独立环境

```bash
cd /Users/bucai/projects/x-tools/chromix-demo
npm run env:list
npm start -- --profile env-1
```

另一个终端可以同时启动：

```bash
npm start -- --profile env-2
```

已创建 `env-1`（屏幕 1440×900）和 `env-2`（1680×1050），两者拥有不同的固定种子、独立的 Cookie、localStorage 和浏览器数据目录。再次启动同名环境会复用配置和登录状态，网站自身仍可能要求重新登录。

`npm start` 默认打开原来的 `demo`；已保留它原来的种子和数据。不要同时启动同名环境，Chromium 会锁定该目录。

## 创建新环境

```bash
npm run env:create -- account-3
npm start -- --profile account-3
```

环境名使用小写字母、数字、下划线或连字符，长度 1–48。创建同名环境报错，不会覆盖已有配置。种子创建后固定；显示模板从有限模板池分配，模板可能复用，不保证所有环境的所有指纹值各不相同。

## 每个环境的配置

- `environments/环境名.json`：固定种子、语言、时区、浏览器版本、代理和屏幕配置。
- `profiles/环境名/`：该环境的完整浏览器数据。
- `artifacts/环境名/fingerprint.json`：浏览器实际返回的指纹信息。
- `artifacts/环境名/screenshot.png`：运行时截图。

新环境从 `.env` 的 `CHROMIX_LOCALE`、`CHROMIX_TIMEZONE`、`CHROMIX_PROXY`、`CLOAKBROWSER_VERSION` 读取初始值并保存。后续修改 `.env` 不会改变已经创建的环境；需要调整时先关闭该环境，再编辑对应 JSON。不要随意修改已有环境种子。完整迁移需保留配置和 profile，跨机器的加密登录信息不保证可用。

`.env` 的 `CHROMIX_URL` 控制每次启动打开的网址；`CHROMIX_CACHE_DIR` 控制浏览器下载缓存。`CLOAKBROWSER_BINARY_PATH` 可指定本地完整浏览器包内的可执行文件，它优先于下载版本配置。

## 验证与限制

```bash
npm run smoke -- --profile env-1
npm run verify:environments
npm run browser:install
```

smoke 使用所选环境的固定配置和临时数据目录，不访问其登录数据，截图为 `artifacts/环境名/smoke.png`。验证脚本使用临时 profile 和本地 HTTP 测试页，检查两个环境同时运行、Cookie/localStorage 隔离与重启保留、指纹稳定性；结果在 `artifacts/environments-verification.json`。

启动参数包含 `--disable-blink-features=AutomationControlled`；实测可见窗口、无头和 iframe 的 `navigator.webdriver` 为 `false`，标准属性仍然存在。

当前 Mac `154.0.8037.57` 实测：不同种子的 CPU、内存、GPU 和 Canvas 哈希仍相同，CPU/内存的公开参数没有改变读数。本示例仅对实际可用的屏幕、viewport、DPR、语言、时区和种子进行固定配置，不代表每个环境拥有完全不同的设备指纹，也不保证通过网站自动化检测。

SDK 默认 Mac stable 下载地址返回 404，因此版本已固定到可下载的 Mac 发布版。不要执行 `playwright install`；Chromix 管理自己的浏览器。

## 编写自动化

编辑 `demo.mjs`，在 `page.goto(...)` 后添加标准 Playwright 操作，定位器按目标页面实际内容调整：

```js
await page.getByRole('textbox', { name: '搜索' }).fill('hello');
await page.getByRole('button', { name: '搜索' }).click();
```

项目资料：https://github.com/xiaozhou26/Chromix

## 原生 CPU / GPU / Canvas 能力检测

```bash
npm run fingerprint:check
npm run fingerprint:check -- --headed
```

检测只使用本地 HTTP 页面和临时 profile，不接触已有登录数据。报告为 `artifacts/native-fingerprint-support.json` 与 `artifacts/native-fingerprint-support-headed.json`。

当前 Mac ARM64 `154.0.8037.57` 在两种模式下，显式 CPU、GPU 自定义名称、Canvas seeded noise 参数均未观察到生效；公开参数与内部别名均已测试。CPU 在主页面、iframe、Worker 内仍相同，WebGL1/2 仍使用真实 Apple GPU 名称，不同种子的 Canvas raw/PNG/Blob 哈希仍相同。不要把种子固定误解为这些读数已经被分环境修改。

项目明确说明，新的像素噪声补丁需要重新编译浏览器：
https://github.com/xiaozhou26/Chromix/blob/main/docs/pixel-noise.md

GPU 自定义名称也需要包含原生补丁的新构建，且只修改 WebGL 展示名称，实际 GPU 能力与公开 WebGPU 保持原生：
https://github.com/xiaozhou26/Chromix/blob/main/docs/gpu-identity.md

更换到匹配的 Mac 新构建后，用 `.env` 的 `CLOAKBROWSER_BINARY_PATH` 指定实际可执行文件，再运行能力检测。检测通过前，不会向已有环境加入无效参数或注入 JavaScript 伪装。

## 无头打开 X 登录页

各环境配置已保存与当前浏览器主版本一致的固定桌面 `userAgent`，可见窗口与无头模式共用。当前 Mac 内核默认无头 UA 含 `HeadlessChrome`；实测原配置访问 X 返回 403，使用固定桌面 UA 后，两次全新会话均返回 200 且登录输入框可见。这个结果不保证网站后续始终接受请求，也未验证账号提交后的登录流程。

```bash
CHROMIX_URL=https://x.com/login npm start -- --profile env-1 --headless
```

该命令使用持久化 profile，按终端回车退出；同名可见窗口必须先关闭。无头模式没有可供手动输入的窗口，自动化代码仍写在 `demo.mjs`。

独立验证登录页加载（使用临时数据目录，不占用已有环境）：

```bash
npm run x:check -- env-1
```

测试重复启动两次，并检查 HTTP 200、登录输入框可见、UA 和 webdriver；报告与截图位于 `artifacts/env-1/x-headless-check.json` 和 `x-headless-1.png`、`x-headless-2.png`。

更换浏览器主版本时需要同步各环境的 `userAgent`，避免版本信息不一致。

## 低内存环境（浏览器预算，不含 Node）

已创建独立的 `env-lite`，原有 `demo` / `env-1` / `env-2` 保持原配置。其固定配置中 `memoryMode` 为 `low`，启动时使用软件合成、禁用 GPU 加速及 WebGL、启用低端设备预算和软渲染进程数量限制；固定 viewport 为 1280×720、DPR 1。该限制不是浏览器总内存硬上限，也不会强制关闭站点隔离。

```bash
CHROMIX_URL=https://x.com/login npm start -- --profile env-lite --headless
```

低内存模式省略 Google / Apple 第三方登录资源，适用于用户名/邮箱登录路径；WebGL 和图形指纹与普通环境不同，视频性能也可能变化。为避免额外分配，不自动保存全页截图。不要将已有普通环境直接改成低内存环境以期待指纹完全不变。

新建同类环境：

```bash
npm run env:create -- account-lite --low-memory
```

内存验证（Mac）：

```bash
npm run memory:check -- env-lite
```

命令使用临时 profile，实际打开 X 登录页，确认输入框可见且可以输入/清空，再持续采样浏览器及子进程的 macOS footprint。排除 Node，保留 RSS 作为独立参考，不用 RSS 与 footprint 混算。不提交登录信息，不关闭已有环境。报告在 `artifacts/env-lite/memory/report.json`，其中 `targetMet` 明确显示是否达到 350 MiB。

原下载内核的历史实测为 468.8–482.9 MiB，350 MiB 目标未达成；这是登录页稳态样本，不是启动峰值或登录后信息流的保证。没有采用页面冻结、持续模拟内存压力、关闭站点隔离或单进程模式来压低测试值。继续接近 350 MiB 需要原生内核级改造与重新验收。


## 第二轮本地内核的无头精简策略

`npm start -- --profile env-lite --headless --native-low-memory` 现在会在无头精简环境额外关闭：

- `WebUIOmniboxPopup`、`WebUIOmniboxAimPopup`、`PreloadTopChromeWebUI`：停止隐藏地址栏 WebUI 和预加载，避免它们常驻独立渲染进程。
- `PartitionAllocLargeThreadCacheSize`、`PartitionAllocLargeEmptySlotSpanRing`：恢复较小的闲置分配缓存，可能增加重新分配开销。未关闭内存安全检查或隔离。

这项策略只在同时满足 headless 和 memoryMode=low 时由 `demo.mjs` 应用；有头和普通环境参数保持原样。
`headless-memory-policy.mjs` 从当前已安装 Playwright 的默认功能列表安全解析并合并参数，保留原有禁用项和调用方参数；包格式变化或显式功能冲突会报错，不会静默丢弃原配置。固定指纹 JSON 和登录数据不改动。

```bash
cd /Users/bucai/projects/x-tools/chromix-demo
CLOAKBROWSER_BINARY_PATH="/Users/bucai/projects/x-tools/chromix-kernel-build/src/out/ChromixRound2/Chromium.app/Contents/MacOS/Chromium" \
CHROMIX_URL="https://x.com/login" \
npm start -- --profile env-lite --headless --native-low-memory
```

同名可见窗口必须先正常关闭。自定义自动化脚本也应调用
`applyHeadlessMemoryPolicy(options.args, { headless:true, lowMemory:true })`，而非仅复制旧的环境参数。
策略验证命令为 `npm run test:headless-policy`。本轮内存、功能及指纹报告保存于 `artifacts/round3/`。
测试范围是 X 登录框显示与输入、填入/清空测试文本，不提交账号；350 MiB 不是启动峰值或登录后复杂页面的硬上限。


第三轮集成验收：X 登录页加载后约 5/15/30/61 秒的 footprint 为
333.4 / 334.1 / 321.9 / 312.6 MiB；另两次组合策略重复测试最高 338 MiB。
三次均使用第二轮本地内核、无头精简模式，不含 Node；报告见
`artifacts/round3/final-report.json`。已验证固定指纹与基线一致，持久 Cookie/
HttpOnly/localStorage/IndexedDB/ServiceWorker/CacheStorage 保留、环境隔离、
音频持续运行及设备枚举。`memory:check` 已采用相同无头策略；用 `--binary` 指定
上述第二轮可执行文件，并加 `--native-low-memory` 可复测。该结果不代表任意网站
或登录后页面都能维持在350 MiB以内。


## 后续修改必须运行：X 登录流程回归

用户要求：以后每批脚本、配置或内核修改完成后，都要使用此回归验证，不能仅凭 HTTP 200 或输入框可见宣称登录流程正常。

```bash
cd /Users/bucai/projects/x-tools/chromix-demo
npm run test:login-flow
npm run x:login:check
```

`x:login:check` 默认使用 env-lite 的固定配置、第二轮本地内核、新建临时无头数据目录，填写
`bucai001` 和每次随机生成的测试密码，最多点击一次密码提交按钮，不重试。
随机密码和请求体不保存；原有登录目录和当前窗口不被关闭或修改。
同页“继续”及分步“下一步→登录”两种表单均支持。

默认只有观察到登录 API 的 POST 响应，且页面明确返回“你输入的密码不正确”等密码错误提示时才通过。
这验证的是表单提交与错误响应链路，不验证账号登录成功。只有用户名阶段就被拒绝时，报告 incomplete，不能代替密码流程验证。

更换或修改内核时，必须明确指定待验证的新可执行文件：

```bash
npm run x:login:check -- --binary "/完整路径/Chromium.app/Contents/MacOS/Chromium"
```

可选参数：`--profile env-lite`、`--username bucai001`、`--timeout-ms 30000`。
预期结果可显式指定为 `--expected invalid-password`（默认）、`account-not-found` 或 `auth-error`（前两者任一）。
若站点回复或账号状态改变，应先检查报告，不要为了让测试通过随意放宽预期。

退出码：0 为预期链路通过；1 为失败/非预期响应；2 为验证码、限流、流程未完成或参数错误。
验证码、额外身份验证、网络异常和未知文案都不能视为通过；不会自动绕过或重复提交。

每次报告保存在 `artifacts/login-flow-regression/时间戳/report.json`；
`artifacts/login-flow-regression/latest.json` 指向最近一次结果（内容副本）。报告记录实际内核路径/版本、
环境配置摘要、页面 HTTP 状态、表单类型、提交次数、登录接口响应状态和最终提示。
本地用例覆盖中英提示、同页/分步、验证码、限流、页面异常、超时及单次提交保护，不请求 X。

回归时加 `--screenshot` 可保存实际响应页面截图，例如 `npm run x:login:check -- --screenshot`；截图为同次报告目录内的 `response.png`。

截图审查发现并修复：透明或 inert 的辅助密码框不能当作密码表单。回归脚本现在检查祖先 inert、透明度、交互性及实际填写值，提交前核对用户名未被替换。用户名阶段被拒绝仍返回 incomplete，不算密码流程 PASS。


## 独立英文代理窗口

`env-en-socks` 为独立英文环境，浏览器 UI 和网页语言为 en-US；代理凭据只在
`environments/env-en-socks.json`（0600）中保存，不写入文档或报告。

```bash
node --env-file=.env launch-en-socks.mjs
```

`launchers/chromium-en-US.sh` 仅为该进程设置 Cocoa 的 AppleLanguages/AppleLocale，
不修改 macOS 系统语言或其他浏览器环境。启动报告位于
`artifacts/env-en-socks/launch-report.json`，不包含代理凭据。
Chromix 的认证 SOCKS5 配置会将 socks5h 规范化为 socks5，Playwright 会加入
防本地 DNS 解析的 host-resolver-rules；其启动警告不等于代理连接失败。

Windows handoff: the Node headless policy is portable, but macOS native patches/binaries/Cocoa launchers and `footprint` results are not interchangeable with Windows. The kernel snapshot documents an opt-in Windows155 overlay in `docs/windows-session-handoff.md`; its new native warning change is unbuilt and requires Windows validation. `native-proxy-options.mjs` emits an unquoted restrictive resolver rule for explicit IPv4 SOCKS proxies; other warnings are retained.

## 可选原生视频禁播

使用含新补丁的内核后，`npm start -- --profile env-lite --disable-video` 禁播视频；`--enable-video` 本次恢复播放。默认不禁用，与低内存模式独立。视频附带的声音也不可用，独立音频不受该策略限制。此原生补丁尚未构建验证。详见 [策略及验证边界](../docs/video-playback-policy.md)。
