# BewlyBewly! Euphonium

[English](README.md) | 官话 - 简体中文 | [官話 - 繁體中文](README-cmn_TW.md) | [廣東話](README-jyut.md)

<p align="center" style="margin-bottom: 0px !important;">
<img width="320" alt="BewlyBewly! Euphonium logo" src="./assets/re_logo.png" style="border-radius: 12px"><br/>
</p>

<p align="center">对您的 bilibili 页面进行一些小更改。</p>

<p align="center"><img src="https://img.shields.io/github/v/release/Takina610/BewlyBewly-Euphonium"> <img src="https://img.shields.io/github/languages/code-size/Takina610/BewlyBewly-Euphonium"></p>

## 安装

BewlyBewly! Euphonium 是一个个人分叉版本，**没有上架任何扩展商店**。你可以自行构建，或者从[发行版页面](https://github.com/Takina610/BewlyBewly-Euphonium/releases)下载已打包好的构建。

### 从源代码构建

```bash
bun install

bun run build          # Chromium 系浏览器 -> extension/
bun run build-firefox  # Firefox 系浏览器  -> extension-firefox/
```

### 载入未打包的扩展

- Chromium 系浏览器（Chrome、Edge、Brave 等）：打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择 `extension` 文件夹。
- Firefox 系浏览器：打开 `about:debugging#/runtime/this-firefox`，点击「临时载入附加组件」，选择 `extension-firefox/manifest.json`。

## 介绍

> [!IMPORTANT]
> BewlyBewly! Euphonium 主要专注页面的调整和优化，而不是完善功能和提升效率。
>
> 由于效率和维护难度的原因，暗色模式只会适应常用页面，而不会适应不常用的页面。

> [!IMPORTANT]
> BewlyBewly! Euphonium 是 [BewlyBewly! Ave Mujica](https://github.com/VentusUta/BewlyBewly-AveMujica) 的一个个人分叉版本，而后者是 [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly) [v0.40.6](https://github.com/BewlyBewly/BewlyBewly/releases/tag/v0.40.6) 的一个 fork（分叉），目的是在原项目存档后提供其他更新和错误修复。

BewlyBewly! Euphonium 是一个用于 bilibili 的浏览器扩展，旨在通过重新设计 bilibili 用户界面来提升用户体验。设计灵感来自于 YouTube、Vision OS 和 iOS，从而实现了更具视觉吸引力和用户友好性的界面。

该项目使用 [vitesse-webext](https://github.com/antfu/vitesse-webext) 模板进行开发。如果没有这个模板，可能无法开发出这个项目。

## 贡献与构建项目

见 [docs/CONTRIBUTING-cmn_CN.md](https://github.com/Takina610/BewlyBewly-Euphonium/blob/main/docs/CONTRIBUTING-cmn_CN.md)

## 鸣谢

- [vitesse-webext](https://github.com/antfu/vitesse-webext)——该项目使用的模板
- [BewlyBewly! Ave Mujica](https://github.com/VentusUta/BewlyBewly-AveMujica)——本项目所基于的分叉
- [UserScripts/bilibiliHome](https://github.com/indefined/UserScripts/tree/master/bilibiliHome)、[bilibili-app-recommend](https://github.com/magicdawn/bilibili-app-recommend)——获取访问密钥的参考来源
- [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved)——部分功能实现
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
