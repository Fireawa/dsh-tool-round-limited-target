# dsh-tool-round-limited-target (Round-Limited Target)

[中文](README.md) | English

[![CI](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml/badge.svg)](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/Fireawa/dsh-tool-round-limited-target)](https://github.com/Fireawa/dsh-tool-round-limited-target/releases)

Give DSH's `/goal` a round cap: **the number written first is how many rounds it may run automatically — and it stops by itself once they are used up.**

```bash
/goal 3 clean up the docs     # at most 3 rounds
```

## Usage

```bash
/goal 3 clean up the docs     # at most 3 rounds
```

- The number must come **first** to set a cap; `rounds` / `轮` / `次` are optional (`/goal 3 rounds clean up the docs` is equivalent).
- A trailing number does not count: in `/goal clean up the docs 3` the 3 is objective text, so the official semantics apply (no cap).
- Subcommands match the built-in `/goal`: `rounds <n>` raises the cap only, `edit [rounds] <objective>` changes the objective, `pause` / `resume` / `clear`, and no argument shows status.

Once the rounds are used up the goal is automatically marked `blocked` (`code=round-limit`) and never runs an extra round. To continue:

```bash
/goal rounds 8      # raise the cap first
/goal resume        # then resume
```

## Install

Requires Node.js 20+ and a working DSH installation.

Track `main` (moves with the latest commit):

```bash
dsh plugin --profile web add git+https://github.com/Fireawa/dsh-tool-round-limited-target.git
```

Pin a version (recommended, predictable behaviour):

```bash
dsh plugin --profile web add github:Fireawa/dsh-tool-round-limited-target#v1.0.2
```

You can also use Web → **Plugins** → add plugin → paste the URL above (or a local path). **Restart `dsh web`** afterwards.
For local development just `link:` the checkout.

## Tool

`round_limited_goal(target, rounds?, replace?)`: the natural-language entry point for the model — `target="3 clean up the docs"` or `rounds=3` means 3 rounds; in `target="clean up the docs 3"` the 3 is objective text and the default 3 rounds apply.

## Configuration

`cordis.patch.yml` is editable; values in the comments are the defaults:

```yaml
commandName: goal            # primary command name
aliasCommandName: target     # alias, '' disables it
shadowGoalPerAgent: true     # false = fall back to the built-in /goal
trailingRounds: false        # only "3 <objective>"; trailing digits stay objective text
defaultRounds: 3             # used when the tool call omits rounds
maxAllowedRounds: 500
requireDirectHuman: true     # only a direct human turn may create a goal
```

## Self-check

```bash
node selftest.mjs      # 126 checks, offline
node verify-live.mjs   # 20 checks, needs a local DSH (skips otherwise)
node mutate.mjs        # mutation testing
npm run check          # all of the above
```

The implementation is just `index.js` + `lib/{parse,command,tool,config}.js`, with zero dependencies.

## License

MIT © [Fireawa](https://github.com/Fireawa). Release process: see [PUBLISHING.md](PUBLISHING.md).
