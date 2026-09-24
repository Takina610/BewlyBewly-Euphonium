<script lang="ts" setup>
import { MOMENTS_TYPE_ITEMS } from '~/constants/momentsTypes'
import { settings } from '~/logic'

import KeywordTable from '../../components/KeywordTable.vue'
import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

function isTypeBlocked(key: string): boolean {
  return settings.value.momentsBlockedTypes.includes(key)
}

function toggleType(key: string) {
  const list = settings.value.momentsBlockedTypes
  const index = list.indexOf(key)
  if (index === -1)
    list.push(key)
  else
    list.splice(index, 1)
}
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_moments_block')">
      <SettingsItem :title="$t('settings.moments_block_invisible')">
        <Radio v-model="settings.momentsBlockInvisible" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.moments_block_jump_ads')">
        <Radio v-model="settings.momentsBlockJumpAds" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.moments_block_live_reservation')">
        <Radio v-model="settings.momentsBlockLiveReservation" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.moments_block_promotions')">
        <Radio v-model="settings.momentsBlockPromotions" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.moments_block_videos')">
        <Radio v-model="settings.momentsBlockVideos" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.moments_block_types')">
      <SettingsItem :desc="$t('settings.moments_block_types_desc')">
        <template #bottom>
          <div flex="~ gap-2 wrap">
            <div
              v-for="item in MOMENTS_TYPE_ITEMS"
              :key="item.key"
              flex="~ gap-2 items-center" p="x-4 y-2" rounded="$bew-radius" cursor-pointer duration-300
              :style="{
                background: isTypeBlocked(item.key) ? 'var(--bew-theme-color-20)' : 'var(--bew-fill-1)',
                color: isTypeBlocked(item.key) ? 'var(--bew-theme-color)' : 'var(--bew-text-1)',
              }"
              @click="toggleType(item.key)"
            >
              {{ $t(item.labelKey) }}
            </div>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.moments_filter_keywords')">
      <SettingsItem :title="$t('settings.enable_moments_keyword_filter')">
        <Radio v-model="settings.momentsFilterKeywords" />
      </SettingsItem>

      <div v-if="settings.momentsFilterKeywords" grid="~ lg:gap-4 lg:cols-2 cols-1" lg:border="t-1 $bew-border-color">
        <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_content')" border="lg:none t-1 $bew-border-color">
          <template #bottom>
            <KeywordTable v-model="settings.momentsFilterContent" :hint="$t('settings.comment_filter_content_hint')" />
          </template>
        </SettingsItem>
        <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_user')" border="lg:none b-1 $bew-border-color">
          <template #bottom>
            <KeywordTable v-model="settings.momentsFilterUser" :hint="$t('settings.comment_filter_user_hint')" />
          </template>
        </SettingsItem>
        <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_uid')" border="lg:none t-1 $bew-border-color">
          <template #bottom>
            <KeywordTable v-model="settings.momentsFilterUid" :hint="$t('settings.comment_filter_uid_hint')" />
          </template>
        </SettingsItem>
        <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_topic')" border="lg:none b-1 $bew-border-color">
          <template #bottom>
            <KeywordTable v-model="settings.momentsFilterTopic" :hint="$t('settings.comment_filter_topic_hint')" />
          </template>
        </SettingsItem>
      </div>
    </SettingsItemGroup>
  </div>
</template>

<style lang="scss" scoped>
.unrestricted-width-settings-item {
  :deep(.left-content) {
    --uno: w-full;
  }

  :deep(.right-content) {
    --uno: w-auto;
  }
}
</style>
