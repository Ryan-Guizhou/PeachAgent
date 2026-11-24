import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/** 对话框的焦点进入、循环和关闭后恢复。 */
export function useDialogFocus(open: Ref<string>, onClose: () => void) {
  const dialogRef = ref<HTMLFormElement | null>(null)
  let trigger: HTMLElement | null = null
  function rememberFocus() {
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  function controls() {
    return Array.from(
      dialogRef.value?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
      ) || [],
    ).filter((el) => el.getClientRects().length > 0)
  }
  watch(
    open,
    async (value, previous) => {
      await nextTick()
      if (value && open.value === value) {
        ;(controls().find((el) => el.matches('input,textarea,select')) || controls()[0] || dialogRef.value)?.focus()
      } else if (!value && previous && !open.value) {
        if (trigger?.isConnected) trigger.focus()
        trigger = null
      }
    },
    { flush: 'post' },
  )
  function handleDialogKey(event: KeyboardEvent) {
    // 异步请求禁用已聚焦的提交按钮时，浏览器可能将焦点退回 body。
    // 在文档捕获阶段处理键盘事件，避免 Escape 和 Tab 脱离当前模态框。
    if (!open.value || !dialogRef.value) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = controls()
    if (!items.length) {
      event.preventDefault()
      event.stopPropagation()
      dialogRef.value.focus()
      return
    }
    const first = items[0],
      last = items[items.length - 1]
    const active = document.activeElement
    const outside = !active || !dialogRef.value.contains(active) || active === dialogRef.value
    if (outside || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
      event.preventDefault()
      event.stopPropagation()
      ;(event.shiftKey ? last : first).focus()
    }
  }
  onMounted(() => document.addEventListener('keydown', handleDialogKey, true))
  onBeforeUnmount(() => document.removeEventListener('keydown', handleDialogKey, true))
  return { dialogRef, rememberFocus }
}
