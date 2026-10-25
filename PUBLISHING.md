# 发布指南

面向维护者。**当前状态**：仅通过 GitHub 分发，未发布到 npm。

| 项 | 值 |
| --- | --- |
| 仓库 | https://github.com/Fireawa/dsh-tool-round-limited-target |
| 当前版本 | `1.0.2` —— `package.json` / `CHANGELOG.md` / tag `v1.0.2` 三处一致 |
| 分发方式 | GitHub（`main` 或指定 tag）+ Release 附件 `*.tgz` |
| npm | 未发布，README 里不提供 npm 安装命令 |

---

## 0. 环境

需要 Git、Node ≥ 20。用户侧安装需要本机有 `pnpm`（`dsh plugin` 会转发给 pnpm）。

---

## 1. 改完代码先跑自检

```powershell
node selftest.mjs      # 126 项，纯离线，必须全绿
node verify-live.mjs   # 20 项；本机没有 DSH 包时自动跳过（退出码 0）
node mutate.mjs        # 变异测试；需要 verify-live 能真的跑起来
```

只想跑离线部分：`npm test`；全跑：`npm run check`。CI 会在 Node 20 / 22 上跑同一套。

---

## 2. 发布新版本

### 2.1 改版本号与 CHANGELOG

1. `package.json` 的 `version` 改成新版本；
2. `CHANGELOG.md` 加一节 `## [x.y.z] - YYYY-MM-DD`，按 Keep a Changelog 分类；
3. 如果用法/行为变了，同步 `README.md`、`README.en.md`、`cordis.patch.yml` 注释、`lib/command.js` 里的 `GOAL_COMMAND_DESCRIPTION` 与 `GOAL_INPUT_HINT`。

### 2.2 提交、打 tag、推送

```powershell
git add -A
git commit -m "chore(release): x.y.z"
git tag -a vx.y.z -m "vx.y.z — 一句话说明"
git push origin main
git push origin vx.y.z
```

### 2.3 建 Release

装了 GitHub CLI 的话：

```powershell
npm pack --pack-destination .
gh release create vx.y.z --title "vx.y.z — 标题" --generate-notes "dsh-tool-round-limited-target-x.y.z.tgz"
```

没有 `gh` 就在网页 **Releases → Draft a new release**：

1. 选刚推上去的 tag；
2. 标题写 `vx.y.z — 一句话`；
3. 正文从 `CHANGELOG.md` 对应小节复制；
4. 把 `npm pack` 出来的 `.tgz` 拖进 Attachments；
5. Publish。

> 附件很重要：它让用户不必 clone 就能装，也给内网/离线场景留了路。

---

## 3. 用户怎么装

三种方式，任选其一；装完**重启 `dsh web`**（宿主插件只在启动时加载）。

```powershell
# A. 跟随 main（会随仓库最新提交变化）
dsh plugin --profile web add git+https://github.com/Fireawa/dsh-tool-round-limited-target.git

# B. 锁定版本（推荐，行为可预期）
dsh plugin --profile web add github:Fireawa/dsh-tool-round-limited-target#v1.0.2

# C. 离线 tgz（从 Release 下载后指向文件）
dsh plugin --profile web add ./dsh-tool-round-limited-target-1.0.2.tgz
```

也可以在 **Web → Plugins → 添加插件** 里粘贴上面的地址。

**怎么确认装上了：** 重启后敲 `/goal`，菜单里那条命令的描述应该是「限轮目标：/goal 5 整理文档 —— 轮数写在最前面…」，而不是内置的「设置或查看长期任务目标」。`/goal 5 整理文档` 能建出 `Rounds: 0/5` 的目标就说明接管成功。

---

## 4. 仓库设置

进入仓库 → **Settings** / 右侧 **About**：

| 位置 | 建议 |
| --- | --- |
| Description | `给 DSH 的 /goal 加轮数：/goal 3 整理文档 表示最多自动跑 3 轮，用完自动标为 blocked（round-limit），不会多跑一轮。` |
| Topics | `dsh` `deepseek-harness` `dsh-plugin` `goal` `slash-command` `agent` |
| Features → Issues | 打开 |
| Actions → General | 保持默认（允许运行 workflow） |
| Branches | 个人项目可不设保护；要设就保护 `main` 并要求 CI 通过 |

`ci` 每次 push / PR 跑：语法检查 + 126 项离线自检；`compat` 每周一拉最新版 DSH 跑真实环境验证 + 变异测试，用来尽早发现 DSH 升级导致的失效。

---

## 5. 兼容性与版本策略

- 本插件依赖两条 DSH 内部约定：**agent 作用域的命令压过 preset 作用域**、**内置 `definitionId` 用于客户端身份**。这两条一变，`verify-live.mjs` 会红，`compat` 每周跑一次就是盯这个。
- 不写 `engines.dsh`：避免 DSH 一升级就把用户拦在门外；等 API 稳定后再收紧。
- 版本号：行为/语法变化 → minor；纯修复 → patch；破坏性变化（比如不再接管 `/goal`）→ major。首个公开版本为 `1.0.0`，之后按下面的规则递增。
- 每次发版都要做到三处一致：`package.json` 的 `version`、`CHANGELOG.md` 的小节标题、git tag 名。

---

## 6. 发布前 checklist

- [ ] `node selftest.mjs` 全绿（126 项）
- [ ] `node verify-live.mjs` 在装有 DSH 的机器上全绿（20 项）
- [ ] `node mutate.mjs` 全绿（10 个变异全部被抓）
- [ ] `package.json` 的 `version`、`CHANGELOG.md` 标题、tag 名三处一致
- [ ] README 中英两份的用法表与代码实际行为一致（改过解析规则时尤其要核对）
- [ ] `npm pack --dry-run` 的清单符合预期（含 `lib/`、`cordis.patch.yml`、两份 README）
- [ ] `git status` 干净，`node_modules/` 没被提交
- [ ] 仓库是 public，LICENSE 被 GitHub 识别为 MIT
- [ ] Release 已建，`.tgz` 附件已上传

---

## 7. 常见问题

**`/goal` 还是内置行为？**
先确认重启了 `dsh web`；看启动日志里有没有 `已注册全局命令 /goal` 和 `已在 agent 作用域接管 /goal`。若出现「仍解析到别的实现，接管未生效」，说明 DSH 的作用域优先级变了——跑 `node verify-live.mjs` 确认，并把 `shadowGoalPerAgent` 设成 `false` 可暂时退回内置行为（`/target` 仍可用）。

**装完发现写法的行为和文档不一致？**
本插件只认「轮数在最前面」（`/goal 5 目标`）。末尾数字一律算目标文本——这是刻意的，对应官方 `/goal` 语义。如果文档和实现对不上，先看 `cordis.patch.yml` 里 `trailingRounds` 是否被改成了 `true`。

**安装时报包名无效？**
GitHub 方式必须用完整 `git+https://…` 地址，或 `github:owner/repo#tag` 简写；`dsh plugin add dsh-tool-round-limited-target` 这种 npm 写法在包发布到 npm 之前一律无效。

**想带附件用 `/goal`？**
接管版不声明 `input.attachments`，注册表会明确拒绝。改用普通消息发附件，或先发附件再 `/goal …`。

**DSH 升级后 `compat` 红了？**
多半是内部约定变了。先看 `verify-live` 哪条断言失败；必要时收紧版本范围并在 README 注明已验证的 DSH 版本。
