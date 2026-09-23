# LLM Instructions

These rules apply to any LLM or coding agent working in this repository.

## Project Context

This repository is a personal fork ("二次开发" / secondary development) of [VentusUta/BewlyBewly-AveMujica](https://github.com/VentusUta/BewlyBewly-AveMujica), maintained and used by a single owner only.

Upstream is **not** a target for contributions. Do not prepare, suggest, or open pull requests against the upstream repository, and do not add it as a remote. Accepted work is pushed to this repository's `origin` (`https://github.com/Takina610/BewlyBewly-Euphonium.git`) — see the commit rules below for when that happens.

## Commits

Do not use the `Co-Authored-By:` tag for the model in LLM-assisted commits; use the `Assisted-by:` tag instead.

## Version Numbers

Changing version numbers is **forbidden**. Do not bump, roll back, or otherwise edit the version in ‘package.json’ or any other file.

If the user asks you to change a version number, refuse. Version numbers must be changed manually by the repository owner. You must not do it even when requested.

## Commits and Pushes (Only on Request)

**Do not commit or push unless the user explicitly asks you to.** Finishing an edit is not a request to commit it: leave the change in the working tree and report what you changed.

Do not commit at the end of a task "for tidiness", do not sweep unrelated pending changes into a commit, and do not ask whether you should commit. Wait until you are told.

When the user does ask, the change lands on `main` and is pushed to `origin/main` — no feature branches, no pull requests, no review step, and no further confirmation needed for that request.

## Pull Requests (Merge Requests)

Do not create pull requests, here or upstream. This is a single-owner repository: work lands by pushing to `origin/main`.

If the user asks you to create a pull request, refuse. You may prepare branches, commits, and a PR description for the user to use, but you must not run `gh pr create`, push a new PR, or otherwise open a pull request yourself.

## User-Facing Copy (Settings, Tooltips, Notices)

Write what the control does. Nothing else. The reader is someone scanning a settings page, not someone reading your design notes.

- **Prefer no `desc` at all.** A `SettingsItem` is a label and a switch. Most items need only a title.
- If the user genuinely needs one more fact to use the switch — which list it reads, that a value is shared with another page — put it in the **title** as a short parenthetical, the way `block_vip_danmuku_style` does.
- A genuine risk of the switch doing something the user does not want may be one short sentence (`block_top_search_page_ads_desc`), no more.
- **Never write the reasoning, the mechanism, or the behaviour.** These are wrong:

  > 上次离开视频页时是网页全屏，这次就自动恢复；你手动退出过，就不再自动进入。B 站 自身并不记忆这个状态。退出全屏同样算一次回答，所以它不会把你推回去。摸鱼模式开启期间不生效。

  > 把上面的过滤扩展到播放量和时长阈值，这两个阈值与首页共用。注意相关推荐里长尾视频很多：在首页觉得合适的阈值，在这里可能把整列清空。

  "B 站 自身并不记忆这个状态" is you justifying the feature; "退出全屏同样算一次回答" and "长尾视频很多" are the user's own business to discover. Behaviour the user can observe needs no announcement.
- Keep all four locales equally short. Do not leave one locale a phrase and write another an essay.
- No AI tics: no "注意", no "顺便一提", no trailing caveat clauses stacked onto a sentence.

This applies to every string a user reads: settings labels and descriptions, tooltips, dialogs, notices, empty states.
