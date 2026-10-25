/**
 * Pure parsing layer: turn "objective + number" and the text after /goal into
 * structured data.
 *
 * No ctx and no services, only string -> data, so selftest can cover it
 * directly. The command and the tool share these rules so syntax cannot drift.
 */

/* ---------- trailing rounds ---------- */

/** N rounds / N 轮 / N 次 (separator optional, e.g. "docs3轮"). */
const MARKED_SUFFIX = /[\s,，、;；:：]*(?:做|执行|跑|共|最多)?\s*(\d{1,6})\s*(?:轮次|轮|次|rounds?)[\s)）]*$/iu;
/** xN / ×N / *N, may hug the objective. */
const XFORM_SUFFIX = /[\s,，、;；:：]*(?:做|执行|跑|共|最多)?\s*[x×*]\s*(\d{1,6})[\s)）]*$/iu;
/** A bare number needs a separator, so "docs2" stays part of the objective. */
const BARE_SUFFIX = /(?:[\s,，、;；:：]+|[（(])\s*(\d{1,6})\s*[)）]?\s*$/u;

const SUFFIX_STYLES = [['marked', MARKED_SUFFIX], ['x', XFORM_SUFFIX], ['bare', BARE_SUFFIX]];

const tidyBody = (text) => String(text).replace(/[\s,，、;；:：\-—～~]+$/u, '').trim();

/**
/**
 * Split one sentence into objective and trailing rounds.
 * @returns {{ objective: string, rounds: number|null, style: 'marked'|'x'|'bare'|'none' }}
 */
export function parseRoundTarget(target) {
  const text = typeof target === 'string' ? target.trim() : '';
  if (text.length === 0) return { objective: '', rounds: null, style: 'none' };

  for (const [style, pattern] of SUFFIX_STYLES) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const body = tidyBody(text.slice(0, match.index));
    const rounds = Number(match[1]);
    if (body.length === 0) continue;                   // pure number: the caller reports it
    if (!Number.isSafeInteger(rounds) || rounds < 1) continue;
    return { objective: body, rounds, style };
  }
  return { objective: tidyBody(text), rounds: null, style: 'none' };
}

/** An empty objective or a bare number (`/goal 3`) is not a valid goal. */
export const isBlankObjective = (objective) => objective.length === 0 || /^\d+$/u.test(objective);

/* ---------- quotes ---------- */

const QUOTE_PAIRS = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’'], ['「', '」'], ['『', '』'], ['《', '》']];

/** Strip one pair of quotes wrapping the whole sentence. */
function unquote(text) {
  const t = String(text).trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) return t.slice(1, -1).trim();
  }
  return t;
}

/* ---------- /goal syntax ---------- */

/**
 * Parse the text after /goal.
 * @returns {{ kind: 'show'|'clear'|'pause'|'resume'|'rounds'|'edit'|'create'|'invalid-edit'|'invalid-rounds', objective?: string, rounds?: number|null }}
 */
export function parseGoalCommand(rawInput, cfg = {}) {
  const input = String(rawInput ?? '').trim();
  if (input.length === 0) return { kind: 'show' };

  const control = input.toLowerCase();
  if (control === 'clear') return { kind: 'clear' };
  if (control === 'pause') return { kind: 'pause' };
  if (control === 'resume') return { kind: 'resume' };
  if (control === 'edit') return { kind: 'invalid-edit' };
  if (control === 'rounds') return { kind: 'invalid-rounds' };

  const roundsVerb = /^rounds(?=[\s:：])\s*[:：]?\s*([\s\S]*)$/iu.exec(input);
  if (roundsVerb !== null) {
    const digits = /^(\d{1,6})$/u.exec(roundsVerb[1].trim());
    if (digits === null) return { kind: 'invalid-rounds' };
    return { kind: 'rounds', rounds: Number(digits[1]) };
  }

  const editVerb = /^edit(?=[\s:：])\s*[:：]?\s*([\s\S]*)$/iu.exec(input);
  if (editVerb !== null) {
    const spec = objectiveAndRounds(editVerb[1].trim(), cfg);
    return { kind: 'edit', objective: spec.objective, rounds: spec.rounds };
  }

  const spec = objectiveAndRounds(input, cfg);
  return { kind: 'create', objective: spec.objective, rounds: spec.rounds };
}

/** `<objective>` / `3 <objective>` / `<objective> 3` -> { objective, rounds }. */
function objectiveAndRounds(text, cfg) {
  if (/^\d+$/u.test(text)) return { objective: text, rounds: null };  // 纯数字留给上层报错

  const leading = /^(\d{1,6})\s*(?:轮次|轮|次|rounds?)?\s*[,，:：]?\s+([\s\S]+)$/iu.exec(text);
  if (leading !== null) return { objective: unquote(leading[2]), rounds: Number(leading[1]) };

  // a trailing number is ambiguous ("fix bug 42"): off by default, opt in with trailingRounds:true
  if (cfg.trailingRounds === true) {
    const parsed = parseRoundTarget(text);
    if (parsed.rounds !== null) return { objective: unquote(parsed.objective), rounds: parsed.rounds };
  }
  return { objective: unquote(text), rounds: null };
}
