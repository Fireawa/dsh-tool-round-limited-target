# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.3] - 2026-10-27

### 修复

- **没有输入 `/goal` 也会被错误启用**。根因是 `round_limited_goal` 工具在「调用方没给轮数」时用 `defaultRounds`（默认 3）兜底建目标：只要模型认为用户要的是多步骤任务就会调用它，于是在普通对话里凭空出现一个 3 轮上限的目标，跑完还会被标成 `blocked`。
- 新增配置 `requireExplicitRounds`（默认 `true`）：没有显式轮数（目标开头的数字，或 `rounds` 参数）时**直接拒绝创建**，并提示改用 `create_goal`。`trailingRounds: true` 时末尾数字也算显式。
- 工具描述改写：开头就写明「只在用户明确要求轮数上限时才调用」，去掉「不写轮数就默认 3 轮」的说法。

### 自检

- `selftest.mjs` 增至 136 项：覆盖「无轮数被拒绝且不建目标」「关闭 requireExplicitRounds 后回落到 defaultRounds」「末尾数字在默认配置下被拒绝」。

## [1.0.2] - 2026-10-25

### 修复

- CI 的语法检查改为通配 + `nullglob` + 逐个 `-f` 判断。以前写死 `scripts/*.mjs`，`scripts/` 目录不存在时通配符会以字面量传给 `node --check`，报 `MODULE_NOT_FOUND` 导致 job 失败。

### 文档

- 删除「贡献」小节。

## [1.0.1] - 2026-10-25

### 文档

- README 的「用法」从 9 行表格改成「一个例子 + 三条要点」，只强调唯一的限轮写法。
- 删掉标题下与用法段重复的说明，以及 `/目标` 别名的提示，减少噪音。
- 安装段补「锁定版本」写法；新增 Release 徽章。
- `PUBLISHING.md` 按当前状态重写：版本号、测试数量、路径、占位符说明全部对齐。

### 移除

- `scripts/set-owner.mjs`：占位符替换脚本，仓库里已没有 `__OWNER__` 需要替换。

## [1.0.0] - 2026-10-25

首个公开版本。

### 功能

- `/goal 5 <目标>`：轮数写在最前面，最多自动跑 5 轮；用完后由 `goal-round-driver` 标成 `blocked`（`code=round-limit`）并停止，不会多跑一轮。
- 只有「数字在最前面」会设上限。末尾数字（如 `/goal 修复 bug 42`）按官方 `/goal` 语义处理：整句都是目标，不设上限、不报错。
- `/goal rounds <n>` 只改上限、保留进度；`clear` / `pause` / `resume` / `edit` 与内置一致。
- `round_limited_goal(target, rounds?, replace?)`：给模型用的自然语言入口，只有 `target="5 目标"` 或 `rounds=5` 才设轮数。
- 在 agent 作用域接管内置 `/goal`，沿用同一个 `definitionId`，图标与「目标」标签不变。

### 实现

- 源码拆分为 `index.js` + `lib/{config,parse,command,tool}.js`，入口只做装配，零依赖。
- 接管自检比较 `handler` 引用，不依赖描述字符串，文案改动不会误判。
- 全部配置项可在 `cordis.patch.yml` 覆盖，`trailingRounds` 默认 `false`。

### 自检

- `selftest.mjs`：126 项，离线。
- `verify-live.mjs`：20 项，跑真实 DSH 包（作用域优先级、注册校验、handler 链路）。
- `mutate.mjs`：10 个变异，验证测试真的会抓错。
- GitHub Actions：`ci.yml`（离线自检 + 语法检查）、`compat.yml`（每周对最新 DSH 跑真实环境验证）。
