# English Drill

忘却曲線（FSRS）に合わせて復習する英語学習アプリ。PWA として動き、ビルド不要（ES モジュール + CDN の Firebase SDK）。

## 構成
- `index.html` / `css/app.css` — 画面の枠
- `js/app.js` — 画面の切り替え（`#/`, `#/study`, `#/progress`, `#/settings`, `#/admin`, `#/read/<教材>/<レッスン>`, `#/profiles`）
- `js/model.js` — 状態、学習キュー、進捗、バッジ
- `js/fsrs.js` — FSRS-5 のスケジューラ（依存なし）
- `js/content.js` — 教材 JSON（TARGET 1400/1900、速読英熟語）を共通カード形式に変換
- `js/backend-firebase.js` — Firebase Auth + Firestore（オフライン永続化あり）
- `js/backend-mock.js` — 動作確認用（`index.html?mock=1` で Firebase なしで動く）
- `sw.js` / `manifest.webmanifest` — PWA
- `firestore.rules` — Firestore のセキュリティルール（`ADMIN_EMAIL` を管理者のメールアドレスに書き換えてコンソールに貼る）

## データ（Firestore）
- `materials/{id}` 教材の情報、`materials/{id}/cards/{n}` カード（150 枚ずつ）、`materials/{id}/passages/{n}` 長文
- `users/{uid}/profiles/{pid}` 学習者（設定・バッジ）
- `users/{uid}/profiles/{pid}/cards/{cardId}` カードごとの FSRS の状態
- `users/{uid}/profiles/{pid}/logs/{auto}` 学習ログ（正本）
- `users/{uid}/profiles/{pid}/days/{YYYY-MM-DD}` 日ごとの集計（回答数・新規数・学習時間）

教材の中身（市販教材）はこのリポジトリに入れない。管理者がアプリの管理画面から Firestore に登録する。
管理者のメールアドレスもリポジトリに書かない。管理者かどうかはルールだけで決め、アプリは管理者だけが読める `config/admin` を読めるかで判断する。

## 開発
- テスト: `node test/fsrs.test.mjs`、`node test/content.test.mjs`、`node test/model.test.mjs`
- 画面の確認: `python3 -m http.server 8765` して `http://localhost:8765/index.html?mock=1`
- 公開: GitHub Pages（main ブランチのルート）。`sw.js` の `VERSION` を上げると端末のキャッシュが更新される。
