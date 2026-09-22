<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

import { settings } from '~/logic'

import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'

const { t } = useI18n()

const levelOptions = computed<Array<{ value: string, label: string }>>(() => [
  {
    label: t('settings.slacking_level_opt.light'),
    value: 'light',
  },
  {
    label: t('settings.slacking_level_opt.heavy'),
    value: 'heavy',
  },
])
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.group_slacking')" :desc="$t('settings.group_slacking_desc')">
      <SettingsItem :title="$t('settings.slacking_mode')">
        <Radio v-model="settings.slackingMode" />
        <template #desc>
          {{ $t('settings.slacking_mode_desc') }}
        </template>
      </SettingsItem>

      <SettingsItem :title="$t('settings.slacking_level')">
        <Select v-model="settings.slackingLevel" w-full :options="levelOptions" />
        <template #desc>
          {{ $t('settings.slacking_level_desc') }}
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_slacking_content')">
      <SettingsItem :title="$t('settings.slacking_dim_intensity')">
        <Slider
          v-model="settings.slackingDimIntensity"
          :min="0"
          :max="80"
          :label="`${settings.slackingDimIntensity}%`"
        />
        <template #desc>
          {{ $t('settings.slacking_dim_intensity_desc') }}
        </template>
      </SettingsItem>

      <SettingsItem :title="$t('settings.slacking_video_dim_intensity')">
        <Slider
          v-model="settings.slackingVideoDimIntensity"
          :min="0"
          :max="80"
          :label="`${settings.slackingVideoDimIntensity}%`"
        />
        <template #desc>
          {{ $t('settings.slacking_video_dim_intensity_desc') }}
        </template>
      </SettingsItem>

      <SettingsItem :title="$t('settings.slacking_hide_danmaku')">
        <Radio v-model="settings.slackingHideDanmaku" />
        <template #desc>
          {{ $t('settings.slacking_hide_danmaku_desc') }}
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_slacking_trigger')">
      <SettingsItem :title="$t('settings.slacking_shortcut')">
        <ShortcutInput v-model="settings.slackingShortcut" />
        <template #desc>
          <span v-html="$t('settings.slacking_shortcut_desc')" />
        </template>
      </SettingsItem>

      <SettingsItem :title="$t('settings.slacking_level_shortcut')">
        <ShortcutInput v-model="settings.slackingLevelShortcut" />
        <template #desc>
          {{ $t('settings.slacking_level_shortcut_desc') }}
        </template>
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.group_slacking_disguise')">
      <SettingsItem :title="$t('settings.slacking_disguise_title')">
        <Radio v-model="settings.slackingDisguiseTitle" />
        <template #desc>
          {{ $t('settings.slacking_disguise_title_desc') }}
        </template>
        <template v-if="settings.slackingDisguiseTitle" #bottom>
          <SettingsItem :title="$t('settings.slacking_window_title')">
            <Input
              v-model="settings.slackingWindowTitle"
              :placeholder="$t('settings.slacking_window_title_default')"
            />
            <template #desc>
              {{ $t('settings.slacking_window_title_desc') }}
            </template>
          </SettingsItem>
        </template>
      </SettingsItem>
    </SettingsItemGroup>
  </div>
</template>
