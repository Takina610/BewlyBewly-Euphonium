<script lang="ts" setup>
import { onKeyStroke } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

/**
 * 一张「关键词 + 备注」的名单，用在哪一组过滤里由调用方的 v-model 决定。
 *
 * 名单是就地改的（unshift / splice / 按下标赋值），所以读它的过滤函数必须 deep watch，
 * 不然编辑完不生效——这是踩过的坑，见 `useFilter`。
 */
export interface KeywordRow {
  keyword: string
  remark: string
}

defineProps<{
  /** 空名单时输入框里的提示，说明这份名单匹配的是什么。 */
  hint?: string
}>()
const model = defineModel<KeywordRow[]>({ required: true })
const { t } = useI18n()
const toast = useToast()

const addingFilter = ref<KeywordRow>({ keyword: '', remark: '' })
const editingFilter = ref<KeywordRow>({ keyword: '', remark: '' })
const editingIndex = ref<number>(-1) // -1: add new, >= 0: edit index
const keywordRef = ref<HTMLInputElement | null>(null)
const remarkRef = ref<HTMLInputElement | null>(null)

function handleAddFilter() {
  const keyword = addingFilter.value.keyword.trim()
  if (!keyword)
    return

  const exists = model.value.some((item, index) => item.keyword === keyword && index !== editingIndex.value)
  if (exists) {
    toast.warning(t('settings.filter_item_already_exist'))
    return
  }

  model.value.unshift({ keyword, remark: addingFilter.value.remark.trim() })
  nextTick(() => handleClearAddingFilter())
}

function handleClearAddingFilter() {
  addingFilter.value = { keyword: '', remark: '' }
}

async function handleEditFilter(index: number, focusItem: 'keyword' | 'remark' = 'keyword') {
  editingIndex.value = index
  editingFilter.value = { ...model.value[index] }
  await nextTick()

  const inputElement = focusItem === 'keyword' ? keywordRef.value : remarkRef.value
  if (Array.isArray(inputElement))
    inputElement[0]?.focus()
  else
    inputElement?.focus()
}

function handleConfirmFilter(index: number) {
  const keyword = editingFilter.value.keyword.trim()
  if (!keyword)
    return

  const exists = model.value.some((item, itemIndex) => item.keyword === keyword && itemIndex !== index)
  if (exists) {
    toast.warning(t('settings.filter_item_already_exist'))
    return
  }

  model.value[index] = { keyword, remark: editingFilter.value.remark.trim() }
  if (index !== -1)
    editingIndex.value = -1
}

function handleDeleteFilter(index: number) {
  model.value.splice(index, 1)
}

onKeyStroke('Escape', (e: KeyboardEvent) => {
  e.preventDefault()
  editingIndex.value = -1
})
</script>

<template>
  <div>
    <div flex="~ gap-1" bg="$bew-fill-1" p-2 mb-2 rounded="$bew-radius">
      <Input
        v-model="addingFilter.keyword"
        size="small"
        :placeholder="hint || $t('common.table.title')"
        w-full
        @click="editingIndex = -1"
        @enter="handleAddFilter"
      />
      <Input
        v-model="addingFilter.remark"
        size="small"
        :placeholder="$t('common.table.remark')"
        w-full
        @click="editingIndex = -1"
        @enter="handleAddFilter"
      />

      <Button
        size="small" type="primary"
        style="--b-button-width: 80px"
        shrink-0
        @click="handleAddFilter"
      >
        <template #left>
          <i i-mingcute:add-line />
        </template>
        {{ $t('common.operation.add') }}
      </Button>
    </div>

    <List
      highlight-first
      pin-top
      w-full max-h-400px overflow-overlay
    >
      <ListItem min-h-44px>
        <div max-w-50px>
          {{ $t('common.table.index') }}
        </div>
        <div>{{ $t('common.table.title') }}</div>
        <div>{{ $t('common.table.remark') }}</div>
        <div max-w-80px>
          {{ $t('common.table.operations') }}
        </div>
      </ListItem>

      <ListItem
        v-for="(item, index) in model" :key="item.keyword"
        :style="{
          background: editingIndex === index ? 'var(--bew-theme-color-20) !important' : '',
        }"
      >
        <div max-w-50px>
          {{ index }}
        </div>
        <template v-if="editingIndex === index">
          <Input
            ref="keywordRef"
            v-model="editingFilter.keyword"
            size="small"
            :placeholder="$t('common.table.title')"
            w-full
            @enter="handleConfirmFilter(index)"
          />
          <Input
            ref="remarkRef"
            v-model="editingFilter.remark"
            size="small"
            :placeholder="$t('common.table.remark')"
            w-full
            @enter="handleConfirmFilter(index)"
          />
        </template>
        <template v-else>
          <div break-anywhere @dblclick="handleEditFilter(index, 'keyword')">
            {{ item.keyword }}
          </div>
          <div break-anywhere @dblclick="handleEditFilter(index, 'remark')">
            {{ item.remark }}
          </div>
        </template>
        <div flex="~ gap-1" max-w-80px>
          <template v-if="editingIndex === index">
            <Button size="small" type="tertiary" @click="handleConfirmFilter(index)">
              <template #left>
                <i i-mingcute:check-line />
              </template>
            </Button>
            <Button size="small" type="tertiary" @click="editingIndex = -2">
              <template #left>
                <i i-mingcute:close-line />
              </template>
            </Button>
          </template>
          <template v-else>
            <Button size="small" type="tertiary" @click="handleEditFilter(index)">
              <template #left>
                <i i-mingcute:edit-2-line />
              </template>
            </Button>
            <Button size="small" type="tertiary" @click="handleDeleteFilter(index)">
              <template #left>
                <i i-mingcute:delete-2-line />
              </template>
            </Button>
          </template>
        </div>
      </ListItem>
    </List>
  </div>
</template>
