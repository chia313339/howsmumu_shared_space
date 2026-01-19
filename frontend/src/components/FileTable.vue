<template>
  <div class="table-responsive">
    <table class="table align-middle mb-0">
      <thead class="table-light">
        <tr>
          <th style="width: 46px;">
            <input
              type="checkbox"
              class="form-check-input"
              :checked="allSelected"
              :indeterminate.prop="selected.length > 0 && !allSelected"
              @change="$emit('toggle-all', !allSelected)"
            >
          </th>
          <th>
            <button
              type="button"
              class="btn btn-link p-0 text-decoration-none sort-button"
              @click="$emit('sort', 'name')"
            >
              檔名 <i :class="sortIcon('name')"></i>
            </button>
          </th>
          <th style="min-width: 170px;">
            <button
              type="button"
              class="btn btn-link p-0 text-decoration-none sort-button"
              @click="$emit('sort', 'updated')"
            >
              上傳時間 <i :class="sortIcon('updated')"></i>
            </button>
          </th>
          <th style="min-width: 120px;">
            <button
              type="button"
              class="btn btn-link p-0 text-decoration-none sort-button"
              @click="$emit('sort', 'size')"
            >
              大小 <i :class="sortIcon('size')"></i>
            </button>
          </th>
          <th class="text-end" style="min-width: 140px;">動作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="5" class="text-center py-4">
            <div class="spinner-border text-primary me-2" role="status"></div>
            載入中...
          </td>
        </tr>
        <tr v-else-if="!files.length">
          <td colspan="5" class="text-center py-4 text-muted">目前沒有檔案</td>
        </tr>
        <tr v-for="file in files" :key="file.path">
          <td>
            <input
              type="checkbox"
              class="form-check-input"
              :checked="selected.includes(file.path)"
              @change="$emit('toggle', file.path)"
            >
          </td>
          <td>
            <div class="fw-semibold">{{ file.name }}</div>
            <small class="text-muted">{{ file.path }}</small>
          </td>
          <td>{{ formatDate(file.updated) }}</td>
          <td>{{ formatSize(file.size) }}</td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" @click="$emit('download', file)">
                <i class="bi bi-download me-1"></i>下載
              </button>
              <button class="btn btn-sm btn-outline-danger" @click="$emit('delete', file)">
                <i class="bi bi-trash me-1"></i>刪除
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  files: {
    type: Array,
    default: () => []
  },
  loading: Boolean,
  selected: {
    type: Array,
    default: () => []
  },
  sortKey: {
    type: String,
    default: 'updated'
  },
  sortDir: {
    type: String,
    default: 'desc'
  }
})

const allSelected = computed(() => props.files.length > 0 && props.selected.length === props.files.length)

function sortIcon (key) {
  if (props.sortKey !== key) return 'bi bi-arrow-down-up text-muted'
  return props.sortDir === 'asc' ? 'bi bi-sort-up' : 'bi bi-sort-down'
}

function formatDate (value) {
  if (!value) return '-'
  const date = new Date(value)
  return date.toLocaleString()
}

function formatSize (bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}
</script>
