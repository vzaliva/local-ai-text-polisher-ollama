# Local AI Text Polisher (Ollama)

A Firefox extension that polishes selected text through a locally-running [Ollama](https://ollama.com/) server. Highlight text on any page, pick a prompt from the right-click menu, and the polished result is copied to your clipboard.

This repository is a fork of the [AMO extension of the same name](https://addons.mozilla.org/en-US/firefox/addon/local-ai-text-polisher-ollama/) (GPL-3.0). The first commit is the canonical v1.0 source extracted from the published `.xpi`.

## Requirements

- Firefox 109 or newer.
- A running Ollama server reachable from the browser (by default `http://localhost:11434`) with at least one model pulled, e.g. `ollama pull phi4`.

## Install (development build)

The extension is not currently signed for general distribution. To run it locally:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json` from this repository.
3. Open the extension's **Preferences** to set the Ollama URL, model name, and your prompts.

Temporary add-ons are unloaded when Firefox closes. For a persistent install, package and sign an `.xpi` (see [`CLAUDE.md`](CLAUDE.md) for the `zip` command and signing notes).

## Usage

1. Select some text on any web page.
2. Right-click and choose **AI Polish Text → \<your prompt\>**.
3. A notification shows progress; on success the polished text is on your clipboard.

Prompts are system instructions sent to Ollama's chat API; your selection is the user message. Two email prompts ship by default (*Email (formal)*, *Email (informal)*); add or edit your own in **Preferences**.

## Configuration

All settings live in the extension's options page (`about:addons` → this extension → **Preferences**):

- **Ollama API URL** — base URL of your Ollama server. Saving a non-localhost URL will prompt for host permission.
- **Ollama Model Name** — must match a model already pulled in Ollama (`ollama list`).
- **Custom Prompts** — name + system-instruction pairs. The highlighted text is sent separately as the user message.

## Permissions

- `contextMenus`, `notifications` — right-click menu and progress/result notifications.
- `storage` — saving settings and prompts.
- `clipboardWrite` + `scripting` — used together to write the polished text to the clipboard via an injected snippet in the active tab.
- `<all_urls>` host permission — so the extension's content-script clipboard injection works on any page where you select text. The Ollama URL itself is granted dynamically when you save settings.

## Working on this repo with AI assistants

If you use Claude Code or another AI coding assistant in this repository, configure it to follow these rules:

- **Do not add `Co-Authored-By: Claude` (or any similar AI attribution) to commit messages, PR descriptions, or other authorship metadata.** Commit and review history should attribute changes to the human author.
- **Do not run git operations that modify the repository state without explicit user approval.** This includes `commit`, `push`, `merge`, `rebase`, `reset`, `checkout` of unrelated branches, branch deletion, tag creation, or anything that rewrites history. Reading state (`status`, `log`, `diff`, `show`) is fine. When in doubt, ask first.

## License

GPL-3.0. See [`LICENSE`](LICENSE).
