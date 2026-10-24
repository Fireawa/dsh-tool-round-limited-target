/**
 * /goal command: definition identity, status card, execution branches.
 *
 * Shadowing the built-in /goal is not done here — index.js registers a
 * same-named command in the agent scope. This module only makes the definition
 * carry the built-in identity (definitionId), so the client keeps showing the
 * 目标 label, the goal icon and the /目标 alias.
 */

import { isBlankObjective, parseGoalCommand } from './parse.js';

/**
 * Definition identity of the built-in /goal. The client uses it to recognise a
 * first-party command: the menu shows 目标 with the goal icon, and /目标 can be
 * submitted as an alias (dsh-client-ui-commands BUILTINS / HOST_FACES /
 * TOKEN_ALIASES). CommandDefinitionId() is the identity function, so passing a
 * plain string is equivalent.
 */
const GOAL_DEFINITION_ID = '@deepseek-ai/dsh-command-goal';

const GOAL_USAGE = 'Usage: /goal [<objective>|3 <objective>|edit <objective>|rounds <n>|pause|resume|clear]';

/** Menu line and input placeholder — the only place the client shows usage. */
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

/** Shared create/edit body: omit maxGoalRounds when no rounds were given. */
const goalRequest = (objective, rounds) => ({
  objective,
  ...(rounds === null ? {} : { maxGoalRounds: rounds }),
});

function commandHint(goal) {
  if (goal.phase === 'active' && goal.activation === 'armed') return HINT_ARMED;
  if (goal.phase === 'active' || goal.phase === 'paused' || goal.phase === 'blocked') return HINT_RESUMABLE;
  return HINT_CREATE;
}

/** Status card; field order matches the built-in /goal. */
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
 * All semantics of one /goal call. Returns { kind: 'success'|'error', text }.
 * GOAL_* errors thrown by the goal domain become readable hints; nothing is
 * re-thrown.
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
        // edit on a completed goal starts a new one (same as the built-in /goal)
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

/** Duck-typed GoalError check (avoids importing @deepseek-ai/dsh-goal). */
function isGoalError(error) {
  const code = error?.code;
  return typeof code === 'string' && code.startsWith('GOAL_');
}

/**
 * Build a command definition; only the primary name carries the built-in
 * definitionId, so the alias does not steal the identity. The caller supplies
 * the handler, keeping the global and agent-scope copies identical.
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
