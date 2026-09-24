# BewlyBewly! Euphonium

[English](README.md) | [官话 - 简体中文](README-cmn_CN.md) | 官話 - 繁體中文 | [廣東話](README-jyut.md)

<p align="center" style="margin-bottom: 0px !important;">
<img width="320" alt="BewlyBewly! Euphonium logo" src="./assets/re_logo.png" style="border-radius: 12px"><br/>
</p>

<p align="center">對您的 bilibili 頁面進行一些小改動。</p>

<p align="center"><img src="https://img.shields.io/github/v/release/Takina610/BewlyBewly-Euphonium"> <img src="https://img.shields.io/github/languages/code-size/Takina610/BewlyBewly-Euphonium"></p>

## 安裝

BewlyBewly! Euphonium 是一個個人分叉版本，**並未上架任何擴充功能商店**。你可以自行建置，或者從[發行版頁面](https://github.com/Takina610/BewlyBewly-Euphonium/releases)下載已打包好的建置。

### 從原始碼建置

```bash
bun install

bun run build          # Chromium 系瀏覽器 -> extension/
bun run build-firefox  # Firefox 系瀏覽器  -> extension-firefox/
```

### 載入未打包的擴充功能

- Chromium 系瀏覽器（Chrome、Edge、Brave 等）：開啟 `chrome://extensions`，開啟「開發人員模式」，點擊「載入未封裝項目」，選擇 `extension` 資料夾。
- Firefox 系瀏覽器：開啟 `about:debugging#/runtime/this-firefox`，點擊「載入臨時附加元件」，選擇 `extension-firefox/manifest.json`。

## 介紹

> [!IMPORTANT]
> BewlyBewly! Euphonium 主要著重於頁面調整和改良，而不是完善功能和提升效率。
>
> 由於考慮到效率和維護困難度，深色模式只會適應常用的頁面，而較少使用的頁面則不會支護。

> [!IMPORTANT]
> BewlyBewly! Euphonium 是 [BewlyBewly! Ave Mujica](https://github.com/VentusUta/BewlyBewly-AveMujica) 的一個個人分叉版本，而後者是 [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly) [v0.40.6](https://github.com/BewlyBewly/BewlyBewly/releases/tag/v0.40.6) 一個 fork（分叉），目的是在原專案封存後提供其他更新和錯誤修復。

BewlyBewly! Euphonium 是一個針對 bilibili 的瀏覽器擴充功能，旨在透過重新設計 bilibili 的介面來提升用戶體驗。設計靈感來自於 YouTube、Vision OS 和 iOS，使介面更具視覺吸引力和用戶友好性。

該專案使用 [vitesse-webext](https://github.com/antfu/vitesse-webext) 範例進行開發。如果沒有此範例，可能無法開發出此專案。

## 貢獻與建置專案

見 [docs/CONTRIBUTING-cmn_TW.md](https://github.com/Takina610/BewlyBewly-Euphonium/blob/main/docs/CONTRIBUTING-cmn_TW.md)

## 鳴謝

- [vitesse-webext](https://github.com/antfu/vitesse-webext)——此專案所用的範例
- [BewlyBewly! Ave Mujica](https://github.com/VentusUta/BewlyBewly-AveMujica)——本專案所基於的分叉
- [UserScripts/bilibiliHome](https://github.com/indefined/UserScripts/tree/master/bilibiliHome)、[bilibili-app-recommend](https://github.com/magicdawn/bilibili-app-recommend)——參考取得 access key 之方法
- [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved)——部分功能的實現
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
