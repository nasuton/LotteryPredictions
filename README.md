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
- `/health` のHTTP応答が正常かつJSONの `status` が `ok` の場合、予想APIを取得します。
- レスポンスの `next_url` を順にたどり、最終ページまで自動で取得します。相対URLにも対応し、同じURLへの循環はエラーとして停止します。
- 取得中は件数の進捗を表示します。全件取得が完了した時だけOK表示にし、取得結果を `lottery_type` で分類して各タブにまとめて表示します。ページ移動ボタンはありません。
- 通信失敗時は `api-status--error` に「通信エラー」「データの取得に失敗しました。再試行してください。」と再試行ボタンを表示します。途中までのデータは成功として表示しません。
- 再試行を押すと、ヘルスチェックから全ページを取得し直します。自動で再試行は行いません。
- HTTPエラー、NG、不正なJSON、15秒のリクエストタイムアウト、総件数に満たない取得結果もエラー表示になります。先頭の0・数字の順序・重複する数字は保持し、同一IDのレコードは重複表示しません。
- 予想パターンは `pattern`、予想数字は `numbers`、対象抽選日欄は `predicted_at` を表示します。
- `npm test` で全件取得、途中エラー、手動再取得、URL循環、重複レコード、キャンセル、レスポンス解析などを確認できます。

## ページ下部の技術構成とリンク

`src/components/SiteFooter.tsx` にフロントエンド・バックエンドの構成と各種リンクを表示しています。

ソースコードのリンク先は `src/config/site.ts` の `sourceCodeUrls.frontend` と `sourceCodeUrls.backend` に設定してください。フロントエンドは本リポジトリを設定済みです。空文字のリンクは「準備中」と表示し、URLを設定するとクリックできるリンクに切り替わります。

技術ブログ（https://nasuton.net/blog/）とAbout Me（https://nasuton.github.io/）は、参照ページ https://nasuton.github.io/PasswordGeneration/ と同じリンク先です。
