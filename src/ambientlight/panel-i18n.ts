/**
 * ambilight 面板的界面翻译。原版面板只有繁体文案（label/description 直接写在
 * `settings-config.js` 里），这里以繁体原文为键，提供 Bewly 四语言中的另外三种；
 * `cmn-TW` 与原文一致，不需要映射。
 *
 * 应用方式在 `logic/ambilight.ts`：菜单构建后按 `settings.language` 把命中文本的节点改写掉，
 * 并用 MutationObserver 在菜单动态重建时重新套用（只改有翻译且文本不同的节点，不会成环）。
 */

export type PanelLanguage = 'en' | 'cmn-CN' | 'cmn-TW' | 'jyut'

export function resolvePanelLanguage(language: string): PanelLanguage {
  if (language === 'en' || language === 'cmn-CN' || language === 'cmn-TW' || language === 'jyut')
    return language
  return 'cmn-TW'
}

const en: Record<string, string> = {
  '設定': 'Settings',
  '顯示進階設定': 'Show advanced settings',
  '統計資訊': 'Statistics',
  '影格率': 'Frame rate',
  '影格時間圖表': 'Frame time graph',
  '解析度與繪製時間': 'Resolution & draw time',
  '黑邊偵測': 'Black bar detection',
  '品質與效能': 'Quality & performance',
  'WebGL 渲染器（較省電）': 'WebGL renderer (power efficient)',
  '解析度': 'Resolution',
  '影格率上限（每秒）': 'Frame rate limit (per second)',
  '同步方式': 'Sync method',
  '解碼': 'Decoding',
  '顯示器': 'Display',
  '影片': 'Video',
  '優先載入網頁': 'Prioritize page load',
  '去色帶最佳化對象': 'Debanding target',
  'LCD（一般）': 'LCD (normal)',
  'OLED（疊加）': 'OLED (overlay)',
  '頁首': 'Header',
  '陰影大小': 'Shadow size',
  '陰影不透明度': 'Shadow opacity',
  '圖片不透明度': 'Image opacity',
  '背景不透明度': 'Background opacity',
  '頁面內容': 'Page content',
  '只在文字與按鈕加上陰影': 'Shadow on text and buttons only',
  '按鈕與區塊背景不透明度': 'Button & block background opacity',
  '背景灰度': 'Background greyness',
  '隱藏捲軸': 'Hide scrollbar',
  '大小（一般模式）': 'Size (normal mode)',
  '大小（寬螢幕模式）': 'Size (theater mode)',
  '大小（全螢幕）': 'Size (fullscreen)',
  '去色帶（雜訊）': 'Debanding (noise)',
  '讓影片與環境光同步': 'Sync video with ambient light',
  '停用影片同步的門檻': 'Threshold to disable video sync',
  '影片抖動修正': 'Video jitter fix',
  '影片破圖修正': 'Video corruption fix',
  '移除黑邊與彩色邊': 'Remove black bars & colored edges',
  '移除上下黑邊': 'Remove horizontal black bars',
  '移除左右黑邊': 'Remove vertical black bars',
  '偵測：也移除彩色邊': 'Detect: also remove colored edges',
  '偵測：偏移': 'Detect: offset',
  '偵測：平均影格數': 'Detect: average frame count',
  '偵測：確定性門檻': 'Detect: certainty threshold',
  '偵測：不對稱門檻': 'Detect: asymmetry threshold',
  '上下黑邊大小': 'Horizontal black bar size',
  '左右黑邊大小': 'Vertical black bar size',
  '換影片時重設黑邊': 'Reset black bars on video change',
  '放大影片填滿移除的黑邊': 'Zoom video to fill removed bars',
  '濾鏡': 'Filter',
  '亮度': 'Brightness',
  '對比': 'Contrast',
  '色彩': 'Vibrance',
  '飽和度': 'Saturation',
  'HDR 濾鏡': 'HDR filter',
  '方向': 'Directions',
  '上': 'Top',
  '右': 'Right',
  '下': 'Bottom',
  '左': 'Left',
  '環境光': 'Ambient light',
  '模糊': 'Blur',
  '邊緣大小': 'Edge size',
  '擴散範圍': 'Spread',
  '擴散淡出起點': 'Spread fade-out start',
  '擴散淡出曲線': 'Spread fade-out curve',
  '淡入時間': 'Fade-in time',
  '減少閃爍': 'Flicker reduction',
  '平滑動態（影格混合）': 'Smooth motion (frame blending)',
  '平滑動態強度': 'Smooth motion strength',
  '固定位置': 'Fixed position',
  '沉浸': 'Immersive',
  '頁首與搜尋框融入背景': 'Blend header & search box into the background',
  '寬螢幕模式時隱藏頁首': 'Hide the header in theater mode',
  '右側欄融入背景': 'Blend the right sidebar into the background',
  '影片資訊與留言區融入背景': 'Blend video info & comments into the background',
  '彈幕輸入列融入背景': 'Blend the danmaku input bar into the background',
  '顯示模式': 'View',
  '在哪些模式啟用': 'Enable in which views',
  '全部': 'All',
  '一般': 'Normal',
  '寬螢幕': 'Theater',
  '全螢幕': 'Fullscreen',
  '子母畫面': 'Picture-in-picture',
  '基本設定': 'Basic settings',
  '外觀（主題）': 'Appearance (theme)',
  '淺色': 'Light',
  '跟隨 B 站': 'Follow Bilibili',
  '深色': 'Dark',
  '啟用': 'Enabled',
  '會使用：CPU 效能': 'Uses: CPU performance',
  '變更後會重新載入網頁': 'Reloads the page after changing',
  '等網頁載入完成後再載入環境光': 'Load the ambient light after the page finishes loading',
  '只在頁面往下捲動後套用': 'Apply only after scrolling down',
  '減少捲動與影片卡頓': 'Reduces scrolling and video stutter',
  '掉幀比例超過此值時停用': 'Disables when the dropped frame ratio exceeds this',
  '會使用：CPU 與 GPU 效能': 'Uses: CPU & GPU performance',
  '會使用：GPU 記憶體': 'Uses: GPU memory',
  '把模糊設為 0% 比較容易看出差異': 'Set blur to 0% to see the difference more easily',
  '會使用：GPU 效能': 'Uses: GPU performance',
  '會使用：GPU 效能。也可以搭配「讓影片與環境光同步」': 'Uses: GPU performance. Can be combined with "Sync video with ambient light"',
  '不隨頁面捲動': 'Does not scroll with the page',
  '頁面在最上方時頁首完全透明': 'Header fully transparent when the page is at the top',
  '頁面在最上方時': 'When the page is at the top',
  '關閉': 'Off',
  ' 秒': ' s',
  '排解效能問題': 'Troubleshoot performance issues',
  '改編自 Wessel Kroos 的 Ambient light for YouTube™': "Adapted from Wessel Kroos's Ambient light for YouTube™",
  '重設所有設定': 'Reset all settings',
  '環境光設定': 'Ambient light settings',
  '如何匯出或匯入設定：\n1. 點擊擴充功能圖示開啟選項\n2. 捲動到「匯入／匯出設定」': 'How to export or import settings:\n1. Click the extension icon to open the options\n2. Scroll to "Import / Export settings"',
}

const cmnCN: Record<string, string> = {
  '設定': '设置',
  '顯示進階設定': '显示高级设置',
  '統計資訊': '统计信息',
  '影格率': '帧率',
  '影格時間圖表': '帧时间图表',
  '解析度與繪製時間': '分辨率与绘制时间',
  '黑邊偵測': '黑边检测',
  '品質與效能': '画质与性能',
  'WebGL 渲染器（較省電）': 'WebGL 渲染器（较省电）',
  '解析度': '分辨率',
  '影格率上限（每秒）': '帧率上限（每秒）',
  '同步方式': '同步方式',
  '解碼': '解码',
  '顯示器': '显示器',
  '影片': '视频',
  '優先載入網頁': '优先加载网页',
  '去色帶最佳化對象': '去色带优化对象',
  'LCD（一般）': 'LCD（一般）',
  'OLED（疊加）': 'OLED（叠加）',
  '頁首': '页首',
  '陰影大小': '阴影大小',
  '陰影不透明度': '阴影不透明度',
  '圖片不透明度': '图片不透明度',
  '背景不透明度': '背景不透明度',
  '頁面內容': '页面内容',
  '只在文字與按鈕加上陰影': '仅给文字与按钮加阴影',
  '按鈕與區塊背景不透明度': '按钮与区块背景不透明度',
  '背景灰度': '背景灰度',
  '隱藏捲軸': '隐藏滚动条',
  '大小（一般模式）': '大小（普通模式）',
  '大小（寬螢幕模式）': '大小（宽屏模式）',
  '大小（全螢幕）': '大小（全屏）',
  '去色帶（雜訊）': '去色带（噪点）',
  '讓影片與環境光同步': '让视频与环境光同步',
  '停用影片同步的門檻': '停用视频同步的门槛',
  '影片抖動修正': '视频抖动修正',
  '影片破圖修正': '视频破图修正',
  '移除黑邊與彩色邊': '移除黑边与彩色边',
  '移除上下黑邊': '移除上下黑边',
  '移除左右黑邊': '移除左右黑边',
  '偵測：也移除彩色邊': '检测：同时移除彩色边',
  '偵測：偏移': '检测：偏移',
  '偵測：平均影格數': '检测：平均帧数',
  '偵測：確定性門檻': '检测：确定性阈值',
  '偵測：不對稱門檻': '检测：不对称阈值',
  '上下黑邊大小': '上下黑边大小',
  '左右黑邊大小': '左右黑边大小',
  '換影片時重設黑邊': '换视频时重置黑边',
  '放大影片填滿移除的黑邊': '放大视频填满移除的黑边',
  '濾鏡': '滤镜',
  '亮度': '亮度',
  '對比': '对比',
  '色彩': '色彩',
  '飽和度': '饱和度',
  'HDR 濾鏡': 'HDR 滤镜',
  '方向': '方向',
  '上': '上',
  '右': '右',
  '下': '下',
  '左': '左',
  '環境光': '环境光',
  '模糊': '模糊',
  '邊緣大小': '边缘大小',
  '擴散範圍': '扩散范围',
  '擴散淡出起點': '扩散淡出起点',
  '擴散淡出曲線': '扩散淡出曲线',
  '淡入時間': '淡入时间',
  '減少閃爍': '减少闪烁',
  '平滑動態（影格混合）': '平滑动态（帧混合）',
  '平滑動態強度': '平滑动态强度',
  '固定位置': '固定位置',
  '沉浸': '沉浸',
  '頁首與搜尋框融入背景': '页首与搜索框融入背景',
  '寬螢幕模式時隱藏頁首': '宽屏模式时隐藏页首',
  '右側欄融入背景': '右侧栏融入背景',
  '影片資訊與留言區融入背景': '视频信息与评论区融入背景',
  '彈幕輸入列融入背景': '弹幕输入栏融入背景',
  '顯示模式': '显示模式',
  '在哪些模式啟用': '在哪些模式启用',
  '全部': '全部',
  '一般': '普通',
  '寬螢幕': '宽屏',
  '全螢幕': '全屏',
  '子母畫面': '画中画',
  '基本設定': '基本设置',
  '外觀（主題）': '外观（主题）',
  '淺色': '浅色',
  '跟隨 B 站': '跟随 B 站',
  '深色': '深色',
  '啟用': '启用',
  '會使用：CPU 效能': '会使用：CPU 性能',
  '變更後會重新載入網頁': '更改后会重新加载网页',
  '等網頁載入完成後再載入環境光': '等网页加载完成后再加载环境光',
  '只在頁面往下捲動後套用': '仅在页面向下滚动后应用',
  '減少捲動與影片卡頓': '减少滚动与视频卡顿',
  '掉幀比例超過此值時停用': '掉帧比例超过此值时停用',
  '會使用：CPU 與 GPU 效能': '会使用：CPU 与 GPU 性能',
  '會使用：GPU 記憶體': '会使用：GPU 显存',
  '把模糊設為 0% 比較容易看出差異': '把模糊设为 0% 更容易看出差异',
  '會使用：GPU 效能': '会使用：GPU 性能',
  '會使用：GPU 效能。也可以搭配「讓影片與環境光同步」': '会使用：GPU 性能。也可搭配「让视频与环境光同步」',
  '不隨頁面捲動': '不随页面滚动',
  '頁面在最上方時頁首完全透明': '页面在最上方时页首完全透明',
  '頁面在最上方時': '页面在最上方时',
  '關閉': '关闭',
  '排解效能問題': '排查性能问题',
  '改編自 Wessel Kroos 的 Ambient light for YouTube™': '改编自 Wessel Kroos 的 Ambient light for YouTube™',
  '重設所有設定': '重置所有设置',
  '環境光設定': '环境光设置',
  '如何匯出或匯入設定：\n1. 點擊擴充功能圖示開啟選項\n2. 捲動到「匯入／匯出設定」': '如何导出或导入设置：\n1. 点击扩展图标打开选项\n2. 滚动到「导入／导出设置」',
}

const jyut: Record<string, string> = {
  '設定': '設定',
  '顯示進階設定': '顯示進階設定',
  '統計資訊': '統計資訊',
  '影格率': '幀率',
  '影格時間圖表': '幀時間圖表',
  '解析度與繪製時間': '解析度與繪製時間',
  '黑邊偵測': '黑邊偵測',
  '品質與效能': '畫質與效能',
  'WebGL 渲染器（較省電）': 'WebGL 渲染器（較慳電）',
  '解析度': '解析度',
  '影格率上限（每秒）': '幀率上限（每秒）',
  '同步方式': '同步方式',
  '解碼': '解碼',
  '顯示器': '顯示器',
  '影片': '影片',
  '優先載入網頁': '優先載入網頁',
  '去色帶最佳化對象': '去色帶最佳化對象',
  'LCD（一般）': 'LCD（一般）',
  'OLED（疊加）': 'OLED（疊加）',
  '頁首': '頁首',
  '陰影大小': '陰影大小',
  '陰影不透明度': '陰影不透明度',
  '圖片不透明度': '圖片不透明度',
  '背景不透明度': '背景不透明度',
  '頁面內容': '頁面內容',
  '只在文字與按鈕加上陰影': '只喺文字同按鈕度加陰影',
  '按鈕與區塊背景不透明度': '按鈕同區塊背景不透明度',
  '背景灰度': '背景灰度',
  '隱藏捲軸': '收起捲動條',
  '大小（一般模式）': '大小（一般模式）',
  '大小（寬螢幕模式）': '大小（寬螢幕模式）',
  '大小（全螢幕）': '大小（全螢幕）',
  '去色帶（雜訊）': '去色帶（雜訊）',
  '讓影片與環境光同步': '令影片同環境光同步',
  '停用影片同步的門檻': '停用影片同步嘅門檻',
  '影片抖動修正': '影片震動修正',
  '影片破圖修正': '影片破圖修正',
  '移除黑邊與彩色邊': '移除黑邊同彩色邊',
  '移除上下黑邊': '移除上下黑邊',
  '移除左右黑邊': '移除左右黑邊',
  '偵測：也移除彩色邊': '偵測：連彩色邊都移除',
  '偵測：偏移': '偵測：偏移',
  '偵測：平均影格數': '偵測：平均幀數',
  '偵測：確定性門檻': '偵測：確定性門檻',
  '偵測：不對稱門檻': '偵測：唔對稱門檻',
  '上下黑邊大小': '上下黑邊大小',
  '左右黑邊大小': '左右黑邊大小',
  '換影片時重設黑邊': '轉片時重設黑邊',
  '放大影片填滿移除的黑邊': '放大影片填滿移除咗嘅黑邊',
  '濾鏡': '濾鏡',
  '亮度': '亮度',
  '對比': '對比',
  '色彩': '色彩',
  '飽和度': '飽和度',
  'HDR 濾鏡': 'HDR 濾鏡',
  '方向': '方向',
  '上': '上',
  '右': '右',
  '下': '下',
  '左': '左',
  '環境光': '環境光',
  '模糊': '模糊',
  '邊緣大小': '邊緣大小',
  '擴散範圍': '擴散範圍',
  '擴散淡出起點': '擴散淡出起點',
  '擴散淡出曲線': '擴散淡出曲線',
  '淡入時間': '淡入時間',
  '減少閃爍': '減少閃爍',
  '平滑動態（影格混合）': '平滑動態（幀混合）',
  '平滑動態強度': '平滑動態強度',
  '固定位置': '固定位置',
  '沉浸': '沉浸',
  '頁首與搜尋框融入背景': '頁首同搜尋框融入背景',
  '寬螢幕模式時隱藏頁首': '寬螢幕模式時隱藏頁首',
  '右側欄融入背景': '右側欄融入背景',
  '影片資訊與留言區融入背景': '影片資訊同留言區融入背景',
  '彈幕輸入列融入背景': '彈幕輸入列融入背景',
  '顯示模式': '顯示模式',
  '在哪些模式啟用': '喺邊啲模式啟用',
  '全部': '全部',
  '一般': '一般',
  '寬螢幕': '寬螢幕',
  '全螢幕': '全螢幕',
  '子母畫面': '子母畫面',
  '基本設定': '基本設定',
  '外觀（主題）': '外觀（主題）',
  '淺色': '淺色',
  '跟隨 B 站': '跟隨 B 站',
  '深色': '深色',
  '啟用': '啟用',
  '會使用：CPU 效能': '會用：CPU 效能',
  '變更後會重新載入網頁': '改咗之後會重新載入網頁',
  '等網頁載入完成後再載入環境光': '等網頁載入完先載入環境光',
  '只在頁面往下捲動後套用': '只喺向下捲動之後先套用',
  '減少捲動與影片卡頓': '減少捲動同影片卡頓',
  '掉幀比例超過此值時停用': '甩幀比例超過呢個值就停用',
  '會使用：CPU 與 GPU 效能': '會用：CPU 同 GPU 效能',
  '會使用：GPU 記憶體': '會用：GPU 記憶體',
  '把模糊設為 0% 比較容易看出差異': '將模糊設做 0% 會容易睇到分別',
  '會使用：GPU 效能': '會用：GPU 效能',
  '會使用：GPU 效能。也可以搭配「讓影片與環境光同步」': '會用：GPU 效能。亦可以配搭「令影片同環境光同步」',
  '不隨頁面捲動': '唔會跟頁面捲動',
  '頁面在最上方時頁首完全透明': '頁面喺最頂嗰陣頁首完全透明',
  '頁面在最上方時': '頁面喺最頂嗰陣',
  '關閉': '關閉',
  '排解效能問題': '排解效能問題',
  '改編自 Wessel Kroos 的 Ambient light for YouTube™': '改編自 Wessel Kroos 嘅 Ambient light for YouTube™',
  '重設所有設定': '重設所有設定',
  '環境光設定': '環境光設定',
  '如何匯出或匯入設定：\n1. 點擊擴充功能圖示開啟選項\n2. 捲動到「匯入／匯出設定」': '點樣匯出或者匯入設定：\n1. 撳擴充功能圖示開啟選項\n2. 捲到「匯入／匯出設定」',
}

const tables: Record<Exclude<PanelLanguage, 'cmn-TW'>, Record<string, string>> = { en, 'cmn-CN': cmnCN, jyut }

/** 繁体原文 → 目标语言文案；没有映射（或目标就是繁体）返回原文。 */
export function translatePanelText(text: string, language: PanelLanguage): string {
  if (language === 'cmn-TW')
    return text
  return tables[language][text] ?? text
}

// ============================================================================
// BewlyBewly：面板语言的应用
// ============================================================================

let currentPanelLanguage: PanelLanguage = 'cmn-TW'

/** 设置面板当前语言；须在 ambilight 引擎构造之前调用（菜单按当时的配置文案构建）。 */
export function setAmbilightPanelLanguage(language: PanelLanguage) {
  currentPanelLanguage = language
}

/** 按当前面板语言翻译 settings.js 里硬编码的界面文案（创建时调用，非 DOM 改写）。 */
export function translateAmbilightPanelText(text: string): string {
  if (currentPanelLanguage === 'cmn-TW')
    return text
  const table = { en, 'cmn-CN': cmnCN, jyut }[currentPanelLanguage]
  return table[text] ?? text
}

/** 配置条目原文（首次应用时记录），语言切换时从原文重新翻译。 */
const configOriginals = new Map<object, { label: string, description: string | undefined }>()

interface PanelConfigEntry {
  label: string
  description?: string
  snapPoints?: { label?: string | number }[]
}

/**
 * 把设置配置数组里的 label/description 改写成当前面板语言。以条目对象为键记录原文，
 * 幂等：重复应用（语言来回切）不会累积翻译。
 */
const snapOriginals = new Map<object, string | number>()

export function applyAmbilightPanelLanguageToConfig(config: PanelConfigEntry[]) {
  for (const entry of config) {
    const original = configOriginals.get(entry) ?? { label: entry.label, description: entry.description }
    configOriginals.set(entry, original)

    entry.label = translateAmbilightPanelText(original.label)
    if (original.description !== undefined)
      entry.description = translateAmbilightPanelText(original.description)

    // 快照点标签（滑杆刻度，如「在哪些模式啟用」的全部/一般/寬螢幕…；数字刻度无需翻译）
    for (const snap of entry.snapPoints ?? []) {
      if (snap.label === undefined)
        continue
      const snapOriginal = snapOriginals.get(snap) ?? snap.label
      snapOriginals.set(snap, snapOriginal)
      if (typeof snapOriginal === 'string')
        snap.label = translateAmbilightPanelText(snapOriginal)
    }
  }
}
