/**
 * 纯解析层：把「目标 + 数字」和 /goal 后面的输入拆成结构化结果。
 *
 * 这里不碰任何 ctx / 服务，只做字符串 → 数据，方便 selftest 直接覆盖；
 * 命令与工具都复用同一套规则，避免两处语法漂移。
 */

/* ---------- 末尾轮数 ---------- */

/** N轮 / N 次 / N rounds（分隔符可选，如 "文档3轮"）。 */
const MARKED_SUFFIX = /[\s,，、;；:：]*(?:做|执行|跑|共|最多)?\s*(\d{1,6})\s*(?:轮次|轮|次|rounds?)[\s)）]*$/iu;
/** xN / ×N / *N，允许紧贴正文。 */
const XFORM_SUFFIX = /[\s,，、;；:：]*(?:做|执行|跑|共|最多)?\s*[x×*]\s*(\d{1,6})[\s)）]*$/iu;
/** 裸数字必须与正文有分隔，避免把「文档2」当轮数。 */
const BARE_SUFFIX = /(?:[\s,，、;；:：]+|[（(])\s*(\d{1,6})\s*[)）]?\s*$/u;

const SUFFIX_STYLES = [['marked', MARKED_SUFFIX], ['x', XFORM_SUFFIX], ['bare', BARE_SUFFIX]];

const tidyBody = (text) => String(text).replace(/[\s,，、;；:：\-—～~]+$/u, '').trim();

/**
 * 从一句话里拆出目标与末尾轮数。
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
    if (body.length === 0) continue;                     // 整句就是个数字，交给上层报错
    if (!Number.isSafeInteger(rounds) || rounds < 1) continue;
    return { objective: body, rounds, style };
  }
  return { objective: tidyBody(text), rounds: null, style: 'none' };
}

/** 空目标，或整句只有一个数字（如 `/goal 3`），都不是合法目标。 */
export const isBlankObjective = (objective) => objective.length === 0 || /^\d+$/u.test(objective);

/* ---------- 引号 ---------- */

const QUOTE_PAIRS = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’'], ['「', '」'], ['『', '』'], ['《', '》']];

/** 去掉整句外面的成对引号。 */
function unquote(text) {
  const t = String(text).trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) return t.slice(1, -1).trim();
  }
  return t;
}

/* ---------- /goal 语法 ---------- */

/**
 * 解析 /goal 后面的输入。
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

/** `<目标>` / `3 <目标>` / `<目标> 3` → { objective, rounds }。 */
function objectiveAndRounds(text, cfg) {
  if (/^\d+$/u.test(text)) return { objective: text, rounds: null };  // 纯数字留给上层报错

  const leading = /^(\d{1,6})\s*(?:轮次|轮|次|rounds?)?\s*[,，:：]?\s+([\s\S]+)$/iu.exec(text);
  if (leading !== null) return { objective: unquote(leading[2]), rounds: Number(leading[1]) };

  // 末尾裸数字天生有歧义（"修复 bug 42"），可用 trailingRounds:false 关掉
  if (cfg.trailingRounds !== false) {
    const parsed = parseRoundTarget(text);
    if (parsed.rounds !== null) return { objective: unquote(parsed.objective), rounds: parsed.rounds };
  }
  return { objective: unquote(text), rounds: null };
}
