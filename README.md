# Howsmumu 雲端空間

Vue + Vite + Bootstrap 的前端，Node.js + Express 的後端，檔案實體存放在 GCP Storage Bucket（預設專案 `dwtlung`，prefix `howsmumu/`）。進入頁面需輸入密碼（預設 `howsmumu`），可上傳 / 下載 / 刪除檔案，單檔限制 100MB。

## 環境需求
- Node.js 18+、npm
- GCP Storage Bucket（預設名稱 `dwtlung`，可改為自己的 bucket），並準備 Service Account JSON 金鑰。

## 環境變數
複製 `.env.example` 為 `.env` 並依需要調整：

```
PORT=3000
ACCESS_PASSWORD=howsmumu
SESSION_SECRET=please-change-me
GCP_PROJECT=dwtlung
GCS_BUCKET=dwtlung
GCS_PREFIX=howsmumu/
CORS_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
# GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

> 建議將 `ACCESS_PASSWORD`、`SESSION_SECRET` 改為自訂值，並使用環境變數提供 `GOOGLE_APPLICATION_CREDENTIALS`（不要把金鑰寫進映像檔或 git）。

## 安裝與開發
在專案根目錄執行（會同時安裝前端相依）：
```
npm install
```

開發模式（前後端分開啟動）：
```
# 啟動後端 (http://localhost:3000)
npm run dev

# 另開終端機啟動前端 (http://localhost:5173)，已設定 API proxy 到 3000
npm run dev --prefix frontend
```

建置前端並以後端提供靜態檔案：
```
npm run build --prefix frontend
npm run start
```

## Docker
建置映像檔：
```
docker build -t howsmumu-drive .
```

執行（將 Service Account 金鑰以唯讀方式掛載，並自訂密碼等環境變數）：
```
docker run -d \
  -p 3000:3000 \
  -e ACCESS_PASSWORD=howsmumu \
  -e GCS_BUCKET=dwtlung \
  -e GCS_PREFIX=howsmumu/ \
  -v /absolute/path/to/key.json:/var/secrets/google/key.json:ro \
  --name howsmumu-drive \
  howsmumu-drive
```

## API 摘要
- `POST /auth/login`：body `{ password }`，成功後以 Cookie 儲存授權。
- `POST /auth/logout`：登出並清除 Cookie。
- `GET /api/files`：取得檔案清單（檔名、路徑、更新時間、大小）。
- `POST /api/files`：上傳單一檔案，field 名稱 `file`，限制 100MB。
- `GET /api/files/:fileName`：下載檔案。
- `DELETE /api/files/:fileName`：刪除檔案。

所有 `/api/*` 路由需已登入（Cookie 認證）。登入密碼由 `ACCESS_PASSWORD` 控制。

## 使用注意
- 上傳檔名會經過簡單清理（非字母數字會轉為 `_`），並存放在指定 prefix 底下。
- 目前使用單一密碼保護，適合小型內部場景；如需多人帳號或更嚴格權限，請改為 OAuth / Identity-Aware Proxy 等方案。
- 請確保 GCP IAM 權限允許讀寫 Bucket，並建議使用獨立 Service Account 並限制角色範圍。
