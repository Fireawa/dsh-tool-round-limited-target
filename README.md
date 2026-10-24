# dsh-tool-round-limited-target — 给 `/goal` 加一个轮数

[![CI](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml/badge.svg)](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

在 DSH 原版 `/goal` 后面加一个数字，这个数字就是自动执行的轮数；轮数用完**自动停止**。

```bash
/goal 3 整理文档        # 最多跑 3 轮，然后停
/目标 3 整理文档        # 也行（客户端把内置标签当别名，提交时规范化成 /goal）
```

```
/goal 3 整理文档
  ↓ 建目标 objective="整理文档"，maxGoalRounds=3（命令直接执行，不进模型）
  ↓ 自动跑第 1/3、2/3、3/3 轮
  ↓ 第 3 轮结束 → 目标自动标为 blocked（code=round-limit）→ 停止
```

---

## 语法（= DSH 原版 + 轮数）

| 输入 | 结果 |
| --- | --- |
| `/goal 3 整理文档` | 建目标，最多 3 轮（**轮数在前**） |
| `/goal 3轮 整理文档` / `/goal 3: 整理文档` | 同上 |
| `/goal 整理文档 3` | 同上（轮数写在末尾也认） |
| `/goal 3 "整理文档"` | 引号自动剥掉 |
| `/goal 整理文档` | 原样行为：用部署默认轮数（内置语义不变） |
| `/goal rounds 8` | **只改轮数**，保留目标与已跑进度 |
| `/goal edit 新目标 5` | 改目标（可同时改轮数） |
| `/goal pause` / `resume` / `clear` | 与内置完全相同 |
| `/goal` | 查看 Status / Objective / Rounds / Activation |

输出格式沿用内置 `/goal`（`Status:` / `Objective:` / `Rounds: 1/3` / `Activation:` / `Commands:`），只是多了 `Goal created (limit 3 rounds)` 这类标题。

### `/目标` 也能敲（保留了内置身份）

`@deepseek-ai/dsh-commands` 的命令名是硬性 ASCII（`/^[a-z][a-z0-9_-]*$/u`，注册与解析各一份），
所以**注册一个叫「目标」的命令是不可能的**。但客户端还有一层别名表：

```js
const BUILTINS = { goal: "@deepseek-ai/dsh-command-goal", ... };
const TOKEN_ALIASES = { 目标: 'goal', goal: 'goal', ... };   // 由 token.goal 生成
resolveCommand('目标') → descriptors.find(d => d.definitionId === BUILTINS.goal)
```

所以本插件的 `/goal` 沿用了内置的 `definitionId`，于是：

| 位置 | 效果 |
| --- | --- |
| 菜单 | 显示 **目标** + 目标图标（`IconGoalOutlineRegular`）+ 中文简介；轮数写法在 hint 里 |
| 输入框 | 敲 `/目标 3 整理文档` 会被解析成 goal，提交时规范化成 `/goal 3 整理文档` |
| 宿主 | 命令名仍是 `goal`（ASCII），下游 `parseCommand` 不会被中文卡住 |

如果哪天客户端这条别名链断了，`/goal 3 整理文档` 永远可用；`/目标 3 整理文档` 作为普通消息发过来时，我也能按同样语义调工具。

---

## 为什么能接管内置 `/goal`（不改任何全局包）

这是本插件唯一的“技巧”，值得说明白，因为它依赖 DSH 的既有结构，不是 hack：

1. web profile 里**根级**的 `command-goal` 是 `disabled: true`（`dsh-web-app` 打的补丁）；
2. 真正生效的 `/goal` 挂在 **agent preset** 里：

```yaml
- id: preset-standard
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    plugins: [ ..., command-goal, tool-goal, ... ]
```

3. preset 由 `dsh-agent-preset-registry` 用 `createScope()` 挂进「preset 作用域」，再把 **agent 的作用域绑成它的子节点**（`bindScopeParent(agent, presetKey)`）；
4. `CommandRuntime` 合并命令时走 `ScopedLayers.merge`：

```
global  →  作用域链（远 → 近）  →  最近的胜出
```

即 **global 最低，agent 自己的作用域最高**。插件在 agent 作用域里注册同名 `goal`，就压过 preset 里的内置版，而且两者不在同一层，不会触发 "already registered"。

5. `definitionId` 照抄内置的（`@deepseek-ai/dsh-command-goal`），所以图标、中文标签、`/目标` 别名全部保留——这只是一个字符串，`CommandDefinitionId()` 是恒等函数，无需 import 任何包。

已用真实的 `cordis` + `dsh-commands` + `dsh-scope` 端到端验证（`node verify-live.mjs`）：

```
list(agent) → goal(…), target(…)
find(goal)  → 限轮目标：/goal 3 整理文档…        ← 不是内置版
goal.definitionId = @deepseek-ai/dsh-command-goal ← 客户端据此显示「目标」+ 图标
/goal 3 整理文档 → create({objective:"整理文档", maxGoalRounds:3})
/goal rounds 7   → edit({maxGoalRounds:7})
list 里 goal 条数 = 1                            ← 内置版被完全遮蔽，不是并列
```

**退路**：把 `shadowGoalPerAgent` 设成 `false` 就退回内置 `/goal` 的行为，此时 `/target` 仍然带轮数。

---

## 产出的工具

### `round_limited_goal(target, rounds?, replace?)`

给模型用的自然语言入口：你说「帮我整理文档 3」，模型调它。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `target` | ✅ | 要做的事，末尾加数字表示轮数：`"整理文档 3"`、`"整理文档x3"`、`"整理文档（3）"` |
| `rounds` | | 显式轮数，**优先级最高**，不依赖末尾解析 |
| `replace` | | 已有未完成目标时是否清掉重建（默认 `false`，只返回说明） |

末尾解析规则（工具与 `/goal` 末尾写法共用）：

| 写法 | 结果 |
| --- | --- |
| `整理文档 3` | 3 轮（空格 + 数字） |
| `整理文档 3轮` / `3 轮` / `3 次` / `3 rounds` | 3 轮 |
| `整理文档x3` / `×3` / `*3` | 3 轮（可紧贴） |
| `整理文档（3）` / `整理文档 (3)` | 3 轮 |
| `整理到第 3 章` | **不算**（数字后面还有字），整句当目标 |
| `把第3章改成第4章` | **不算**（数字在句中） |
| `文档2` | **不算**（无分隔符） |

---

## 轮数用完以后

目标变成 `phase=blocked`、`blockedReason.code=round-limit`，自动继续立刻停止（driver 只驱动 `active` 且 `armed` 的目标）。内置那段逻辑是：

```js
if (goal.roundsStarted >= goal.maxGoalRounds) {
  ctx.goals.block(agent, goalRef(goal), {
    code: 'round-limit',
    message: `Goal reached its configured limit of ${goal.maxGoalRounds} rounds.`,
  });
  return;
}
```

要接着做：

```
/goal rounds 8      # 先提高上限（保留已跑进度）
/goal resume        # 再恢复自动继续
```

`/goal` 在 exhausted 状态会直接提示这一步。

---

## 配置（`cordis.patch.yml`）

```yaml
- insert:
    - id: round-limited-target
      name: 'dsh-tool-round-limited-target'
      config:
        commandName: goal          # 主命令名（改成别的就不接管 /goal）
        aliasCommandName: target   # 全局别名；'' 关闭
        shadowGoalPerAgent: true   # 在 agent 作用域接管 /goal
        trailingRounds: true       # 接受「目标 3」这种末尾轮数
        toolName: round_limited_goal
        defaultRounds: 3           # 工具没写轮数时用这个（超过 maxAllowedRounds 时按上限）
        maxAllowedRounds: 500      # 上限，超过报错不夹断
        requireDirectHuman: true   # 工具与内置 create_goal 同一权限策略
```

`requireDirectHuman` 的判据与 `@deepseek-ai/dsh-tool-goal` 的 `hasDirectHumanInput` 一致（扫本轮 `user/message` 的 `source.kind === 'user'`）；拿不到会话投影时**放行**（返回 `undefined` 而不是 `false`）。斜杠命令由人自己敲，不受此项约束。

---

## 安装 / 注册

装完都要**重启 `dsh web`**（Host 插件代码只在启动时加载）。

### 1. `dsh plugin`（推荐，需要本机有 pnpm）

```bash
# 发布到 npm 之后
dsh plugin --profile web add dsh-tool-round-limited-target

# 或者直接从 GitHub 安装
dsh plugin --profile web add git+https://github.com/Fireawa/dsh-tool-round-limited-target.git
```

`dsh plugin` 会把参数转发给 profile 目录里的 pnpm，并把组合包加入
`dsh.profile.bundles`（默认启用）。

### 2. Web 界面

Web → **Plugins** → 添加插件 → 粘贴 Git 地址
`https://github.com/Fireawa/dsh-tool-round-limited-target`
（也接受包名、tarball、本地绝对路径）。

### 3. 本地开发（`link:` 指向 checkout）

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-tool-round-limited-target": "link:/绝对/路径/dsh-tool-round-limited-target"
},
"dsh": { "profile": { "bundles": [ "...", "dsh-tool-round-limited-target" ] } }
```

然后在 profile 目录跑 `pnpm install`（或手工建一个指向插件目录的 junction），重启 `dsh web`。

**装上了怎么确认：** 敲 `/goal`，菜单里那条命令的描述应该是
「限轮目标：/goal 3 整理文档 …」而不是 DSH 内置的「设置或查看长期任务目标」；
`/goal 3 整理文档` 能建出 `Rounds: 0/3` 的目标，就说明接管成功。

> 想自己打包发布？见 [PUBLISHING.md](PUBLISHING.md)。

---

## 代码结构

```
index.js            插件主体：装配。注册工具、注册命令、在 agent 作用域接管 /goal
lib/config.js       配置默认值与归一化（非法值回落；defaultRounds 夹到上限）
lib/parse.js        纯解析：末尾轮数、/goal 子命令。无 ctx，便于单测
lib/command.js      /goal 命令定义、状态卡片、执行分支
lib/tool.js         round_limited_goal 工具、权限门、回显文案
selftest.mjs        离线自检（mock ctx）
verify-live.mjs     真实 dsh-commands / cordis / dsh-scope 验证
mutate.mjs          变异测试
PUBLISHING.md       发布指南（GitHub + 可选 npm）
scripts/set-owner.mjs  一键替换仓库里的 Fireawa 占位符
.github/workflows   CI（ci.yml）与 DSH 兼容性哨兵（compat.yml）
```

依赖是单向的：`index → tool/command → parse`，`config` 只被 `index` 使用；
模块之间没有循环，也没有全局单例（除了 `index.js` 里用来防重复注册的 `ACTIVE`）。
入口只额外转发 `parseGoalCommand` / `parseRoundTarget` 两个纯函数给自检脚本，
其余常量与辅助函数都留在各自模块内部。

---

## 自检：三个脚本，覆盖三种风险

```powershell
cd dsh-tool-round-limited-target
node selftest.mjs      # 118 项，mock，纯离线
node verify-live.mjs   # 20 项，真实 DSH 包（找不到就跳过）
node mutate.mjs        # 变异测试：证明上面两个真的会红
```

也可以 `npm run test` / `npm run verify` / `npm run mutate` / `npm run check`（全跑）。

### `selftest.mjs` — 逻辑正确性（118 项，全 mock）

| 组 | 覆盖 |
| --- | --- |
| 解析 | 末尾/开头轮数、`x3`、括号、引号、`第 3 章` 这类误判防护 |
| 工具 | 注册、参数是对象根 schema、新建 / 显式轮数优先 / 默认轮数 / 默认轮数夹到上限 / 超上限 / 空目标 / 纯数字目标 / 已有目标拒绝 + `replace` / 权限门（非真人回合拒绝、无法判断时放行） |
| `/goal` 语法 | 轮数在前/末尾、中文引号、`0` 轮、7 位数字、`edit` 两种顺序、`rounds`、`clear/pause/resume`、`trailingRounds=false`、大小写回退 |
| 命令注册与执行 | 全局 `goal` + `target` 共用同一 handler、agent 作用域接管开关、`definitionId` 只给 goal 不给别名、`complete` 上 `edit` 变 `create`、`rounds` 提上限后的 resume 提示 |

### `verify-live.mjs` — 假设正确性（真实包）

selftest 证明不了「我的 mock 和 DSH 一致」，所以这个脚本直接 import 本机的
`@deepseek-ai/dsh-commands` / `cordis` / `dsh-scope`，造出 preset 作用域 + agent 作用域，验证：

- `parseCommand('/goal 3 整理文档')` 的真实切分；`/目标 …` 在**宿主**层确实返回 `undefined`；
- 本插件的命令定义能通过真实 `register()` 校验（直接复用插件的定义工厂，测试里不再另抄一份 description/hint）；同名重复注册确实会被拒（说明接管只能靠作用域）；
- **agent 作用域压过 preset 作用域**，`list()` 里只有一个 `goal`；
- `definitionId` 与 descriptor 里都带 `@deepseek-ai/dsh-command-goal`（客户端据此显示「目标」+ 图标、接受 `/目标` 别名），别名 `target` 不抢身份；
- 真实 handler 链路：`/goal 3 x` → `create(maxGoalRounds:3)`，`/goal rounds 7` → `edit`；
- 接管成功时**不应**触发插件的自检告警（自检比较的是 `handler` 引用，不是文案字符串）。

找不到全局包时静默跳过（退出码 0）；可用 `DSH_AI_DIR=…/dsh/node_modules/@deepseek-ai` 指定。

### `mutate.mjs` — 测试自身有没有牙齿

把源码复制到临时目录，注入 9 个语义 bug（`>` 改 `<`、关掉分支、删掉校验、命令名改中文、丢掉 `definitionId`…），
跑 selftest，应当**全部变红**。另加 1 个只落在「mock 看不见」的异步自检上的变异：

```
基线（未变异）：exit 0  ✅ 全绿
✅ M1 轮数上限校验反向   ✅ M6 clear 子命令失效
✅ M2 末尾轮数解析失效   ✅ M7 complete 上的 edit 不走 create
✅ M3 不再接管 /goal     ✅ M8 命令名改成中文
✅ M4 真人权限门失效     ✅ M10 丢掉定义身份（图标/中文标签会消失）
✅ M5 轮数下界失效（允许 0）
M9 接管自检误报:  selftest → 漏网（符合预期）  verify-live → ✅ 抓住
```

这就是保留两个脚本的理由：**selftest 管逻辑分支，verify-live 管「我假设的 DSH 行为」**。
DSH 升级导致作用域优先级、命令名校验或 `definitionId` 语义变化时，只有 verify-live 会红。

---

## 已知限制

1. **宿主命令名只能小写 ASCII**：`/goal` 是注册名；`/目标` 能敲是因为客户端把内置标签当作别名（`TOKEN_ALIASES`），提交时会规范化成 `/goal`。`/Goal`（大写）不行。
2. **末尾裸数字天然有歧义**：`/goal 修复 bug 42` 会被读成 42 轮。把 `trailingRounds` 设成 `false` 可关闭这一形式，或用轮数在前的写法 `/goal 42 修复 bug`。
3. **接管的是命令行为，不是内置包**：`@deepseek-ai/dsh-command-goal` 仍在 preset 里加载（只是被遮蔽）。DSH 升级若改了它的语法，本插件不会自动跟随；届时把 `shadowGoalPerAgent` 设成 `false` 即回到内置行为。
4. **菜单简介是内置那句**：保留 `definitionId` 换来图标和「目标」标签，代价是菜单描述显示 DSH 内置的「设置或查看长期任务目标」而不是本插件的文案；轮数写法放在 hint 里（`3 <要做什么> · clear | pause | resume | edit <目标> | rounds <n>`）。
5. **`/goal` 不再支持附件**：内置版允许带图片/文件（会作为目标参考发出去），接管后本插件不声明 `input.attachments`，带附件提交会被注册表**明确拒绝**（不会静默丢掉）。需要带参考文件时：用普通消息发附件，或先发附件再 `/goal ...`。
6. **轮数不是时间**：3 轮 = 3 次自动继续，不等于 3 分钟。第 3 轮结束不管做完没做完都会停（没做完就是 blocked）。
7. 与 `ralph` 的区别：ralph 是**阻塞式前台循环 + 每轮新开子 agent**；本插件是**同会话 goal 轮次**，历史连续、上下文不重置。
8. **同一进程只装一次**：`apply` 用模块级 `ACTIVE` 防止重复注册，同一进程里若再加载第二个 profile，会先 dispose 前一份注册。DSH 每个 profile 独立进程，实际不会遇到。
