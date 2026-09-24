<script lang="ts" setup>
import { SEARCH_BAR_CHARACTERS } from '~/constants/imgs'
import { SEARCH_PURIFY_ITEMS, SEARCH_RESULT_TYPES } from '~/constants/searchPurify'
import { settings } from '~/logic'

import ChangeWallpaper from '../../components/ChangeWallpaper.vue'
import KeywordTable from '../../components/KeywordTable.vue'
import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SlackingNotice from '../../components/SlackingNotice.vue'

watch(() => settings.value.individuallySetSearchPageWallpaper, (newValue) => {
  if (newValue)
    document.documentElement.style.backgroundImage = `url(${settings.value.searchPageWallpaper})`
  else
    document.documentElement.style.backgroundImage = `url(${settings.value.wallpaper})`
})

function changeSearchBarFocusCharacter(url: string) {
  settings.value.searchPageSearchBarFocusCharacter = url
}

function isPurified(key: string): boolean {
  return settings.value.searchPurifyItems.includes(key)
}

function isTypeBlocked(key: string): boolean {
  return settings.value.searchBlockedTypes.includes(key)
}

function toggle(list: string[], key: string) {
  const index = list.indexOf(key)
  if (index === -1)
    list.push(key)
  else
    list.splice(index, 1)
}
</script>

<template>
  <div>
    <!--
      Slacking mode takes this page's appearance over: every background image is hidden, which covers
      the wallpaper picker here. Rather than leaving the rest of the controls there to be poked at, the
      whole tab is replaced by the explanation while the mode runs — same treatment as Appearance.
    -->
    <SlackingNotice v-if="settings.slackingMode" desc-key="settings.slacking_notice_desc_search_page" />

    <template v-else>
      <SettingsItemGroup :title="$t('settings.group_logo')">
        <SettingsItem :title="$t('settings.logo_color')">
          <div w-full flex rounded="$bew-radius" bg="$bew-fill-1" p-1>
            <div
              flex="1 ~" items-center justify-center py-1 cursor-pointer
              text-center rounded="$bew-radius"
              :style="{
                background: settings.searchPageLogoColor === 'themeColor' || !settings.searchPageLogoColor ? 'var(--bew-theme-color)' : '',
                color: settings.searchPageLogoColor === 'themeColor' || !settings.searchPageLogoColor ? 'white' : '',
              }"
              @click="settings.searchPageLogoColor = 'themeColor'"
            >
              {{ $t('settings.logo_color_opt.theme_color') }}
            </div>
            <div
              flex="1 ~" items-center justify-center py-1 cursor-pointer
              text-center rounded="$bew-radius"
              :style="{
                background: settings.searchPageLogoColor === 'white' ? 'var(--bew-theme-color)' : '',
                color: settings.searchPageLogoColor === 'white' ? 'white' : '',
              }"
              @click="settings.searchPageLogoColor = 'white'"
            >
              {{ $t('settings.logo_color_opt.white') }}
            </div>
          </div>
        </SettingsItem>

        <SettingsItem :title="$t('settings.enable_logo_glowing_effect')">
          <Radio v-model="settings.searchPageLogoGlow" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.logo_visibility')">
          <Radio v-model="settings.searchPageShowLogo" />
        </SettingsItem>
      </SettingsItemGroup>

      <SettingsItemGroup :title="$t('settings.group_search_bar')">
        <SettingsItem :title="$t('settings.bg_darkens_when_the_search_bar_is_focused')">
          <Radio v-model="settings.searchPageDarkenOnSearchFocus" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.bg_blurs_when_the_search_bar_is_focused')">
          <template #desc>
            <span color="$bew-warning-color">{{ $t('common.performance_impact_warn') }}</span>
          </template>

          <Radio v-model="settings.searchPageBlurredOnSearchFocus" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.choose_search_bar_focused_character')">
          <template #bottom>
            <div grid="~ xl:cols-8 lg:cols-6 cols-5 gap-4">
              <picture
                aspect-square bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
                un-border="4 transparent" cursor-pointer
                grid place-items-center
                :class="{ 'selected-wallpaper': settings.searchPageSearchBarFocusCharacter === '' }"
                @click="changeSearchBarFocusCharacter('')"
              >
                <div i-tabler:photo-off text="3xl $bew-text-3" />
              </picture>
              <Tooltip v-for="item in SEARCH_BAR_CHARACTERS" :key="item.url" placement="top" :content="item.name" aspect-square>
                <picture
                  aspect-square bg="$bew-fill-1" rounded="$bew-radius" overflow-hidden
                  un-border="4 transparent" w-full
                  :class="{ 'selected-wallpaper': settings.searchPageSearchBarFocusCharacter === item.url }"
                  @click="changeSearchBarFocusCharacter(item.url)"
                >
                  <img
                    :src="item.url" alt="" loading="lazy"
                    w-full h-full object-contain
                  >
                </picture>
              </Tooltip>
            </div>
          </template>
        </SettingsItem>
      </SettingsItemGroup>

      <ChangeWallpaper type="searchPage" />

      <!--
        净化搜索结果：清在接口数据那层，所以这里改完刷新一次才看得到——已经返回的结果要等下一批。
      -->
      <SettingsItemGroup :title="$t('settings.group_search_purify')">
        <SettingsItem :title="$t('settings.search_purify_items')">
          <template #bottom>
            <div flex="~ gap-2 wrap">
              <div
                v-for="item in SEARCH_PURIFY_ITEMS"
                :key="item.key"
                flex="~ gap-2 items-center" p="x-4 y-2" rounded="$bew-radius" cursor-pointer duration-300
                :style="{
                  background: isPurified(item.key) ? 'var(--bew-theme-color-20)' : 'var(--bew-fill-1)',
                  color: isPurified(item.key) ? 'var(--bew-theme-color)' : 'var(--bew-text-1)',
                }"
                @click="toggle(settings.searchPurifyItems, item.key)"
              >
                {{ $t(item.labelKey) }}
              </div>
            </div>
          </template>
        </SettingsItem>

        <SettingsItem :title="$t('settings.search_blocked_types')">
          <template #bottom>
            <div flex="~ gap-2 wrap">
              <div
                v-for="item in SEARCH_RESULT_TYPES"
                :key="item.key"
                flex="~ gap-2 items-center" p="x-4 y-2" rounded="$bew-radius" cursor-pointer duration-300
                :style="{
                  background: isTypeBlocked(item.key) ? 'var(--bew-theme-color-20)' : 'var(--bew-fill-1)',
                  color: isTypeBlocked(item.key) ? 'var(--bew-theme-color)' : 'var(--bew-text-1)',
                }"
                @click="toggle(settings.searchBlockedTypes, item.key)"
              >
                {{ $t(item.labelKey) }}
              </div>
            </div>
          </template>
        </SettingsItem>

        <SettingsItem :title="$t('settings.enable_search_keyword_filter')">
          <Radio v-model="settings.searchFilterKeywords" />
        </SettingsItem>

        <div v-if="settings.searchFilterKeywords" grid="~ lg:gap-4 lg:cols-2 cols-1" lg:border="t-1 $bew-border-color">
          <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.search_filter_content')" border="lg:none t-1 $bew-border-color">
            <template #bottom>
              <KeywordTable v-model="settings.searchFilterContent" :hint="$t('settings.comment_filter_content_hint')" />
            </template>
          </SettingsItem>
          <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_user')" border="lg:none b-1 $bew-border-color">
            <template #bottom>
              <KeywordTable v-model="settings.searchFilterUser" :hint="$t('settings.comment_filter_user_hint')" />
            </template>
          </SettingsItem>
          <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_uid')" border="lg:none b-1 $bew-border-color">
            <template #bottom>
              <KeywordTable v-model="settings.searchFilterUid" :hint="$t('settings.comment_filter_uid_hint')" />
            </template>
          </SettingsItem>
        </div>
      </SettingsItemGroup>
    </template>
  </div>
</template>

<style scoped lang="scss">
.selected-wallpaper {
  --uno: "border-$bew-theme-color-60";
}

.unrestricted-width-settings-item {
  :deep(.left-content) {
    --uno: w-full;
  }

  :deep(.right-content) {
    --uno: w-auto;
  }
}
</style>
