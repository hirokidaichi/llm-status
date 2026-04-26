# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime & commands

- Runtime is **Bun** (`>= 1.1`). Source is TypeScript executed directly via Bun — there is no transpile step in the run path. `picocolors` is the only runtime dependency; the table renderer is hand-rolled.
- `bun src/index.ts <args>` — run the CLI from source. The shipped entry `bin/llm-status` is just a one-line shebang re-exporting `src/index.ts`, so use either.
- `bun run typecheck` (`tsc --noEmit`) — strict mode + `noUncheckedIndexedAccess` is on; treat array indexing as possibly-`undefined`.
- `bun run build` — bundles to `dist/` for the Bun target. Not part of the normal dev loop.
- There is no test suite, no linter, no formatter. Verify changes by running the CLI against your own local logs.

## Architecture

The CLI's job is to read three local log stores, normalize them into one `UsageEntry` shape, then aggregate and render. There is no networking — `codex app-server` is spawned as a subprocess for rate limits.

```
src/index.ts                    arg parsing → dispatch into src/cli/*
src/types.ts                    UsageEntry, TokenBreakdown, helpers
src/<provider>/reader.ts        log scanner → UsageEntry[]
src/<provider>/pricing.ts       model regex → USD/1M token table
src/codex/app-server.ts         JSON-RPC client for `codex app-server`
src/codex/cache.ts              60s file cache for app-server output (statusline)
src/cli/aggregate.ts            UsageEntry[] → DailyBucket[] / SessionBucket[]
src/cli/{default,daily,session,limits,json,statusline}.ts   command implementations
src/statusline/                 statusline-only helpers (see below)
src/format/{colors,table}.ts    picocolors helpers + ANSI-aware table renderer
```

### Statusline subsystem (`src/statusline/`)

The `statusline` command is its own subsystem because it runs in a hot path (Claude Code
fires it on every assistant response) and has different correctness rules from the bulk
aggregation commands. Files:

- `input.ts` — parses Claude Code's stdin JSON (`model`, `transcript_path`, `cwd`, `cost`,
  `exceeds_200k_tokens`, etc.). Returns `null` when stdin is a TTY (manual invocation).
- `transcript.ts` — reads only the **tail 256KB** of `transcript_path` and walks lines
  bottom-up to find the most recent `assistant` row's `usage`. Whole-file reads would be
  too slow on long sessions.
- `git.ts` — `git -C cwd ...` wrappers that swallow errors to `null`.
- `haiku.ts` — calls `claude-haiku-4-5-20251001` to summarize `git status` in ≤36 chars.
  Cache key is `sha256(cwd + porcelain)[:16]`, stored at
  `~/.cache/llm-status/git-summaries/<hash>.txt`. Cache hits never call the API; misses
  do a 2.5s-timeout fetch and fall back to a mechanical `3M 2A 1?` summary on failure or
  when `ANTHROPIC_API_KEY`/`LLM_STATUS_NO_HAIKU` say no.
- `codex.ts` — wraps `readCodexRateLimits` + `readCachedLimits` and renders the Codex
  block in `minimal` / `compact` / `full` formats.
- `claude-stats.ts` — aggregates Claude usage in three windows (5h / today / 7d) by
  calling `loadClaudeUsage({ skipFilesOlderThan })` once and filtering in memory. TTL
  120s on disk + per-process inflight memo to dedupe concurrent segment calls. The
  `skipFilesOlderThan` flag makes the reader stat files and skip those whose mtime is
  older than the window — Claude Code is append-only so this is safe.
- `segments.ts` — pure formatters per segment name; the orchestrator runs them in
  `Promise.all` and joins the non-empty ones with ` · `.

`UsageEntry` (in `types.ts`) is the canonical shape. Every reader emits it with the same `TokenBreakdown` (input / cacheCreation / cacheRead / output / reasoning), so aggregation and rendering are provider-agnostic.

### Provider-specific invariants (do not break these)

- **Claude** (`~/.claude/projects/**/*.jsonl`): only `type: "assistant"` rows with `message.usage`. The same response can appear in multiple JSONL files when a session is resumed — `claude/reader.ts` dedupes by `message.id::requestId`. Keep that key intact when changing the reader.
- **Codex usage** (`~/.codex/sessions/**/*.jsonl`): the `event_msg.token_count` event carries a **cumulative** `total_token_usage`. The reader walks each file once and keeps only the last value per session. Summing `token_count` events across a file would double-count.
- **Codex limits** (`codex app-server` over stdio): newline-delimited JSON-RPC, **no `Content-Length` header**. Sequence is `initialize` (id 1) → `account/rateLimits/read` (id 2). Process is killed after the first `id: 2` result; the deadline defaults to 12s but the statusline path overrides it to 3s via `readCodexRateLimits({ timeoutMs })`. If you adjust the protocol, keep it newline-framed.
- **Gemini** (`~/.gemini/tmp/<projectHash>/chats/session-*.json`): only `type: "gemini"` messages have `tokens`. Tool tokens are folded into `output`; `thoughts` map to `reasoning`. Dedupe key is `sessionId::messageId` (falls back to timestamp when there's no id).
- **Statusline** (`cli/statusline.ts` + `statusline/*`): must never block Claude Code's prompt. All segment renderers swallow errors to `""` and the orchestrator joins only the non-empty ones, so a failing `git`, missing `transcript_path`, or unreachable `codex` CLI silently disappears. Do not let this code path throw, write to stderr, or `process.exit` — the user will see the error painted into their terminal prompt. Network calls (Haiku) require `ANTHROPIC_API_KEY` and respect `LLM_STATUS_NO_HAIKU=1`; the rest of the system stays offline.

### Cost numbers

`<provider>/pricing.ts` is a regex-matched table of API list prices in USD per 1M tokens. The first regex that matches wins, so order matters (more specific patterns must come before generic ones — see `gpt-4.1-mini` before `gpt-4.1`, `gemini-2.5-flash-lite` before `gemini-2.5-flash`). When a model doesn't match any regex, cost is `0` and the table renders `—`. These numbers are **reference only** for users on Pro/Max/flat-rate plans — do not present them as actual billing.

### Adding a new provider

1. Create `src/<provider>/{reader.ts,pricing.ts}` exporting `load<Provider>Usage(opts)` returning `UsageEntry[]` with `provider: "<name>"`.
2. Extend the `Provider` union in `src/types.ts`.
3. Wire the loader into the three `Promise.all` call sites in `src/cli/{default,daily,session,json}.ts`.
4. Add a label/color branch in the `providerLabel` helpers in `cli/daily.ts` and `cli/session.ts`.

## Conventions

- Module specifiers use explicit `.ts` extensions (`tsconfig` has `allowImportingTsExtensions`). Match that style.
- Comments are mixed Japanese/English; the README is Japanese. Match the surrounding file.
- `dateKey` in `cli/aggregate.ts` is local-timezone `YYYY-MM-DD` — daily buckets are user-local, not UTC.
