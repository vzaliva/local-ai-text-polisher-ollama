// background.js

// --- Constants ---
const CONTEXT_MENU_ID = "ollama-polish-parent";
// Default settings live in defaults.js (DEFAULT_SETTINGS), loaded before this
// script via manifest.json's background.scripts array and shared verbatim with
// the options page.

// --- Storage Helper ---
async function getSettings() {
    // Retrieve settings from storage, falling back to the shared defaults.
    const result = await browser.storage.local.get(DEFAULT_SETTINGS);
    // Ensure URL doesn't end with a slash for consistency
    if (result.ollamaUrl.endsWith('/')) {
        result.ollamaUrl = result.ollamaUrl.slice(0, -1);
    }
    return result;
  }
  
  // --- Context Menu Management ---
  async function setupContextMenu() {
    // Ensure previous menus are removed before creating new ones
    await browser.contextMenus.removeAll();
  
    const settings = await getSettings();
  
    // Create the parent menu item
    browser.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "AI Polish Text",
      contexts: ["selection"] // Show only when text is selected
    });
  
    // Create submenu items for each custom prompt
    if (settings.customPrompts && settings.customPrompts.length > 0) {
      settings.customPrompts.forEach(prompt => {
        browser.contextMenus.create({
          id: prompt.id, // Use the prompt's unique ID
          parentId: CONTEXT_MENU_ID,
          title: prompt.name,
          contexts: ["selection"]
        });
      });
    } else {
      // Add a placeholder if no prompts are configured
      browser.contextMenus.create({
        id: "no-prompts",
        parentId: CONTEXT_MENU_ID,
        title: "No prompts configured...",
        contexts: ["selection"],
        enabled: false // Disable clicking
      });
    }
  }
  
  // --- Ollama API Interaction ---
  function buildChatMessages(promptTemplate, selectedText) {
    // Legacy prompts may still contain {TEXT}; strip it — selection is always the user message.
    const systemContent = promptTemplate.replace(/\{TEXT\}/g, '').trim();
    const messages = [];
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }
    messages.push({ role: 'user', content: selectedText });
    return messages;
  }

  // Returns the polished text, or throws with a descriptive message. Progress and
  // errors are surfaced by the in-page modal, not notifications.
  async function polishTextWithOllama(text, promptTemplate, settings) {
    const apiUrl = `${settings.ollamaUrl}/api/chat`;
    const model = settings.ollamaModel;
    const messages = buildChatMessages(promptTemplate, text);

    console.log(`Sending request to Ollama: ${apiUrl} with model ${model}`);
    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: false }),
      });
    } catch (error) {
      console.error("Network error reaching Ollama:", error);
      throw new Error(`Could not reach Ollama at ${settings.ollamaUrl}. Is the server running? (${error.message})`);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error("Ollama API Error Response:", response.status, response.statusText, "Body:", errorBody);
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}. ${errorBody || ''}`.trim());
    }

    const data = await response.json();
    if (data.message?.content) {
      return data.message.content.trim();
    }
    if (data.error) {
      console.error("Ollama returned an error object:", data.error);
      throw new Error(`Ollama returned an error: ${data.error}`);
    }
    console.warn("Ollama response format unexpected:", data);
    throw new Error("Received unexpected response format from Ollama.");
  }
  
  // --- Result modal ---
  // The popup is the single feedback surface (no system notifications). It is
  // injected into the selection's frame in two steps:
  //   1. aiPolishOpenInPage — at click time, before the Ollama call: captures the
  //      replacement target (while focus/selection are intact) and shows the dialog
  //      in a "loading" phase. Opening now is also what makes feedback feel instant.
  //   2. aiPolishResolveInPage — when the response (or an error) arrives: flips the
  //      same dialog to "ready" (fills the editable text) or "error".
  // Both run in the same content-script world for the frame, so the event listeners
  // wired in step 1 (Copy/Replace, closing over the captured target) stay live.
  // Each function is serialised by executeScript and may not reference outer scope.
  function aiPolishOpenInPage(originalText, statusText, errorText) {
    const HOST_ID = "__ai_polish_modal__";

    // Capture the replacement target NOW — once this dialog renders and steals
    // focus, document.activeElement and the selection are gone. Field selections
    // aren't visible via window.getSelection(), hence the activeElement branch.
    let target = null;
    const active = document.activeElement;
    const isTextField = active && (
      active.tagName === "TEXTAREA" ||
      (active.tagName === "INPUT" &&
       /^(text|search|url|tel|password|)$/i.test(active.type)));
    if (isTextField && !active.readOnly && !active.disabled) {
      target = { kind: "field", el: active,
                 start: active.selectionStart, end: active.selectionEnd };
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        let node = sel.anchorNode;
        let ce = node && (node.nodeType === 1 ? node : node.parentElement);
        while (ce && ce !== document.body) {
          if (ce.isContentEditable) break;
          ce = ce.parentElement;
        }
        if (ce && ce.isContentEditable) {
          target = { kind: "ce", el: ce, range: sel.getRangeAt(0).cloneRange() };
        }
      }
    }
    const canReplace = !!target;

    // Remove any stale modal (double-invoke), then build a shadow-DOM dialog so
    // the page's CSS can't restyle it.
    const old = document.getElementById(HOST_ID);
    if (old) old.remove();
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5);
          display: flex; align-items: center; justify-content: center;
          font-family: system-ui, -apple-system, sans-serif; }
        .card { background: #fff; color: #1a1a1a; width: min(680px, 92vw);
          max-height: 88vh; overflow: auto; border-radius: 10px; box-sizing: border-box;
          box-shadow: 0 10px 40px rgba(0,0,0,.3); padding: 18px 20px; }
        .title { font-size: 15px; font-weight: 600; margin: 0 0 12px; }
        .label { font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .04em; color: #666; margin: 10px 0 4px; }
        .orig { white-space: pre-wrap; word-break: break-word; background: #f5f5f5;
          border: 1px solid #e2e2e2; border-radius: 6px; padding: 8px 10px;
          font-size: 13px; max-height: 160px; overflow: auto; }
        .status { display: flex; align-items: center; gap: 8px; font-size: 13px;
          color: #555; margin: 14px 0; }
        .spinner { width: 15px; height: 15px; border: 2px solid #c9d6ee;
          border-top-color: #1a73e8; border-radius: 50%; flex: none;
          animation: aip-spin .8s linear infinite; }
        @keyframes aip-spin { to { transform: rotate(360deg); } }
        textarea.edited { width: 100%; box-sizing: border-box; min-height: 120px;
          resize: vertical; font: inherit; font-size: 13px; padding: 8px 10px;
          border: 1px solid #cfcfcf; border-radius: 6px; }
        .hint { font-size: 12px; color: #9a5b00; margin-top: 8px; }
        .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
        button { font: inherit; font-size: 13px; padding: 7px 14px; border-radius: 6px;
          border: 1px solid transparent; cursor: pointer; }
        .cancel { background: #eee; color: #333; }
        .copy { background: #e8effb; color: #1a4ba0; border-color: #c4d6f5; }
        .replace { background: #1a73e8; color: #fff; }
        .replace[disabled] { background: #b9c7da; cursor: not-allowed; }
        /* phase visibility */
        .card[data-phase="ready"] .status { display: none; }
        .card[data-phase="loading"] .spinner { display: block; }
        .card[data-phase="error"] .spinner { display: none; }
        .card[data-phase="error"] .status { color: #b00020; }
        .card[data-phase="loading"] .result,
        .card[data-phase="error"] .result { display: none; }
        .card[data-phase="loading"] .copy, .card[data-phase="error"] .copy,
        .card[data-phase="loading"] .replace, .card[data-phase="error"] .replace { display: none; }
      </style>
      <div class="backdrop">
        <div class="card" role="dialog" aria-modal="true">
          <p class="title">AI Polish</p>
          <div class="label">Original</div>
          <div class="orig"></div>
          <div class="status"><span class="spinner"></span><span class="status-text"></span></div>
          <div class="result">
            <div class="label">Polished (editable)</div>
            <textarea class="edited" spellcheck="false"></textarea>
            <div class="hint" hidden>Select text in an editable field to replace it.</div>
          </div>
          <div class="actions">
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="copy">Copy to clipboard</button>
            <button type="button" class="replace">Replace</button>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    const $ = (s) => shadow.querySelector(s);
    $(".orig").textContent = originalText;
    const card = $(".card");
    if (errorText) {
      $(".status-text").textContent = errorText;
      card.setAttribute("data-phase", "error");
    } else {
      $(".status-text").textContent = statusText || "Working…";
      card.setAttribute("data-phase", "loading");
    }

    const edited = $(".edited");
    const replaceBtn = $(".replace");
    if (!canReplace) {
      replaceBtn.disabled = true;
      $(".hint").hidden = false;
    }

    // Cancel / Esc close the popup. Closing does NOT abort an in-flight Ollama
    // request (there is no messaging channel back to the background script); the
    // late result simply finds no dialog and is discarded.
    function close() {
      window.removeEventListener("keydown", onKey, true);
      if (window.__aiPolishKey === onKey) delete window.__aiPolishKey;
      host.remove();
    }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    // Drop a listener left behind by a previous popup that was re-triggered
    // before being closed, so Esc handlers don't accumulate on window.
    if (window.__aiPolishKey) {
      window.removeEventListener("keydown", window.__aiPolishKey, true);
    }
    window.__aiPolishKey = onKey;
    window.addEventListener("keydown", onKey, true);

    // Only Cancel / Esc close — a stray backdrop click must not discard edits.
    $(".cancel").addEventListener("click", close);

    $(".copy").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      try {
        await navigator.clipboard.writeText(edited.value);
        close();
      } catch (err) {
        // Keep the dialog open so the failure is visible.
        btn.textContent = "Copy failed";
        console.error("AI Polish: clipboard write failed", err);
      }
    });

    replaceBtn.addEventListener("click", () => {
      const text = edited.value;
      if (target.kind === "field") {
        const el = target.el;
        const val = el.value;
        const start = target.start, end = target.end;
        const next = val.slice(0, start) + text + val.slice(end);
        // Use the native setter so frameworks (React/Vue) observing the input
        // pick up the change instead of overwriting it on the next render.
        const proto = el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, next);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.focus();
        const caret = start + text.length;
        try { el.setSelectionRange(caret, caret); } catch (_) {}
      } else { // contenteditable: execCommand keeps the editor's undo + input events
        target.el.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(target.range);
        document.execCommand("insertText", false, text);
      }
      close();
    });
  }

  // Update an already-open dialog. No-op if the user already closed it.
  function aiPolishResolveInPage(ok, payload) {
    const host = document.getElementById("__ai_polish_modal__");
    if (!host || !host.shadowRoot) return;
    const sr = host.shadowRoot;
    const card = sr.querySelector(".card");
    if (ok) {
      const edited = sr.querySelector(".edited");
      edited.value = payload;
      card.setAttribute("data-phase", "ready");
      edited.focus();
      try { edited.setSelectionRange(payload.length, payload.length); } catch (_) {}
    } else {
      sr.querySelector(".status-text").textContent = payload;
      card.setAttribute("data-phase", "error");
    }
  }

  async function openModal(originalText, statusText, errorText, tabId, frameId) {
    try {
      await browser.scripting.executeScript({
        // Target the frame that owns the selection (e.g. webmail compose iframes),
        // not just the top frame, so we read/write the right element.
        target: { tabId, frameIds: [frameId ?? 0] },
        func: aiPolishOpenInPage,
        args: [originalText, statusText ?? null, errorText ?? null]
      });
      return true;
    } catch (error) {
      // Injection can fail on privileged pages (about:, addons.mozilla.org), where
      // the popup is impossible. errorText was meant for in-popup display and isn't
      // why injection failed, so don't surface it here — state the real cause.
      console.error("Error injecting popup:", error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: "AI Polisher",
        message: "Cannot show the AI Polish popup on this page (it may be a privileged page such as about: or addons.mozilla.org)."
      });
      return false;
    }
  }

  async function resolveModal(ok, payload, tabId, frameId) {
    try {
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [frameId ?? 0] },
        func: aiPolishResolveInPage,
        args: [ok, payload]
      });
    } catch (error) {
      console.error("Error updating popup:", error);
    }
  }
  
  // --- Event Listeners ---
  
  // Listen for clicks on our context menu items
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    // Ensure the click is on one of our items and not the parent or placeholder
    if (info.parentMenuItemId !== CONTEXT_MENU_ID || !info.menuItemId.startsWith("prompt-")) {
      return;
    }
  
    const selectedText = info.selectionText;
    if (!selectedText) {
      console.warn("No text selected.");
      return;
    }
  
    const settings = await getSettings();
    const promptId = info.menuItemId;
    const selectedPrompt = settings.customPrompts.find(p => p.id === promptId);
  
    if (!selectedPrompt) {
      console.error(`Prompt with ID ${promptId} not found.`);
      return;
    }

    // The popup lives inside the page, so we need a tab to inject into.
    if (!tab?.id) {
      console.error("AI Polisher: no tab id; cannot show popup.");
      return;
    }
    const tabId = tab.id;
    const frameId = info.frameId;
    const model = settings.ollamaModel;

    // --- Dynamic host permission for the Ollama URL ---
    // Resolve this BEFORE opening the popup so the permission prompt keeps its
    // user gesture. (Rarely shown once the localhost origin is granted.)
    let hasPermission = false;
    try {
      hasPermission = await browser.permissions.contains({
        origins: [`${settings.ollamaUrl}/*`]
      });
    } catch (permError) {
      console.error("Error checking permissions:", permError);
      await openModal(selectedText, null,
        `Invalid Ollama URL: ${settings.ollamaUrl}`, tabId, frameId);
      return;
    }
    if (!hasPermission) {
      const granted = await browser.permissions.request({
        origins: [`${settings.ollamaUrl}/*`]
      });
      if (!granted) {
        await openModal(selectedText, null,
          `Permission denied for ${settings.ollamaUrl}. Grant it on the options page.`,
          tabId, frameId);
        return;
      }
    }

    // Open the popup immediately in its loading phase, then call Ollama and
    // resolve the same popup with the result or the error.
    const opened = await openModal(selectedText, `Polishing with ${model}…`, null, tabId, frameId);
    if (!opened) return; // privileged page — notification already shown

    try {
      const polishedText = await polishTextWithOllama(selectedText, selectedPrompt.text, settings);
      await resolveModal(true, polishedText, tabId, frameId);
    } catch (error) {
      await resolveModal(false, error.message, tabId, frameId);
    }
  });
  
  // Listen for changes in storage (e.g., when settings are saved)
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.customPrompts || changes.ollamaUrl || changes.ollamaModel)) {
      console.log("Settings changed, updating context menu...");
      setupContextMenu(); // Re-create the menu with new prompts/settings
    }
  });
  
  // Initial setup when the extension starts
  browser.runtime.onInstalled.addListener(() => {
    console.log("Extension installed/updated. Setting up context menu.");
    setupContextMenu();
  });
  
  // Also setup on browser startup (in case browser was closed)
  browser.runtime.onStartup.addListener(() => {
      console.log("Browser startup. Setting up context menu.");
      setupContextMenu();
  });
  