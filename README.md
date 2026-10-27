# dsh-tool-round-limited-target（限轮目标）

中文 | [English](README.en.md)

[![CI](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml/badge.svg)](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Fireawa/dsh-tool-round-limited-target)](https://github.com/Fireawa/dsh-tool-round-limited-target/releases)

给 DSH 的 `/goal` 加一个轮数上限：**写在最前面的数字就是最多自动执行的轮数，用完自动停**。

```bash
/goal 3 整理文档      # 最多 3 轮
```

## 用法

```bash
/goal 3 整理文档        # 最多 3 轮
```

- 轮数写在**最前面**才是上限，`轮` / `次` / `rounds` 可省：`/goal 3轮 整理文档` 等价。
- 写在末尾不算：`/goal 整理文档 3` 里的 3 属于目标文本，按官方语义不设上限。
- 子命令同内置 `/goal`：`rounds <n>` 只改上限、`edit [轮数] 目标` 改目标、`pause` / `resume` / `clear`，不带参数查看状态。

轮数用完，目标自动变成 `blocked`（`code=round-limit`），不会多跑。要接着做：

```bash
/goal rounds 8      # 先提高上限
/goal resume        # 再恢复
```

## 安装

要求：Node.js 20+，且已装好 DSH。

跟随 `main`（会随仓库最新提交变化）：

```bash
dsh plugin --profile web add git+https://github.com/Fireawa/dsh-tool-round-limited-target.git
```

锁定版本（推荐，行为可预期）：

```bash
dsh plugin --profile web add github:Fireawa/dsh-tool-round-limited-target#v1.0.3
```

也可以 Web → **Plugins** → 添加插件 → 粘贴上面的地址（或本地路径）。装完**重启 `dsh web`**。
本地开发用 `link:` 指向 checkout 即可。

## 工具

`round_limited_goal(target, rounds?, replace?)`：给模型用的自然语言入口。`target="3 整理文档"` 或 `rounds=3` 就是 3 轮；**没有显式轮数时直接拒绝**，避免模型在普通对话里凭空建出一个限轮目标。

## 配置

`cordis.patch.yml` 可改，括号内是默认值：

```yaml
commandName: goal            # 主命令名
aliasCommandName: target     # 别名，'' 关闭
shadowGoalPerAgent: true     # false = 退回内置 /goal
trailingRounds: false        # 只认「3 目标」；末尾数字按官方语义算目标文本
defaultRounds: 3             # 仅在 requireExplicitRounds=false 时兜底
maxAllowedRounds: 500
requireDirectHuman: true     # 只允许真人回合创建
requireExplicitRounds: true  # 没有显式轮数就拒绝建目标（防模型误触发）
```

## 自检

```bash
node selftest.mjs      # 136 项，离线
node verify-live.mjs   # 20 项，需要本机 DSH（没有会跳过）
node mutate.mjs        # 变异测试
npm run check          # 全跑
```

实现只有 `index.js` + `lib/{parse,command,tool,config}.js`，零依赖。

## 许可证

MIT © [Fireawa](https://github.com/Fireawa)。发布流程见 [PUBLISHING.md](PUBLISHING.md)。
