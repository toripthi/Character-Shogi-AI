# web UI 計画（棋力校正のために、自分が指せる画面を作る）

作成：2026-11-07。状態：**A・盤の取り込み・B・C（人間 vs AI の対局モード）・D（設定パネルと局ログ）・E（一致確認）完了。次は F（ユーザーが5局指す）。**

## 1. 何のためか
Phase 5（棋力の校正）のために、**ユーザー本人が AI と5局指して**強さを見る。
ぴよ将棋と対局させる案は取りやめた：ぴよ将棋に API が無く、利用規約第3条（禁止行為）に「本アプリが通常意図しない効果を及ぼす外部ツールの利用、作成又は頒布」がある。グレーな手段は取らない。

最終的な画面のイメージ（ランク対局風）：盤を中央に、**右上にキャラ（表情差分あり）**、**右上と右下にそれぞれの経過時間**。左手前のキャラは置かない。まずは盤が先。

## 2. 決めたこと（2026-11-07）
- **UI は `web/`、ビルドなし**（素の ES モジュール）。配信はリポジトリのルート（`npm run web` → `http://localhost:8080/web/`）。`web/` から `../src/`（エンジン）・`../data/book/`（定跡）を相対パスで読むため。配信は `web/`・`src/`・`data/book/` だけに絞る。
- **盤・持ち駒の描画は shogi-kifu-narabe から無改変で複製**（`web/VENDOR.md`。ハッシュで改変を検出）。この repo 独自のものは `index.html`・`css/app.css`・`js/main.js`・`js/layout.js` だけ。元の修正を後から取り込めるようにするため。
- **ルール判定は UI に持たせない。エンジンの `ShogiBoard` が持つ**（`legalMoves` / `makeMoveByUSI` / `sfen`）。流用元は棋譜並べで、合法手も手番も見ない設計。
- **思考は Worker、ルール判定はメインスレッド**。`chooseMove` は同期で、最悪 `HARD_TIME_LIMIT_MS`（10秒）かかる。局面は SFEN ではなく **USI の手順（平手からの全手）** で渡し、Worker 側で再生する（UI の盤状態→SFEN の変換を書かずに済む。平手のみ）。
- **終局処理は UI 側**。エンジンにあるのは「合法手0＝詰み」だけで、千日手・持将棋・入玉・手数上限・時間は無い。
- **時計は経過時間（加算表示）**。持ち時間による負けは入れない（確定したら変える）。
- **対局ログを必ず残す**。設定・seed・USI手順・結果・手ごとの `source`/`score`/`ms`・指し方（真面目／雑早指し／変則）を、JSON と KIF で書き出せるようにする。流用元はリロードで状態が消えるため。

## 3. 手順
| 段階 | 内容 | 状態 |
|---|---|---|
| A | 本番の import 経路から tsshogi・node 依存を外す | **完了**（D-034） |
| A' | 盤・持ち駒・名前・時計枠・キャラ枠を `web/` に表示（初形のみ） | **完了**（headless Chromium で 390×844・768×1024・390×600・360×560 を確認） |
| B | `usi.js`（UI の Move ↔ USI）、`engine-worker.js`（`newGame(設定, seed)` / `think(手順)` → `{usi, source, info}`）、メインスレッドの `ShogiBoard`（`rules.js`） | **完了**（D-035。下の「B で出来たもの」） |
| C | 対局モード：タップ入力、成り選択、合法手チェック、終局（詰み・千日手・投了・手数上限）、経過時間の加算 | **完了**（D-036。下の「C で出来たもの」） |
| D | 設定パネル（persona・depth・maxNodes/maxDepth・margin・slipRate・slipMargin・book・seed ほか）と局ログ保存・書き出し | **完了**（D-037。下の「D で出来たもの」） |
| E | 一致確認：固定 seed で、UI 経由の手順が `scripts/match.js` 系の対局と一致するか | **完了**（D-038。下の「E で確かめたこと」） |
| F | 5局（ユーザーが指す）→ 設定をプリセットとして記録 | 未着手 |

**C で流用元から追加で取り込むもの**：`ui/selection.js`・`core/nari-judge.js`・`ui/nari-popup.js`（と関連 CSS）。（`core/apply-move.js`・`models/move.js` は B で取り込み済み。）指し手の確定口は流用元の `commitMove()` 1本なので、対局モードはそこに差し込む。「前へ」「待った」・分岐・棋譜モードは対局モード中は無効にする。

**B・C の完了条件の目安**：初形から人間側が1手指す → AI が返す → 盤に反映、が最後まで（詰みまで）通る。違法手は受け付けない。成り・打ちが正しく通る。

### B で出来たもの（C はこれを呼ぶだけで指せる）
すべて `web/js/engine/`。
- **`rules.js`** `createRules({sfen?})`：`turn()`（'SENTE'/'GOTE'）、`legalUsis()`、`isLegal(usi)`、`play(usi)`（合法なら指して true、違法なら何も変えず false）、`moves()`（平手からの USI の手順）、`result()`（`{over:false}` または `{over:true, reason:"checkmate", winner}`）、`inCheck()`、`sfen()`、`reset()`。エンジンの `ShogiBoard` だけを読み込み、探索・評価は持ち込まない。
- **`usi.js`**：`moveToUsi(move)`、`usiToMove(usi, boardState, side?)`（打つ手は side 必須）、`applyUsi(boardState, usi, side?)` → `{boardState, move}`（流用元の `applyMoveToBoard` を通す）、`boardStateToSfen(boardState, turn)`。
- **`engine-client.js`** `createEngineClient()`：`newGame({config, seed?, bookUrl?})` → 実際に使われた設定（seed 込み。ログに残す）、`think(moves)` → `{usi, source, info, opening}`、`restart()`（思考中でも打ち切って Worker を作り直す）、`terminate()`。`config` は `createPlayer` のオプション。`usi` が `null` なら合法手が無い（詰み）。
- 配線の想定（C）：人間の入力 → `moveToUsi` → `rules.play` が true なら `applyMoveToBoard` で盤を更新 → AI の番なら `engine.think(rules.moves())` → 返った `usi` を `rules.play` → `applyUsi` で盤を更新。AI の手番かどうかは `rules.turn()` で決める。
- 点検：`web/dev/engine-check.html`（`npm run web` で開く。スマホでも結果が画面に出る）。Worker 起動・合法手・24手の対局・定跡取得・不正手順・`restart` を実ブラウザで通す。headless Chromium では全通過。

### C で出来たもの
`web/js/game/`（DOM 非依存。`npm test` で検証）と `web/js/ui/`（画面）。
- **`game/game.js`** `createGame(...)`：対局の進行。指し手の確定口は `commit()` 1本（`rules.play` が true の手だけ盤に反映）。phase は idle / human / choosing / ai / over。投了・AI 思考中の打ち切り（`engine.restart()`）・遅れて戻った手の破棄・違法手を返した AI の停止に対応。人間は先手・後手どちらも可（後手なら盤を反転し AI が先に指す）。
- **`game/input.js`**：タップの解釈。**合法手の集合だけ**を根拠にする（UI にルールを持たせない）。動ける先を印で示し、成りは「成る・成らない両方が合法」のときだけ選択を出す（強制成りは出さない）。
- **`game/termination.js`**：千日手（同一局面4回＝引き分け）、連続王手の千日手（その側の反則負け）、手数上限（既定300手＝引き分け）、結果の文面。
- **`game/clock.js`**：経過時間（加算表示）。手番の側だけが進む。1手に使った時間をログに残す。
- **`game/settings.js`**：設定は当面 URL のクエリ（D で設定パネルに置き換え）。`?persona=&depth=&seed=&side=sente|gote&style=&book=0|1&margin=&slip=&slipMargin=&maxMoves=`。不正値は黙って直さずエラー。既定は ibisha-seme・深さ3・先手・定跡あり。
- **`ui/promotion-popup.js`・`ui/target-marks.js`**：成り選択と移動先の印・タップ位置の変換（この repo 独自）。
- **対局ログ**：終局時に localStorage（`csai.gamelogs`、最新30局）へ保存。設定・seed・USI手順・手ごとの by/source/score/depth/nodes/ms・指し方・結果。書き出し画面は D。
- **検証**：`test/web/game.test.js`（22件）。実ブラウザ（Playwright の Chromium、390×844 と 360×560）で、人間側をランダムな合法手で自動操作した通し対局を、先手で詰みまで（成り2・打ち2を含む）、後手（盤反転）で詰みまで完走、コンソールエラー0。投了→新しい対局、成りポップアップの成る/キャンセルも確認。`?debug=1` のときだけ `window.__csai` を付ける（この自動操作用）。
- **未対応**：入玉・持将棋の宣言（手数上限の引き分けで代用）、持ち時間、待った、棋譜の書き出し（D）。Safari・iOS 実機は未確認。
### D で出来たもの
- **設定シート**（`ui/menu-sheet.js`。盤の左上の ⚙ ボタンから）：AI の個性・探索の深さ・定跡・ノード上限／最大の深さ（ペア）・margin・slip・slipMargin・あなたの手番・seed・指し方（真面目／雑な早指し／変則／未指定）・手数上限。変更は**次の対局から**効く。「この設定で新しい対局」で適用（指している対局があれば確認のうえ中断として記録）。不正な値はシート内にエラーを出して始めない。
- **設定の保存と優先順位**（`game/settings.js`）：既定 < 保存済み（localStorage `csai.settings`）< URL のクエリ。URL の `?persona=…&depth=…` は従来どおり使える（試験・再現用）。保存済みや URL が不正なら、黙って直さず設定シートを開いて理由を見せる。
- **対局ログ**：終局時に加えて、**新しい対局を始める前の中断**（1手以上指していれば `abandoned`）も残す。入力欄の値（`settingsRaw`）も残るので、同じ設定・seed で再現できる。最新30局。
- **書き出し**（シートの「対局ログ」タブ）：1局ごとに **KIF**・**JSON**・**KIF をコピー**・削除、全件 JSON。ファイル名は `csai-日時-個性-d深さ-s seed`。KIF（`game/kif.js`）は UTF-8、移動元つき（`７六歩(77)`）、成らない手に「不成」は書かない（標準に合わせた。tsshogi が読めない）、消費時間つき、AI の手に `*AI source=… score=… depth=… nodes=…` のコメント、`*設定：…` の行。終局行は 詰み／投了／千日手／反則勝ち／持将棋（手数上限）／中断。
- **検証**：`test/web/export.test.js`（KIF を tsshogi で読み戻して、150手超のランダム対局5本の手順が完全一致するか、など）と `game.test.js` の中断。実ブラウザで、設定の適用・不正入力・保存復元・中断ログ・KIF/JSON ダウンロード・削除を通し、5サイズ（360×560〜768×1024）で帯に収まることを確認。
- **未対応・既知**：途中でページを閉じる／更新すると、その対局のログは残らない（`pagehide` では保存していない。アプリの切り替えで対局が終わるのを避けるため）。KIF の終局行の「使った時間」は 0。iPhone 実機のダウンロード（「ファイル」への保存）は未確認。
### E で確かめたこと（web 側の AI は、match.js と同じ手を指す）
- **方法**：`scripts/match.js` の実対局（A＝試す AI、B＝人間役の代わり）を正解にする。web 側は B の手を与え、A の手番で AI に1手選ばせて、**手と source（search / book / plan）が全部同じか**を見る。A は先手・後手の両方。設定は設定画面と同じ組み立て（`buildSettings`）を通す。seed は match.js と同じ振り方（局 i の先手側は seed + i×100003、後手側はさらに +7919）。
- **場面**（`scripts/gen-web-parity.js` の `CASES`。各2局）：居飛車の攻め屋・深さ2／振り飛車の守り屋・定跡あり（book・search・plan の3種の source）／攻め屋・margin 50／守り屋・深さ3・ノード予算（上限800・最大の深さ4）。8局・AI 計150手。
- **結果**：3つの経路すべてで全手一致。(1) Node の `session`（`test/web/parity.test.js`、`npm test` に入る）、(2) 実ブラウザの本物の Worker（`web/dev/engine-check.html` の最後の項目。iPhone でも再実行できる）、(3) 実画面で人間役がタップして指した対局（Playwright の Chromium、AI の返事が一致。使った試験スクリプトは repo 外）。
- **検出力の確認**：seed を1ずらすと 20手中16手、margin を外すと14手、深さを変えると16手が不一致になる。ノード予算は元々効きが弱い（外しても15手中2手）ので、手の一致に加えて、エンジンが実際に使った設定（`newGame` の戻り値）が入力欄の値と一致することも直接確かめている。
- **fixture の更新**：正解データ `web/dev/parity-fixture.json` は match.js から作る。**エンジンの評価・探索を変えると古くなり、`parity.test.js` の最後のテスト（match.js を走らせ直して比較）が落ちる**。そのときは `node scripts/gen-web-parity.js` で作り直し、差分（挙動が変わった箇所）を確認する。`npm run verify:web-parity` で最新かだけ確かめられる。
- **対象外**：slip（悪手を選ぶ確率）は match.js に無いので、match.js との比較はしていない。ただし `engine-session.test.js` が、同じ seed の `createPlayer` を直接呼んだ手との一致を slip 込みで確かめている。開始局面は平手のみ。
## 4. 5局の使い方（確認済みの前提）
- 5局で見分けられるのは「初段か8級か」程度の**粗い差**。3勝2敗の勝率95%区間は約23〜88%で、細かい調整はできない。5連勝・5連敗なら設定を動かす。それ以外は誤差として、棋譜の中身（見落とし方・形・終盤の崩れ方）を見る。
- ユーザーの自己申告（ウォーズで連盟基準3級前後、先月は2級〜1級の間）から、3本の物差しを使う：**真面目に指す＝2級前後、雑な早指し＝5級前後、普段使わない戦法の早指し＝6〜7級前後**。ログに「指し方」欄を持たせ、局ごとに記録する。
- 1回の5局で試せる設定は1つ。候補は事前に絞る。同じ AI に慣れる学習効果が出るので seed と戦法は振る。

## 5. 未解決・要確認
- **キャラの表情**：種類（normal 以外に何を作るか）、画像の形式・サイズ、切り替えの契機（評価値の変化／駒を取った・取られた／王手／勝敗）。未決。`js/main.js` の `setExpression(name)` が差し込み口。
- **定跡の効き方（切り分け済み・不具合ではない）**：定跡は persona の `bookTags` で引く。`ibisha-seme`（タグ ibisha）は初手で定跡を引くが、`seme`（タグ空）はタグ付きの手が使えず、`balance` もタグなしのキャラとして同じ扱いで、本番の定跡（全ラインにタグ付き）では引ける手がない。定跡の手を確かめたい対局は `ibisha-seme` / `furi-mamori` を使う。現在の定跡は16本・195局面で、外れたら探索に切り替わる。
- **素材のライセンス**：`web/assets/` の盤・駒画像の出典・利用条件が未確認（流用元の docs にも「要確認」のまま）。公開・配布の前に確認し、`NOTICE-THIRD-PARTY.md` に記載する。
- **実機ブラウザ**：表示と Worker の確認は headless Chromium のみ。Safari・iOS 実機は未確認（モジュール Worker は Safari 15 以降）。スマホで `web/dev/engine-check.html` を開いて全項目に ✅ が付くかを見るのが、手っ取り早い実機確認。
- **`restart` の検証範囲**：待機中の呼び出しが打ち切られ、作り直した Worker がすぐ使えることは確認済み。探索の最中に止めた場合の確認は、思考が速くて作れていない。
- **終局ルールの細目**：千日手（同一局面4回、連続王手の扱い）、持将棋・入玉の扱い、手数上限の値。C の前に決める。
- **`web/` を公開する場合の配信構成**：リポジトリのルートごと置く前提で書いている。

## 6. 検査
- `npm test`：本番経路が tsshogi 無しで動き、同じ手を指すこと（`test/web/no-tsshogi.test.js`）、`web/` の複製が無改変であること（`test/web/web-vendor.test.js`）を含む。
- `npm run check:web`：`src/index.js` から辿れる import に、npm パッケージ・node 組み込み・検証専用ファイルが混ざっていないこと。
- 画面：`npm run web` で開いて目視。headless での確認は、使い捨ての puppeteer-core + 同梱 Chromium で行った（repo には入れていない）。

## 6. 将来のスコープ（いまはやらない）
- **入玉宣言（将棋ウォーズのルールに合わせる）**：どちらかが入玉宣言できる状態になったら、**強制的に入玉宣言したものとして扱う**（宣言の操作は設けない）。現状は未対応で、手数上限（300手）の引き分けで代用している（D-036）。実装するときは、ウォーズの入玉（持将棋）判定の細目（点数・駒数の条件、宣言できる条件）を公式のルールで確認してから決める。判定は `game/termination.js` に足す想定。
- 持ち時間（時間切れ負け）、待った、表情つきキャラの描画（§5）。

