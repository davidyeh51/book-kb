# 書籍數位化知識庫（外殼）

這個 repo 只放網頁程式。書目與簡報內容存在 Supabase（`kb_items`、`kb_decks`），
必須以個人帳號＋存取金鑰登入、且金鑰未滿 60 天才讀得到（資料庫 RLS 強制執行）。

- `assets/app.js`：登入、首頁、關鍵字搜尋、簡報播放器、我的金鑰、帳號管理
- `assets/exhibits.js`：圖解引擎（簡報 JSON 只描述結構，SVG 在這裡統一繪製）與重繪書封
- 新增一本書的簡報＝新增一份 JSON 上傳到 `kb_decks`，網頁不必改
