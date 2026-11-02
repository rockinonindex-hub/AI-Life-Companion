# 検証結果と変更ファイル

実施日：2026-11-02。基点：main `3818bc1dff4535818fbaa31c9121532d8ac6b6f9`。専用ブランチ：`feature/cooking-shopping-system`。

## テスト

- 既存回帰テスト：19/19成功。
- 料理・互換性の追加テスト：14/14成功。
- 通常精度／不在圧縮 × 7日・30日・180日：全6ケース成功。各ケースを同じシードで2回実行し、全イベントとWorld Stateが一致。
- 在庫を全確定イベントから再計算し、非負整数・使用量・最終在庫・結果集計・日記出典を検証。
- 100年不在：73行動、約27ms（5秒以内）。
- `node --check` と `git diff --check` 成功。

## 高速シミュレーション

Node.js v24.19.0、Asia/Tokyo、シード20261101。時刻2026-11-01 00:00から実行。実行時間は環境に依存する。

| 日数 | 精度 | 全イベント / 保持 | 調理回数 | 料理種類 | 成功 / 変わった料理 / 失敗 | 買い物 | 時間 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | 通常 | 112 / 112 | 22 | 14 | 18 / 4 / 0 | 10 | 120ms |
| 7 | 圧縮 | 66 / 66 | 12 | 8 | 10 / 1 / 1 | 6 | 50ms |
| 30 | 通常 | 480 / 480 | 98 | 19 | 92 / 6 / 0 | 34 | 524ms |
| 30 | 圧縮 | 104 / 104 | 17 | 9 | 16 / 1 / 0 | 6 | 57ms |
| 180 | 通常 | 2880 / 1800 | 577 | 20 | 563 / 14 / 0 | 207 | 9007ms |
| 180 | 圧縮 | 74 / 74 | 13 | 7 | 10 / 3 / 0 | 6 | 93ms |

通常精度180日の料理は20種、実行時間は30秒以内。圧縮はすべて160行動以内（要約イベントを別に1件記録）。通常精度の固定シードでは失敗が出ていないため、不適合な在庫を用いた明示的な失敗テストで消費・経験・学習を検証した。

## ブラウザー

環境に導入済みのPlaywrightとChromiumを利用し、ローカルHTTPで次を確認。アプリへの依存追加はない。

- 起動と保存、おやつ10種の贈答、会話、日記、7日送り。
- 再読み込み後の在庫と乱数の継続。
- v1実データの移行とバックアップ。破損JSONの保護と明示リセット。
- 複数タブ更新検知後の操作停止。
- 1280×900と390×844の画面を目視確認。横方向のはみ出しなし。ページ例外0件。

この環境のChromiumポリシーはfile://を禁止しているため、ファイル直接起動のブラウザー実証は未実施。Classic scriptと相対パスのみの構成を維持し、ES Modules・fetchは導入していない。通常ブラウザーではindex.htmlを直接開く手順を継続する。

ブラウザー再検証はPlaywrightが別途導入された開発環境で `node tests/browser-smoke.cjs` を実行する。Chromiumのパスは `CHROMIUM_PATH`、直接ファイルでの検証は `BROWSER_FILE_URL=1` で指定可能。

## 変更ファイル

- `README.md`
- `app.js`
- `cooking.js`
- `data.js`
- `docs/cooking-system.md`
- `docs/verification.md`
- `events.js`
- `index.html`
- `presets/ingredients.js`
- `presets/recipes.js`
- `presets/snacks.js`
- `samples/seven-days.json`
- `samples/seven-days.md`
- `samples/simulation-report.json`
- `simulation.js`
- `storage.js`
- `tests/browser-smoke.cjs`
- `tests/cooking-tests.cjs`
- `tests/fixtures/v1-world.json`
- `tests/helpers.cjs`
- `tests/run-tests.cjs`
- `tests/simulate.cjs`
