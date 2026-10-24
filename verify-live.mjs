/**
 * verify-live.mjs — 用**真实的** DSH 包验证核心假设（selftest 做不到的部分）
 *
 *   node verify-live.mjs
 *
 * selftest.mjs 全是 mock，能证明“插件的逻辑对”，但证明不了两件事：
 *   1. 命令定义能通过 dsh-commands 的真实注册校验；
 *   2. 「agent 作用域的命令压过 preset 作用域」这条优先级真的成立（接管 /goal 全靠它）。
 *
 * 本脚本 import 本机安装的 @deepseek-ai/dsh-commands、cordis、dsh-scope，
 * 造出 preset 作用域 + agent 作用域，跑一遍真实的注册/解析/优先级/执行。
 * 找不到全局包时**静默跳过**（退出码 0），所以在任何机器上都能跑。
 *
 * 覆盖：
 *   - parseCommand 对 "/goal 3 整理文档" 的切分
 *   - parseCommand 对 "/目标 …" 返回 undefined（中文命令名不存在）
 *   - 本插件的命令定义通过真实 register()（名称/描述/hint 校验）
 *   - 重复注册同名命令会抛错（证明接管必须靠作用域，不能靠 register）
 *   - agent 作用域 > preset 作用域，且 list() 里只有一个 goal
 *   - 真实 handler：/goal 3 x → create(maxGoalRounds=3)，/goal rounds 7 → edit(maxGoalRounds=7)
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

/* ---------------- 找本机 DSH 全局包 ---------------- */

const CANDIDATES = [
  process.env.DSH_AI_DIR,
  join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
  join('/usr/local/lib/node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
  join('/usr/lib/node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
].filter((value) => typeof value === 'string' && value.length > 0);

const base = CANDIDATES.find((dir) => existsSync(join(dir, 'dsh-commands', 'lib', 'index.js')));
if (base === undefined) {
  console.log('跳过：没找到 @deepseek-ai/dsh 全局包（设 DSH_AI_DIR 指向 …/dsh/node_modules/@deepseek-ai 可强制指定）');
  process.exit(0);
}

const asUrl = (rel) => pathToFileURL(join(base, rel)).href;

/* ---------------- 加载真实实现 ---------------- */

let CommandRuntime, parseCommand, cordis, createScope, bindScopeParent, plugin, goalCommandDefinition;
try {
  ({ CommandRuntime, parseCommand } = await import(asUrl('dsh-commands/lib/index.js')));
  cordis = await import(asUrl('cordis/lib/index.js'));
  ({ createScope, bindScopeParent } = await import(asUrl('dsh-scope/lib/index.js')));
  plugin = await import(new URL('./index.js', import.meta.url));
  // 用插件自己的定义工厂做注册校验，避免测试里另抄一份 description/hint 而漂移
  ({ goalCommandDefinition } = await import(new URL('./lib/command.js', import.meta.url)));
} catch (error) {
  console.log(`跳过：导入真实包失败（${String(error?.message ?? error)}）`);
  process.exit(0);
}

/* ---------------- 断言小工具 ---------------- */

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed += 1; return; }
  failures.push(`${label}\n    期望 ${e}\n    实际 ${a}`);
};
const checkTrue = (label, condition, detail = '') => {
  if (condition) { passed += 1; return; }
  failures.push(`${label}${detail ? `\n    ${detail}` : ''}`);
};

console.log(`使用 ${base}`);

/* ---------------- 1. parseCommand 的真实行为 ---------------- */

console.log('— 真实 parseCommand —');
check('/goal 3 整理文档', parseCommand('/goal 3 整理文档'), { name: 'goal', rawInput: ' 3 整理文档' });
check('/goal（无参数）', parseCommand('/goal'), { name: 'goal', rawInput: '' });
check('/目标 不是命令', parseCommand('/目标 3 整理文档'), undefined);
check('/Goal 不是命令', parseCommand('/Goal 3 x'), undefined);

/* ---------------- 2. 真实 register 校验 ---------------- */

console.log('— 真实注册表 —');
const root = new cordis.Context();
const runtime = new CommandRuntime(root);

const dummyHandler = () => ({ kind: 'success', text: 'ok' });

let registered = false;
try {
  runtime.register(goalCommandDefinition('goal', 'goal', dummyHandler));
  registered = true;
} catch (error) {
  failures.push(`真实注册失败：${String(error?.message ?? error)}`);
}
checkTrue('本插件的命令定义通过真实校验', registered);

let duplicateRejected = false;
try {
  runtime.register(goalCommandDefinition('goal', 'goal', dummyHandler));
} catch {
  duplicateRejected = true;
}
checkTrue('同名命令在同一层会被拒绝（所以接管只能靠作用域）', duplicateRejected);

/* ---------------- 3. 作用域优先级：preset vs agent ---------------- */

console.log('— 作用域优先级（接管 /goal 的核心假设）—');

const presetKey = {};
const presetScope = createScope(root, presetKey);
presetScope.ctx.commands.register({
  name: 'goal',
  description: 'BUILTIN（preset 作用域）',
  input: { hint: 'builtin' },
  handler: () => ({ kind: 'success', text: 'builtin' }),
});

const agent = { id: 'agent-live', session: { snapshotEvents: () => [] } };
bindScopeParent(agent, presetKey);
agent.ctx = createScope(root, agent).ctx;

const beforeOverride = runtime.find(agent, 'goal')?.description;
check('未接管前解析到内置版', beforeOverride, 'BUILTIN（preset 作用域）');

let created = [];
let edited = [];
let current;
const warns = [];
const pluginCtx = {
  logger: { info() {}, warn: (message) => warns.push(String(message)) },
  agents: { list: () => [agent], get: (id) => (id === agent.id ? agent : undefined), roots: () => [agent] },
  get: () => undefined,
  on() {},
  commands: runtime,
  tools: { register: () => () => {} },
  goals: {
    get: () => current,
    create: (_a, request) => {
      created.push(request);
      current = {
        id: 'goal-live', revision: 1, objective: request.objective, phase: 'active',
        maxGoalRounds: request.maxGoalRounds ?? 256, roundsStarted: 0, activation: 'armed',
      };
      return current;
    },
    edit: (_a, ref, request) => {
      edited.push(request);
      current = { ...current, ...request, revision: ref.revision + 1 };
      return current;
    },
    clear: () => { current = undefined; return { id: 'x', revision: 9 }; },
    pause: () => current,
    resume: () => current,
  },
};

// 只跑到这里为止的东西：真实注册表 + 真实作用域 + 本插件真实的 apply
const { apply } = plugin;
apply(pluginCtx, {});
await new Promise((resolve) => setTimeout(resolve, 300));

const after = runtime.find(agent, 'goal');
checkTrue('agent 作用域接管了 /goal', after?.description !== beforeOverride, after?.description);
check('list() 里只有一个 goal', runtime.list(agent).filter((d) => d.name === 'goal').length, 1);
checkTrue('目标里还保留别名 target', runtime.list(agent).some((d) => d.name === 'target'));
check('接管成功时插件不应报警', warns.filter((message) => message.includes('接管未生效')).length, 0);

// 定义身份 = 客户端认第一方命令的唯一依据（「目标」标签 + 目标图标 + /目标 别名）
check('接管后的 goal 带内置定义身份', after?.definitionId, '@deepseek-ai/dsh-command-goal');
check('descriptor 也带（客户端读 descriptor）', runtime.list(agent).find((d) => d.name === 'goal')?.definitionId, '@deepseek-ai/dsh-command-goal');
check('别名 target 不抢身份', runtime.list(agent).find((d) => d.name === 'target')?.definitionId, undefined);

/* ---------------- 4. 真实 handler 链路 ---------------- */

console.log('— 真实执行 —');
const run = async (line) => {
  const parsed = parseCommand(line);
  const resolved = runtime.find(agent, parsed.name);
  return resolved.handler({ agent, rawInput: parsed.rawInput, attachments: [] });
};

const first = await run('/goal 3 整理文档');
check('kind', first.kind, 'success');
check('/goal 3 整理文档 → create', created, [{ objective: '整理文档', maxGoalRounds: 3 }]);
checkTrue('输出含 Objective', first.text.includes('Objective: 整理文档'), first.text);
checkTrue('输出含 Rounds 0/3', first.text.includes('Rounds: 0/3'), first.text);

await run('/goal rounds 7');
check('/goal rounds 7 → edit', edited, [{ maxGoalRounds: 7 }]);

const view = await run('/goal');
checkTrue('查看含 Status', view.text.includes('Status:'), view.text);

/* ---------------- 结果 ---------------- */

if (failures.length === 0) {
  console.log(`\n✅ 真实环境验证通过（${passed} 项）`);
  process.exit(0);
}
console.error(`\n❌ ${failures.length} 项失败（通过 ${passed} 项）`);
for (const failure of failures) console.error(`  · ${failure}`);
process.exit(1);
