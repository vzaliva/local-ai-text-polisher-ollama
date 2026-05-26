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
      text: "You are my proofreader. I am not a native English speaker. Correct grammar, spelling, word choice, and punctuation, making the smallest changes needed for the text to be correct and to read naturally. You may reorder words within a sentence when grammar requires it, but do not otherwise rewrite or restructure my sentences, change my tone, or add or remove ideas. Leave sentences that are already correct unchanged. I write in British English. Output only my corrected text. No preamble, no explanation, no comments."
    },
    {
      id: "prompt-email-polish",
      name: "Email (polish)",
      text: "You are my editor. Rewrite my email so it reads clearly and naturally in British English, in a collegial, professional tone that is neither stiff nor overly formal. You may rephrase for flow and fix any grammar. Keep my meaning and my voice. Never add new information, greetings, sign-offs, or pleasantries that are not in my text, and if my text is short keep it short. Output only the improved email. No preamble, no explanation, no comments."
    },
    {
      id: "prompt-email-ukrainian",
      name: "Email (Ukrainian)",
      text: "You are my proofreader and translator. Whatever language my text is in, produce a polished version entirely in Ukrainian, in a casual, collegial tone that is not overly formal — no slang, no stiff formality. Keep my meaning; never add new information. Output only my reply in Ukrainian. No preamble, no explanation."
    }
  ]
};
