/**
 * 把仓库里的 __OWNER__ 占位符替换成你的 GitHub 用户名。
 *
 *   node scripts/set-owner.mjs <github-用户名>
 *
 * 只改本仓库里的这几个文件；替换幂等，重复跑不会出错。
 */

import { readFileSync, writeFileSync } from 'node:fs';

const FILES = ['package.json', 'README.md', 'PUBLISHING.md', 'LICENSE'];
const owner = process.argv[2];

if (owner === undefined || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(owner)) {
  console.error('用法: node scripts/set-owner.mjs <github-用户名>');
  console.error('用户名规则: 1~39 个字母/数字/连字符，不能以连字符开头或结尾。');
  process.exit(1);
}

let changed = 0;
for (const file of FILES) {
  const before = readFileSync(file, 'utf8');
  const after = before.split('__OWNER__').join(owner);
  if (after === before) continue;
  writeFileSync(file, after, 'utf8');
  changed += 1;
  console.log(`✔ ${file}`);
}

console.log(changed === 0
  ? '没有找到 __OWNER__：可能已经设置过了。'
  : `完成：__OWNER__ → ${owner}（${changed} 个文件）。`);
