const browsersUAList = [
  { ua: 'Firefox', name: 'Firefox' },
  { ua: 'OPR', name: 'Opera' },
  { ua: 'Edg', name: 'Edge' },
  { ua: 'Chrome', name: 'Chrome' },
]

export function getBrowser() {
  try {
    const ua = globalThis.navigator.userAgent
    const browser = browsersUAList.find(
      browser => ua.includes(browser.ua),
    )
    return browser ? browser.name : ''
  }
  catch {
    return null
  }
}

export function getVersion() {
  try {
    return (chrome.runtime.getManifest() || {}).version
  }
  catch {
    return null
  }
}

export const originalProjectLink
  = 'https://github.com/WesselKroos/youtube-ambilight'
export const troubleshootLink = `${originalProjectLink}/blob/master/TROUBLESHOOT.md`
