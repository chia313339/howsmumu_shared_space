# Howsmumu Drive 規格說明

## 目標
- 提供一個受密碼保護的「類雲端硬碟」網頁，使用者輸入密碼後可上傳、下載、刪除檔案。
- 檔案限制：單檔最大 100MB。
- 前端：Vue 3 + Vite + Bootstrap 5，支援拖拉上傳與 RWD。
- 後端：Node.js + Express，檔案實體存放於 GCP Storage Bucket（預設專案 `dwtlung`、prefix `howsmumu/`）。
- 交付 Docker 映像可直接部署，並使用安全方式提供 GCP 認證（掛載 Service Account 金鑰，不寫入映像）。

## 系統架構
- 瀏覽器 (Vue, Axios, Bootstrap) ↔ Express API (Node 18+) ↔ GCP Storage Bucket
- 前端建置後放置於 `/frontend/dist`，由 Express 提供靜態檔案。
- 認證：單一密碼登入，伺服端以 Cookie（`auth_token`）維持狀態。
- 檔案儲存：GCS Object，名稱為 prefix + 淨化後檔名，metadata 記錄原始檔名。

## 環境變數
- `PORT`：伺服器埠號，預設 3000。
- `ACCESS_PASSWORD`：登入密碼，預設 `howsmumu`。
- `SESSION_SECRET`：用於簽發 Token 的 Secret，請自訂。
- `GCP_PROJECT`：GCP 專案 ID，預設 `dwtlung`。
- `GCS_BUCKET`：Bucket 名稱，預設 `dwtlung`。
- `GCS_PREFIX`：檔案路徑 prefix，預設 `howsmumu/`。
- `CORS_ORIGIN`：前端來源，預設 `http://localhost:5173`。
- `COOKIE_SECURE`：`true` 時 Cookie 僅透過 HTTPS 傳送。
- `GOOGLE_APPLICATION_CREDENTIALS`：Service Account JSON 路徑（以 Volume/Secret 提供）。

## API 設計
所有 `/api/*` 路由需已登入（Cookie `auth_token` 存在且有效）。

### 認證
- `POST /auth/login`
  - Body: `{ "password": "howsmumu" }`
  - 成功：200 `{ ok: true }` 並設置 HttpOnly Cookie `auth_token`
  - 失敗：401 `{ error: "Invalid password" }`
- `POST /auth/logout`
  - 清除 Cookie，回傳 `{ ok: true }`

### 健康檢查
- `GET /api/health` → `{ status: "ok" }`

### 檔案
- `GET /api/files`
  - 回傳 `{ files: [ { id, name, path, size, updated } ] }`
  - `name`: 原始檔名；`path`: prefix 去除後的檔名；`size`: 位元組；`updated`: ISO 時戳。
- `POST /api/files`
  - Form field `file`，單檔限制 100MB（multer 限制）。
  - 成功：201 `{ ok: true, name: "<original>" }`
  - 失敗：413（超過大小）或 500。
- `GET /api/files/:fileName`
  - 依檔名下載，`Content-Disposition: attachment`.
  - 404：檔案不存在。
- `DELETE /api/files/:fileName`
  - 刪除指定檔案；404：不存在；500：錯誤。

### 錯誤格式
`{ error: "<message>" }`，401/404/413/500 依情境設定。

## 前端行為與流程
- 初始載入：
  1) 嘗試呼叫 `GET /api/files`；401 則顯示登入表單。
  2) 成功則展示主畫面。
- 登入：表單輸入密碼 → `POST /auth/login` → 成功後重新拉取檔案清單。
- 上傳：拖拉或選擇檔案 → 前端先檢查大小 → 依序呼叫 `POST /api/files`（multipart/form-data）→ 成功後刷新清單。
- 下載：點擊下載 → 瀏覽器開啟 `/api/files/:path` 新視窗下載。
- 刪除：點擊刪除 → 確認對話框 → `DELETE /api/files/:path` → 成功後從列表移除。
- UI 元件：
  - `UploadArea`：拖拉/按鈕觸發檔案選擇。
  - `FileTable`：表格顯示檔名、上傳時間、大小，附下載/刪除按鈕。
  - Bootstrap 5 + Bootstrap Icons，RWD 支援桌面與行動版。

## 後端流程（序列摘要）
- 登入：
  1) `POST /auth/login` 收到密碼 → 比對 `ACCESS_PASSWORD`。
  2) 產生 `auth_token = sha256(SESSION_SECRET + password)`，寫入 HttpOnly Cookie。
  3) 後續請求由 `authMiddleware` 驗證 Cookie。
- 上傳：
  1) `multer` 以 memory storage 接收檔案（限制 100MB）。
  2) 清理檔名（非字母數字符號轉 `_`），組合為 `GCS_PREFIX + sanitizedName`。
  3) 以 `@google-cloud/storage` 寫入 Object，metadata.metadata.originalName 紀錄原檔名。
  4) 回傳 201。
- 列表：
  1) `bucket.getFiles({ prefix })` 取得 prefix 底下檔案。
  2) 過濾資料夾項目，組合 `name`（原檔名 metadata）、`path`（prefix 去除後）、大小與時間。
- 下載：
  1) 檢查檔案存在。
  2) 設定 Content-Type/Disposition，將 GCS 讀取串流 pipe 回客戶端。
- 刪除：存在檢查 → `file.delete()`。

## 安全性
- 單一密碼保護，Cookie 為 HttpOnly；可透過 `COOKIE_SECURE=true` 強制 HTTPS。
- 不將 Service Account 金鑰放入映像檔，Dockerfile 預留 `/var/secrets/google/key.json` 路徑供掛載。
- 檔名淨化避免路徑注入；上傳限制 100MB，multer 捕捉大小錯誤。
- 建議使用最低權限的 Service Account（Storage Object Admin 或細分角色），並於 VPC/Ingress 層搭配 HTTPS。

## 待辦 / 建議強化
- 改為多使用者帳號或 OAuth / Identity-Aware Proxy 以提升安全性。
- 新增檔案夾/標籤、版本紀錄或簽署式 URL 以降低伺服器負載。
- 加入進度條與批次上傳（多檔並行）以改善體驗。
- 增加整合測試（含 GCS emulator）與 CI workflow。
