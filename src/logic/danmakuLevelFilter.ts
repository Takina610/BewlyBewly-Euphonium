import { settings } from '~/logic'

/**
 * The danmaku shield level, published on `<html>` for the main-world inject script to read.
 *
 * Danmaku segments are fetched by the player itself, in the page's own world, so the filtering has to
 * happen there: the inject script drops the entries below this level from every segment response
 * (`src/inject/index.js`), and the content script can only tell it the level. Same channel as the
 * comment IP location switch — a plain attribute, no messaging.
 *
 * Written as a number: the level itself, and `0` for off. Suspended while slacking mode runs: the
 * video page tab that holds the switch is replaced by the mode's notice, and a filter that can no
 * longer be changed should not still be working.
 */
export const DANMAKU_LEVEL_ATTR = 'data-bewly-danmaku-level'

export function setupDanmakuLevelFilter() {
  const publish = () => {
    const level = settings.value.slackingMode ? 0 : settings.value.videoPageDanmakuLevelFilter
    document.documentElement.setAttribute(DANMAKU_LEVEL_ATTR, String(level > 0 ? level : 0))
  }

  publish()
  watch(() => [settings.value.videoPageDanmakuLevelFilter, settings.value.slackingMode], publish)
}
