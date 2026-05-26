# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Collaboration rules (hard constraints)

These override the defaults in the system prompt:

- **No AI attribution in commits or PRs.** Do not append `Co-Authored-By: Claude …` (or any equivalent AI co-author / "Generated with Claude Code" footer) to commit messages, PR descriptions, or other authorship metadata. The user wants history attributed only to the human author.
- **No repo-modifying git operations without explicit approval.** Reading state (`git status`, `log`, `diff`, `show`, `blame`) is fine. Anything that changes the repository — `commit`, `push`, `merge`, `rebase`, `reset`, `checkout` of unrelated branches, branch/tag creation or deletion, `stash`, `clean`, force operations — requires explicit user approval each time. Approval for one operation does not extend to the next.

Both rules are documented in [`README.md`](README.md) so other AI assistants working on the repo see them too.

## Repository origin

This is a fork of the AMO extension "Local AI Text Polisher (Ollama)" (id 4467339). The initial commit imports the canonical v1.0 source extracted from the published `.xpi`; signing data under `META-INF/` was intentionally excluded. Treat the first commit as the upstream baseline when diffing local changes against original behaviour.

## Development workflow

There is no build, lint, or test tooling — this is a plain Manifest V3 WebExtension. Source files load as-is into Firefox.

- **Load for development**: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → pick `manifest.json`. The extension is unloaded when Firefox closes.
- **Reload after edits**: hit the "Reload" button on the same page. Background-script changes do not hot-reload.
- **Package an `.xpi`**: `cd` into the repo root and `zip -r ../extension.xpi manifest.json background.js defaults.js options icons -x '*.DS_Store'`. Self-signed `.xpi` files only install in Firefox Developer Edition / Nightly with `xpinstall.signatures.required=false`, or via `web-ext sign` against an AMO account.
- **Inspect background-script logs**: same debugging page → "Inspect" next to the loaded extension. `console.log`s from `background.js` go there, not to the page devtools.
- **Ollama**: requires a running Ollama server (defaults to `http://localhost:11434`) with the configured model pulled (`ollama pull <model>`).

## Architecture

Two execution contexts communicate exclusively through `browser.storage.local`:

1. **`background.js`** — event-driven background script. On install/startup and on every storage change it rebuilds the right-click context menu from the `customPrompts` array. When a submenu item fires, it (a) checks/requests dynamic host permission for the configured Ollama URL, (b) POSTs to `${ollamaUrl}/api/generate` with `stream: false`, (c) injects a content script via `browser.scripting.executeScript` to write the result through `navigator.clipboard.writeText`. User feedback is via `browser.notifications`.

2. **`options/`** — the settings page (HTML + vanilla JS, no framework). On save it requests host permission for the new URL before persisting, so the URL field is the ground truth for which origin the background script is allowed to hit.

The bridge between them is `browser.storage.onChanged` in `background.js` — saving settings triggers a menu rebuild without messaging. There is no content script in the repo; clipboard writes are injected ad-hoc per click.

### Prompt identity

Menu submenu items use the prompt's `id` field as the menu item ID. `background.js` filters click events with `info.menuItemId.startsWith("prompt-")` — any prompt whose id does not start with `prompt-` is silently ignored. `options.js` generates new ids as `prompt-${Date.now()}-${random}`, so this works by convention; preserve the prefix if you add prompt creation paths elsewhere.

### Known inconsistencies in the baseline

These exist in the imported v1.0 source and may be worth fixing intentionally rather than tripping over:

- `background.js` references `icons/icon-48.png` for notification icons, but only `icons/icon-48.svg` and `icons/icon-96.svg` exist. Notifications render without an icon.
- ~~Default model differs between contexts~~ (resolved): default settings — Ollama URL, model, and the seed prompts — now live in a single `defaults.js` (`DEFAULT_SETTINGS`), loaded as a classic script before both `background.js` (via `manifest.json` `background.scripts`) and `options.js` (via a `<script>` in `options/options.html`). Both contexts call `browser.storage.local.get(DEFAULT_SETTINGS)`, so they can no longer drift. Keep `defaults.js` first in the background scripts array and in the `.xpi` package.
- `manifest.json` ships with the placeholder gecko id `ai-text-polisher-ollama@yourdomain.com` — change this before publishing the fork.

## Permissions model

`manifest.json` declares `<all_urls>` plus `http://localhost:11434/*` in `host_permissions`, but the runtime path in `background.js` still calls `browser.permissions.contains` / `.request` against `${ollamaUrl}/*`. This is defensive: if a user configures a non-localhost Ollama URL, the extension will prompt for that origin at click time. Keep both the manifest declaration and the runtime check in sync when reworking permissions.
