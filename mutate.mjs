/**
 * mutate.mjs — mutation testing: prove the self-test really catches bugs
 * instead of staying green forever.
 *
 *   node mutate.mjs
 *
 * It copies the plugin sources (index.js + lib/) and both test scripts into a
 * temp dir, injects one semantically clear bug at a time (> to <, a disabled
 * branch, a dropped check, ...) and re-runs the tests:
 *
 *   - selftest must fail (it covers the logic branches);
 *   - one mutation targets something mocks cannot see but the real registry
 *     can, so selftest misses it and verify-live must catch it — that is why
 *     both scripts exist.
 *
 * No temp files are written into the plugin directory; the temp dir is removed
 * afterwards. Exit code 0 when everything behaves as expected.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const WORK = join(tmpdir(), `dsh-round-limited-target-mut-${process.pid}`);

const run = (script, cwd) => spawnSync(process.execPath, [script], { cwd, stdio: 'ignore' }).status;

/** Sources under mutation (matches the import graph of index.js). */
const SOURCES = ['index.js', 'lib/config.js', 'lib/parse.js', 'lib/command.js', 'lib/tool.js'];

const originals = new Map(SOURCES.map((rel) => [rel, readFileSync(join(HERE, rel), 'utf8')]));

const restoreSources = () => {
  for (const [rel, text] of originals) writeFileSync(join(WORK, rel), text, 'utf8');
};

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

/** Each mutation swaps from for to; from must match exactly once, else skip and fail. */
const MUTATIONS = [
  {
    name: 'M1 轮数上限校验反向（工具）',
    file: 'lib/tool.js',
    from: 'if (rounds > cfg.maxAllowedRounds) {',
    to: 'if (rounds < cfg.maxAllowedRounds) {',
  },
  {
    name: 'M2 末尾轮数解析失效',
    file: 'lib/parse.js',
    from: 'if (cfg.trailingRounds !== false) {',
    to: 'if (false) {',
  },
  {
    name: 'M3 不再接管 /goal',
    file: 'index.js',
    from: 'if (cfg.shadowGoalPerAgent !== true) {',
    to: 'if (true) {',
  },
  {
    name: 'M4 真人权限门失效',
    file: 'lib/tool.js',
    from: 'if (verdict === false) {',
    to: 'if (false) {',
  },
  {
    name: 'M5 轮数下界失效（允许 0）',
    file: 'lib/command.js',
    from: 'if (!Number.isSafeInteger(rounds) || rounds < 1) {',
    to: 'if (!Number.isSafeInteger(rounds)) {',
  },
  {
    name: 'M6 clear 子命令失效',
    file: 'lib/parse.js',
    from: "if (control === 'clear') return { kind: 'clear' };",
    to: "if (false) return { kind: 'clear' };",
  },
  {
    name: 'M7 complete 上的 edit 不走 create',
    file: 'lib/command.js',
    from: "if (current.phase === 'complete') return renderGoal('Goal created',",
    to: "if (false) return renderGoal('Goal created',",
  },
  {
    name: 'M8 命令名改成中文',
    file: 'lib/config.js',
    from: "commandName: 'goal',",
    to: "commandName: '目标',",
  },
  {
    name: 'M10 丢掉内置定义身份（图标/中文标签会消失）',
    file: 'lib/command.js',
    from: '{ definitionId: GOAL_DEFINITION_ID }',
    to: '{}',
  },
];

/** Targets what mocks cannot see: a false async self-check. selftest must miss it. */
const LIVE_ONLY = {
  name: 'M9 接管自检误报（恒为真）',
  file: 'index.js',
  from: 'if (resolved !== undefined && resolved.handler !== handler) {',
  to: 'if (resolved !== undefined) {',
};

mkdirSync(join(WORK, 'lib'), { recursive: true });
for (const test of ['selftest.mjs', 'verify-live.mjs']) {
  cpSync(join(HERE, test), join(WORK, test));
}
restoreSources();

let failures = 0;
const baseline = run('selftest.mjs', WORK);
console.log(`基线（未变异）：exit ${baseline}  ${baseline === 0 ? '✅ 全绿' : '❌ 本来就红 —— 先修 selftest'}`);
if (baseline !== 0) failures += 1;

console.log('');
for (const mutation of MUTATIONS) {
  const source = originals.get(mutation.file);
  const hits = source === undefined ? 0 : countOccurrences(source, mutation.from);
  if (hits !== 1) {
    console.log(`⚠️  ${mutation.name}：模板命中 ${hits} 处（实现已改？），跳过`);
    failures += 1;
    continue;
  }
  restoreSources();
  writeFileSync(join(WORK, mutation.file), source.replace(mutation.from, mutation.to), 'utf8');
  const status = run('selftest.mjs', WORK);
  if (status === 0) failures += 1;
  console.log(`${status !== 0 ? '✅ 被抓住' : '❌ 漏网  '}  ${mutation.name}   (exit ${status})`);
}

restoreSources();
const liveSource = originals.get(LIVE_ONLY.file);
const liveHits = countOccurrences(liveSource, LIVE_ONLY.from);
console.log('');
if (liveHits !== 1) {
  console.log(`⚠️  ${LIVE_ONLY.name}：模板命中 ${liveHits} 处，跳过`);
  failures += 1;
} else {
  writeFileSync(join(WORK, LIVE_ONLY.file), liveSource.replace(LIVE_ONLY.from, LIVE_ONLY.to), 'utf8');
  const selfStatus = run('selftest.mjs', WORK);
  const liveStatus = run('verify-live.mjs', WORK);
  console.log(`${LIVE_ONLY.name}:`);
  console.log(`  selftest    → exit ${selfStatus}  ${selfStatus === 0 ? '（漏网，符合预期：mock 看不见异步自检）' : '（意外：它抓到了）'}`);
  console.log(`  verify-live → exit ${liveStatus}  ${liveStatus !== 0 ? '✅ 抓住了' : '❌ 也漏了'}`);
  if (liveStatus === 0 || selfStatus !== 0) failures += 1;
}

rmSync(WORK, { recursive: true, force: true });

console.log('');
if (failures === 0) {
  console.log('✅ 变异全部被检测到：selftest 覆盖逻辑分支，verify-live 覆盖真实注册表/作用域');
  process.exit(0);
}
console.error(`❌ ${failures} 处不符合预期（见上）`);
process.exit(1);
