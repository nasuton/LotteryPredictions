# 宝くじ予想Webページ

React + Vite + TypeScript の開発環境です。ヘルスチェック成功後に予想APIを取得し、5種類の宝くじタブに予想一覧を表示します。

## 開発環境

- Node.js: セットアップ確認時は 24.6.0
- npm: セットアップ確認時は 11.5.1
- React / React DOM
- Vite / TypeScript
- Oxlint（コードの静的チェック）

依存関係のバージョンは `package.json`、インストールした正確なバージョンは `package-lock.json` を参照してください。

## 起動

このフォルダで実行します。初回セットアップ時は依存関係をインストール済みです。

```powershell
npm run dev
```

ターミナルに表示されたURL（通常は http://localhost:5173/ ）を開きます。
別のPCやクローン後の依存関係の復元には `npm ci` を実行してください。

## 確認コマンド

```powershell
npm run lint
npm run build
npm run preview
```

- `lint`: コードの静的チェック
- `build`: TypeScriptの型チェックと公開用ファイルの生成（`dist/`）
- `preview`: ビルド済みファイルのローカル確認

## 主なファイル

| ファイル | 役割 |
| --- | --- |
| `src/App.tsx` | メイン画面 |
| `src/App.css` | メイン画面のスタイル |
| `src/components/StatusPanel.tsx` | 更新状況パネル |
| `src/hooks/usePredictions.ts` / `src/hooks/useStatus.ts` | 予想一覧・更新状況の取得 |
| `src/lib/api.ts` | API呼び出し（v1・旧パスフォールバック） |
| `src/lib/status.ts` | 更新状況の型・検証・日付整形 |
| `src/hooks/useHitRates.ts` / `src/lib/hitRates.ts` / `src/components/PredictionHitRate.tsx` | パターン別ヒット率の取得・検証・表示 |
| `src/lib/csv.ts` | 選択中タブの予想をCSVに変換・ダウンロード |
| `src/index.css` | 共通スタイル・レスポンシブ設定 |
| `src/main.tsx` | Reactの起動処理 |
| `vite.config.ts` | Viteの設定 |
| `.env.local`（任意・Git管理対象外） | API接続先の上書き設定 |

## API接続先の準備

API接続先を変更する場合は `.env.local` を作成し、`VITE_API_BASE_URL` に公開APIのURLを設定してください。通常は既定の接続先を使用するため、このファイルの作成は不要です。

```powershell
Set-Content -Path .env.local -Value 'VITE_API_BASE_URL=https://nasuton.com/lottery'
```

コードからは `import.meta.env.VITE_API_BASE_URL` で参照できます。未設定・空欄の場合は https://nasuton.com/lottery を使用します。設定変更後は開発サーバーを再起動してください。

`VITE_` で始まる値はブラウザーに公開されるため、秘密のAPIキーは入れないでください。別ドメインのAPIを利用する場合、API側で公開サイトからのアクセスを許可するCORS設定が必要です。

## GitHub Pages

リポジトリ配下のURLでもビルド後のアセットを参照できるよう、Viteの `base` を `./` に設定しています。

公開対象は `npm run build` で生成される `dist/` です。`.github/workflows/deploy.yml` により、`main`へのpush時にテスト・Lint・ビルド後、GitHub Pagesへ自動公開します。GitHubのSettings → PagesではSourceをGitHub Actionsに設定します。

公開URL: https://nasuton.github.io/LotteryPredictions/

API側ではCORSの許可Originに `https://nasuton.github.io` を設定してください（パスは含めません）。

画面遷移を追加する場合は、GitHub Pagesでの直接アクセスにも対応するルーティング方式を選んでください。

## 予想データの一括取得

- `src/config/api.ts` の `PREDICTIONS_LIMIT = 100` はAPIへの1リクエスト当たりの件数です（1〜100件）。表示件数の上限ではありません。全件を取得するため `PREDICTIONS_OFFSET` は0を使用します。
- `/health` のHTTP応答が正常かつJSONの `status` が `ok` の場合、予想API `/api/v1/predictions?limit&offset` を取得します。
- **旧パスへのフォールバック**: `/api/v1/predictions` が404を返した場合（API側がまだ旧バージョンのとき）だけ、旧パス `/api/predictions` で再試行します。その後の `next_url` 追跡も旧パスに合わせます。フォールバックしたことは `console.info` に1行記録し、画面には表示しません。404以外のエラー（500など）はフォールバックせずエラー表示になります。API側とフロントのデプロイ順序を問わないための仕組みで、API側の移行完了後に削除できます。
- レスポンスの `next_url` を順にたどり、最終ページまで自動で取得します。相対URLにも対応し、同じURLへの循環や、最初のページと異なるパス（v1 ⇄ 旧）への遷移はエラーとして停止します。
- 取得中は件数の進捗を表示します。全件取得が完了した時だけOK表示にし、取得結果を `lottery_type` で分類して各タブにまとめて表示します。ページ移動ボタンはありません。
- 通信失敗時は `api-status--error` に「通信エラー」「データの取得に失敗しました。再試行してください。」と再試行ボタンを表示します。途中までのデータは成功として表示しません。
- 再試行を押すと、ヘルスチェックから全ページを取得し直します（更新状況も再取得します）。自動で再試行は行いません。
- HTTPエラー、NG、不正なJSON、15秒のリクエストタイムアウト、総件数に満たない取得結果もエラー表示になります。先頭の0・数字の順序・重複する数字は保持し、同一IDのレコードは重複表示しません。
- 予想パターンは `pattern`、予想数字は `numbers`、対象抽選日欄は `predicted_at` を表示します。
- 各タブ見出しの「CSVダウンロード」ボタンで、**選択中のタブの予想だけ**をCSVファイルとして保存できます（`src/lib/csv.ts`）。列は `宝くじ,予想パターン,予想数字,対象抽選日`、予想数字は先頭の0と順序を保つため半角スペース区切りの文字列です。Excelで文字化けしないようUTF-8 BOM付き・CRLF改行で出力し、ファイル名は `predictions_<種別ID>_<YYYYMMDD>.csv`（日付は日本時間）です。データ取得が完了し、その種別の予想が1件以上あるときだけボタンを表示します。
- `npm test` で全件取得、途中エラー、手動再取得、URL循環、重複レコード、キャンセル、レスポンス解析、v1→旧パスのフォールバック、更新状況の取得と日付整形などを確認できます。

## パターン別ヒット率

- `/api/v1/lottery_hit_rates?limit=100&offset=0` から `next_url` をたどって全件取得し、`lottery_type` と `pattern` の組み合わせで予想一覧に対応付けます。
- ミニロト・ロト6・ロト7の一覧の「ヒット率」欄に、3個以上一致率 (`hit_rate`) と集計件数、各一致数の率 (`match_N_rate`) を表示します。内訳はミニロトが3〜5個一致、ロト6が3〜6個一致、ロト7が3〜7個一致です。対象外の一致数は表示しません。APIの率は0〜100の数値なので、`12.5` は `12.5%`、`0` は `0%` と表示します。表示値は各パターンの最新の過去集計で、行の対象抽選日に限定した値ではありません。
- ナンバーズ3・4はAPIの対象外なのでヒット率の列を表示しません。対応する集計がないパターンや集計件数0件は「未集計」、取得中は「取得中…」と表示します。
- ヒット率は予想一覧とは独立して取得します。通信・検証エラー時も予想一覧は表示し、対象タブに「ヒット率の取得に失敗しました。」と「ヒット率を再取得」ボタンを表示します。予想一覧の「再試行」でもヒット率を再取得します。
- `npm test` でページング・型検証・0%・種別の対応付け・不完全な取得・URL循環・キャンセルを確認します。`node tests/browser/hit-rates.browser.mjs` でモックAPIを使った画面表示・タブ切替・再取得・モバイル表示を確認できます（`playwright-core` と Edge が必要）。

## 更新状況パネル

タブの上部に、選択中の宝くじ種別の更新状況を表示します（`src/hooks/useStatus.ts`、`src/components/StatusPanel.tsx`、`src/lib/status.ts`）。

- 取得先は `/api/v1/status` です。予想一覧とは独立して取得し、失敗（404を返す旧API・ネットワークエラーなど）した場合はパネルを表示しないだけで、予想一覧の表示には影響しません。再試行ボタンで予想一覧と一緒に再取得します。
- 表示内容（タブ切替に連動）:
  - 予想更新日: `by_type[].latest_predicted_at`（例: `2026年9月28日（月）`）。日本時間の今日より2日以上古い場合は `（N日前）` を付けます。
  - 予想パターン数: `by_type[].count`
  - 最終バッチ: その種別の `batch_name === "registration"`（無ければ最も新しい実行）の `status` と `finished_at`（例: `成功 / 9月28日 03:05 （日本時間）`）。`success`→成功、`failed`→失敗、`skipped`→スキップ を文字と色の両方で示し、失敗時は「表示中の予想は前回のものです。」を補足します。`last_batch_runs` が `null` のときはこの行を表示しません。
- `latest_predicted_at` は `YYYY-MM-DD` の日付のみなので、UTC解釈で前日にずれないよう文字列を分解してローカル日付として扱います。**表示する時刻はすべて日本時間（JST）に統一**しています。`finished_at` はオフセット付きISO文字列を `Intl.DateTimeFormat` の `timeZone: 'Asia/Tokyo'` で整形し、閲覧者の端末のタイムゾーンに左右されません（`<time dateTime>` にはUTCのISO文字列を入れています）。「N日前」の判定やCSVファイル名の日付も日本時間の暦日で計算します。
- 読み上げ環境向けに `<section aria-labelledby>` と `<dl>` で構造化し、`<time dateTime>` を使います。タブ切替のたびに読み上げられるのを避けるため `aria-live` は付けていません。

`/api/v1/status` のレスポンス形:

```json
{"data": {
  "predictions": {"total": 305,
    "by_type": [{"lottery_type": "loto6", "count": 43, "latest_predicted_at": "2026-09-28"}]},
  "last_batch_runs": [{"batch_name": "registration", "lottery_type": "loto6", "status": "success",
    "started_at": "2026-09-28T03:05:00+09:00", "finished_at": "2026-09-28T03:05:12+09:00",
    "rows_affected": 43, "message": ""}],
  "generated_at": "2026-09-28T12:00:00+09:00"}}
```

`last_batch_runs` は `null`、`by_type` は空配列の場合があります。未知の `lottery_type` や `status` の要素は無視します。

### ブラウザでの手動確認

`tests/browser/status-panel.browser.mjs` は Playwright（Edge）でビルド済みの `dist/` を開き、APIを `page.route` でモックして更新状況パネル・タブ連動・404時の非表示・再試行・旧パスフォールバック・CSVダウンロード・axe（WCAG 2.1 AA）・390×844表示を確認します。`npm test` には含まれず、依存関係も `package.json` に追加していません。

```powershell
npm run build
npm i --no-save playwright-core axe-core
node tests/browser/status-panel.browser.mjs
```

## ページ下部の技術構成とリンク

`src/components/SiteFooter.tsx` にフロントエンド・バックエンドの構成と各種リンクを表示しています。

ソースコードのリンク先は `src/config/site.ts` の `sourceCodeUrls.frontend` と `sourceCodeUrls.backend` に設定してください。フロントエンドは本リポジトリを設定済みです。空文字のリンクは「準備中」と表示し、URLを設定するとクリックできるリンクに切り替わります。

技術ブログ（https://nasuton.net/blog/）とAbout Me（https://nasuton.github.io/）は、参照ページ https://nasuton.github.io/PasswordGeneration/ と同じリンク先です。
