<script lang="ts" setup>
import { settings } from '~/logic'

import KeywordTable from '../components/KeywordTable.vue'
import SettingsItem from '../components/SettingsItem.vue'
import SettingsItemGroup from '../components/SettingsItemGroup.vue'
</script>

<template>
  <div>
    <SettingsItemGroup :title="$t('settings.content_block_settings')">
      <SettingsItemGroup>
        <SettingsItem :title="$t('settings.block_ads')">
          <Radio v-model="settings.blockAds" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.block_top_search_page_ads')" :desc="$t('settings.block_top_search_page_ads_desc')">
          <Radio v-model="settings.blockTopSearchPageAds" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.block_vip_danmuku_style')">
          <Radio v-model="settings.blockVIPDanmukuStyle" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_filter_recommendations')">
          <Radio v-model="settings.videoPageFilterRecommendations" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.video_page_filter_numeric_conditions')">
          <Radio v-model="settings.videoPageFilterNumericConditions" />
        </SettingsItem>
      </SettingsItemGroup>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.url_trim_settings')">
      <SettingsItemGroup>
        <SettingsItem :title="$t('settings.clean_url_argument')">
          <Radio v-model="settings.cleanUrlArgument" />
        </SettingsItem>
        <SettingsItem :title="$t('settings.bv_to_av')">
          <Radio v-model="settings.bvToAv" />
        </SettingsItem>
      </SettingsItemGroup>
    </SettingsItemGroup>

    <!--
      数量精确显示管的是顶栏「我的」面板与个人空间页头部那几个数（动态、关注、粉丝、获赞），
      与评论区无关，所以不跟 IP 属地一起摆在评论区那一组里。
    -->
    <SettingsItemGroup :title="$t('settings.group_user_pages')">
      <SettingsItem :title="$t('settings.show_exact_counts')">
        <Radio v-model="settings.showExactCounts" />
      </SettingsItem>
    </SettingsItemGroup>

    <SettingsItemGroup :title="$t('settings.comment_settings')">
      <SettingsItemGroup>
        <SettingsItem :title="$t('settings.show_comment_ip_location')">
          <Radio v-model="settings.showCommentIpLocation" />
          <template #desc>
            {{ $t('settings.show_comment_ip_location_desc') }}
          </template>
        </SettingsItem>
      </SettingsItemGroup>
    </SettingsItemGroup>

    <!--
      评论区过滤：四条名单各管一处。命中的评论由主世界的注入脚本从接口响应里丢掉，所以这里改完
      刷新页面就能看到效果——已经加载出来的评论要等下一批。
    -->
    <SettingsItemGroup :title="$t('settings.group_comment_filter')">
      <SettingsItem :title="$t('settings.enable_comment_filter')">
        <Radio v-model="settings.enableCommentFilter" />
      </SettingsItem>

      <div v-if="settings.enableCommentFilter" grid="~ lg:gap-4 lg:cols-2 cols-1" lg:border="t-1 $bew-border-color">
        <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_content')" border="lg:none t-1 $bew-border-color">
          <template #bottom>
            <KeywordTable v-model="settings.commentFilterContent" :hint="$t('settings.comment_filter_content_hint')" />
          </template>
        </SettingsItem>
        <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_user')" border="lg:none b-1 $bew-border-color">
          <template #bottom>
            <KeywordTable v-model="settings.commentFilterUser" :hint="$t('settings.comment_filter_user_hint')" />
          </template>
        </SettingsItem>
        <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_uid')" border="lg:none t-1 $bew-border-color">
          <template #bottom>
            <KeywordTable v-model="settings.commentFilterUid" :hint="$t('settings.comment_filter_uid_hint')" />
          </template>
        </SettingsItem>
        <SettingsItem class="unrestricted-width-settings-item" :title="$t('settings.comment_filter_topic')" border="lg:none b-1 $bew-border-color">
          <template #bottom>
            <KeywordTable v-model="settings.commentFilterTopic" :hint="$t('settings.comment_filter_topic_hint')" />
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
