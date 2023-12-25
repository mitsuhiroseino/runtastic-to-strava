# runtastic-to-strava

RuntasticのトラッキングデータをStravaでインポート可能な形式に変換します。

## 使い方

1. `./resoures`フォルダを作成し、Runtasticから抽出したデータを`./resources/runtastic`配下に配置します。
2. コマンドラインで`yarn r2s`を実行します。
3. `./resources/gpx`配下にセッションごとにGPXファイルが作成されます。