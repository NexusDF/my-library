<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const dialogRef = ref<HTMLDialogElement | null>(null)
const titleId = useId()
const messageId = useId()

watch(
  () => props.open,
  async (isOpen) => {
    await nextTick()
    const dialog = dialogRef.value
    if (!dialog) return
    if (isOpen && !dialog.open) dialog.showModal()
    else if (!isOpen && dialog.open) dialog.close()
  },
  { immediate: true },
)

function onCancel(event: Event) {
  event.preventDefault()
  emit('cancel')
}

function onBackdrop(event: MouseEvent) {
  if (event.target === dialogRef.value) emit('cancel')
}
</script>

<template>
  <dialog
    ref="dialogRef"
    class="dialog"
    :aria-labelledby="titleId"
    :aria-describedby="messageId"
    @cancel="onCancel"
    @click="onBackdrop"
  >
    <div class="dialog__panel">
      <h2 :id="titleId" class="dialog__title">{{ title }}</h2>
      <p :id="messageId" class="dialog__message">{{ message }}</p>
      <div class="dialog__actions">
        <button type="button" class="btn btn--ghost" @click="emit('cancel')">Отмена</button>
        <button
          type="button"
          class="btn"
          :class="danger ? 'btn--danger' : 'btn--primary'"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 0;
  font: inherit;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) + 2px);
  box-shadow: var(--shadow);
}

.dialog::backdrop {
  background: rgba(12, 10, 16, 0.64);
}

.dialog__panel {
  padding: 20px;
}

.dialog__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.dialog__message {
  margin: 8px 0 0;
  color: var(--text-muted);
  line-height: 1.45;
}

.dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 18px;
}

.btn {
  display: inline-flex;
  flex: 1 1 120px;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 16px;
  font: inherit;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg-elevated);
  color: var(--text);
}

.btn--ghost {
  background: transparent;
}

.btn--primary {
  font-weight: 600;
  color: var(--accent-ink);
  background: var(--accent);
  border-color: transparent;
}

.btn--danger {
  font-weight: 600;
  color: var(--bg);
  background: var(--danger);
  border-color: transparent;
}
</style>
