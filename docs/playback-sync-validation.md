# 再生同期の検証（2026-09-11）

## 再現できた問題

`play()` の完了と、映像・音声の時計が安定して進み始める時点は一致しなかった。両方の Promise が完了した直後は同じ位置でも、その後に片方の時計だけが約90〜125ms止まり、その差が通常再生中にも残る組み合わせを合成AAC/H.264動画で再現した。開始直後の一回のシークだけでは検出できず、補正シーク自体が次のデコード待ちを作る場合もあった。

別の経路として、再生中の拍の起点変更は設定だけを更新して古い時刻の組み合わせを再生し続けていた。倍率変更、ループ先頭への移動、片側の読み込み待ちも、それぞれの時計が動き始めるタイミングをずらし得た。

## 変更

- ファイル2本では、無音で準備し、指定位置のデコードを待ってから選択中の音声で再生する。
- 少なくとも250ms観測し、両時計が80ms相当進むまで開始を確認する。差が25msを超えるときだけ、先行する動画を一度待たせてから再開する。追加のシークは行わない。
- 通常再生中の定期的なシーク・倍率の追従・停止と再開の繰り返しは行わない。
- 拍の微調整は両方を停止して起点を保存する。次の同期再生はその値を使う。
- ファイル比較の明示的な倍率変更とループ先頭では、開始を一度準備し直す。準備途中の連続操作は最新の要求だけを有効にする。
- `waiting` が発生した場合だけ180ms後に確認し、片側が停止・読み込み待ち、または75ms超の差が残る場合は両方を停止して再開操作を案内する。自動再試行はしない。
- 片側の動画が終わった場合は両方を停止する。画面を離れた後や開始を中止した後に古い開始処理が再生を再開しないようにする。
- インカメ練習は比較相手の再生時計を持たず、今回のファイル用準備処理を使わない。練習中の倍率変更も中断しない。

## BPMと倍率の確認方法

解析・手動タップ・既存設定のどれで設定しても、再生は保存した同じBPMと起点を使う。お手本と自分のBPMを `Br, Bs`、1拍目の秒数を `Or, Os` とすると、対応時刻は次の通り。

```text
selfTime = Os + (referenceTime - Or) × Br / Bs
```

練習倍率を `p` とすると、お手本の音を選んだ場合は `referenceRate=p, selfRate=p×Br/Bs`、自分の音を選んだ場合は `selfRate=p, referenceRate=p×Bs/Br`。両方の `BPM×実際のplaybackRate` が一致することをブラウザ内で検査した。手動タップは練習倍率0.5の状態から開始しても、元動画を1倍で再生して記録することを実測した。この計算経路に設定手法由来の二重掛けは再現しなかった。

誤差は白線の見た目ではなく、実際の `HTMLVideoElement.currentTime` から連続した拍番号を求め、選択中の曲の速度で秒数に換算した。拍番号を剰余にせず比較するため、丸一拍ずれていても検出する。2本が存在する共通区間だけを測り、両方の描画フレーム数が増えること、通常再生中に追加シークがないことも確認する。

## 実行条件

WindowsのChromeでビルド済みアプリを実行。ユーザー提供の元動画2本では、24通りのBPM・主役・倍率の組み合わせに加え、手動タップ、自動解析の実推論、保存直後、履歴からの復元、微調整、比較と重ねるの切替、途中からの再生、再生中の倍率変更、読み込み待ちを模した停止と再開を含む43回を検査した。さらに4回のループ境界を通過させた。測定した最大の時計差は **30.6ms**、12秒間の連続再生では最大 **21.5ms**。元動画は公開・コミットしていない。

公開用には録画映像や楽曲を含まない合成120/150 BPM動画を用意し、同じ検証を `tests/built-sync.mjs` に追加。0.25倍・2.5倍、準備中の連続倍率変更、自分の動画の終了と再開を含む47回が通過し、最大時計差は39.0msだった。単体テスト203件、型検査、ビルドも通過。CIの同期判定は時計差90ms未満、実効BPM一致、描画継続、通常再生中の追加シークなし。90msはテストの許容値であり、iPhoneでの精度保証ではない。

```sh
npm test
npm run check
npm run build
node tests/built-sync.mjs
```

`SYNC_REFERENCE` と `SYNC_SELF` にローカルの動画パスを渡すと、同じ検査を手元の動画で実行できる。`SYNC_QA_DIR` を設定すると測定値をJSONで保存する。元動画やその検証ログを公開リポジトリへ追加しない。

## YouTubeと検証の限界

YouTubeは[公式IFrame API](https://developers.google.com/youtube/iframe_api_reference)で返された実際の倍率に両方を合わせ、開始時に時計を一度合わせる。埋め込み側のpause完了も非同期なので、その応答を待ってから再開する。実際の埋め込み検証には同ドキュメントの公開サンプル `M7lc1UVf-VE` と合成ローカル動画を使用した。任意のYouTube動画の埋め込み可否・広告・通信状態まで同じ条件であるとは限らない。

お手本146.877／自分139.992 BPMという設定で、主役2種類×指定倍率0.75・1・1.25の6通りを実測した。お手本主役では指定倍率がそのまま適用され、最大時計差は26.9ms。自分主役ではYouTubeが0.7・0.95・1.2倍へ丸められ、実際の練習倍率は約0.734427・0.996722・1.259018倍になった。その実測倍率に合わせた両方の実効BPMは一致し、最大時計差は79.0msだった。ケースごとに先頭へ戻し、自分の動画の終了前だけを測定した。

この検証はブラウザのメディア時計と描画継続の検査で、楽曲に対する解析グリッド自体の正しさ、踊りの動きの一致、スピーカーから聞こえる音の遅延を保証するものではない。自動解析が別の拍を「1」と解釈していた場合は、拍の起点を手動で修正する必要がある。YouTubeは時刻の応答が粗く、ファイル2本と同じ精度にはならない場合がある。iPhone Safari実機での検証は未実施。


## 2026-09-12: leaving first-beat edits

Reproduced the reported paused grid offset using BPM 150.119 / 139.879 and
saved origins 3.9 / 1.0 seconds. Opening the first-beat editor, moving the
reference trial position to 4.3, and closing left actual media clocks at 4.3 / 1.0.
That is 0.4 reference seconds (about one beat) apart. The white grids exposed
this real position difference; the BPM conversion itself was correct.

First-beat edits now keep the original origins for the edit session. Leaving
without Save restores them and positions the follower once relative to the
audible master's actual time. Close, switching to comparison, full screen,
opening another configuration, and source changes finish the edit session.
Saving commits the edited origins; a rejected storage write keeps the editor
open. Preview origins cannot silently leak into the next practice session.

`tests/built-beat-editor.mjs` failed on the prior build with a measured 0.4 s
gap and passes with the fix. It checks both audio masters and edited sources,
with and without playback preview, navigation exits, failed save recovery,
actual media clock alignment and DOM white-line coordinates. Manual arrows
still move beats relative to the song while paused; steady playback does not
add repeated seeks. The new test also gates Pages publication.

Verification used real Chromium media elements at a 390 × 700 viewport and
synthetic test videos; actual iPhone Safari was not available.


## 2026-09-12: repeated pause/resume

The first-start decoder warmup was previously repeated on every Play click,
including full-screen pause/resume. Its opaque cover hid both videos. A native
pair now remembers successful preparation for the same two media elements and
source URLs. Replacing either source invalidates that readiness.

For an already prepared pair near its mapped position, Play starts both sources
without muted warmup or rewinding. The one-time 250 ms clock observation
runs while those frames play; it does not obscure or rewind either video.
A real startup clock difference over 25 ms can still hold the ahead source once;
there is no periodic seeking during playback. A larger paused mismatch over
75 ms, an explicit beat edit, or changing the audio master positions the
follower before starting. Even a
1 ms manual nudge uses the exact new mapping; the ordinary-resume tolerance
must not swallow an intentional edit. New media still use cold preparation.
Pre-roll follower entry remembers successful preparation too.

The full-video preparation cover and the React `preparing` mute override were
removed. The start button remains cancelable during genuine decoder waits;
errors remain visible. The preparation code owns temporary cold-start muting.

The built beat-editor test additionally checks 12 ordinary pause/resumes across
both audio masters and normal/full-screen views. It observes native Play/Pause
calls, seek events, actual clock phase, and cover insertion: no repeated muted
warmup, no rewind seeks, and at most one real startup clock hold. Unit cases
cover source replacement, asymmetric warm launch latency and cancellation.

The decoder-stall browser test waits for both native media to pause AND React's
stopped state. Native pause happens synchronously before React publishes the
state; checking only the native predicate raced that same stop operation.

## 2026-09-12: saved analysis drafts

A second phase regression was reproduced: save an analysis origin at 3.9 s,
save 4.3 s in the separate first-beat editor, reopen analysis, then Save. The old
analysis draft could restore 3.9 s. History now records the production BPM/origin
baseline so external saved changes win while intentionally unsaved new drafts
still survive navigation. Separate-audio analysis retains its own audio origin
and only applies BPM to the video. The built history test exercises real audio
analysis and this edit/reopen/save sequence.

Legacy histories without baseline metadata adopt the currently configured video
grid on migration; their old draft cannot overwrite a later first-beat edit.
A separate regression removes baseline metadata from a real IndexedDB history,
changes the saved origin to 5.1 s, reloads, and verifies both the current value
and the migrated metadata. An as-yet unconfigured video can still restore its
legacy draft.

Validation for these changes: 232 unit tests, type checking and production
build passed. The full sync browser suite passed 47 runs / 24 rate combinations
and 4 loop boundaries; the largest sampled native clock gap was 62.2 ms.
The beat-editor/resume suite passed with both the public synthetic fixtures
and the two original videos previously provided by the user. Each included
12 ordinary stop/resumes across both masters and normal/full-screen views.
The originals were read locally and were not added to the public repository.
The compact UI, full-screen viewer, and analysis-history browser tests passed.
These are Chrome tests, not measurements on a physical iPhone.

The first publication gate exposed a 93.6 ms warm-start clock error on Linux
Chromium that did not appear in local Windows runs. Removing clock observation
entirely let the audio clock stall just after Play resolved. The corrected warm
path starts both videos immediately but retains the one-time observation while
they play. It still skips muted warmup and rewind, and never hides the frames.
