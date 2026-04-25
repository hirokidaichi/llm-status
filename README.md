# llm-status

Claude Code と OpenAI Codex の使用状況を **1 画面に並べて確認する CLI**。
ローカルログ (`~/.claude/projects/**/*.jsonl`, `~/.codex/sessions/**/*.jsonl`) と
`codex app-server` の JSON-RPC を読んで、トークン量・推定コスト・レートリミットを
すぐに表示する。Bun + TypeScript で実装、外部ネットワークアクセスはなし。

```
$ llm-status
Today (2026-04-25)

Provider │ Sess/Msg │     Input │   Cache W │     Cache R │  Output │  Reason │       Total │  Est. $
─────────┼──────────┼───────────┼───────────┼─────────────┼─────────┼─────────┼─────────────┼────────
Claude   │    1,175 │     1,625 │ 5,091,744 │ 269,227,897 │ 435,853 │       0 │ 274,757,119 │ $532.03
Codex    │       11 │ 9,034,453 │         0 │   8,125,952 │ 165,144 │ 117,144 │  17,442,693 │   $4.97
```

## 何を見せるか

| ソース | 場所 | 取得内容 |
|--------|------|---------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | `assistant` メッセージの `usage`（input/cache_creation/cache_read/output） |
| Codex (使用量) | `~/.codex/sessions/**/*.jsonl` | `event_msg.token_count` の `total_token_usage` をセッション末尾値で採用 |
| Codex (制限) | `codex app-server` (JSON-RPC) | `account/rateLimits/read` で 5h 窓・週次窓・プラン種別 |

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

## ロードマップ

- `watch` モード（5 秒おきに今日値を再描画）
- Anthropic API の `/v1/organizations/.../usage_report/messages` 連携（公式集計）
- statusline 用の 1 行モード

## License

MIT
