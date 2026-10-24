# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Changed

- 源码注释统一改为英文（面向开发者）；工具描述、`/goal` 回显、日志等用户可见文案保持原样。
- `README.md` / `README.en.md` 补齐「许可证」段落与署名、贡献说明、Node.js 20+ 运行要求。
- 新增 `.editorconfig`，统一缩进与换行。

## [1.1.0] - 2026-10-24

### Added

- `defaultRounds` 超过 `maxAllowedRounds` 时按上限使用，不再让「不写轮数」的调用必然失败。
- 工具拒绝纯数字目标（`round_limited_goal(target="3")`），与 `/goal 3` 行为一致。
- `npm run test` / `verify` / `mutate` / `check` 快捷脚本。
- GitHub Actions：`ci.yml`（离线自检 + 语法检查）、`compat.yml`（每周对最新 DSH 跑真实环境验证）。

### Changed

- 源码拆分为 `index.js` + `lib/{config,parse,command,tool}.js`，入口只做装配。
- `/goal` 接管自检改为比较 `handler` 引用，不再依赖描述字符串。
- `verify-live.mjs` 直接复用插件的命令定义工厂，避免测试里另抄一份 description/hint。

### Removed

- 未使用的 `parseCommandTarget` 导出。
- 仅内部使用、却对外导出的常量（`DEFAULT_CONFIG`、`DESCRIPTION`、`GOAL_*`）。

## [1.0.0] - 2026-10-24

### Added

- 首个版本：`/goal 3 <目标>` 限轮、`/goal rounds <n>`、`round_limited_goal` 工具、agent 作用域接管内置 `/goal`。
- 三套自检：`selftest.mjs`（118 项离线）、`verify-live.mjs`（20 项真实包）、`mutate.mjs`（10 个变异）。
