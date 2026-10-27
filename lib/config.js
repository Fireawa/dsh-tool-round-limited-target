/**
 * Config: defaults + normalisation. Invalid values fall back to the default
 * instead of throwing, so a typo cannot break profile startup. The default and
 * maximum round counts are kept consistent here.
 */

const DEFAULT_CONFIG = {
  toolName: 'round_limited_goal',
  commandName: 'goal',        // must match /^[a-z][a-z0-9_-]*$/u
  aliasCommandName: 'target', // fallback entry when shadowing fails; '' disables
  shadowGoalPerAgent: true,   // register goal in the agent scope to beat the built-in
  trailingRounds: false,      // only "<n> <objective>" caps rounds; trailing digits stay objective text
  defaultRounds: 3,           // used when the call omits rounds (only if requireExplicitRounds=false)
  maxAllowedRounds: 500,      // hard error above this, never silently clamped
  requireDirectHuman: true,   // same permission policy as the built-in create_goal
  requireExplicitRounds: true, // refuse when the call omits rounds, so the model cannot invent a cap
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
    trailingRounds: c.trailingRounds === true,
    // keep the default under the cap, or "omit rounds" would always fail
    defaultRounds: Math.min(
      integerIn(c.defaultRounds, DEFAULT_CONFIG.defaultRounds, 1, ROUNDS_LIMIT),
      maxAllowedRounds,
    ),
    maxAllowedRounds,
    requireDirectHuman: c.requireDirectHuman !== false,
    requireExplicitRounds: c.requireExplicitRounds !== false,
  };
}
