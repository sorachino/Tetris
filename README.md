# 対戦テトリス

2人用オンライン対戦テトリス。部屋コードで接続（WebSocket中継サーバー経由）。

- `index.html` … ゲーム本体（サーバーが配信）
- `server.js` … 部屋コード管理＋メッセージ中継（Node.js / ws）

## ローカル起動
```
npm install
npm start   # http://localhost:3000
```

## Renderへのデプロイ
Render → New → Web Service → このリポジトリを選択
(Build: `npm install` / Start: `npm start` / Plan: Free)
または Blueprint（`render.yaml`）。発行されたURLを2人で開いて遊ぶ。
