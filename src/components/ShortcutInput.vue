<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import { eventToShortcut, hasModifier, heldModifiers } from '~/utils/shortcut'

const modelValue = defineModel<string>({ default: '' })

const { t } = useI18n()

const recording = ref<boolean>(false)
/** Live preview shown while the user holds the modifiers down. */
const draft = ref<string>('')

function stopRecording() {
  recording.value = false
  draft.value = ''
}

function startRecording() {
  recording.value = true
  draft.value = ''
}

function handleKeydown(event: KeyboardEvent) {
  if (!recording.value)
    return

  // Swallow the keystroke so it cannot reach the page while recording
  event.preventDefault()
  event.stopPropagation()

  if (event.code === 'Escape') {
    stopRecording()
    return
  }

  if (event.code === 'Backspace' || event.code === 'Delete') {
    modelValue.value = ''
    stopRecording()
    return
  }

  const shortcut = eventToShortcut(event)

  // A modifier is being held down on its own: preview it and wait for the actual key
  if (!shortcut) {
    draft.value = heldModifiers(event).join('+')
    return
  }

  draft.value = shortcut

  // A shortcut needs a modifier, otherwise it would swallow ordinary typing
  if (hasModifier(shortcut)) {
    modelValue.value = shortcut
    stopRecording()
  }
}

const displayText = computed<string>(() => {
  if (recording.value)
    return draft.value || t('settings.slacking_shortcut_recording')
  return modelValue.value || t('settings.slacking_shortcut_empty')
})
</script>

<template>
  <button
    type="button"
    w-full min-w-40 rounded="$bew-radius" px-4 py-1.5
    bg="$bew-fill-1 hover:$bew-fill-2" cursor="pointer"
    border="1 solid" transition-all duration-300 whitespace-nowrap
    :class="recording
      ? 'ring-2 border-$bew-theme-color text-$bew-text-1'
      : 'border-transparent text-$bew-text-2 hover:text-$bew-text-1'"
    @click="recording ? stopRecording() : startRecording()"
    @blur="stopRecording"
    @keydown="handleKeydown"
  >
    <span text-sm>{{ displayText }}</span>
  </button>
</template>
