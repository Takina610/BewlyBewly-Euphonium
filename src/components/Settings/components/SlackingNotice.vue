<script lang="ts" setup>
import { settings } from '~/logic'

import { MenuType } from '../types'

defineProps<{
  /** Which explanation to show. Defaults to the one about wallpaper and gradient backgrounds. */
  descKey?: string
}>()

/**
 * Slacking mode takes over a few appearance settings by design. Those controls stay interactive, so
 * without a word here the only feedback is that changing them appears to do nothing. This banner
 * says why, and offers the two ways out.
 *
 * Provided by `Settings.vue`, so the tab switch works from any depth.
 */
const changeMenuItem = inject<((menuItem: MenuType) => void) | null>('changeSettingsMenuItem', null)
</script>

<template>
  <div
    v-if="settings.slackingMode"
    class="b-slacking-notice"
    flex="~ gap-3 items-start"
    mb-4 p="x-4 y-3" rounded="$bew-radius"
    bg="$bew-fill-alt" border="1 $bew-border-color"
    style="box-shadow: var(--bew-shadow-edge-glow-1), var(--bew-shadow-1);"
  >
    <div i-mingcute:eye-close-fill shrink-0 text-2xl color="$bew-warning-color" />

    <div flex-1>
      <p text="$bew-text-1" fw-bold>
        {{ $t('settings.slacking_notice_title') }}
      </p>

      <p text="sm $bew-text-2" mt-1>
        {{ $t(descKey ?? 'settings.slacking_notice_desc') }}
      </p>

      <div mt-3 flex="~ gap-2 wrap">
        <Button size="small" @click="settings.slackingMode = false">
          {{ $t('settings.slacking_notice_disable') }}
        </Button>
        <Button v-if="changeMenuItem" size="small" @click="changeMenuItem(MenuType.Slacking)">
          {{ $t('settings.slacking_notice_configure') }}
        </Button>
      </div>
    </div>
  </div>
</template>
