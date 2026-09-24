<script lang="ts" setup>
import { VIDEO_POPUP_ITEMS } from '~/constants/videoPagePopups'
import { settings } from '~/logic'
import {
  cleanupPlaybackRateInput,
  cleanupPlaybackRateListInput,
  hasPlaybackRateSign,
  sanitizePlaybackRateInput,
  sanitizePlaybackRateListInput,
} from '~/logic/playbackSpeed'
import { isVideoOrBangumiPage } from '~/utils/main'

import SettingsItem from '../../components/SettingsItem.vue'
import SettingsItemGroup from '../../components/SettingsItemGroup.vue'
import SlackingNotice from '../../components/SlackingNotice.vue'

function isPopupRemoved(key: string): boolean {
  return settings.value.videoPageRemovedPopups.includes(key)
}

function togglePopup(key: string) {
  const list = settings.value.videoPageRemovedPopups
  const index = list.indexOf(key)
  if (index === -1)
    list.push(key)
  else
    list.splice(index, 1)
}

watch(() => settings.value.legacyPlayerLoadingScreen, () => {
  if (isVideoOrBangumiPage())
    location.reload()
})

/**
 * The four shield levels. The numbers are the level itself — danmaku below it are dropped — and they
 * are what gets stored, but what the user picks from is a plain low/medium/high, because the real
 * values (9/10/11) are an implementation detail of how bilibili scores danmaku today.
 */
const danmakuLevelOptions = [
  { value: 0, label: 'settings.danmaku_level_off' },
  { value: 9, label: 'settings.danmaku_level_low' },
  { value: 10, label: 'settings.danmaku_level_medium' },
  { value: 11, label: 'settings.danmaku_level_high' },
]

type PlaybackSpeedKey = 'videoPageDefaultPlaybackRate' | 'videoPageLongPressPlaybackRate' | 'videoPagePlaybackRateList'

/**
 * 速度框的输入过滤：只认数字和小数点（列表再认一个空格当分隔符），负号整条不收——抹掉负号会把
 * `-2` 悄悄变成 `2`，那是用户没写过的数，所以这一下什么都不做，框里留着原来那个值。
 *
 * 过滤放在 `Input` 组件里（`sanitize`），不是在这一层：框里的文字由组件自己的 model 决定，外面改写
 * 过的 DOM 下一帧就会被它的原文盖回去。
 */
function speedSanitizer(key: PlaybackSpeedKey) {
  return (text: string) => {
    if (hasPlaybackRateSign(text))
      return String(settings.value[key])

    return key === 'videoPagePlaybackRateList'
      ? sanitizePlaybackRateListInput(text)
      : sanitizePlaybackRateInput(text)
  }
}

/**
 * 离开输入框时过的那一道：`0`、`1..5` 这种认不出的清空，超出浏览器区间的写成夹住之后那个数。
 * 输入当中不能这么干——`0` 是 `0.5` 的前半截。
 */
function playbackSpeedSettler(key: PlaybackSpeedKey) {
  return (text: string) => key === 'videoPagePlaybackRateList'
    ? cleanupPlaybackRateListInput(text)
    : cleanupPlaybackRateInput(text)
}

/** 过滤完的值落到 settings 上；框里已经是收干净的那个了，这里只为把它存下来。 */
function writePlaybackSpeed(event: Event, key: PlaybackSpeedKey) {
  const input = event.target as HTMLInputElement
  settings.value[key] = input.value
}

/**
 * 框里的按键不外传。B 站页面自己的快捷键会把空格这类键吃掉（上游对字体输入框是同样处理的），
 * 而这三个框都长在视频页上。
 */
function keepKeysInForm() {}
</script>

<template>
  <div>
    <!--
      Slacking mode takes this page's appearance over: it hides the video page background and forces
      the frosted glass off. Rather than leaving the rest of the controls there to be poked at, the
      whole tab is replaced by the explanation while the mode runs — same treatment as Appearance.
    -->
    <SlackingNotice v-if="settings.slackingMode" desc-key="settings.slacking_notice_desc_video_page" />

    <template v-else>
      <SettingsItemGroup :title="$t('settings.group_video_page')">
        <!-- 控制视频页背景的开关 -->
        <SettingsItem
          :title="$t('settings.show_video_page_background')" :desc="$t('settings.show_video_page_background_desc')"
        >
          <Radio v-model="settings.showVideoPageBackground" />
        </SettingsItem>

        <!-- 控制视频页弹幕列表样式的开关 -->
        <SettingsItem :title="$t('settings.video_page_danmaku_style')" :desc="$t('settings.video_page_danmaku_style_desc')">
          <div w-full flex rounded="$bew-radius" bg="$bew-fill-1" p-1>
            <div
              flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
              :style="{
                background: settings.videoPageDanmakuStyle === 'auto' ? 'var(--bew-theme-color)' : '',
                color: settings.videoPageDanmakuStyle === 'auto' ? 'white' : '',
              }"
              @click="settings.videoPageDanmakuStyle = 'auto'"
            >
              {{ $t('settings.style_auto_follow_bg') }}
            </div>
            <div
              flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
              :style="{
                background: settings.videoPageDanmakuStyle === 'on' ? 'var(--bew-theme-color)' : '',
                color: settings.videoPageDanmakuStyle === 'on' ? 'white' : '',
              }"
              @click="settings.videoPageDanmakuStyle = 'on'"
            >
              {{ $t('settings.style_force_enable') }}
            </div>
            <div
              flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
              :style="{
                background: settings.videoPageDanmakuStyle === 'off' ? 'var(--bew-theme-color)' : '',
                color: settings.videoPageDanmakuStyle === 'off' ? 'white' : '',
              }"
              @click="settings.videoPageDanmakuStyle = 'off'"
            >
              {{ $t('settings.style_force_disable') }}
            </div>
          </div>
        </SettingsItem>

        <!-- 控制视频页视频合集列表样式的开关 -->
        <SettingsItem :title="$t('settings.video_page_video_pod_style')" :desc="$t('settings.video_page_video_pod_style_desc')">
          <div w-full flex rounded="$bew-radius" bg="$bew-fill-1" p-1>
            <div
              flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
              :style="{
                background: settings.videoPageVideoPodStyle === 'auto' ? 'var(--bew-theme-color)' : '',
                color: settings.videoPageVideoPodStyle === 'auto' ? 'white' : '',
              }"
              @click="settings.videoPageVideoPodStyle = 'auto'"
            >
              {{ $t('settings.style_auto_follow_bg') }}
            </div>
            <div
              flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
              :style="{
                background: settings.videoPageVideoPodStyle === 'on' ? 'var(--bew-theme-color)' : '',
                color: settings.videoPageVideoPodStyle === 'on' ? 'white' : '',
              }"
              @click="settings.videoPageVideoPodStyle = 'on'"
            >
              {{ $t('settings.style_force_enable') }}
            </div>
            <div
              flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
              :style="{
                background: settings.videoPageVideoPodStyle === 'off' ? 'var(--bew-theme-color)' : '',
                color: settings.videoPageVideoPodStyle === 'off' ? 'white' : '',
              }"
              @click="settings.videoPageVideoPodStyle = 'off'"
            >
              {{ $t('settings.style_force_disable') }}
            </div>
          </div>
        </SettingsItem>

        <!-- 控制视频播放器圆角的开关 -->
        <SettingsItem :title="$t('settings.rounded_video_player')" :desc="$t('settings.rounded_video_player_desc')">
          <Radio v-model="settings.roundedVideoPlayer" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.legacy_player_loading_screen')">
          <Radio v-model="settings.legacyPlayerLoadingScreen" />
        </SettingsItem>
      </SettingsItemGroup>

      <SettingsItemGroup :title="$t('settings.group_danmaku')">
        <!-- 弹幕等级过滤：把等级不够的弹幕从播放器拿到的数据里去掉 -->
        <SettingsItem :title="$t('settings.danmaku_level_filter')">
          <div w-full flex rounded="$bew-radius" bg="$bew-fill-1" p-1>
            <div
              v-for="option in danmakuLevelOptions" :key="option.value"
              flex-1 py-1 cursor-pointer text-center rounded="$bew-radius"
              :style="{
                background: settings.videoPageDanmakuLevelFilter === option.value ? 'var(--bew-theme-color)' : '',
                color: settings.videoPageDanmakuLevelFilter === option.value ? 'white' : '',
              }"
              @click="settings.videoPageDanmakuLevelFilter = option.value"
            >
              {{ $t(option.label) }}
            </div>
          </div>
        </SettingsItem>

        <SettingsItem :title="$t('settings.show_loaded_danmaku_count')">
          <Radio v-model="settings.videoPageShowLoadedDanmakuCount" />
        </SettingsItem>

        <!--
          播放器里的浮窗本身就是几条弹幕动作（投票、三连、评分…），所以跟屏蔽等级摆在一组。
        -->
        <SettingsItem :title="$t('settings.video_page_removed_popups')">
          <template #bottom>
            <div flex="~ gap-2 wrap">
              <div
                v-for="item in VIDEO_POPUP_ITEMS"
                :key="item.key"
                flex="~ gap-2 items-center" p="x-4 y-2" rounded="$bew-radius" cursor-pointer duration-300
                :style="{
                  background: isPopupRemoved(item.key) ? 'var(--bew-theme-color-20)' : 'var(--bew-fill-1)',
                  color: isPopupRemoved(item.key) ? 'var(--bew-theme-color)' : 'var(--bew-text-1)',
                }"
                @click="togglePopup(item.key)"
              >
                {{ $t(item.labelKey) }}
              </div>
            </div>
          </template>
        </SettingsItem>
      </SettingsItemGroup>

      <!--
        这一页上这几项（含下面播放器行为里的自动点赞）在摸鱼模式期间照常生效，而那个模式下整个 tab
        会被上面的提示替换掉，于是成了「改不了但仍在生效」。用户点名要它们收在这一页上，就这样放着。
      -->
      <SettingsItemGroup :title="$t('settings.group_video_page_cleanup')">
        <SettingsItem :title="$t('settings.video_page_remove_charge_button')">
          <Radio v-model="settings.videoPageRemoveChargeButton" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_block_live_order')">
          <Radio v-model="settings.videoPageBlockLiveOrder" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_block_activity_tag')">
          <Radio v-model="settings.videoPageBlockActivityTag" />
        </SettingsItem>
      </SettingsItemGroup>

      <!--
        视频下方推荐过滤。关键词那一项读的是首页那两张名单，所以标题里点明了共用；
        数值阈值默认关着——首页合适的阈值搬到这一列长尾视频里容易把整列清空。
      -->
      <SettingsItemGroup :title="$t('settings.group_video_recommendation_filter')">
        <SettingsItem :title="$t('settings.video_page_remove_charge_exclusive_video')">
          <Radio v-model="settings.videoPageRemoveChargeExclusiveVideo" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_remove_promoted_videos')">
          <Radio v-model="settings.videoPageRemovePromotedVideos" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_only_uploader_videos')">
          <Radio v-model="settings.videoPageOnlyUploaderVideos" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_remove_all_recommendations')">
          <Radio v-model="settings.videoPageRemoveAllRecommendations" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_filter_recommendations')">
          <Radio v-model="settings.videoPageFilterRecommendations" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_filter_numeric_conditions')">
          <Radio v-model="settings.videoPageFilterNumericConditions" />
        </SettingsItem>
      </SettingsItemGroup>

      <SettingsItemGroup :title="$t('settings.group_player_behaviour')">
        <SettingsItem :title="$t('settings.remember_web_fullscreen')">
          <Radio v-model="settings.videoPageRememberWebFullscreen" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_auto_like')">
          <Radio v-model="settings.videoPageAutoLike" />
        </SettingsItem>
      </SettingsItemGroup>

      <SettingsItemGroup :title="$t('settings.group_playback_speed')">
        <SettingsItem :title="$t('settings.default_playback_speed')">
          <Input
            :model-value="settings.videoPageDefaultPlaybackRate"
            :placeholder="$t('settings.playback_speed_example')"
            :sanitize="speedSanitizer('videoPageDefaultPlaybackRate')"
            :settle="playbackSpeedSettler('videoPageDefaultPlaybackRate')"
            @keydown.stop.passive="keepKeysInForm"
            @input="writePlaybackSpeed($event, 'videoPageDefaultPlaybackRate')"
            @change="writePlaybackSpeed($event, 'videoPageDefaultPlaybackRate')"
          />
        </SettingsItem>

        <SettingsItem :title="$t('settings.long_press_playback_speed')">
          <Input
            :model-value="settings.videoPageLongPressPlaybackRate"
            :placeholder="$t('settings.playback_speed_example')"
            :sanitize="speedSanitizer('videoPageLongPressPlaybackRate')"
            :settle="playbackSpeedSettler('videoPageLongPressPlaybackRate')"
            @keydown.stop.passive="keepKeysInForm"
            @input="writePlaybackSpeed($event, 'videoPageLongPressPlaybackRate')"
            @change="writePlaybackSpeed($event, 'videoPageLongPressPlaybackRate')"
          />
        </SettingsItem>

        <SettingsItem :title="$t('settings.playback_speed_list')">
          <Input
            :model-value="settings.videoPagePlaybackRateList"
            :placeholder="$t('settings.playback_speed_list_example')"
            :sanitize="speedSanitizer('videoPagePlaybackRateList')"
            :settle="playbackSpeedSettler('videoPagePlaybackRateList')"
            @keydown.stop.passive="keepKeysInForm"
            @input="writePlaybackSpeed($event, 'videoPagePlaybackRateList')"
            @change="writePlaybackSpeed($event, 'videoPagePlaybackRateList')"
          />
        </SettingsItem>

        <SettingsItem :title="$t('settings.disable_long_press_speed_up')">
          <Radio v-model="settings.videoPageDisableLongPressSpeedUp" />
        </SettingsItem>

        <SettingsItem :title="$t('settings.remember_playback_speed')">
          <Radio v-model="settings.videoPageRememberPlaybackRate" />
        </SettingsItem>
      </SettingsItemGroup>
    </template>
  </div>
</template>

<style scoped lang="scss">
</style>
