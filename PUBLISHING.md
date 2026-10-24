# 发布指南（GitHub + 可选 npm）

这个目录已经是可直接推送的仓库内容。下面按顺序做一遍就能发布。

---

## 0. 一次性准备

需要：Git、Node ≥ 20。发布到 npm 才需要 npm 账号；DSH 用户安装需要本机有 `pnpm`（`dsh plugin` 会转发给 pnpm）。

**先替换占位符。** 仓库里所有 `Fireawa` 都指你的 GitHub 用户名：

```powershell
cd "$HOME\Desktop\dsh-tool-round-limited-target"
node scripts/set-owner.mjs 你的GitHub用户名
```

它会改 `package.json`（author / repository / homepage / bugs）、`README.md`（badge 和安装命令）、`PUBLISHING.md`、`LICENSE`。
替换后可以 `git diff` 检查一眼。

---

## 1. 本地先跑一遍自检

```powershell
node selftest.mjs      # 118 项，纯离线，必须全绿
node verify-live.mjs   # 20 项；本机没有 DSH 包时会自动跳过（退出码 0）
node mutate.mjs        # 变异测试；需要 verify-live 能真的跑起来
```

只想跑离线部分：`npm test`；全跑：`npm run check`。

---

## 2. 初始化仓库并推送

```powershell
cd "$HOME\Desktop\dsh-tool-round-limited-target"
git init -b main
git add .
git commit -m "feat: round-limited /goal plugin for DSH"
```

仓库已经在 GitHub 上建好（Web 上建，或装 GitHub CLI 后一条命令）：

```powershell
# 方式 A：网页建好空仓库后
git remote add origin https://github.com/你的用户名/dsh-tool-round-limited-target.git
git push -u origin main

# 方式 B：用 gh 直接创建并推送
gh repo create dsh-tool-round-limited-target --public --source=. --remote=origin --push
```

> 仓库名建议就用 `dsh-tool-round-limited-target`；如果改了名字，`package.json` 的 `name`、
> `repository`、`homepage`、`bugs` 和 README 里的 URL 要一起改。

---

## 3. GitHub 仓库设置

进入仓库 → **Settings** / 右侧 **About**：

| 位置 | 建议 |
| --- | --- |
| Description | `给 DSH 的 /goal 加轮数：/goal 3 整理文档，用完自动停（round-limit）。` |
| Website | 留空，或指向 README |
| Topics | `dsh` `deepseek-harness` `dsh-plugin` `goal` `slash-command` `agent` |
| Features → Issues | 打开（接收 bug） |
| Features → Discussions | 可选 |
| Actions → General | 保持默认（允许运行 workflow） |
| Branches | 个人项目可不设保护；要设就保护 `main`、要求 CI 通过 |

第一次 push 后，**Actions** 里会出现 `ci`：语法检查 + 118 项离线自检 + `verify-live`（在 CI 上会跳过）。
`compat` 是每周一的手动/定时任务，会装最新版 DSH 跑真实环境验证和变异测试，用来发现 DSH 升级导致的失效。

---

## 4. 打 tag、发 Release

版本号先和 `package.json` 的 `version` 对齐（当前 `1.1.0`），再把 `CHANGELOG.md` 补上这一版：

```powershell
git tag v1.1.0
git push origin v1.1.0
gh release create v1.1.0 --title "v1.1.0" --notes-file CHANGELOG.md
```

没有 `gh` 就在网页 **Releases → Draft a new release**：选 `v1.1.0`，标题同名，正文从 `CHANGELOG.md` 复制，Publish。
GitHub 会自动附上 Source code (zip/tar.gz)——这个 zip 本身就是可分发的安装包（DSH 插件页也接受压缩包）。

---

## 5. 发布到 npm（可选）

GitHub 已经足够分发（支持 git 地址 / 压缩包安装）。想让安装命令更短（`dsh plugin add dsh-tool-round-limited-target`）再发 npm。

```powershell
# 1) 看名字是否被占（返回 404 就是没被占）
npm view dsh-tool-round-limited-target version

# 2) 检查将要发布的文件清单（不应包含 node_modules / scripts / .github）
npm pack --dry-run

# 3) 登录并发布
npm login
npm publish --access public
```

如果名字被占用，改成带 scope 的包名（例如 `@你的名字/dsh-tool-round-limited-target`）：

1. 改 `package.json` 的 `name`；
2. 同步 README / PUBLISHING 里的安装命令；
3. `npm publish --access public`（scoped 包必须显式 `--access public`）。

发布后建议在 npm 包设置里绑定 GitHub 仓库，并开启 2FA。若以后想用 CI 自动发 npm，
需要配置 `NPM_TOKEN` secret，并注意版本号不能重复发布。

---

## 6. 用户怎么装

三种方式，任选其一；装完**重启 `dsh web`**（Host 插件代码只在启动时加载）。

```powershell
# A. 从 npm（发布后）
dsh plugin --profile web add dsh-tool-round-limited-target

# B. 直接从 GitHub
dsh plugin --profile web add git+https://github.com/你的用户名/dsh-tool-round-limited-target.git

# C. Web 界面
#    Web → Plugins → 添加插件 → 粘贴上面的 Git 地址或包名
#    （也接受 tarball / 本地绝对路径）
```

`dsh plugin` 会转发给 profile 目录里的 pnpm，并把组合包加入 `dsh.profile.bundles`（默认启用）。
本地改代码调试时，把依赖写成 `link:<插件目录>` 即可。

**装上了怎么确认：** 重启后敲 `/goal`，菜单里那条命令的描述应该是
「限轮目标：/goal 3 整理文档 —— 最多自动跑 3 轮…」，而不是 DSH 内置的「设置或查看长期任务目标」。
`/goal 3 整理文档` 能建出 `Rounds: 0/3` 的目标就说明接管成功。

---

## 7. 兼容性与版本策略

- DSH 目前是 `0.x`，本插件依赖两条内部约定：**agent 作用域的命令压过 preset 作用域**、**内置 `definitionId` 用于客户端身份**。
  这两条一旦变化，`verify-live.mjs` 会红，`compat` 每周跑一次就是干这个的。
- 可选：在 `package.json` 写 `"engines": { "dsh": ">=0.2.0 <0.3.0" }` 会让插件管理器做版本闸门
  （不满足会拒绝安装，给出 `allow-version` 覆盖命令）。本项目**故意没写**，避免 DSH 一升级就拦死用户；
  等 API 稳定后再加。
- 版本号：语法/行为变化 → minor；纯修复 → patch；破坏性变化（比如不再接管 `/goal`）→ major。
- 每次发版：改 `package.json` 的 `version`、补 `CHANGELOG.md`、打同名 tag。

---

## 8. 发布前 checklist

- [ ] `node scripts/set-owner.mjs <用户名>` 已执行，仓库里搜不到 `Fireawa`
- [ ] `node selftest.mjs` 全绿（118 项）
- [ ] `node verify-live.mjs` 在装有 DSH 的机器上全绿（20 项）
- [ ] `node mutate.mjs` 全绿（10 个变异全部被抓）
- [ ] `git status` 没有多余文件；`node_modules/` 没被提交
- [ ] `npm pack --dry-run` 的清单符合预期（含 `lib/`、`cordis.patch.yml`）
- [ ] README 里的安装命令可以直接复制执行
- [ ] `CHANGELOG.md` 有这一版，tag 与 `version` 一致
- [ ] 仓库是 public，LICENSE 被 GitHub 识别为 MIT

---

## 9. 常见问题

**`/goal` 还是内置行为？**
检查是否重启了 `dsh web`；看启动日志里有没有 `已注册全局命令 /goal` 和 `已在 agent 作用域接管 /goal`。
若出现「仍解析到别的实现，接管未生效」，说明 DSH 的作用域优先级变了——跑 `node verify-live.mjs` 确认，并把 `shadowGoalPerAgent` 设成 `false` 可暂时退回内置行为（`/target` 仍可用）。

**安装时报包名无效？**
GitHub 方式必须用完整 `git+https://…` 地址；npm 方式确认包已发布、名字拼写正确。

**想带附件用 `/goal`？**
接管版不声明 `input.attachments`，注册表会明确拒绝。改用普通消息发附件，或先发附件再 `/goal …`。

**DSH 升级后 CI 的 `compat` 红了？**
多半是内部约定变了。先看 `verify-live` 哪条断言失败；必要时在 `engines.dsh` 里收紧范围并在 README 注明已验证版本。
