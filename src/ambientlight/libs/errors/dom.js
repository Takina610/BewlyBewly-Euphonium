function getNodeSelector(elem) {
  if (!elem.tagName)
    return elem.nodeName // Document

  const idSelector = elem.id ? `#${elem.id}` : ''
  const classSelector = elem.classList?.length
    ? `.${Array.from(elem.classList).sort().join('.')}`
    : ''
  return `${elem.tagName.toLowerCase()}${idSelector}${classSelector}`
}

function getNodeTree(elem) {
  if (!elem)
    return []

  const tree = []
  tree.push(elem)
  while (elem.parentNode && elem.parentNode.tagName) {
    tree.unshift(elem.parentNode)
    elem = elem.parentNode
  }
  return tree
}

export function getNodeTreeString(elem) {
  return getNodeTree(elem)
    .map((node, i) => `${' '.repeat(i)}${getNodeSelector(node)}`)
    .join('\n')
}

export function getPageElems() {
  const allSelector
    = 'html, body, #app, #bilibili-player, .bpx-player-container, .bpx-player-video-area, .bpx-player-video-wrap, video'

  return {
    counts: allSelector.split(',').reduce((counts, selector) => {
      selector = selector.trim()
      counts[selector] = document.querySelectorAll(selector).length
      return counts
    }, {}),
  }
}
