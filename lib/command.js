/**
 * /goal 命令：定义身份、状态卡片、执行分支。
 *
 * 「接管内置 /goal」不在这里 —— 那是 index.js 在 agent 作用域再注册一次同名
 * 命令的功劳。本模块只保证注册出来的定义与内置版同身份（definitionId），
 * 这样客户端的「目标」标签、目标图标和 /目标 别名都照旧。
 */

import { isBlankObjective, parseGoalCommand } from './parse.js';

/**
 * 内置 /goal 的定义身份。客户端靠它认出第一方命令：
 * 菜单显示「目标」+ 目标图标，且 /目标 可以作为别名提交
 * （dsh-client-ui-commands 的 BUILTINS / HOST_FACES / TOKEN_ALIASES）。
 * CommandDefinitionId() 是恒等函数，直接给字符串等价。
 */
const GOAL_DEFINITION_ID = '@deepseek-ai/dsh-command-goal';

const GOAL_USAGE = 'Usage: /goal [<objective>|3 <objective>|edit <objective>|rounds <n>|pause|resume|clear]';

/** 菜单行与输入框占位提示；也是客户端唯一会显示「怎么用」的地方。 */
const GOAL_INPUT_HINT = '3 <要做什么>   ·   clear | pause | resume | edit <目标> | rounds <n>';

const GOAL_COMMAND_DESCRIPTION = '限轮目标：/goal 3 整理文档 —— 最多自动跑 3 轮，用完自动停止。原 /goal 的 clear/pause/resume/edit 全部保留，另加 /goal rounds <n>。';

const HINT_ARMED = '/goal edit <objective>, /goal rounds <n>, /goal pause, /goal clear';
const HINT_RESUMABLE = '/goal edit <objective>, /goal rounds <n>, /goal resume, /goal clear';
const HINT_CREATE = '/goal <objective>, /goal 3 <objective>, /goal clear';

const goalRef = (goal) => ({ id: goal.id, revision: goal.revision });

const missingGoal = (action) => ({
  kind: 'error',
  text: `No goal is currently set; /goal ${action} requires one. ${GOAL_USAGE}`,
});

/** create / edit 共用的请求体：没写轮数就不带 maxGoalRounds（沿用部署默认）。 */
const goalRequest = (objective, rounds) => ({
  objective,
  ...(rounds === null ? {} : { maxGoalRounds: rounds }),
});

function commandHint(goal) {
  if (goal.phase === 'active' && goal.activation === 'armed') return HINT_ARMED;
  if (goal.phase === 'active' || goal.phase === 'paused' || goal.phase === 'blocked') return HINT_RESUMABLE;
  return HINT_CREATE;
}

/** 目标状态卡片，字段顺序与内置 /goal 一致。 */
function renderGoal(title, goal) {
  const reason = goal.phase === 'blocked' ? goal.blockedReason : undefined;
  const lines = [
    title,
    `Status: ${goal.phase}`,
    ...(reason === undefined ? [] : [`Blocker: ${reason.code}: ${reason.message}`]),
    `Objective: ${goal.objective}`,
    `Rounds: ${goal.roundsStarted}/${goal.maxGoalRounds}`,
    `Activation: ${goal.activation}`,
  ];
  if (goal.phase === 'active' && goal.roundsStarted >= goal.maxGoalRounds) {
    lines.push('Limit: exhausted — raise it with /goal rounds <n>, then /goal resume');
  }
  lines.push('', `Commands: ${commandHint(goal)}`);
  return { kind: 'success', text: lines.join('\n') };
}

function checkRounds(rounds, cfg) {
  if (!Number.isSafeInteger(rounds) || rounds < 1) {
    return `Round count must be a positive integer (got ${JSON.stringify(rounds) ?? String(rounds)}). ${GOAL_USAGE}`;
  }
  if (rounds > cfg.maxAllowedRounds) {
    return `Round count ${rounds} exceeds the configured maximum of ${cfg.maxAllowedRounds}.`;
  }
  return null;
}

/**
 * 一次 /goal 调用的全部语义。返回 { kind: 'success'|'error', text }。
 * 目标域抛出的 GOAL_* 错误在这里转成可读提示，不回传异常。
 */
export function runGoalCommand(ctx, cfg, log, invocation) {
  const agent = invocation?.agent;
  if (agent === undefined) return { kind: 'error', text: 'No live agent for this invocation.' };

  const command = parseGoalCommand(invocation.rawInput, cfg);

  try {
    const current = ctx.goals.get(agent);

    switch (command.kind) {
      case 'show':
        return current === undefined
          ? { kind: 'success', text: `No goal is currently set.\n${GOAL_USAGE}` }
          : renderGoal('Goal', current);

      case 'invalid-edit':
        return { kind: 'error', text: `Goal editing requires a replacement objective.\n${GOAL_USAGE}` };

      case 'invalid-rounds':
        return { kind: 'error', text: `Round limit requires a number: /goal rounds 5\n${GOAL_USAGE}` };

      case 'create': {
        if (isBlankObjective(command.objective)) {
          return { kind: 'error', text: `A goal needs an objective. ${GOAL_USAGE}` };
        }
        if (command.rounds !== null) {
          const problem = checkRounds(command.rounds, cfg);
          if (problem !== null) return { kind: 'error', text: problem };
        }
        if (current !== undefined && current.phase !== 'complete') {
          return {
            kind: 'error',
            text: `A goal is already ${current.phase}. Use /goal edit <objective> to change it, /goal rounds <n> to change its limit, or /goal clear before replacing it.`,
          };
        }
        const created = ctx.goals.create(agent, goalRequest(command.objective, command.rounds));
        log.info(`round-limited-target: /goal 创建「${command.objective}」${command.rounds === null ? '（部署默认轮数）' : `最多 ${command.rounds} 轮`}`);
        return renderGoal(
          command.rounds === null ? 'Goal created' : `Goal created (limit ${command.rounds} rounds)`,
          created,
        );
      }

      case 'edit': {
        if (current === undefined) return missingGoal('edit');
        if (isBlankObjective(command.objective)) {
          return { kind: 'error', text: `Goal editing requires a replacement objective.\n${GOAL_USAGE}` };
        }
        if (command.rounds !== null) {
          const problem = checkRounds(command.rounds, cfg);
          if (problem !== null) return { kind: 'error', text: problem };
        }
        const request = goalRequest(command.objective, command.rounds);
        // 已完成的目标上 edit 等价于新开一个（与内置 /goal 一致）
        if (current.phase === 'complete') return renderGoal('Goal created', ctx.goals.create(agent, request));
        return renderGoal('Goal updated', ctx.goals.edit(agent, goalRef(current), request));
      }

      case 'rounds': {
        if (current === undefined) return missingGoal('rounds');
        const problem = checkRounds(command.rounds, cfg);
        if (problem !== null) return { kind: 'error', text: problem };
        const edited = ctx.goals.edit(agent, goalRef(current), { maxGoalRounds: command.rounds });
        const exhausted = edited.phase === 'blocked' && edited.blockedReason?.code === 'round-limit';
        return renderGoal(
          exhausted ? 'Round limit raised — run /goal resume to continue' : 'Round limit updated',
          edited,
        );
      }

      case 'pause':
        if (current === undefined) return missingGoal('pause');
        return renderGoal('Goal paused', ctx.goals.pause(agent, goalRef(current)));

      case 'resume':
        if (current === undefined) return missingGoal('resume');
        return renderGoal('Goal resumed', ctx.goals.resume(agent, goalRef(current)));

      case 'clear':
        if (current === undefined) return { kind: 'success', text: 'No goal to clear.' };
        ctx.goals.clear(agent, goalRef(current));
        return { kind: 'success', text: 'Goal cleared.' };

      default:
        return { kind: 'error', text: `Unknown command. ${GOAL_USAGE}` };
    }
  } catch (error) {
    if (isGoalError(error)) {
      return { kind: 'error', text: `The goal command is not valid for the current state: ${String(error?.message ?? error)}\nRun /goal to view available commands.` };
    }
    return { kind: 'error', text: `Goal command failed: ${String(error?.message ?? error)}` };
  }
}

/** GoalError 的鸭子类型判定（不 import @deepseek-ai/dsh-goal）。 */
function isGoalError(error) {
  const code = error?.code;
  return typeof code === 'string' && code.startsWith('GOAL_');
}

/**
 * 构造命令定义；只有主命令带内置 definitionId，别名不抢身份。
 * handler 由调用方给，保证全局份与 agent 作用域份行为完全一致。
 */
export function goalCommandDefinition(name, primaryName, handler) {
  return {
    ...(name === primaryName ? { definitionId: GOAL_DEFINITION_ID } : {}),
    name,
    description: GOAL_COMMAND_DESCRIPTION,
    input: { hint: GOAL_INPUT_HINT },
    handler,
  };
}
