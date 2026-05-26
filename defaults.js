// defaults.js
//
// Single source of truth for the extension's default settings.
//
// Both execution contexts load this file *before* their own script:
//   - the background event page, via manifest.json's background.scripts array
//   - the options page, via a <script> tag in options/options.html
// As classic (non-module) scripts they share one global lexical scope per
// context, so the `var` below is visible to background.js and options.js.
// Keeping the defaults here avoids the two contexts drifting out of sync.

var DEFAULT_SETTINGS = {
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "gemma3-polish",
  customPrompts: [
    {
      id: "prompt-email-grammar",
      name: "Email (fix grammar)",
      text: "You are a proofreader for a non-native English writer. Correct only the grammar, spelling, word choice and punctuation of the text below, making the smallest changes needed for it to be correct and read naturally; you may reorder words within a sentence when grammar requires it. Keep every sentence the author wrote — never drop, merge, summarise or reinterpret a sentence — and do not add or remove information. Leave anything already correct unchanged. Use British English. Output only the corrected text, nothing else."
    },
    {
      id: "prompt-email-polish",
      name: "Email (polish)",
      text: "You are a copy-editor. Improve the wording of the text below so it reads clearly and naturally in British English, in a collegial, professional tone that is neither stiff nor overly formal. You may rephrase for flow, but keep every sentence the author wrote — never drop, merge, summarise or reinterpret a sentence — and do not add or remove information or change the meaning. Keep short text short. Output only the edited text, nothing else."
    },
    {
      id: "prompt-email-ukrainian",
      name: "Email (Ukrainian)",
      text: "You are my proofreader and translator. Whatever language my text is in, produce a polished version entirely in Ukrainian, in a casual, collegial tone that is not overly formal — no slang, no stiff formality. Keep my meaning; never add new information. Output only my reply in Ukrainian. No preamble, no explanation."
    }
  ]
};
