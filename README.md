# English Drill

忘却曲線（FSRS）に合わせて復習する学習アプリ。教材ごとに毎日の復習と新しい語を出し、カード・4択・つづり・穴埋め・リスニングの5つの形式で学習する。英語の単語帳のほか、古文単語（古文単語330）も扱う（つづり・穴埋めの代わりに「例文の傍線部の意味を選ぶ」例文問題、読みの読み上げ、入試の実戦問題）。PWA として動き、ビルド不要（ES モジュール + CDN の Firebase SDK）。

## 画面
- ログイン（Google）→ 学習者を選ぶ（1つのアカウントで複数の学習者）
- ホーム: 今日の目標リング（学習時間・回答・新しい語）と、教材ごとの今日の数
- 教材ページ: 今日の学習、出題形式、覚え具合（定着・覚えた・あやしい）、Section ごとの練習、教材ごとの設定
- 学習: カード（4段階で評価）／4択／つづり／穴埋め／リスニング（端末の読み上げ）／ミックス。新しい語は必ずカードで覚える。4択などは正解＝普通、ヒントを使った正解＝難しい、不正解＝もう一度として記録する
- 学習のおわり: 回答数・正答率・時間・新しい語、獲得したバッジ、「もう一度」が多かった語
- 記録: 今週のリング、連続日数、4週間、教材ごとの覚え具合、バッジ12種（メダル）
- 教材を追加: 家族の教材（管理者が登録）、自分の教材（Excel・CSV・1語ずつ）

## 覚え具合の判定（`js/model.js`）
- 定着: 直近10回の正解率90%以上で、次の復習が21日以上先
- あやしい: 正解率70%未満、最後の答えが不正解、または覚えはじめ（学習中）
- 覚えた: それ以外の学習済み

## 構成
- `js/app.js` 画面の切り替え（`#/`, `#/m/<教材>`, `#/study/<教材>/<today|deck|shaky|miss|extra>/<引数>`, `#/progress`, `#/settings`, `#/add`, `#/admin`, `#/read/<教材>/<レッスン>`, `#/play/<教材>/<範囲>`, `#/drill/<教材>/<セット>`, `#/profiles`）
- `js/model.js` 状態、教材ごとのキュー、覚え具合、目標、バッジ
- `js/quiz.js` 出題形式（4択の誤答選び、例文の穴埋め、変化形、つづりの採点、古文の例文問題）
- `js/fsrs.js` FSRS-5 のスケジューラ
- `js/content.js` 教材 JSON（TARGET 1400/1900、速読英熟語、鉄壁、古文単語330）と自分の教材（CSV・Excel）を共通カード形式に変換。古文単語330 の付録（慣用表現・文法・和歌・文学史・古文常識・敬語）は「付録 …」の区分のカードに、実戦問題は extras に入る
- `js/speech.js` 読み上げ（Web Speech API）
- `js/backend-firebase.js` Firebase Auth + Firestore（オフライン永続化あり）／ `js/backend-mock.js` テストモード（`index.html?mock=1`）
- `js/ui/*.js` 各画面（`drill.js` は古文の実戦問題と付録の演習: 5 択・二つ選ぶ・並べ替え・文法・記述と口語訳の自己採点。記録は端末の localStorage）、`js/ui/parts.js` リング・メダル・帯グラフなどの部品
- `sw.js` / `manifest.webmanifest` PWA（アプリ本体・SDK・フォントを端末に保存）
- `firestore.rules` セキュリティルール（family() と admins() にメールアドレスを入れてコンソールに貼る）

## データ（Firestore）
- `materials/{id}` 家族の教材、`/cards/{n}`（150枚ずつ）、`/passages/{n}` 長文、`/images/{n}` 挿絵（40枚ずつ）、`/extras/{n}` 付属データ（実戦問題。100問ずつ）
- `users/{uid}/materials/{id}` 自分の教材、`/cards/{n}`
- `users/{uid}/profiles/{pid}` 学習者（設定・目標・バッジ）
- `users/{uid}/profiles/{pid}/cards/{cardId}` カードごとの FSRS の状態と直近10回の正誤
- `users/{uid}/profiles/{pid}/logs/{auto}` 学習ログ（正本）
- `users/{uid}/profiles/{pid}/days/{YYYY-MM-DD}` 日ごとの集計（全体と教材ごと）

教材の中身（市販教材）とメールアドレスはこのリポジトリに入れない。教材は管理者がアプリの管理画面から Firestore に登録する。

## 開発
- テスト: `node test/fsrs.test.mjs`、`node test/content.test.mjs`、`node test/model.test.mjs`、`node test/quiz.test.mjs`
- 画面の確認: `python3 -m http.server 8765` して `node test/ui.test.mjs`（または `http://localhost:8765/index.html?mock=1`）
- 公開: GitHub Pages（main ブランチのルート）。`sw.js` の `VERSION` を上げると端末のキャッシュが更新される。
