import { setErrorHandler } from './libs/generic'
import { contentScript } from './libs/messaging/content'

let reporting = false // Prevent infinite loops
setErrorHandler((ex) => {
  if (reporting)
    return

  try {
    reporting = true
    contentScript.postMessage('error', {
      name: ex.name,
      message: ex.message,
      stack: ex.stack,
      details: ex.details,
    })
  }
  catch (reportEx) {
    console.warn('Failed to report error:', ex, 'innerError:', reportEx)
  }
  finally {
    reporting = false
  }
})

const getElem = (() => {
  const elems = {}
  return (name) => {
    if (!elems[name]?.isConnected) {
      if (elems[name] && !elems[name].isConnected) {
        elems[name].dataset.ytalElem = name
      }
      elems[name] = document.querySelector(`[data-ytal-elem="${name}"]`)
      if (elems[name]) {
        delete elems[name].dataset.ytalElem
      }
    }
    return elems[name]
  }
})()

// Bilibili swaps the theme variables stylesheet between light.css and dark.css:
// <link id="__css-map__" href="//s1.hdslb.com/bfs/seed/jinkela/short/bili-theme/light.css">
const themeStylesheetRegex = /\/(light|dark)\.css(\?|#|$)/
function updateTheme(toDark) {
  document.documentElement.classList.toggle('night-mode', toDark)

  const themeStylesheetElem = document.getElementById('__css-map__')
  const href = themeStylesheetElem?.getAttribute('href')
  if (!href || !themeStylesheetRegex.test(href))
    return

  const newHref = href.replace(
    themeStylesheetRegex,
    `/${toDark ? 'dark' : 'light'}.css$2`,
  )
  if (newHref !== href)
    themeStylesheetElem.setAttribute('href', newHref)
}

contentScript.addMessageListener(
  'update-theme',
  (toDark) => {
    updateTheme(toDark)
    contentScript.postMessage('update-theme')
  },
)

const updateImmersiveMode = function updateImmersiveMode(enable) {
  document.documentElement.toggleAttribute(
    'data-bewly-amb-immersive',
    enable,
  )
}

contentScript.addMessageListener(
  'update-immersive-mode',
  (enable) => {
    updateImmersiveMode(enable)
    contentScript.postMessage('update-immersive-mode')
  },
)

// Only used by browsers that do not support VideoFrame.colorSpace
contentScript.addMessageListener('is-hdr-video', () => {
  contentScript.postMessage('is-hdr-video', false)
})

contentScript.addMessageListener(
  'video-player-set-size',
  () => {
    contentScript.postMessage('sizes-changed')
    contentScript.postMessage('video-player-set-size')
  },
)

contentScript.addMessageListener(
  'show',
  ({ toDark, hideScrollbar, immersiveMode }) => {
    const html = document.documentElement
    if (hideScrollbar)
      html.toggleAttribute('data-bewly-amb-hide-scrollbar', true)
    if (immersiveMode)
      updateImmersiveMode(true)

    updateTheme(toDark)

    html.toggleAttribute('data-bewly-amb-enabled', true)

    contentScript.postMessage('sizes-changed')
    contentScript.postMessage('show')
  },
)

contentScript.addMessageListener('hide', ({ toDark }) => {
  const html = document.documentElement
  html.toggleAttribute('data-bewly-amb-enabled', false)
  html.toggleAttribute('data-bewly-amb-hide-scrollbar', false)

  updateImmersiveMode(false)

  updateTheme(toDark)

  contentScript.postMessage('sizes-changed')
  contentScript.postMessage('hide')
})

let videoObserver
let videoObserverElem
contentScript.addMessageListener(
  'apply-chromium-bug-1142112-workaround',
  () => {
    try {
      const videoElem = getElem('video')
      if (videoObserverElem === videoElem)
        return

      if (videoObserver) {
        videoObserver.disconnect()
        videoObserver = undefined
      }
      videoObserverElem = videoElem
      if (!videoElem || videoElem.ambientlightGetVideoPlaybackQuality)
        return

      let videoIsHidden = false // IntersectionObserver is always executed at least once when the observation starts
      let videoVisibilityChangeTime
      videoObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (videoObserverElem !== entry.target)
              continue
            videoIsHidden = entry.intersectionRatio === 0
            videoVisibilityChangeTime = performance.now()
          }
        },
        {
          rootMargin: '-70px 0px 0px 0px', // header height (64px) + additional pixels to be safe
          threshold: 0.0001, // Because sometimes a pixel in not visible on screen but the intersectionRatio is already 0
        },
      )
      videoObserver.observe(videoElem)

      Object.defineProperty(videoElem, 'ambientlightGetVideoPlaybackQuality', {
        value: videoElem.getVideoPlaybackQuality,
      })

      let previousDroppedVideoFrames = 0
      let droppedVideoFramesCorrection = 0
      let previousTime = performance.now()

      videoElem.getVideoPlaybackQuality = function () {
        // Use scoped properties instead of this from here on
        const original = videoElem.ambientlightGetVideoPlaybackQuality()
        let droppedVideoFrames = original.droppedVideoFrames
        if (droppedVideoFrames < previousDroppedVideoFrames) {
          previousDroppedVideoFrames = 0
          droppedVideoFramesCorrection = 0
        }
        // Ignore dropped frames for 2 seconds due to requestVideoFrameCallback dropping frames when the video is offscreen
        if (videoIsHidden || videoVisibilityChangeTime > previousTime - 2000) {
          droppedVideoFramesCorrection
            += droppedVideoFrames - previousDroppedVideoFrames
        }
        previousDroppedVideoFrames = droppedVideoFrames
        droppedVideoFrames = Math.max(
          0,
          droppedVideoFrames - droppedVideoFramesCorrection,
        )
        previousTime = performance.now()
        return {
          corruptedVideoFrames: original.corruptedVideoFrames,
          creationTime: original.creationTime,
          droppedVideoFrames,
          totalVideoFrames: original.totalVideoFrames,
        }
      }
    }
    catch (ex) {
      console.warn(
        'Failed to apply getVideoPlaybackQuality workaround. Continuing ambientlight initialization...',
      )
      throw ex
    }
  },
)
