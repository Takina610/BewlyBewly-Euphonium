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
