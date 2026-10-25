# dsh-tool-round-limited-target (Round-Limited Target)

[中文](README.md) | English

[![CI](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml/badge.svg)](https://github.com/Fireawa/dsh-tool-round-limited-target/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Give DSH's `/goal` a number: **the number is how many rounds it may run automatically — and it stops by itself once they are used up.**

```bash
/goal 3 clean up the docs     # at most 3 rounds
```

Only a leading number sets a cap. Every other form is handed to the official `/goal` semantics unchanged (no cap, deployment default), and never errors.

## Usage

| Input | Result |
| --- | --- |
| `/goal 3 clean up the docs` | at most 3 rounds (number first) |
| `/goal 3 rounds clean up the docs` | same (`rounds` / `轮` / `次` are optional) |
| `/goal clean up the docs 3` | official semantics: `3` is just objective text, no cap |
| `/goal fix bug 42` | official semantics: the objective is "fix bug 42", not 42 rounds |
| `/goal rounds 8` | raise the cap only, keep the progress |
| `/goal edit 5 new objective` | change the objective (and optionally the rounds) |
| `/goal edit new objective` | change the objective only, keep the cap |
| `/goal pause` / `resume` / `clear` | same as built-in |
| `/goal` | show status |

Once the rounds are used up the goal is automatically marked `blocked` (`code=round-limit`) and never runs an extra round. To continue:

```bash
/goal rounds 8      # raise the cap first
/goal resume        # then resume
```

`/target 3 clean up the docs` works as well — the plugin reuses the built-in command identity, so the icon and the localized label stay unchanged.

## Install

Requires Node.js 20+ and a working DSH installation.

```bash
dsh plugin --profile web add git+https://github.com/Fireawa/dsh-tool-round-limited-target.git
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

## Contributing

This repo is maintained primarily for the author's own use: issues are welcome for bug reports and usage questions, but pull requests are not guaranteed to be merged.
Run `npm run check` before opening one (offline self-test + live verification + mutation testing), or paste its output in the PR description.

## License

MIT © [Fireawa](https://github.com/Fireawa). Release process: see [PUBLISHING.md](PUBLISHING.md).
