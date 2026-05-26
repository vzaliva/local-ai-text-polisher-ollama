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

1. **`background.js`** — event-driven background script. On install/startup and on every storage change it rebuilds the right-click context menu from the `customPrompts` array. When a submenu item fires, it (a) checks/requests dynamic host permission for the configured Ollama URL, (b) injects a before/after popup (`browser.scripting.executeScript`, targeting `info.frameId` so it lands in the frame that owns the selection) and (c) POSTs to `${ollamaUrl}/api/chat` with `stream: false`. The popup — not `browser.notifications` — is the feedback surface: it opens in a "loading" phase and is then updated to "ready" or "error". A notification is used only as a last resort when injection itself is impossible (privileged pages).

2. **`options/`** — the settings page (HTML + vanilla JS, no framework). On save it requests host permission for the new URL before persisting, so the URL field is the ground truth for which origin the background script is allowed to hit.

The bridge between them is `browser.storage.onChanged` in `background.js` — saving settings triggers a menu rebuild without messaging. There is no standing content script in the repo; per click the background script does **two** `executeScript` injections into the selection's frame (`info.frameId`):

1. `aiPolishOpenInPage` runs **before** the Ollama call. It first records the replacement target while focus/selection are still intact — a `<textarea>`/`<input>` (via `selectionStart/End`) or a `contenteditable` ancestor (via a cloned `Range`) — holding it in a closure, then renders a shadow-DOM dialog in its "loading" phase. Capturing must happen here, not after the round-trip: focus moves while the model runs, and field selections aren't visible to `window.getSelection()` anyway. (Permission is resolved *before* this injection so the permission prompt keeps its user gesture.)
2. `aiPolishResolveInPage` runs after the response, finds the open dialog by id, and flips it to "ready" (fills the editable textarea) or "error". It is a no-op if the user already closed the dialog. Because both injections run in the same content-script world for the frame, the Copy/Replace listeners wired in step 1 (closing over the captured target) stay live.

Both injected functions are serialised by `executeScript`, so they cannot reference outer scope — all helpers and styles live inside them. Phase visibility is driven by a `data-phase` attribute on the card with CSS rules. **Replace** writes back via the native value setter + dispatched `input` event (so React/Vue controlled inputs notice) for fields, or `document.execCommand("insertText")` for contenteditable. Known limitation: heavy editors (Lexical, ProseMirror, Monaco, CodeMirror, Slack/Gmail rich compose) manage their own model and may ignore the write; **Copy to clipboard** is the universal fallback.

### Prompt identity

Menu submenu items use the prompt's `id` field as the menu item ID. `background.js` filters click events with `info.menuItemId.startsWith("prompt-")` — any prompt whose id does not start with `prompt-` is silently ignored. `options.js` generates new ids as `prompt-${Date.now()}-${random}`, so this works by convention; preserve the prefix if you add prompt creation paths elsewhere.

### Known inconsistencies in the baseline

These exist in the imported v1.0 source and may be worth fixing intentionally rather than tripping over:

- `background.js` references `icons/icon-48.png` for notification icons, but only `icons/icon-48.svg` and `icons/icon-96.svg` exist. Notifications render without an icon.
- ~~Default model differs between contexts~~ (resolved): default settings — Ollama URL, model, and the seed prompts — now live in a single `defaults.js` (`DEFAULT_SETTINGS`), loaded as a classic script before both `background.js` (via `manifest.json` `background.scripts`) and `options.js` (via a `<script>` in `options/options.html`). Both contexts call `browser.storage.local.get(DEFAULT_SETTINGS)`, so they can no longer drift. Keep `defaults.js` first in the background scripts array and in the `.xpi` package.
- `manifest.json` ships with the placeholder gecko id `ai-text-polisher-ollama@yourdomain.com` — change this before publishing the fork.

## Permissions model

`manifest.json` declares `<all_urls>` plus `http://localhost:11434/*` in `host_permissions`, but the runtime path in `background.js` still calls `browser.permissions.contains` / `.request` against `${ollamaUrl}/*`. This is defensive: if a user configures a non-localhost Ollama URL, the extension will prompt for that origin at click time. Keep both the manifest declaration and the runtime check in sync when reworking permissions.
