# dsh-tool-round-limited-target (Round-Limited Target)

[中文](README.md) | English

[![CI](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml/badge.svg)](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Give DSH's `/goal` a number: **the number is how many rounds it may run automatically — and it stops by itself once they are used up.**

```bash
/goal 3 clean up the docs     # at most 3 rounds
```

## Usage

| Input | Result |
| --- | --- |
| `/goal 3 clean up the docs` | at most 3 rounds (number first) |
| `/goal clean up the docs 3` | same (a trailing number is accepted too) |
| `/goal 3 rounds clean up the docs` | same (`rounds` / `轮` / `次` are optional) |
| `/goal rounds 8` | raise the cap only, keep the progress |
| `/goal edit new objective 5` | change the objective (and optionally the rounds) |
| `/goal pause` / `resume` / `clear` | same as built-in |
| `/goal` | show status |

Once the rounds are used up the goal is automatically marked `blocked` (`code=round-limit`) and never runs an extra round. To continue:

```bash
/goal rounds 8      # raise the cap first
/goal resume        # then resume
```

`/target 3 clean up the docs` works as well — the plugin reuses the built-in command identity, so the icon and the localized label stay unchanged.

## Install

```bash
dsh plugin --profile web add git+https://github.com/Fireawa/dsh-tool-round-limited-target.git
```

You can also use Web → **Plugins** → add plugin → paste the URL above (or a local path). **Restart `dsh web`** afterwards.
For local development just `link:` the checkout.

## Tool

`round_limited_goal(target, rounds?, replace?)`: the natural-language entry point for the model — `target="clean up the docs 3"` means 3 rounds.

## Configuration

`cordis.patch.yml` is editable; values in the comments are the defaults:

```yaml
commandName: goal            # primary command name
aliasCommandName: target     # alias, '' disables it
shadowGoalPerAgent: true     # false = fall back to the built-in /goal
trailingRounds: true         # false = only "3 <objective>", avoids "fix bug 42"
defaultRounds: 3             # used when the tool call omits rounds
maxAllowedRounds: 500
requireDirectHuman: true     # only a direct human turn may create a goal
```

## Self-check

```bash
node selftest.mjs      # 118 checks, offline
node verify-live.mjs   # 20 checks, needs a local DSH (skips otherwise)
node mutate.mjs        # mutation testing
npm run check          # all of the above
```

The implementation is just `index.js` + `lib/{parse,command,tool,config}.js`, with zero dependencies. Release process: see [PUBLISHING.md](PUBLISHING.md). License: MIT.
