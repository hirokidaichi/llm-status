# llm-status

Claude Code / OpenAI Codex / Google Gemini CLI の使用状況を **1 画面に並べて確認する CLI**。
ローカルログ (`~/.claude/projects/`, `~/.codex/sessions/`, `~/.gemini/tmp/`) と
`codex app-server` の JSON-RPC を読んで、トークン量・推定コスト・レートリミットを
すぐに表示する。Bun + TypeScript で実装。集計はオフライン、Claude Code の statusline
として登録できる 1 行モード（ccsl 相当 + Codex quota + Haiku によるオプションの git status
サマリー）も同梱。

```
$ llm-status
Today (2026-04-25)

Provider │ Sess/Msg │     Input │   Cache W │     Cache R │  Output │  Reason │       Total │  Est. $
─────────┼──────────┼───────────┼───────────┼─────────────┼─────────┼─────────┼─────────────┼────────
Claude   │    1,201 │     1,666 │ 5,239,727 │ 271,424,566 │ 456,672 │       0 │ 277,122,631 │ $539.66
Codex    │       11 │ 9,034,453 │         0 │   8,125,952 │ 165,144 │ 117,144 │  17,442,693 │   $4.97
Gemini   │        0 │         0 │         0 │           0 │       0 │       0 │           0 │       —
```

## 何を見せるか

| ソース | 場所 | 取得内容 |
|--------|------|---------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | `assistant` メッセージの `usage`（input/cache_creation/cache_read/output） |
| Codex (使用量) | `~/.codex/sessions/**/*.jsonl` | `event_msg.token_count` の `total_token_usage` をセッション末尾値で採用 |
| Codex (制限) | `codex app-server` (JSON-RPC) | `account/rateLimits/read` で 5h 窓・週次窓・プラン種別 |
| Gemini CLI | `~/.gemini/tmp/<projectHash>/chats/session-*.json` | 各 `gemini` メッセージの `tokens` (input / output / cached / thoughts / tool) |

コストは **API 公式定価による推定値**。Pro/Max 等の定額プランで使っている場合は
ボリューム感の参考程度に見ること。

## インストール

要 **Bun ≥ 1.1**（`bun --version` で確認）。

```bash
git clone https://github.com/hirokidaichi/llm-status.git
cd llm-status
bun install
ln -s "$PWD/bin/llm-status" ~/.local/bin/llm-status   # 任意：PATH に通す
```

## 使い方

```bash
llm-status                     # 今日の Claude + Codex サマリ
llm-status daily --days 14     # 直近14日の日別表
llm-status session --limit 30  # 最近のセッション一覧（直近7日）
llm-status limits              # Codex の 5h / 週次レートリミット
llm-status statusline          # Claude Code の statusline 用 1 行
llm-status --json daily        # 機械可読出力（パイプ用）
llm-status --json limits
```

## 設計メモ

- **重複排除**: Claude のメッセージは resume などで複数 JSONL に同じレスポンスが
  現れることがあるため、`message.id::requestId` をキーに 1 回だけ計上する。
- **Codex の累積扱い**: `token_count` イベントは累積値なので、各セッション最後の
  値だけを採用する（同じトークンを多重カウントしない）。
- **app-server**: `Bun.spawn` で `codex app-server` を起動し、改行区切り JSON-RPC で
  `initialize` → `account/rateLimits/read` を順に投げる。Content-Length ヘッダは不要。
- **依存**: `picocolors` のみ。テーブルレンダラは ANSI 幅対応の自前実装。

## statusline モード

Claude Code の `statusLine.command` に登録すると、stdin で渡される JSON
（`model`, `cwd` など）と `~/.claude/.ratelimit_cache.json` を読んで複数行を出力する。

```
🤖 Opus 4.7 · ⏱ 5h 38% (4h) · 📅 7d 20% (3d) · 🌿 main · ⚡ Codex 5h 0% / 7d 4%
📝 8 files +124 -10 (4 new) ： ステータスライン機能実装中
```

1 行目: モデル名 / Claude の 5h・7d 利用率（Anthropic 計算済の値） / ブランチ / Codex の 5h・7d 利用率
2 行目: 変更ファイル数・追加削除行数・未追跡数 ： Haiku が日本語で要約した内容

`~/.claude/settings.json` に登録:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/Users/you/.local/bin/llm-status statusline"
  }
}
```

### セグメント

| name          | 内容                                                                            | 依存 |
|---------------|--------------------------------------------------------------------------------|------|
| `model`       | `🤖 Opus 4.7` — `model.display_name` をそのまま表示                              | stdin JSON |
| `5h`          | `⏱ 5h 38% (4h)` — 5 時間窓の利用率（Anthropic 計算済）                          | `~/.claude/.ratelimit_cache.json` |
| `7d`          | `📅 7d 20% (3d)` — 7 日窓の利用率                                               | 同上 |
| `7d_opus`     | `🅾 7d Opus 60%` — Opus 専用 7 日窓                                              | 同上（取得できる場合） |
| `7d_sonnet`   | `🅢 7d Sonnet 6%` — Sonnet 専用 7 日窓                                           | 同上（取得できる場合） |
| `branch`      | `🌿 main` — `git symbolic-ref --short HEAD` (detached なら短縮 SHA)              | git |
| `gitstats`    | `📝 8 files +124 -10 (4 new)` — `git diff --shortstat HEAD` + 未追跡数         | git |
| `gitsummary`  | Haiku による日本語要約（API キー無時は機械的サマリー）                            | optional API key |
| `git`         | `gitstats` と `gitsummary` を `：` で結合した複合セグメント。デフォルト推奨     | git + optional API key |
| `codex`       | `⚡ Codex 5h 0% / 7d 4%` — Codex の 5h / 週次窓                                 | `codex` CLI |
| `nl`          | 改行マーカー。`--segments` の途中に挟むと、そこで次の行に折る                    | — |

### オプション

```bash
llm-status statusline --segments model,5h,7d,branch,codex      # 1 行のみ
llm-status statusline --segments model,5h,7d,nl,git            # 2 行構成
llm-status statusline --segments codex --format minimal        # Codex だけ minimal
```

色: 利用率で変わる（<50% green / 50–80% yellow / >80% red）。stale な値は dim で `(stale)` 付き。

### 環境変数

| name | 用途 |
|------|------|
| `ANTHROPIC_API_KEY`     | `gitsummary` の Haiku 呼び出しに必須。未設定時は機械的サマリーにフォールバック |
| `LLM_STATUS_NO_HAIKU=1` | API key があっても Haiku 呼び出しを抑止 |

### キャッシュとレイテンシ

- **Claude utilization**: `~/.claude/.ratelimit_cache.json` を直接読むだけ（Anthropic
  計算済の値）。Claude Code が API 呼び出しのたびに更新する。`resets_at` が過去なら
  `(stale)` 付きで dim 表示。
- **Codex quota**: `~/.cache/llm-status/codex-limits.json` に TTL 60s。`codex app-server`
  の spawn は ~1s かかるので、Hit すれば <40ms。失敗時は古いキャッシュにフォールバック。
- **Haiku git summary**: `~/.cache/llm-status/git-summaries/<hash>.txt` に保存。
  キーは `PROMPT_VERSION + cwd + git status --porcelain` の SHA-256 先頭 16 桁なので、
  status が変わるかプロンプトを更新するまで無限再利用。Miss 時のみ
  `claude-haiku-4-5-20251001` を 2.5s タイムアウトで叩く（~$0.0003/call）。
  キー無時 / `LLM_STATUS_NO_HAIKU=1` のときは機械的サマリー（`3M 2A 1?`）にフォールバック。
- 全段ホット時 ~50ms。

### ccstatusline (ccsl) と併用したい場合

`--segments codex` で Codex 部分だけ出して ccsl に組み込む:

```yaml
segments:
  - type: command
    command: llm-status statusline --segments codex
    refresh: 60s
```

## ロードマップ

- `watch` モード（5 秒おきに今日値を再描画）
- Anthropic API の `/v1/organizations/.../usage_report/messages` 連携（公式集計）

## License

MIT
