<script lang="ts" setup>
import { LIVE_CLEANUP_ITEMS } from '~/constants/liveCleanup'
import { settings } from '~/logic'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'

function isCleaned(key: string): boolean {
  return settings.value.liveCleanupItems.includes(key)
}

function toggleCleanup(key: string) {
  const list = settings.value.liveCleanupItems
  const index = list.indexOf(key)
  if (index === -1)
    list.push(key)
  else
    list.splice(index, 1)
}
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_live_cleanup')">
      <SettingsItem :desc="$t('settings.live_cleanup_desc')">
        <template #bottom>
          <div flex="~ gap-2 wrap">
            <div
              v-for="item in LIVE_CLEANUP_ITEMS"
              :key="item.key"
              flex="~ gap-2 items-center" p="x-4 y-2" rounded="$bew-radius" cursor-pointer duration-300
              :style="{
                background: isCleaned(item.key) ? 'var(--bew-theme-color-20)' : 'var(--bew-fill-1)',
                color: isCleaned(item.key) ? 'var(--bew-theme-color)' : 'var(--bew-text-1)',
              }"
              @click="toggleCleanup(item.key)"
            >
              {{ $t(item.labelKey) }}
            </div>
          </div>
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_live_player')">
      <SettingsItem :title="$t('settings.live_default_original_quality')">
        <Radio v-model="settings.liveDefaultOriginalQuality" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.live_remove_watermark')">
        <Radio v-model="settings.liveRemoveWatermark" />
      </SettingsItem>
      <SettingsItem :title="$t('settings.live_block_real_name_dialog')">
        <Radio v-model="settings.liveBlockRealNameDialog" />
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
