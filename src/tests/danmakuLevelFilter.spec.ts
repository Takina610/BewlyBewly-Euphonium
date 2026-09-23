import { runInThisContext } from 'node:vm'

import { afterEach, expect, it, vi } from 'vitest'

import injectSource from '~/inject/index.js?raw'
import { DANMAKU_LEVEL_ATTR } from '~/logic/danmakuLevelFilter'

vi.mock('webextension-polyfill', () => {
  const browser = {
    runtime: { id: 'test-extension-id' },
    storage: {
      local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      onChanged: { addListener: () => {} },
    },
  }
  return { default: browser, storage: browser.storage }
})

/**
 * The shield level is applied in the main-world inject script: danmaku segments are fetched by the
 * player itself, through `XMLHttpRequest`, so that is the only place the bytes can be swapped. The
 * script is copied verbatim into the extension as a classic script and cannot be imported, so this
 * evaluates its source against a fake XHR and looks at what comes back out of `response`.
 *
 * The fixture is a real `DmSegMobileReply`: a repeated `elems` field (1), each entry a `DanmakuElem`
 * carrying `content` (7), `mode` (3), `weight` (9) and `pool` (11). Verified against the live API —
 * weights come back at 8 and above, which is why the shield levels on offer start at 9.
 */
const SEGMENT_URL = 'https://api.bilibili.com/x/v2/dm/wbi/web/seg.so?type=1&oid=42006219392&segment_index=1'

class FakeXMLHttpRequest {
  static payload: ArrayBuffer | null = null

  readyState = 1
  status = 200
  responseType = 'arraybuffer'
  url = ''
  private body: ArrayBuffer | null = null
  private listeners: Record<string, ((this: FakeXMLHttpRequest) => void)[]> = {}

  open(_method: string, url: string) {
    this.url = url
  }

  send() {
    this.readyState = 4
    this.body = FakeXMLHttpRequest.payload
    for (const listener of this.listeners.load ?? [])
      listener.call(this)
  }

  addEventListener(type: string, listener: (this: FakeXMLHttpRequest) => void) {
    (this.listeners[type] ||= []).push(listener)
  }

  get response(): ArrayBuffer | null {
    return this.body
  }
}

/** protobuf 的 varint：负数会符号扩展成 64 位（10 字节），所以这里用 BigInt 写。 */
function varint(value: number): number[] {
  let rest = BigInt(value)
  if (rest < 0n)
    rest += 1n << 64n

  const bytes: number[] = []
  do {
    const byte = Number(rest & 0x7Fn)
    rest >>= 7n
    bytes.push(rest > 0n ? byte | 0x80 : byte)
  } while (rest > 0n)
  return bytes
}

function intField(field: number, value: number): number[] {
  return [...varint(field * 8), ...varint(value)]
}

function bytesField(field: number, payload: number[]): number[] {
  return [...varint(field * 8 + 2), ...varint(payload.length), ...payload]
}

interface ElemSpec {
  content: string
  weight?: number
  pool?: number
  mode?: number
}

function danmakuReply(elems: ElemSpec[]): ArrayBuffer {
  const bytes: number[] = []
  for (const elem of elems) {
    const payload = [...bytesField(7, [...new TextEncoder().encode(elem.content)]), ...intField(3, elem.mode ?? 1)]
    if (elem.weight !== undefined)
      payload.push(...intField(9, elem.weight))
    if (elem.pool !== undefined)
      payload.push(...intField(11, elem.pool))
    bytes.push(...bytesField(1, payload))
  }
  return new Uint8Array(bytes).buffer
}

/** Reads the fixture back out: which danmaku survived, and with which weight. */
function readReply(buffer: ArrayBuffer): ElemSpec[] {
  const bytes = new Uint8Array(buffer)
  const elems: ElemSpec[] = []
  let pos = 0

  function readVarint(): number {
    let value = 0
    let shift = 0
    while (true) {
      const byte = bytes[pos++]
      value += (byte & 0x7F) * 2 ** shift
      if (!(byte & 0x80))
        return value
      shift += 7
    }
  }

  while (pos < bytes.length) {
    const tag = readVarint()
    const field = Math.floor(tag / 8)
    const wire = tag % 8
    expect(wire).toBe(2)

    const length = readVarint()
    const end = pos + length
    if (field === 1) {
      const elem: ElemSpec = { content: '' }
      let inner = pos
      while (inner < end) {
        const innerTag = readVarintFrom(inner)
        inner = innerTag.pos
        const innerField = Math.floor(innerTag.value / 8)
        const innerWire = innerTag.value % 8
        if (innerWire === 0) {
          const value = readVarintFrom(inner)
          inner = value.pos
          if (innerField === 3)
            elem.mode = value.value
          else if (innerField === 9)
            elem.weight = value.value
          else if (innerField === 11)
            elem.pool = value.value
        }
        else {
          const value = readVarintFrom(inner)
          inner = value.pos
          if (innerField === 7)
            elem.content = new TextDecoder().decode(bytes.subarray(inner, inner + value.value))
          inner += value.value
        }
      }
      elems.push(elem)
    }
    pos = end
  }

  function readVarintFrom(from: number): { value: number, pos: number } {
    let value = 0
    let shift = 0
    let at = from
    while (true) {
      const byte = bytes[at++]
      value += (byte & 0x7F) * 2 ** shift
      if (!(byte & 0x80))
        return { value, pos: at }
      shift += 7
    }
  }

  return elems
}

function requestSegment() {
  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', SEGMENT_URL)
  xhr.send()
  return xhr.response as ArrayBuffer
}

function sender(weight: number | undefined, content: string, extra: Partial<ElemSpec> = {}): ElemSpec {
  return { content, weight, ...extra }
}

const FIXTURE = [
  sender(8, 'lv8'),
  sender(10, 'lv10'),
  sender(11, 'lv11'),
  sender(undefined, 'code', { pool: 2, mode: 8 }),
  sender(1, 'subtitle', { pool: 1 }),
  sender(2, 'advanced', { mode: 7 }),
  sender(-9, 'negative'),
]

afterEach(() => {
  document.documentElement.removeAttribute(DANMAKU_LEVEL_ATTR)
})

// jsdom has no Clipboard API, and the script's URL cleaner patches it on the way in
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async () => {} },
})

;(globalThis as any).XMLHttpRequest = FakeXMLHttpRequest
// As a classic script, exactly as the browser runs it in the page. Wrapped in a scope of its own
// because this global outlives the test, and the script declares top-level names.
runInThisContext(`;(() => {
${injectSource}
})()`)

it('leaves the response alone while the filter is off', () => {
  FakeXMLHttpRequest.payload = danmakuReply(FIXTURE)

  const response = requestSegment()

  expect(readReply(response).map(elem => elem.content)).toEqual(FIXTURE.map(elem => elem.content))
})

it('drops every danmaku below the level, and keeps everything else', () => {
  document.documentElement.setAttribute(DANMAKU_LEVEL_ATTR, '10')
  FakeXMLHttpRequest.payload = danmakuReply(FIXTURE)

  const response = requestSegment()

  // 8 and -9 are below 10; the special pools and the weight-less entries are never touched
  expect(readReply(response).map(elem => elem.content)).toEqual(['lv10', 'lv11', 'code', 'subtitle', 'advanced'])
})

it('keeps only the top level when that is what was asked for', () => {
  document.documentElement.setAttribute(DANMAKU_LEVEL_ATTR, '11')
  FakeXMLHttpRequest.payload = danmakuReply(FIXTURE)

  const response = requestSegment()

  expect(readReply(response).map(elem => elem.content)).toEqual(['lv11', 'code', 'subtitle', 'advanced'])
})

it('reads the level once per request, so a page that asks twice gets the same bytes', () => {
  document.documentElement.setAttribute(DANMAKU_LEVEL_ATTR, '11')
  FakeXMLHttpRequest.payload = danmakuReply(FIXTURE)

  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', SEGMENT_URL)
  xhr.send()

  expect(xhr.response).toBe(xhr.response)
  expect(readReply(xhr.response as ArrayBuffer)).toHaveLength(4)
})

it('does not touch requests that are not danmaku segments', () => {
  document.documentElement.setAttribute(DANMAKU_LEVEL_ATTR, '11')
  FakeXMLHttpRequest.payload = danmakuReply(FIXTURE)

  const xhr = new FakeXMLHttpRequest()
  xhr.open('GET', 'https://api.bilibili.com/x/web-interface/view?bvid=BV1TceU6iEoH')
  xhr.send()

  expect(readReply(xhr.response as ArrayBuffer)).toHaveLength(FIXTURE.length)
})
