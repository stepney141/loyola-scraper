# loyola-scraper

## これはなに

- Loyola掲示板の課外活動情報をスクレイピングし、更新情報をDiscordにwebhookで送信するためのなにか
- HTML要素をXPathや座標で指定しているため、Loyolaの表示をカスタマイズしている場合はそれに合わせてコード中のXPath・座標の指定も書き換える必要がある

## 必要なもの

- Node.js(v14以上推奨)
- yarn
- 任意の処理を定期実行するための何らかのツール

## 環境構築

1. このリポジトリを `git clone` する
2. 落としてきたリポジトリ内で `yarn` する
3. `setting.example.json` を `settings/setting.json`にコピーし、後者のファイルの中身を適当に書き換える（これが設定ファイルになる）

## 使い方

適当なツールを使い、`index.js` の定期実行を設定する
