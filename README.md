# loyola-scraper

[![Loyola Automatic Watcher](https://github.com/stepney141/loyola-scraper/actions/workflows/loyola-auto-watcher.yml/badge.svg)](https://github.com/stepney141/loyola-scraper/actions/workflows/loyola-auto-watcher.yml)

## これはなに

- Loyola掲示板の課外活動情報をスクレイピングし、更新情報をDiscordにwebhookで送信する
- HTML要素をXPathや座標で指定しているため、Loyolaの表示をカスタマイズしている場合はそれに合わせてコード中のXPath・座標の指定も書き換える必要がある
- 30分おきに発火

## 必要なもの

- Node.js (`v14`必須)
- yarn
- 任意の処理を定期実行するための何らかのツール

## 使い方

1. `yarn install`
2. 適当なツールを使い、`index.js` の定期実行を設定する
