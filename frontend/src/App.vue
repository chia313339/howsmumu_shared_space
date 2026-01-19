<template>
  <div class="container py-5">
    <header class="text-center mb-4">
      <p class="text-uppercase text-muted fw-semibold mb-1 small">Secure Shared Space</p>
      <h1 class="brand-title">Howsmumu 雲端空間</h1>
      <p class="text-muted mb-0">輸入密碼後即可上傳與下載檔案，單檔限制 100MB。</p>
    </header>

    <div v-if="!authed" class="row justify-content-center">
      <div class="col-12 col-md-7 col-lg-5">
        <div class="card shadow-sm">
          <div class="card-body p-4">
            <h5 class="fw-semibold mb-3">請輸入密碼</h5>
            <form @submit.prevent="handleLogin">
              <div class="mb-3">
                <label class="form-label small text-muted">密碼</label>
                <input
                  v-model="password"
                  type="password"
                  class="form-control form-control-lg"
                  placeholder="請輸入密碼"
                  required
                  :disabled="loading"
                >
              </div>
              <button class="btn btn-primary w-100 btn-lg" type="submit" :disabled="loading">
                <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                進入
              </button>
              <p v-if="error" class="text-danger small mt-3 mb-0">{{ error }}</p>
            </form>
          </div>
        </div>
      </div>
    </div>

    <div v-else>
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-3">
        <div>
          <h5 class="mb-0">共享空間</h5>
          <small class="text-muted">拖拉或點擊即可上傳，檔案保存於 GCP Storage。</small>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary" @click="refreshFiles" :disabled="loadingFiles">
            <span v-if="loadingFiles" class="spinner-border spinner-border-sm me-2"></span>
            重新整理
          </button>
          <button class="btn btn-outline-danger" @click="handleLogout">登出</button>
        </div>
      </div>

      <UploadArea
        class="mb-3"
        :uploading="uploading"
        :max-size="maxSize"
        @files-dropped="handleFiles"
      />

      <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
        <div class="d-flex align-items-center gap-2">
          <button
            class="btn btn-outline-primary btn-sm"
            :disabled="!selected.length || loadingFiles || deleting"
            @click="bulkDownload"
          >
            <i class="bi bi-download me-1"></i>下載選取 ({{ selected.length }})
          </button>
          <button
            class="btn btn-outline-danger btn-sm"
            :disabled="!selected.length || loadingFiles || deleting"
            @click="bulkDelete"
          >
            <i class="bi bi-trash me-1"></i>刪除選取
          </button>
        </div>
        <small v-if="selected.length" class="text-muted">已選 {{ selected.length }} 個檔案</small>
      </div>

      <div class="card shadow-sm">
        <div class="card-header d-flex justify-content-between align-items-center bg-white">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-folder2-open text-primary"></i>
            <span class="fw-semibold">檔案清單</span>
            <span class="badge badge-soft">{{ files.length }} 個檔案</span>
          </div>
          <small class="text-muted">單檔限制 100MB</small>
        </div>
        <FileTable
          :files="sortedFiles"
          :loading="loadingFiles"
          :selected="selected"
          :sort-key="sortKey"
          :sort-dir="sortDir"
          @download="startDownload"
          @delete="confirmDelete"
          @toggle="toggleSelection"
          @toggle-all="toggleAll"
          @sort="setSort"
        />
      </div>

      <div v-if="status" class="alert alert-info mt-3 py-2 mb-0">
        {{ status }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import UploadArea from './components/UploadArea.vue'
import FileTable from './components/FileTable.vue'
import { deleteFile, fetchFiles, loginRequest, logoutRequest, uploadFile } from './services/api'

const maxSize = 100 * 1024 * 1024
const authed = ref(false)
const password = ref('')
const error = ref('')
const loading = ref(false)
const loadingFiles = ref(false)
const uploading = ref(false)
const files = ref([])
const status = ref('')
const selected = ref([])
const deleting = ref(false)
const sortKey = ref('updated')
const sortDir = ref('desc')

const sortedFiles = computed(() => {
  const list = [...files.value]
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => {
    let result = 0
    if (key === 'name') {
      result = (a.name || '').localeCompare(b.name || '', undefined, {
        numeric: true,
        sensitivity: 'base'
      })
    } else if (key === 'size') {
      result = (a.size || 0) - (b.size || 0)
    } else {
      const aTime = a.updated ? new Date(a.updated).getTime() : 0
      const bTime = b.updated ? new Date(b.updated).getTime() : 0
      result = aTime - bTime
    }
    return result * dir
  })
  return list
})

onMounted(async () => {
  await tryBootstrapSession()
})

async function tryBootstrapSession () {
  loadingFiles.value = true
  try {
    await loadFiles()
    authed.value = true
  } catch (err) {
    authed.value = false
  } finally {
    loadingFiles.value = false
  }
}

async function handleLogin () {
  loading.value = true
  error.value = ''
  try {
    await loginRequest(password.value)
    authed.value = true
    await loadFiles()
  } catch (err) {
    error.value = err?.response?.data?.error || '登入失敗，請確認密碼'
    authed.value = false
  } finally {
    loading.value = false
  }
}

async function handleLogout () {
  await logoutRequest()
  authed.value = false
  password.value = ''
  files.value = []
}

async function refreshFiles () {
  await loadFiles()
}

async function loadFiles () {
  loadingFiles.value = true
  status.value = ''
  try {
    const data = await fetchFiles()
    files.value = data.files || []
    selected.value = []
  } catch (err) {
    if (err?.response?.status === 401) {
      authed.value = false
      error.value = '連線逾時，請重新登入'
    } else {
      status.value = '無法取得檔案清單，請稍後再試'
    }
    throw err
  } finally {
    loadingFiles.value = false
  }
}

function handleFiles (droppedFiles) {
  const valid = Array.from(droppedFiles).filter(file => {
    if (file.size > maxSize) {
      status.value = `檔案 ${file.name} 超過 100MB，已略過`
      return false
    }
    return true
  })
  if (!valid.length) return
  uploadSequential(valid)
}

async function uploadSequential (fileList) {
  uploading.value = true
  status.value = '上傳中...'
  try {
    for (const file of fileList) {
      await uploadFile(file)
    }
    status.value = '上傳完成'
    await loadFiles()
  } catch (err) {
    status.value = err?.response?.data?.error || '上傳失敗，請稍後重試'
  } finally {
    uploading.value = false
    setTimeout(() => { status.value = '' }, 2000)
  }
}

function startDownload (file) {
  const target = `/api/files/${encodeURIComponent(file.path)}`
  window.open(target, '_blank')
}

async function confirmDelete (file) {
  const ok = window.confirm(`確定要刪除 ${file.name} 嗎？`)
  if (!ok) return
  try {
    await deleteFile(file.path)
    files.value = files.value.filter(f => f.path !== file.path)
    selected.value = selected.value.filter(p => p !== file.path)
  } catch (err) {
    status.value = '刪除失敗，請稍後再試'
  }
}

function toggleSelection (path) {
  if (selected.value.includes(path)) {
    selected.value = selected.value.filter(p => p !== path)
  } else {
    selected.value = [...selected.value, path]
  }
}

function toggleAll (checked) {
  if (checked) {
    selected.value = files.value.map(f => f.path)
  } else {
    selected.value = []
  }
}

function setSort (key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = key
  sortDir.value = key === 'name' ? 'asc' : 'desc'
}

function bulkDownload () {
  if (!selected.value.length) return
  selected.value.forEach(path => {
    const target = `/api/files/${encodeURIComponent(path)}`
    window.open(target, '_blank')
  })
}

async function bulkDelete () {
  if (!selected.value.length) return
  const ok = window.confirm(`確定刪除選取的 ${selected.value.length} 個檔案嗎？`)
  if (!ok) return
  deleting.value = true
  status.value = '刪除中...'
  try {
    for (const path of selected.value) {
      await deleteFile(path)
      files.value = files.value.filter(f => f.path !== path)
    }
    selected.value = []
    status.value = '已刪除'
  } catch (err) {
    status.value = '批次刪除失敗，請稍後再試'
  } finally {
    deleting.value = false
    setTimeout(() => { status.value = '' }, 2000)
  }
}
</script>
