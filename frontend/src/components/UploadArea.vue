<template>
  <div
    class="drop-area w-100 p-4 p-md-5 text-center border"
    :class="{ 'drag-over': isOver }"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="d-flex flex-column flex-md-row align-items-center justify-content-between gap-3">
      <div class="d-flex align-items-center gap-3">
        <div class="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center" style="width:52px;height:52px;">
          <i class="bi bi-cloud-arrow-up fs-4"></i>
        </div>
        <div class="text-start">
          <h5 class="mb-1">拖拉檔案到這裡</h5>
          <small class="text-muted">或點擊按鈕選擇檔案，單檔限制 {{ displaySize }}</small>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <input
          ref="fileInput"
          type="file"
          class="d-none"
          multiple
          @change="onFileChange"
        >
        <button class="btn btn-primary" type="button" :disabled="uploading" @click="triggerFileInput">
          <span v-if="uploading" class="spinner-border spinner-border-sm me-2"></span>
          選擇檔案
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  uploading: Boolean,
  maxSize: {
    type: Number,
    default: 100 * 1024 * 1024
  }
})
const emit = defineEmits(['files-dropped'])

const isOver = ref(false)
const fileInput = ref(null)

const displaySize = computed(() => {
  const mb = props.maxSize / (1024 * 1024)
  return `${Math.round(mb)} MB`
})

function onDragOver () {
  isOver.value = true
}

function onDragLeave () {
  isOver.value = false
}

function onDrop (event) {
  isOver.value = false
  const { files } = event.dataTransfer
  if (files?.length) {
    emit('files-dropped', files)
  }
}

function triggerFileInput () {
  fileInput.value?.click()
}

function onFileChange (event) {
  const { files } = event.target
  if (files?.length) {
    emit('files-dropped', files)
  }
  event.target.value = ''
}
</script>
