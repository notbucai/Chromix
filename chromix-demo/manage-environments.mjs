import { createEnvironment, listEnvironments } from './environments.mjs';
try {
  const [command, name, ...extra] = process.argv.slice(2);
  if (command === 'create' && name && (extra.length === 0 || (extra.length === 1 && extra[0] === '--low-memory'))) {
    const config = await createEnvironment(name, { lowMemory: extra.includes('--low-memory') });
    console.log(`已创建 ${name}，固定种子 ${config.seed}`);
    console.log(`启动：npm start -- --profile ${name}`);
  } else if (command === 'list' && !name) {
    console.table((await listEnvironments()).map(config => ({
      name: config.name, memoryMode: config.memoryMode || 'normal', seed: config.seed, locale: config.locale, timezone: config.timezone,
      screen: config.display ? `${config.display.width}×${config.display.height}` : 'native',
      proxy: config.proxy ? '已设置' : '未设置',
    })));
  } else throw new Error('用法：npm run env:create -- 环境名 [--low-memory] 或 npm run env:list');
} catch (error) { console.error(error.message); process.exitCode = 1; }
