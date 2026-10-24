/**
 * dsh-tool-round-limited-target — 给 /goal 加一个轮数
 *
 *   /goal 3 整理文档       最多自动跑 3 轮
 *   /goal 整理文档 3       轮数写末尾也认
 *   /goal rounds 8         只改上限，保留进度
 *
 * 轮数用完由 @deepseek-ai/dsh-goal-round-driver 标成 blocked/code=round-limit
 * 并停止自动继续 —— 这是内核行为，本插件只补「一句话说清轮数」的入口。
 *
 * 本文件只做装配：注册工具、注册斜杠命令、在 agent 作用域接管 /goal。
 * 解析在 lib/parse.js，配置在 lib/config.js，命令在 lib/command.js，工具在 lib/tool.js。
 *
 * 零依赖：不 import 任何 @deepseek-ai/* 包；definitionId 只是一段字符串。
 */

import { normalizeConfig } from './lib/config.js';
import { goalCommandDefinition, runGoalCommand } from './lib/command.js';
import { createToolDefinition } from './lib/tool.js';

export const name = 'dsh-tool-round-limited-target';

/** tools=注册工具；goals=目标域；agents=校验调用者；commands=斜杠命令。 */
export const inject = ['tools', 'goals', 'agents', 'commands'];

/** 解析函数是纯函数，转发出去方便自检脚本直接测。 */
export { parseGoalCommand, parseRoundTarget } from './lib/parse.js';

/** 自检延迟：命令注册是同步的，稍等一拍让作用域合并完成。 */
const SELF_CHECK_DELAY_MS = 100;

/* ---------- 命令注册：全局 + agent 作用域 ---------- */

/**
 * 注册命令：全局 + 每个 agent 作用域。
 *
 * 为什么要分两层：内置 /goal 挂在 agent preset 的作用域里，而命令合并顺序是
 * global → 作用域链（远→近），最近的胜出。所以 agent 自己那一层能压过 preset，
 * 全局那份只是没有 preset 的 agent 的兜底。
 */
function registerGoalCommands(ctx, cfg, log, track) {
  if (typeof ctx.commands?.register !== 'function') {
    log.warn('round-limited-target: 没有 commands 服务，跳过斜杠命令注册');
    return;
  }

  const handler = (invocation) => runGoalCommand(ctx, cfg, log, invocation);
  const definition = (commandName) => goalCommandDefinition(commandName, cfg.commandName, handler);

  for (const commandName of [cfg.commandName, cfg.aliasCommandName]) {
    if (typeof commandName !== 'string' || commandName.length === 0) continue;
    try {
      track(ctx.commands.register(definition(commandName)));
      log.info(`round-limited-target: 已注册全局命令 /${commandName}`);
    } catch (error) {
      log.info(`round-limited-target: 跳过全局命令 /${commandName} —— ${String(error?.message ?? error)}`);
    }
  }

  if (cfg.shadowGoalPerAgent !== true) {
    log.info('round-limited-target: shadowGoalPerAgent=false，保留内置 /goal 行为');
    return;
  }

  const mounted = new WeakSet();

  function mountFor(agent) {
    if (agent === null || typeof agent !== 'object' || mounted.has(agent)) return;
    const agentCtx = agent.ctx;
    if (agentCtx === undefined || typeof agentCtx.plugin !== 'function') return;
    mounted.add(agent);
    try {
      agentCtx.plugin({
        name: 'round-limited-target:goal-command',
        inject: ['commands'],
        apply(scopeCtx) {
          try {
            track(scopeCtx.commands.register(definition(cfg.commandName)));
            log.info(`round-limited-target: 已在 agent 作用域接管 /${cfg.commandName}（agent ${agent.id}）`);
          } catch (error) {
            log.warn(`round-limited-target: agent 作用域注册 /${cfg.commandName} 失败: ${String(error?.message ?? error)}`);
          }
        },
      });
    } catch (error) {
      log.warn(`round-limited-target: 无法在 agent 上挂载命令: ${String(error?.message ?? error)}`);
      return;
    }

    // 自检：作用域优先级是 DSH 内部约定，万一变了就在日志里点名，而不是静默退回内置版。
    // 比较 handler 引用（find() 返回的就是注册时那个函数），比描述字符串更难被文案改动骗过。
    setTimeout(() => {
      try {
        const resolved = ctx.commands.find(agent, cfg.commandName);
        if (resolved !== undefined && resolved.handler !== handler) {
          log.warn(`round-limited-target: agent ${agent.id} 上的 /${cfg.commandName} 仍解析到别的实现`
            + `（"${String(resolved.description ?? '').slice(0, 40)}…"），接管未生效；`
            + `可用 ${cfg.aliasCommandName ? `/${cfg.aliasCommandName} ` : ''}作为带轮数的入口。`);
        }
      } catch { /* 自检失败不影响命令本身 */ }
    }, SELF_CHECK_DELAY_MS).unref?.();
  }

  try {
    for (const agent of ctx.agents.list()) mountFor(agent);
  } catch (error) {
    log.warn(`round-limited-target: 枚举现有 agent 失败: ${String(error?.message ?? error)}`);
  }

  if (typeof ctx.on === 'function') {
    ctx.on('agent/created', ({ agent }) => mountFor(agent));
  } else {
    log.warn('round-limited-target: 没有事件服务，之后新建的 agent 不会自动接管 /goal');
  }
}

/* ---------- 插件主体 ---------- */

/** 已注册资源的总 disposer，保证重新 apply 时不重复注册。 */
let ACTIVE = null;

function createLogger(ctx) {
  const at = (level) => (message) => {
    try { ctx.logger?.[level]?.(message); } catch { /* ignore */ }
  };
  return { info: at('info'), warn: at('warn') };
}

export function apply(ctx, config) {
  if (ACTIVE !== null) {
    try { ACTIVE(); } catch { /* ignore */ }
    ACTIVE = null;
  }

  const cfg = normalizeConfig(config);
  const log = createLogger(ctx);

  const disposers = [];
  const track = (dispose) => {
    if (typeof dispose === 'function') disposers.push(dispose);
  };

  // 注册失败只 warn：一个工具/命令坏了不该拖垮整个 profile 启动
  try {
    track(ctx.tools.register(createToolDefinition(ctx, cfg, log)));
    log.info(`round-limited-target: 已注册工具 ${cfg.toolName}（默认 ${cfg.defaultRounds} 轮，上限 ${cfg.maxAllowedRounds} 轮）`);
  } catch (error) {
    log.warn(`round-limited-target: 注册工具 ${cfg.toolName} 失败: ${String(error?.message ?? error)}`);
  }

  registerGoalCommands(ctx, cfg, log, track);

  ACTIVE = () => {
    for (const dispose of disposers.splice(0)) {
      try { dispose(); } catch { /* ignore */ }
    }
  };
}
