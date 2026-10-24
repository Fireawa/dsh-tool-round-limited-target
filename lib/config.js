/**
 * 配置：默认值 + 归一化。非法值一律回落到默认（不抛错，避免一个手误
 * 让整个 profile 起不来）；轮数上限与默认轮数在这里保证自洽。
 */

const DEFAULT_CONFIG = {
  toolName: 'round_limited_goal',
  commandName: 'goal',        // 必须是 /^[a-z][a-z0-9_-]*$/u，见 README「已知限制」
  aliasCommandName: 'target', // 接管失败时的退路；'' 关闭
  shadowGoalPerAgent: true,   // 在 agent 作用域注册 goal，压过 preset 里的内置 /goal
  trailingRounds: true,       // 是否接受「目标 3」这种末尾轮数
  defaultRounds: 3,           // 工具没写轮数时用这个
  maxAllowedRounds: 500,      // 超过直接报错，不静默夹断
  requireDirectHuman: true,   // 工具与内置 create_goal 同一权限策略
};

const COMMAND_NAME = /^[a-z][a-z0-9_-]{0,31}$/u;
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/u;
const ROUNDS_LIMIT = 100000;

const integerIn = (value, fallback, min, max) => (
  Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback
);

function commandName(value, fallback, allowEmpty = false) {
  if (allowEmpty && value === '') return '';
  return typeof value === 'string' && COMMAND_NAME.test(value) ? value : fallback;
}

export function normalizeConfig(raw) {
  const c = raw !== null && typeof raw === 'object' ? raw : {};
  const maxAllowedRounds = integerIn(c.maxAllowedRounds, DEFAULT_CONFIG.maxAllowedRounds, 1, ROUNDS_LIMIT);
  return {
    toolName: typeof c.toolName === 'string' && TOOL_NAME.test(c.toolName)
      ? c.toolName
      : DEFAULT_CONFIG.toolName,
    commandName: commandName(c.commandName, DEFAULT_CONFIG.commandName),
    aliasCommandName: commandName(c.aliasCommandName, DEFAULT_CONFIG.aliasCommandName, true),
    shadowGoalPerAgent: c.shadowGoalPerAgent !== false,
    trailingRounds: c.trailingRounds !== false,
    // 默认轮数不能超过上限，否则「不写轮数」这种正常用法会必然失败
    defaultRounds: Math.min(
      integerIn(c.defaultRounds, DEFAULT_CONFIG.defaultRounds, 1, ROUNDS_LIMIT),
      maxAllowedRounds,
    ),
    maxAllowedRounds,
    requireDirectHuman: c.requireDirectHuman !== false,
  };
}
