# YouTubeの自動位置合わせに使う静止画取得の調査

確認日：2026-09-10。対象は、GitHub Pagesで公開しているWebアプリをiPhoneのSafariから開く構成。

## 結論と公開状態

YouTubeを別のブラウザで再生・撮影する方式と、PCの利用者がタブ共有を許可する方式では、実際のYouTube映像の静止画を取得できた。したがって、YouTubeの映像を解析すること自体が不可能ではない。

ただし、今回確認できた方法をiPhoneのSafariの通常のページ内だけで実行することはできない。PC向けはタブ共有を追加、iPhoneでURLだけの操作にする場合は補助サーバーで撮影する構成が候補になる。静止画取得の試作まで検証した段階で、YouTubeの自動位置合わせは公開アプリには未実装。現在は重ね表示と手動補正を使う。

Xは異なる。読み込めた公開動画は端末内のBlobとして再生しているため、既存の1コマ／動画全体の骨格解析に接続できる。複数の添付動画は、写真を除いて矢印で切り替える。

## 比較した方法

| 方法 | 調査・実験の結果 | このアプリへの適用 |
|---|---|---|
| iframeの内部動画を直接読む | 通常のページからのアクセスは実験でSecurityError | 今の構成では不可 |
| html2canvasなどで画面を画像化 | ライブラリはDOMから画面を再構成する。実際のOSスクショではなく、別オリジンの内容を読む制限も残る | ライブラリを足すだけでは解決しない |
| YouTube IFrame API・サムネイルAPI | 再生位置・速度などは操作できるが、指定時刻の画素を返す機能はない。通常のサムネイルは任意時刻の姿勢を表さない | 姿勢合わせの参照画像として代用しない |
| PCのタブ共有 → Canvas | 隔離したChromeで、YouTubeの停止フレームを取得・読み出しできた | PC向けの実装候補。利用者のボタン操作と共有許可が必要 |
| 別ブラウザの自動撮影 | ローカルで動かしたChromeの自動操作で、iframeを含む静止画を取得できた | iPhoneから利用するなら同じ処理を動かす補助サーバーが必要。クラウドでの安定動作は未検証 |
| YouTube.jsなどで映像データを取得 | ブラウザから利用する実装にもプロキシサーバーや拡張が使われる。既存サンプルには非推奨のものもある | GitHub Pagesだけで完結する解決策にはならない |
| iOSのReplayKit | Appleのネイティブアプリ用の画面録画機能 | WebページのJavaScriptからそのまま使える機能ではない。ネイティブ化が別途必要で、YouTube映像の取得可否も実機検証が必要 |

根拠：[同一オリジンの制限](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)、[html2canvas公式説明](https://html2canvas.hertzen.com/documentation)、[IFrame API](https://developers.google.com/youtube/iframe_api_reference)、[サムネイルAPI](https://developers.google.com/youtube/v3/docs/thumbnails)。

画面共有は利用者による操作と毎回の許可を必要とする。MDNの互換性データではSafari iOSの`getDisplayMedia`は非対応で、ホーム画面に追加するだけではこのAPIを使えるようにはならない。[画面共有API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)、[互換性データ](https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json)、[Chrome Region Capture](https://developer.chrome.com/docs/web-platform/region-capture)。

別ブラウザの撮影はページ内のJavaScriptより外側で動く。[Puppeteerのスクリーンショット](https://pptr.dev/api/puppeteer.page.screenshot)。YouTube.jsの[旧ブラウザ例](https://github.com/LuanRT/YouTube.js/blob/main/examples/browser/README.md)はサーバー経由を必要とし、最新の例への移行を案内している。開発者の[ytc-bridge](https://github.com/LuanRT/ytc-bridge)はChromiumの拡張として動く。ネイティブの候補は[ReplayKit](https://developer.apple.com/documentation/replaykit)。

## 実際に試したこと

### YouTubeの画素取得

隔離したPCのChromeで、YouTube公式APIのサンプル動画`M7lc1UVf-VE`を埋め込み、約41.59秒の人物が映っている場面で停止した。

1. 親ページからiframeの内部文書を読むと`SecurityError`になった。
2. `getDisplayMedia`で自分のテストタブを取得した。共有映像は960×720、`displaySurface: browser`。
3. iframeの表示範囲をCanvasへ640×480で切り出し、`getImageData`とPNG化が成功した。画像を目視し、YouTubeの人物が写っていることを確認した。
4. 同じiframeをブラウザ自動操作側からも撮影し、同じ場面が写っていることを確認した。
5. 共有用の映像トラックを停止し、ブラウザを終了した。

共有先の選択には隔離した自動テスト用Chromeのフラグを使った。一般利用者の共有許可を省略できることを意味しない。最初の試行は共有選択待ちでタイムアウトし、現在のタブを選ぶテスト用フラグを修正後に成功した。

これは静止画の取得実験。ダンス動画でのYouTube自動位置合わせ、実際の共有ダイアログの操作、iPhone実機、クラウドサーバーでの撮影、広告や再生制限がある動画は検証していない。取得画像にはYouTubeの操作ボタンも写るため、骨格補正へ接続するには人物が見える場面を選び、画像と表示座標の対応を確認する必要がある。

### Twitterの矢印と自動補正

複数添付のテストでは、Xの取得部分だけをテスト用の応答に置き換え、利用者提供の2本の動画を端末内で返した。私人の動画をXや取得サービスに送信していない。写真・動画・写真・動画の並びで、2つの動画だけを前後に選べることを確認した。

- 動画のデコード、MediaPipeの骨格推定、位置・倍率の計算は本物の処理を実行。
- 1コマ補正は倍率約0.896、横約11.03%、縦約3.13%。全体補正は32組中22組を利用し、倍率約0.985、横約13.27%、縦約1.27%。数値はこのテストの動画・表示領域に限る。
- 解析前後で見えている2本の再生時刻・速度・音の状態が変わらないことを確認。
- 切り替え時に補正を解除。戻した動画のBPMを復元。取得失敗・中止時は元の動画を維持。
- 320×568から844×390まで5種類の縦横表示で、矢印と常設トラックの配置を確認。
- 別途、実際の公開X動画からの取得・デコード・画素読み出し・同期再生・履歴復元も確認。公開X動画での人物の位置合わせそのものは今回のテスト対象外。

## iPhone向けに次に進める構成

自動化を優先するなら、公開サイトの画面はGitHub Pagesに残し、YouTubeの参照画像だけを作る補助サーバーを追加する方式をまず試す。利用者が「この場面で合わせる」を押した時に動画IDと時刻を送る。サーバーが独立したブラウザでその動画を開き、停止した画像と実際の取得時刻を返す。自分の動画は端末内に残して骨格を解析し、共通の表示座標で倍率・位置を計算してプレビューする。

実装前に確認すべき点は、クラウドからの再生可否、待ち時間、指定時刻と取得時刻の差、操作ボタンや広告の混入、複数人からの対象選択、画面回転後の座標換算。失敗時は補正を適用せず手動調整へ戻す。再生中の追従補正や連続シークは追加せず、採用した位置と倍率を固定する。

サーバーを追加しない場合、iPhoneでは利用者が選んだスクリーンショットを基準にするか、頭・腰・足などを数点指定して計算する方式が残る。どちらも今後の追加実装。
