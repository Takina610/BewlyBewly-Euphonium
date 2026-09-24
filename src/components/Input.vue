<script lang="ts" setup>
type Size = 'small' | 'medium' | 'large'
interface Props {
  size?: Size
  type?: 'text' | 'password' | 'email' | 'number'
  min?: number
  max?: number
  placeholder?: string
  /** 每次输入后过一道，返回框里真正该留下的文字；认不出的字符当场挡在框外。 */
  sanitize?: (value: string) => string
  /** 离开输入框时过一道：`0`、超出区间的数收成真正会生效的那个值。 */
  settle?: (value: string) => string
}
const props = withDefaults(defineProps<Props>(), { size: 'medium' })

defineEmits(['enter'])

const modelValue = defineModel<string | number>()

const inputRef = ref<HTMLInputElement | null>(null)

/**
 * 把框里的文字与 model 一起换成过滤后的值。两边都要写：只改 DOM 的话，Vue 下一帧会把它自己那份
 * 原文贴回框里，外面那一层改回来的值就是这样丢掉的。
 */
function applyFilter(event: Event, filter?: (value: string) => string) {
  if (!filter)
    return

  const input = event.target as HTMLInputElement
  const cleaned = filter(input.value)
  if (cleaned === input.value)
    return

  input.value = cleaned
  modelValue.value = cleaned
}

function handleInput(event: Event) {
  applyFilter(event, props.sanitize)
}

function handleChange(event: Event) {
  applyFilter(event, props.settle)
}

const height = computed(() => {
  if (props.size === 'small')
    return '30px'
  if (props.size === 'medium')
    return '35px'
  if (props.size === 'large')
    return '40px'
  return '35px'
})

const padding = computed(() => {
  if (props.size === 'small')
    return '0 calc(var(--bew-base-font-size) * 0.5)'
  return '0 var(--bew-base-font-size)'
})

function focus() {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div
    :style="{ height, padding }"
    focus-within:ring="2px $bew-theme-color"
    p="x-4"
    rounded="$bew-radius" transition-all duration-300
    bg="$bew-fill-1" flex="~ gap-2"
  >
    <div v-if="$slots.prefix" class="prefix">
      <div>
        <slot name="prefix" />
      </div>
    </div>

    <input
      ref="inputRef"
      v-model="modelValue"
      :style="{ lineHeight: height }"
      :type="type"
      :min="min"
      :max="max"
      :placeholder="placeholder"
      w-inherit h-inherit
      outline-none flex-1 bg-transparent
      @keydown.enter="$emit('enter')"
      @input="handleInput"
      @change="handleChange"
    >

    <div v-if="$slots.suffix" class="suffix">
      <div>
        <slot name="suffix" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.prefix,
.suffix {
  --uno: "flex items-center";
}
</style>
