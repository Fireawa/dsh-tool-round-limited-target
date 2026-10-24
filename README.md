# dsh-tool-round-limited-target（限轮目标）

中文 | [English](README.en.md)

[![CI](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml/badge.svg)](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

给 DSH 的 `/goal` 加一个数字：**数字就是自动执行的轮数，用完自动停**。

```bash
/goal 3 整理文档      # 最多 3 轮
```

## 用法

| 写法 | 结果 |
| --- | --- |
| `/goal 3 整理文档` | 最多 3 轮（轮数在前） |
| `/goal 整理文档 3` | 同上（末尾也认） |
| `/goal 3轮 整理文档` | 同上 |
| `/goal rounds 8` | 只改上限，保留进度 |
| `/goal edit 新目标 5` | 改目标（可同时改轮数） |
| `/goal pause` / `resume` / `clear` | 与内置相同 |
| `/goal` | 查看状态 |

轮数用完，目标自动变成 `blocked`（`code=round-limit`），不会多跑。要接着做：

```bash
/goal rounds 8      # 先提高上限
/goal resume        # 再恢复
```

`/目标 3 整理文档` 也能敲——沿用了内置命令身份，图标和中文标签不变。

## 安装

```bash
dsh plugin --profile web add git+https://github.com/Fireawa/dsh-tool-round-limited-target.git
```

也可以 Web → **Plugins** → 添加插件 → 粘贴上面的地址（或本地路径）。装完**重启 `dsh web`**。
本地开发用 `link:` 指向 checkout 即可。

## 工具

`round_limited_goal(target, rounds?, replace?)`：给模型用的自然语言入口，`target="整理文档 3"` 就是 3 轮。

## 配置

`cordis.patch.yml` 可改，括号内是默认值：

```yaml
commandName: goal            # 主命令名
aliasCommandName: target     # 别名，'' 关闭
shadowGoalPerAgent: true     # false = 退回内置 /goal
trailingRounds: true         # false = 只认「3 目标」，避免「修复 bug 42」
defaultRounds: 3             # 工具没写轮数时用
maxAllowedRounds: 500
requireDirectHuman: true     # 只允许真人回合创建
```

## 自检

```bash
node selftest.mjs      # 118 项，离线
node verify-live.mjs   # 20 项，需要本机 DSH（没有会跳过）
node mutate.mjs        # 变异测试
npm run check          # 全跑
```

实现只有 `index.js` + `lib/{parse,command,tool,config}.js`，零依赖。发布流程见 [PUBLISHING.md](PUBLISHING.md)，License: MIT。
