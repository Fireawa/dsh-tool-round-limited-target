/**
 * selftest.mjs — 不需要 DSH 就能跑的离线自检
 *
 *   node selftest.mjs
 *
 * 覆盖四块：
 *   1. 「目标 + 数字」解析（哪些结尾算轮数、哪些不算）；
 *   2. 工具 round_limited_goal 的注册与 execute 主路径；
 *   3. /goal 命令的语法解析（接管内置版 + 轮数 / rounds / edit / 生命周期）；
 *   4. 命令注册：全局 goal+target、agent 作用域接管。
 *
 * 用 mock ctx，不碰真实 DSH、不写任何文件。
 */

import { apply, parseGoalCommand, parseRoundTarget } from './index.js';

let passed = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    return;
  }
  failures.push(`${label}\n    期望 ${e}\n    实际 ${a}`);
}

function checkTrue(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${label}${detail ? `\n    ${detail}` : ''}`);
}

/* ------------------------------------------------------------------ */
/* 1. 解析                                                             */
/* ------------------------------------------------------------------ */

console.log('— 解析：目标 + 数字 —');

check('末尾空格+数字', parseRoundTarget('整理文档 3'), { objective: '整理文档', rounds: 3, style: 'bare' });
check('末尾「3轮」', parseRoundTarget('整理文档 3轮'), { objective: '整理文档', rounds: 3, style: 'marked' });
check('末尾「3 轮」（带空格）', parseRoundTarget('整理文档 3 轮'), { objective: '整理文档', rounds: 3, style: 'marked' });
check('末尾「3 次」', parseRoundTarget('整理文档 3 次'), { objective: '整理文档', rounds: 3, style: 'marked' });
check('英文 rounds', parseRoundTarget('tidy docs 3 rounds'), { objective: 'tidy docs', rounds: 3, style: 'marked' });
check('紧贴 x3', parseRoundTarget('整理文档x3'), { objective: '整理文档', rounds: 3, style: 'x' });
check('全角 ×3', parseRoundTarget('整理文档 ×3'), { objective: '整理文档', rounds: 3, style: 'x' });
check('括号数字', parseRoundTarget('整理文档（3）'), { objective: '整理文档', rounds: 3, style: 'bare' });
check('半角括号数字', parseRoundTarget('整理文档 (3)'), { objective: '整理文档', rounds: 3, style: 'bare' });
check('「最多 3 轮」', parseRoundTarget('整理文档 最多 3 轮'), { objective: '整理文档', rounds: 3, style: 'marked' });

console.log('— 解析：数字不算轮数的情况 —');

check('数字后面还有字', parseRoundTarget('整理到第 3 章'), { objective: '整理到第 3 章', rounds: null, style: 'none' });
check('完全没有数字', parseRoundTarget('整理文档'), { objective: '整理文档', rounds: null, style: 'none' });
check('数字在句中', parseRoundTarget('把第3章改成第4章'), { objective: '把第3章改成第4章', rounds: null, style: 'none' });
check('紧贴数字不拆（无分隔）', parseRoundTarget('文档2'), { objective: '文档2', rounds: null, style: 'none' });
check('句中数字 + 末尾轮数', parseRoundTarget('把第3章改成第4章 5'), { objective: '把第3章改成第4章', rounds: 5, style: 'bare' });

/* ------------------------------------------------------------------ */
/* 2. mock ctx                                                         */
/* ------------------------------------------------------------------ */

function makeCtx({ existing } = {}) {
  const calls = {
    tool: [],
    commands: [],
    scopedCommands: [],
    create: [],
    edit: [],
    clear: [],
    pause: [],
    resume: [],
  };

  const goal = () => existing?.[0];
  const view = (overrides = {}) => ({
    id: 'goal-selftest',
    revision: 1,
    objective: 'x',
    phase: 'active',
    maxGoalRounds: 3,
    roundsStarted: 0,
    createdAt: 0,
    updatedAt: 0,
    activation: 'armed',
    ...overrides,
  });

  /** 模拟 agent：ctx.plugin() 会用一个「agent 作用域 ctx」调用插件的 apply。 */
  const agent = {
    id: 'agent-1',
    session: { snapshotEvents: () => [] },
    ctx: {
      plugin(definition) {
        definition.apply({
          commands: {
            register(def) {
              calls.scopedCommands.push(def);
              return () => {};
            },
          },
        });
        return { dispose() {} };
      },
    },
  };

  const ctx = {
    logger: { info() {}, warn() {} },
    agents: {
      get: (id) => (id === agent.id ? agent : undefined),
      list: () => [agent],
      roots: () => [agent],
    },
    // 故意不给 sessionProjections：humanTurn 应返回 undefined（放行）
    get: () => undefined,
    on() {},
    goals: {
      get: () => goal(),
      create: (_agent, request) => {
        calls.create.push(request);
        return view({ objective: request.objective, maxGoalRounds: request.maxGoalRounds ?? 256 });
      },
      edit: (_agent, ref, request) => {
        calls.edit.push({ ref, request });
        const base = goal() ?? view();
        return { ...base, ...request, revision: ref.revision + 1 };
      },
      clear: (_agent, ref) => {
        calls.clear.push(ref);
        return { id: ref.id, revision: ref.revision + 1 };
      },
      pause: (_agent, ref) => {
        calls.pause.push(ref);
        return view({ phase: 'paused', activation: 'disarmed' });
      },
      resume: (_agent, ref) => {
        calls.resume.push(ref);
        return view({ phase: 'active', activation: 'armed' });
      },
    },
    tools: {
      register(def) {
        calls.tool.push(def);
        return () => {};
      },
    },
    commands: {
      register(def) {
        calls.commands.push(def);
        return () => {};
      },
    },
  };

  return { ctx, calls, agent };
}

const textOf = (result) => String(result?.content?.[0]?.text ?? '');

/* ------------------------------------------------------------------ */
/* 3. 工具                                                             */
/* ------------------------------------------------------------------ */

console.log('— 工具：注册 —');

{
  const { ctx, calls } = makeCtx();
  apply(ctx, {});
  check('注册了 1 个工具', calls.tool.length, 1);
  const def = calls.tool[0];
  check('工具名', def.name, 'round_limited_goal');
  check('参数是对象根 schema', def.parameters?.type, 'object');
  check('target 必填', def.parameters?.required, ['target']);
  checkTrue('描述里写了「目标 + 数字」用法', def.description.includes('整理文档 3'));
  checkTrue('描述里写了 round-limit 停止规则', def.description.includes('round-limit'));
}

console.log('— 工具：新建 —');

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const def = calls.tool[0];
  const result = await def.execute({ target: '整理文档 3' }, { agent });
  check('未报错', result.isError, false);
  check('轮数取自末尾数字', calls.create[0], { objective: '整理文档', maxGoalRounds: 3 });
  const text = textOf(result);
  checkTrue('回显目标', text.includes('目标：整理文档'), text);
  checkTrue('回显轮数', text.includes('最多 3 轮'), text);
  checkTrue('说明 round-limit 停止', text.includes('round-limit'), text);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const def = calls.tool[0];
  await def.execute({ target: '整理文档 3', rounds: 7 }, { agent });
  check('显式 rounds 优先', calls.create[0], { objective: '整理文档', maxGoalRounds: 7 });
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, { defaultRounds: 5 });
  const def = calls.tool[0];
  await def.execute({ target: '整理文档' }, { agent });
  check('没写轮数用 defaultRounds', calls.create[0], { objective: '整理文档', maxGoalRounds: 5 });
}

{
  // 默认轮数不能超过上限，否则「不写轮数」必然失败
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, { defaultRounds: 900, maxAllowedRounds: 500 });
  const def = calls.tool[0];
  await def.execute({ target: '整理文档' }, { agent });
  check('defaultRounds 超过上限时按上限用', calls.create[0], { objective: '整理文档', maxGoalRounds: 500 });
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await calls.tool[0].execute({ target: '3' }, { agent });
  check('纯数字目标被拒绝', result.isError, true);
  check('纯数字目标不建目标', calls.create.length, 0);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await calls.tool[0].execute({ target: '整理文档', rounds: 0 }, { agent });
  check('显式 0 轮被拒绝', result.isError, true);
  check('0 轮不建目标', calls.create.length, 0);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const def = calls.tool[0];
  const result = await def.execute({ target: '整理文档 999' }, { agent });
  check('超过上限报错', result.isError, true);
  check('没有建目标', calls.create.length, 0);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const def = calls.tool[0];
  const result = await def.execute({ target: '   ' }, { agent });
  check('空目标报错', result.isError, true);
}

console.log('— 工具：已有目标 / 权限 —');

const toolExisting = {
  id: 'goal-old',
  revision: 4,
  objective: '旧目标',
  phase: 'active',
  maxGoalRounds: 3,
  roundsStarted: 1,
  createdAt: 0,
  updatedAt: 0,
  activation: 'armed',
};

{
  const { ctx, calls, agent } = makeCtx({ existing: [toolExisting] });
  apply(ctx, {});
  const def = calls.tool[0];

  const refused = await def.execute({ target: '新目标 2' }, { agent });
  check('已有目标时不覆盖', refused.isError, true);
  checkTrue('提示 replace=true', textOf(refused).includes('replace=true'), textOf(refused));
  check('没有建目标', calls.create.length, 0);

  const replaced = await def.execute({ target: '新目标 2', replace: true }, { agent });
  check('replace 时清旧目标', calls.clear[0], { id: 'goal-old', revision: 4 });
  check('replace 后新建', calls.create[0], { objective: '新目标', maxGoalRounds: 2 });
  check('replace 未报错', replaced.isError, false);
  checkTrue('回显已替换', textOf(replaced).includes('已清掉原来的未完成目标'), textOf(replaced));
}

{
  // roots() 不含 agent ⇒ humanTurn 判定为「不是真人这一轮发起」
  const { ctx, calls, agent } = makeCtx();
  ctx.agents.roots = () => [];
  apply(ctx, {});
  const result = await calls.tool[0].execute({ target: '整理文档 3' }, { agent });
  check('非真人回合的调用被拒绝', result.isError, true);
  check('没有建目标', calls.create.length, 0);
}

{
  // 拿不到回合边界（没有 sessionProjections）⇒ 放行，不误杀
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await calls.tool[0].execute({ target: '整理文档 3' }, { agent });
  check('无法判断权限时放行', result.isError, false);
}

/* ------------------------------------------------------------------ */
/* 4. /goal 语法                                                       */
/* ------------------------------------------------------------------ */

console.log('— /goal：语法解析 —');

check('/goal 空 → show', parseGoalCommand(''), { kind: 'show' });
check('/goal 3 目标', parseGoalCommand('3 整理文档'), { kind: 'create', objective: '整理文档', rounds: 3 });
check('/goal 3轮 目标', parseGoalCommand('3轮 整理文档'), { kind: 'create', objective: '整理文档', rounds: 3 });
check('/goal 3: 目标', parseGoalCommand('3: 整理文档'), { kind: 'create', objective: '整理文档', rounds: 3 });
check('/goal 目标（无轮数）', parseGoalCommand('整理文档'), { kind: 'create', objective: '整理文档', rounds: null });
check('/goal 目标 3（轮数在末尾）', parseGoalCommand('整理文档 3'), { kind: 'create', objective: '整理文档', rounds: 3 });
check('/goal 引号', parseGoalCommand('3 "整理文档"'), { kind: 'create', objective: '整理文档', rounds: 3 });
check('/goal clear', parseGoalCommand('clear'), { kind: 'clear' });
check('/goal pause', parseGoalCommand('pause'), { kind: 'pause' });
check('/goal resume', parseGoalCommand('resume'), { kind: 'resume' });
check('/goal edit 空', parseGoalCommand('edit'), { kind: 'invalid-edit' });
check('/goal edit 目标', parseGoalCommand('edit 新目标'), { kind: 'edit', objective: '新目标', rounds: null });
check('/goal edit 目标 5', parseGoalCommand('edit 新目标 5'), { kind: 'edit', objective: '新目标', rounds: 5 });
check('/goal edit 5 目标', parseGoalCommand('edit 5 新目标'), { kind: 'edit', objective: '新目标', rounds: 5 });
check('/goal rounds 8', parseGoalCommand('rounds 8'), { kind: 'rounds', rounds: 8 });
check('/goal rounds 空', parseGoalCommand('rounds'), { kind: 'invalid-rounds' });
check('/goal rounds abc', parseGoalCommand('rounds abc'), { kind: 'invalid-rounds' });
check('trailingRounds=false 时不拆末尾', parseGoalCommand('整理文档 3', { trailingRounds: false }), { kind: 'create', objective: '整理文档 3', rounds: null });
check('/goal 中文引号', parseGoalCommand('3 「整理文档」'), { kind: 'create', objective: '整理文档', rounds: 3 });
check('/goal 0 轮（交给执行层拒绝）', parseGoalCommand('0 目标'), { kind: 'create', objective: '目标', rounds: 0 });
check('/goal 7 位数字不当轮数', parseGoalCommand('1234567 目标'), { kind: 'create', objective: '1234567 目标', rounds: null });

console.log('— /goal：注册 —');

{
  const { ctx, calls } = makeCtx();
  apply(ctx, {});
  const names = calls.commands.map((d) => d.name);
  checkTrue('全局注册 goal', names.includes('goal'), JSON.stringify(names));
  checkTrue('全局注册别名 target', names.includes('target'), JSON.stringify(names));
  checkTrue('agent 作用域也注册 goal（压过 preset 内置版）', calls.scopedCommands.some((d) => d.name === 'goal'),
    JSON.stringify(calls.scopedCommands.map((d) => d.name)));
  const def = calls.commands.find((d) => d.name === 'goal');
  checkTrue('命令描述非空', typeof def.description === 'string' && def.description.length > 0);
  checkTrue('命令有 input.hint', typeof def.input?.hint === 'string' && def.input.hint.length > 0);
  checkTrue('命令名符合 ASCII 约束', /^[a-z][a-z0-9_-]*$/u.test(def.name));

  // 两处必须是同一份实现：全局那份兜底、agent 那份胜出，行为不能分叉
  const scoped = calls.scopedCommands.find((d) => d.name === 'goal');
  checkTrue('全局与 agent 作用域共用同一 handler', def.handler === scoped?.handler);
  checkTrue('两处描述一致', def.description === scoped?.description);
  checkTrue('命令不声明 attachments（会被明确拒绝，不静默丢）', scoped?.input?.attachments === undefined);

  // 定义身份：客户端靠它把这一行显示成「目标」+ 目标图标，并接受 /目标 作为别名
  check('全局 goal 带内置定义身份', def.definitionId, '@deepseek-ai/dsh-command-goal');
  check('agent 作用域的 goal 也带定义身份', scoped?.definitionId, '@deepseek-ai/dsh-command-goal');
  check('别名 target 不抢定义身份', calls.commands.find((d) => d.name === 'target')?.definitionId, undefined);
}

{
  const { ctx, calls } = makeCtx();
  apply(ctx, { commandName: 'Goal', aliasCommandName: 'TARGET' });
  check('非法大写 commandName 回落到 goal', calls.commands[0].name, 'goal');
  check('非法大写 alias 回落到 target', calls.commands[1].name, 'target');
}

{
  const { ctx, calls } = makeCtx();
  apply(ctx, { shadowGoalPerAgent: false });
  check('shadowGoalPerAgent=false 时不再接管', calls.scopedCommands.length, 0);
}

{
  const { ctx, calls } = makeCtx();
  apply(ctx, { aliasCommandName: '' });
  checkTrue('别名可关闭', !calls.commands.some((d) => d.name === 'target'));
}

console.log('— /goal：执行 —');

/** 用 agent 作用域里那份（接管版）执行命令，更接近真实链路。 */
async function runGoal(calls, agent, rawInput) {
  const def = calls.scopedCommands.find((d) => d.name === 'goal') ?? calls.commands.find((d) => d.name === 'goal');
  return def.handler({ agent, rawInput, attachments: [] });
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await runGoal(calls, agent, ' 3 整理文档');
  check('kind=success', result.kind, 'success');
  check('create 参数', calls.create[0], { objective: '整理文档', maxGoalRounds: 3 });
  checkTrue('回显 Objective', result.text.includes('Objective: 整理文档'), result.text);
  checkTrue('回显 Rounds 0/3', result.text.includes('Rounds: 0/3'), result.text);
  checkTrue('标题带轮数', result.text.includes('limit 3 rounds'), result.text);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  await runGoal(calls, agent, ' 整理文档');
  check('没写轮数 → 不带 maxGoalRounds（沿用部署默认）', calls.create[0], { objective: '整理文档' });
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await runGoal(calls, agent, ' 3');
  check('只有数字 → 报错', result.kind, 'error');
  check('没有建目标', calls.create.length, 0);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await runGoal(calls, agent, ' 999 大目标');
  check('超上限报错', result.kind, 'error');
  check('没有建目标', calls.create.length, 0);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await runGoal(calls, agent, ' 0 目标');
  check('0 轮被拒绝', result.kind, 'error');
  check('没有建目标', calls.create.length, 0);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await runGoal(calls, agent, '');
  check('空参数 → 查状态', result.kind, 'success');
  checkTrue('提示没有目标', result.text.includes('No goal is currently set'), result.text);
}

console.log('— /goal：已有目标与生命周期 —');

const existingGoal = {
  id: 'goal-old',
  revision: 4,
  objective: '旧目标',
  phase: 'active',
  maxGoalRounds: 3,
  roundsStarted: 1,
  createdAt: 0,
  updatedAt: 0,
  activation: 'armed',
};

{
  const { ctx, calls, agent } = makeCtx({ existing: [existingGoal] });
  apply(ctx, {});
  const refused = await runGoal(calls, agent, ' 2 新目标');
  check('已有目标时拒绝', refused.kind, 'error');
  checkTrue('提示 edit / rounds / clear', refused.text.includes('/goal edit') && refused.text.includes('/goal rounds'), refused.text);
  check('没有建目标', calls.create.length, 0);

  const view = await runGoal(calls, agent, '');
  checkTrue('查看显示 Rounds', view.text.includes('Rounds: 1/3'), view.text);

  const paused = await runGoal(calls, agent, ' pause');
  check('pause 调到目标域', calls.pause.length, 1);
  check('pause kind=success', paused.kind, 'success');

  await runGoal(calls, agent, ' resume');
  check('resume 调到目标域', calls.resume.length, 1);

  const cleared = await runGoal(calls, agent, ' clear');
  check('clear 调到目标域', calls.clear.length, 1);
  check('clear kind=success', cleared.kind, 'success');
  check('clear 不会建目标', calls.create.length, 0);
}

{
  const { ctx, calls, agent } = makeCtx({ existing: [existingGoal] });
  apply(ctx, {});
  const edited = await runGoal(calls, agent, ' edit 新目标 5');
  check('edit 目标 + 轮数', calls.edit[0], { ref: { id: 'goal-old', revision: 4 }, request: { objective: '新目标', maxGoalRounds: 5 } });
  check('edit kind=success', edited.kind, 'success');
  check('edit 不新建目标', calls.create.length, 0);
}

{
  // 已完成的目标上 edit ⇒ 等价于新开一个（与内置 /goal 一致）
  const complete = { ...existingGoal, phase: 'complete' };
  const { ctx, calls, agent } = makeCtx({ existing: [complete] });
  apply(ctx, {});
  const result = await runGoal(calls, agent, ' edit 新目标 4');
  check('complete 时 edit 变成 create', calls.create[0], { objective: '新目标', maxGoalRounds: 4 });
  check('complete 时不再走 edit', calls.edit.length, 0);
  check('complete 时 kind=success', result.kind, 'success');
}

{
  const { ctx, calls, agent } = makeCtx({ existing: [existingGoal] });
  apply(ctx, {});
  const raised = await runGoal(calls, agent, ' rounds 8');
  check('rounds 只改上限', calls.edit[0], { ref: { id: 'goal-old', revision: 4 }, request: { maxGoalRounds: 8 } });
  check('rounds kind=success', raised.kind, 'success');
}

{
  const blockedExhausted = {
    ...existingGoal,
    phase: 'blocked',
    roundsStarted: 3,
    blockedReason: { code: 'round-limit', message: 'Goal reached its configured limit of 3 rounds.' },
  };
  const { ctx, calls, agent } = makeCtx({ existing: [blockedExhausted] });
  apply(ctx, {});
  const raised = await runGoal(calls, agent, ' rounds 8');
  checkTrue('提高上限后提示 resume', raised.text.includes('/goal resume'), raised.text);
}

{
  const { ctx, calls, agent } = makeCtx();
  apply(ctx, {});
  const result = await runGoal(calls, agent, ' pause');
  check('无目标时 pause 报错', result.kind, 'error');
  checkTrue('提示缺目标', result.text.includes('No goal is currently set'), result.text);
}

/* ------------------------------------------------------------------ */

if (failures.length === 0) {
  console.log(`\n✅ 全部通过（${passed} 项）`);
  process.exit(0);
}

console.error(`\n❌ ${failures.length} 项失败（通过 ${passed} 项）`);
for (const failure of failures) console.error(`  · ${failure}`);
process.exit(1);
