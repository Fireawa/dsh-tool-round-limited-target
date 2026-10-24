/**
 * dsh-tool-round-limited-target — add a round limit to /goal
 *
 *   /goal 3 tidy the docs     at most 3 automatic rounds
 *   /goal tidy the docs 3     trailing number also accepted
 *   /goal rounds 8            raise the limit, keep progress
 *
 * The core already does the stopping: @deepseek-ai/dsh-goal-round-driver marks
 * the goal blocked/code=round-limit once the rounds are used up. This plugin
 * only adds the "one sentence states the rounds" entry point.
 *
 * Wiring only: register the tool, register the slash command, shadow /goal in
 * the agent scope. Parsing in lib/parse.js, config in lib/config.js, command
 * in lib/command.js, tool in lib/tool.js.
 *
 * Zero dependencies: no @deepseek-ai/* imports; definitionId is just a string.
 */

import { normalizeConfig } from './lib/config.js';
import { goalCommandDefinition, runGoalCommand } from './lib/command.js';
import { createToolDefinition } from './lib/tool.js';

export const name = 'dsh-tool-round-limited-target';

/** tools=tool registry; goals=goal domain; agents=caller check; commands=slash commands. */
export const inject = ['tools', 'goals', 'agents', 'commands'];

/** Pure parsers, re-exported so the self-test can call them directly. */
export { parseGoalCommand, parseRoundTarget } from './lib/parse.js';

/** Self-check delay: registration is sync; let scope merging settle first. */
const SELF_CHECK_DELAY_MS = 100;

/* ---------- command registration: global + agent scope ---------- */

/**
 * Register the command globally and in every agent scope.
 *
 * Two layers because the built-in /goal lives in the agent preset scope while
 * commands merge global -> scope chain (far -> near) with the nearest winning.
 * The agent's own layer therefore beats the preset; the global copy is only a
 * fallback for agents without a preset.
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

    // Self-check: scope precedence is a DSH internal contract. If it ever
    // changes, say so in the log instead of silently falling back to the
    // built-in /goal. Comparing the handler reference (find() returns the
    // registered function) is harder to fool than comparing descriptions.
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

/* ---------- plugin body ---------- */

/** Disposer for everything registered, so re-apply does not register twice. */
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

  // Registration failures are warnings only: one broken tool must not kill startup
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
