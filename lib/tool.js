/**
 * round_limited_goal 工具：给模型用的自然语言入口（「做到某事，最多 N 轮」）。
 *
 * 职责只有三件：把参数校验清楚、按内置 create_goal 的权限策略放行、
 * 创建并回显。解析在 parse.js，配置在 config.js，斜杠命令在 command.js。
 */

import { isBlankObjective, parseRoundTarget } from './parse.js';

/* ---------- 工具结果形状 ---------- */

const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    properties: {
      content: { type: 'array', items: {} },
      isError: { type: 'boolean' },
    },
    required: ['content'],
  },
  render(_args, value) {
    const blocks = value?.content;
    if (Array.isArray(blocks) && blocks.length > 0) return blocks;
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
  },
};

const ok = (text) => ({ content: [{ type: 'text', text: String(text) }], isError: false });
const fail = (text) => ({ content: [{ type: 'text', text: String(text) }], isError: true });

/* ---------- 权限：本轮是否有真人输入 ---------- */

/**
 * 与 @deepseek-ai/dsh-tool-goal 的 hasDirectHumanInput 同判据：扫本轮
 * user/message 的 source.kind === 'user'。
 * 无法判断时返回 undefined（放行），不把正常用法判死。
 * @returns {boolean|undefined}
 */
function humanTurn(ctx, agent) {
  try {
    const agents = ctx.agents;
    if (typeof agents?.roots === 'function') {
      const roots = agents.roots();
      if (Array.isArray(roots) && !roots.includes(agent)) return false;
    }
    const projections = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : undefined;
    if (projections === undefined || typeof projections?.stateOf !== 'function') return undefined;
    const events = agent?.session?.snapshotEvents?.();
    if (!Array.isArray(events)) return undefined;
    const boundary = projections.stateOf(agent.session, 'turnBoundary');
    const turnStart = boundary?.openTurnStartSeq;
    if (turnStart === null || turnStart === undefined) return undefined;
    for (let seq = turnStart + 1; seq < events.length; seq += 1) {
      const event = events[seq];
      if (event?.type === 'user/message' && event?.data?.source?.kind === 'user') return true;
    }
    return false;
  } catch {
    return undefined;
  }
}

/* ---------- 文案 ---------- */

const DESCRIPTION = `创建一个「限轮目标」：把要做的事写在前面，末尾加一个数字表示最多自动执行几轮，轮数用完自动停止。

用法（target 一个字段写完）：
- "整理文档 3"        → 最多 3 轮（末尾空格 + 数字）
- "整理文档 3轮" / "整理文档 3 次" / "整理文档 3 rounds" → 最多 3 轮
- "整理文档x3" / "整理文档（3）" → 最多 3 轮
也可以单独传 rounds 显式指定轮数（优先级最高）；两者都不给时用默认 3 轮。

和 create_goal 的区别：
- create_goal 需要自己算 max_goal_rounds，且沿用部署默认（通常 256 轮），用户不说轮数就会跑很久；
- 本工具就是为了「目标 + 数字」这一句话：轮数默认小、可预期，用户说几个数字就几轮。

轮数用完后，goal-round-driver 会自动把目标标记为 blocked（code=round-limit）并停止自动继续；不会再多跑一轮。

什么时候用它：用户用任何语言表达「做到某事，最多 N 轮 / 跑 N 次 / 只做几轮」时。只有目标、没有轮数时用 create_goal。`;

function renderCreated(goal, rounds, objective, source, replaced) {
  const lines = [
    '✅ 已创建限轮目标',
    '',
    `目标：${objective}`,
    `轮数：最多 ${rounds} 轮（当前 ${goal.roundsStarted}/${goal.maxGoalRounds}）`,
    `id  ：${goal.id}（revision ${goal.revision}，phase ${goal.phase}）`,
    `来源：${source}`,
  ];
  if (replaced) lines.push('说明：已清掉原来的未完成目标，轮数从 0 重新计。');
  lines.push(
    '',
    `停止规则：第 ${rounds} 轮结束后系统自动把目标标记为 blocked（code=round-limit）并停止自动继续，不会多跑。`,
    '要接着做：先 update_goal edit 提高 max_goal_rounds，再 update_goal resume。',
    '',
    '接下来：本轮回复结束时会自动开始第 1 轮。不用再调用 create_goal，也不用自己数轮数。',
  );
  return lines.join('\n');
}

function explainExisting(current) {
  const reason = current.phase === 'blocked' && current.blockedReason?.code === 'round-limit'
    ? `（已用完 ${current.maxGoalRounds} 轮，code=round-limit）`
    : current.blockedReason?.code
      ? `（blocked ${current.blockedReason.code}）`
      : '';
  return [
    `当前已有一个未完成的目标，不能直接新建${reason}。`,
    '',
    `目标：${current.objective}`,
    `phase：${current.phase} · 轮数：${current.roundsStarted}/${current.maxGoalRounds} · revision ${current.revision}`,
    '',
    '三种处理方式：',
    '1. 想用新目标替换它：重新调用本工具并传 replace=true（会清掉旧目标，轮数从 0 开始）。',
    '2. 只想改轮数、保留进度：用 update_goal action=edit 设 max_goal_rounds（需用户直接要求）。',
    '3. 想接着旧的做：先让用户用 /goal resume 恢复它。',
  ].join('\n');
}

const presentCall = (args) => ({
  card: 'generic',
  title: `限轮目标 · 最多 ${Number.isSafeInteger(args?.rounds) ? args.rounds : '按末尾数字'} 轮`,
  kind: 'other',
  rawInput: typeof args?.target === 'string' && args.target.length > 0 ? args.target : args,
});

/* ---------- 工具定义 ---------- */

export function createToolDefinition(ctx, cfg, log) {
  return {
    name: cfg.toolName,
    description: DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: '要做的事，末尾加一个数字表示轮数，例如 "整理文档 3"（3 轮）、"整理文档x3"、"整理文档（3）"。'
            + '数字后面还有别的字（如 "整理到第 3 章"）时不算轮数，整句都当目标。',
        },
        rounds: {
          type: 'number',
          description: `显式轮数（正整数，1~${cfg.maxAllowedRounds}），优先级高于 target 末尾的数字。不填则用末尾数字，再没有就用默认 ${cfg.defaultRounds} 轮。`,
        },
        replace: {
          type: 'boolean',
          description: '当前已有未完成目标时是否清掉它并新建（默认 false，会返回说明而不是覆盖）。',
        },
      },
      required: ['target'],
    },
    output: TEXT_OUTPUT,
    timeoutMs: 20000,
    presentCall,
    execute: async (args, exec) => {
      const agent = exec?.agent;
      if (agent === undefined) {
        return fail('限轮目标需要在一个正在运行的会话回合里调用（拿不到当前 agent），请在对话里直接调用本工具。');
      }
      if (typeof ctx.agents?.get === 'function' && ctx.agents.get(agent.id) !== agent) {
        return fail('当前 agent 已经不是活跃实例了（可能被关闭或重启），无法为它创建目标。请在新会话里重新调用。');
      }

      const requestedRounds = args?.rounds;
      if (requestedRounds !== undefined && !Number.isSafeInteger(requestedRounds)) {
        return fail(`rounds 必须是正整数，收到 ${JSON.stringify(requestedRounds)}。也可以不传 rounds，直接写成「整理文档 3」。`);
      }

      const parsed = parseRoundTarget(args?.target);
      const explicitRounds = Number.isSafeInteger(requestedRounds) ? requestedRounds : undefined;

      let rounds;
      let source;
      if (explicitRounds !== undefined) {
        rounds = explicitRounds;
        source = '工具参数 rounds';
      } else if (parsed.rounds !== null) {
        rounds = parsed.rounds;
        source = `目标末尾的「${parsed.style === 'marked' ? `${parsed.rounds} 轮` : parsed.style === 'x' ? `x${parsed.rounds}` : parsed.rounds}」`;
      } else {
        rounds = cfg.defaultRounds;
        source = `没写轮数，用默认 ${cfg.defaultRounds} 轮`;
      }

      const objective = parsed.objective;
      if (isBlankObjective(objective)) {
        return fail('目标不能为空或只有数字。请写成「要做什么 + 轮数」，例如：round_limited_goal(target="整理文档 3")。');
      }
      if (!Number.isSafeInteger(rounds) || rounds < 1) {
        return fail(`轮数必须是正整数，收到 ${String(rounds)}。请写成「目标 3」这种形式，或用 rounds 参数。`);
      }
      if (rounds > cfg.maxAllowedRounds) {
        return fail(`轮数 ${rounds} 超过允许上限 ${cfg.maxAllowedRounds}。`
          + '如果确实要跑这么多轮，请让用户直接说轮数上限（配置项 maxAllowedRounds 可调），或者用 create_goal 显式设 max_goal_rounds。');
      }

      if (cfg.requireDirectHuman) {
        const verdict = humanTurn(ctx, agent);
        if (verdict === false) {
          return fail('创建目标需要用户在本轮直接提出（顶层 agent 的真人输入）。'
            + '如果是自动继续的轮次或子 agent 发起的，请等用户的下一句指令。');
        }
      }

      let current;
      try {
        current = ctx.goals.get(agent);
      } catch (error) {
        return fail(`读取当前目标失败：${String(error?.message ?? error)}`);
      }

      let replaced = false;
      if (current !== undefined && current.phase !== 'complete') {
        if (args?.replace !== true) return fail(explainExisting(current));
        try {
          ctx.goals.clear(agent, { id: current.id, revision: current.revision });
          replaced = true;
        } catch (error) {
          return fail(`清理旧目标失败（${String(error?.code ?? '')}）：${String(error?.message ?? error)}。`
            + '可以让用户用 /goal clear 清掉后再试。');
        }
      }

      let goal;
      try {
        goal = ctx.goals.create(agent, { objective, maxGoalRounds: rounds });
      } catch (error) {
        const code = String(error?.code ?? '');
        const hint = code === 'GOAL_ALREADY_EXISTS'
          ? '当前仍有未完成的目标，用 replace=true 替换，或让用户先 /goal clear。'
          : code === 'GOAL_INVALID_OBJECTIVE'
            ? '目标文本不合法（不能为空、不能只有空白）。'
            : '可以先用 get_goal 看一下当前目标状态。';
        return fail(`创建限轮目标失败（${code || '未知错误'}）：${String(error?.message ?? error)}。${hint}`);
      }

      log.info(`round-limited-target: 已创建「${objective}」最多 ${rounds} 轮（${goal.id}）`);
      return ok(renderCreated(goal, rounds, objective, source, replaced));
    },
  };
}
