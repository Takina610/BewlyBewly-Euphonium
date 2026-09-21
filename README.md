# BewlyBewly! Euphonium

English | [官话 - 简体中文](README-cmn_CN.md) | [官話 - 繁體中文](README-cmn_TW.md) | [廣東話](README-jyut.md)

<p align="center" style="margin-bottom: 0px !important;">
<img width="320" alt="BewlyBewly! Euphonium logo" src="./assets/re_logo.png"><br/>
</p>

<p align="center">Just make a few small changes to your bilibili homepage.</p>

<p align="center"><img src="https://img.shields.io/github/v/release/Takina610/BewlyBewly-Euphonium"> <img src="https://img.shields.io/github/languages/code-size/Takina610/BewlyBewly-Euphonium"></p>

## Installation

BewlyBewly! Euphonium is a personal fork and is **not published on any extension store**. You either build it yourself or grab a packaged build from the [releases page](https://github.com/Takina610/BewlyBewly-Euphonium/releases).

### Build from source

```bash
bun install

bun run build          # Chromium-based browsers -> extension/
bun run build-firefox  # Firefox-based browsers  -> extension-firefox/
```

### Load the unpacked extension

- Chromium-based browsers (Chrome, Edge, Brave, ...): open `chrome://extensions`, enable "Developer mode", click "Load unpacked" and select the `extension` folder.
- Firefox-based browsers: open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on..." and select `extension-firefox/manifest.json`.

## Introduction

> [!IMPORTANT]
> BewlyBewly! Euphonium mainly focuses on page adjustments and optimization rather than improving functionality and efficiency.
>
> The dark mode will only be adapted to commonly used pages due to its efficiency and maintenance difficulty, while less
> frequently used pages will not to be adapted.

> [!IMPORTANT]
> BewlyBewly! Euphonium is a personal fork of [BewlyBewly! Ave Mujica](https://github.com/VentusUta/BewlyBewly-AveMujica), which itself is a fork of [BewlyBewly](https://github.com/BewlyBewly/BewlyBewly) [v0.40.6](https://github.com/BewlyBewly/BewlyBewly/releases/tag/v0.40.6). It exists to provide feature updates and bug fixes after the original project was archived.

BewlyBewly! Euphonium is a browser extension for bilibili that aims to enhance the user experience by redesigning the bilibili UI. The design is inspired by YouTube, Vision OS, and iOS, resulting in a more visually appealing and user-friendly interface.

This project uses the [vitesse-webext](https://github.com/antfu/vitesse-webext) template for development. Without this template, it may not be possible to develop this project.

## Contribution & Build

See [docs/CONTRIBUTING.md](https://github.com/Takina610/BewlyBewly-Euphonium/blob/main/docs/CONTRIBUTING.md).

## Credits

- [vitesse-webext](https://github.com/antfu/vitesse-webext) - The template used for this project
- [BewlyBewly! Ave Mujica](https://github.com/VentusUta/BewlyBewly-AveMujica) - The fork this project is based on
- [UserScripts/bilibiliHome](https://github.com/indefined/UserScripts/tree/master/bilibiliHome), [bilibili-app-recommend](https://github.com/magicdawn/bilibili-app-recommend) - Reference source for obtaining the access key
- [Bilibili-Evolved](https://github.com/the1812/Bilibili-Evolved) - Partial implementation of functionalities
- [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect)
