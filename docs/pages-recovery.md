# Pages公開の復旧記録

## 公開状態（2026-11-10）

| 対象 | 状態 |
| --- | --- |
| [元の公開URL](https://wo1f-rgb.github.io/wotagei-master/) | 復旧済み。標準Pagesデプロイ・HTTP 200・公開アプリ上のブラウザテスト成功 |
| 予備リポジトリ `Wo1F-rgb/wotagei-master-web` | 作成・ソースとビルド済みファイルのpush済み |
| [予備公開URL](https://wo1f-rgb.github.io/wotagei-master-web/) | 標準Pagesデプロイ成功。公開アプリ上のブラウザテスト成功 |
| アカウントのbilling lock | 解除は未確認。公開経路の変更と解除は別の問題 |

カスタムActions workflowは「The job was not started because your account is locked due to a billing issue.」で開始できませんでした。ローカルで生成した静的ファイルと`.nojekyll`を`gh-pages`へ送る方式では、予備・元の両リポジトリでGitHub標準の`pages-build-deployment`が成功しました。支払方法や契約などの金融設定は変更していません。

元の公開先での確認記録：

- 公開アプリのソース：`5b61cd5792323e58ce2836850ece7d01089c032c`
- 公開用ファイル：`1bf535e545aba8540c016a51430b09b1a2d72e96`（`gh-pages`）
- [元リポジトリの標準Pages実行](https://github.com/Wo1F-rgb/wotagei-master/actions/runs/42838255889)：全工程成功
- [公開中のrelease.json](https://wo1f-rgb.github.io/wotagei-master/release.json)：上記ソースcommitを確認
- 公開HTML：HTTP 200、`index-ahgEbN3d.js`の配信を確認
- `npm run publish:pages -- --repo Wo1F-rgb/wotagei-master`：終了コード0。型チェック、テスト280件（失敗・スキップ0）、ビルド、静的配信検証が成功

予備公開先はソース`323c9de`、公開用commit `60640375db914c010b89cd5480c2aa95abd4d5a6`で、同じアプリ機能の公開を先に確認しました。[予備リポジトリの標準Pages実行](https://github.com/Wo1F-rgb/wotagei-master-web/actions/runs/42836707398)もデプロイを含め成功しています。予備の`main`にも更新コマンドと文書を反映済みです。

両方の公開URLを対象に`tests/built-beat-frames.mjs`を実行し、MP4の読み込み、JPEG・ZIPの出力、4拍分の実JPEG画素、正確なシーク、出力前後の動画時刻の維持、中止、4画面サイズのテストが成功しました。YouTube APIとXの情報取得はテスト内の代替応答を使っており、外部サービスとの実通信を保証する結果ではありません。ブラウザ検証はWindows上のChromiumで行い、iPhone実機は未確認です。

元の公開URLは引き続き使えます。URLのオリジンは変わらないため、この復旧に伴う端末内の保存データ移行は不要です。

`.nojekyll`はJekyllによるビルドを省くためのファイルです。ブランチからの公開もGitHub Actionsのworkflowでデプロイされるため、「Actionsを一切使わない方式」ではありません。今回の標準workflowが開始できたことは実測結果であり、すべてのbilling lockで使える保証ではありません。[GitHub公式：公開元の設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 今後の更新

Node.js 24、Git、GitHub CLIを使い、GitHub CLIで対象リポジトリに書き込めるアカウントへログインします。対象は既存の公開リポジトリで、デフォルトブランチが`main`である必要があります。ソースの変更をコミットし、作業ツリーを変更のない状態にしてから実行します。

```sh
npm ci
npm run publish:pages -- --repo Wo1F-rgb/wotagei-master
```

予備リポジトリへ公開する場合は、`--repo Wo1F-rgb/wotagei-master-web`を指定します。

更新コマンドは次を順に行います。

1. 型チェック、テスト、静的ビルド、配信ファイルの検証。
2. ソースを対象リポジトリの`main`へpush。
3. `dist-pages`の内容、`.nojekyll`、ソースcommitを記録した`release.json`を対象リポジトリの`gh-pages`へpush。
4. Pagesを`gh-pages`のルートから公開する設定を有効化、または維持。

pushせず検証と公開用ファイルの準備だけを行う場合は、末尾に`--dry-run`を付けます。実行中にソースが変更された場合や、既存ブランチへ通常のpushができない場合は停止し、force-pushはしません。

push後は、対象リポジトリのActionsで`pages-build-deployment`の成功を確認し、公開URLの`release.json`が今回のソースcommitを示すことと、アプリの反映を確認します。通常は公開まで最大10分程度かかります。コマンドによるpush完了だけでは、GitHub側の公開成功を意味しません。[GitHub公式：Pagesサイトの作成](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

Settings → Pages → Build and deploymentでは、Sourceを **Deploy from a branch**、Branchを **gh-pages / (root)** にします。既存のカスタムworkflow `.github/workflows/pages.yml` は手動実行のみで、ソースのpushでは起動しません。通常の更新は上記コマンドを使います。カスタムActions workflowへ公開を戻すと、billing lockが残る間は再び開始を拒否される可能性があります。

GitHubが静的ファイルを配信するため、PCや自分のサーバーの常時起動は不要です。更新するときだけローカルでビルド・pushします。

READMEやこの復旧記録だけを更新する場合は、ソースのcommit・pushだけで構いません。公開アプリを再ビルドしない限り、`release.json`は直近に公開したアプリのソースcommitを示します。

## 再び課金エラーになった場合

無料プラン・支払方法なし・有料契約や残高の表示なしでも、アカウントのbilling lockによって無料Actionsが止まる場合があるとGitHubは説明しています。ただし、このアカウントでロックが発生した原因は確定していません。支払方法や契約を変更せず、エラー文・実行URL・表示されている契約状態を記録し、利用できる場合はGitHub Supportにロックの調査を依頼します。[GitHub公式：ロックされたアカウント](https://docs.github.com/en/billing/how-tos/troubleshooting/locked-account)

ブランチ公開も拒否される場合は、ローカル検証済みの`dist-pages`を保管して公開を保留します。billing lockの解消前に、公開設定を繰り返し切り替える必要はありません。
