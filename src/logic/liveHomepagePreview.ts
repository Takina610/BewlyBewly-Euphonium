import { settings } from '~/logic/storage'
import { isLiveIndexPage } from '~/utils/main'

// 直播首页的预览播放器由原页面 JS 驱动，且可能造在游离于文档外的树里，隔离世界够不着，
// 真正的拦截在主世界（inject 脚本）：它盯着 <html data-bewly-stop-live-preview>，
// 标记在就短路 HTMLMediaElement.prototype.play 并停掉正在播的媒体。
// 这里只负责按设置挂/摘标记；设置热切换时同步，不用刷新页面。
export function setupLiveHomepagePreview() {
  if (!isLiveIndexPage())
    return

  const apply = () => {
    if (settings.value.livePauseHomepagePreview)
      document.documentElement.setAttribute('data-bewly-stop-live-preview', 'true')
    else
      document.documentElement.removeAttribute('data-bewly-stop-live-preview')
  }

  apply()
  watch(() => settings.value.livePauseHomepagePreview, apply)
}
