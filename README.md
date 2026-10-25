# dsh-tool-round-limited-target（限轮目标）

中文 | [English](README.en.md)

[![CI](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml/badge.svg)](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

给 DSH 的 `/goal` 加一个数字：**数字就是自动执行的轮数，用完自动停**。

```bash
/goal 3 整理文档      # 最多 3 轮
```

只有「数字在最前面」这一种写法会设轮数上限；其它写法原样交给官方 `/goal`（不设上限，走部署默认轮数），不会报错。

## 用法

| 写法 | 结果 |
| --- | --- |
| `/goal 3 整理文档` | 最多 3 轮（轮数在最前面） |
| `/goal 3轮 整理文档` | 同上（`轮` / `次` / `rounds` 可省） |
| `/goal 整理文档 3` | 官方语义：`3` 只是目标文本，不设上限 |
| `/goal 修复 bug 42` | 官方语义：目标是「修复 bug 42」，不是 42 轮 |
| `/goal rounds 8` | 只改上限，保留进度 |
| `/goal edit 5 新目标` | 改目标（可同时改轮数） |
| `/goal edit 新目标` | 只改目标，沿用原轮数 |
| `/goal pause` / `resume` / `clear` | 与内置相同 |
| `/goal` | 查看状态 |

轮数用完，目标自动变成 `blocked`（`code=round-limit`），不会多跑。要接着做：

```bash
/goal rounds 8      # 先提高上限
/goal resume        # 再恢复
```

`/目标 3 整理文档` 也能敲——沿用了内置命令身份，图标和中文标签不变。

## 安装

要求：Node.js 20+，且已装好 DSH。

```bash
dsh plugin --profile web add git+https://github.com/Fireawa/dsh-tool-round-limited-target.git
```

也可以 Web → **Plugins** → 添加插件 → 粘贴上面的地址（或本地路径）。装完**重启 `dsh web`**。
本地开发用 `link:` 指向 checkout 即可。

## 工具

`round_limited_goal(target, rounds?, replace?)`：给模型用的自然语言入口。`target="3 整理文档"` 或 `rounds=3` 就是 3 轮；`target="整理文档 3"` 里的 3 算目标文本，用默认 3 轮。

## 配置

`cordis.patch.yml` 可改，括号内是默认值：

```yaml
commandName: goal            # 主命令名
aliasCommandName: target     # 别名，'' 关闭
shadowGoalPerAgent: true     # false = 退回内置 /goal
trailingRounds: false        # 只认「3 目标」；末尾数字按官方语义算目标文本
defaultRounds: 3             # 工具没写轮数时用
maxAllowedRounds: 500
requireDirectHuman: true     # 只允许真人回合创建
```

## 自检

```bash
node selftest.mjs      # 126 项，离线
node verify-live.mjs   # 20 项，需要本机 DSH（没有会跳过）
node mutate.mjs        # 变异测试
npm run check          # 全跑
```

实现只有 `index.js` + `lib/{parse,command,tool,config}.js`，零依赖。

## 贡献

本仓库以自用为主：欢迎用 issue 报问题或讨论用法，但 PR 不保证合并。
改完请先跑 `npm run check`（离线自检 + 真实环境验证 + 变异测试），或在 PR 描述里贴出结果。

## 许可证

MIT © [Fireawa](https://github.com/Fireawa)。发布流程见 [PUBLISHING.md](PUBLISHING.md)。
