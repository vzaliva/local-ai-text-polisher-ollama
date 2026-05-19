// background.js

// --- Constants ---
const CONTEXT_MENU_ID = "ollama-polish-parent";
const DEFAULT_OLLAMA_URL = "http://localhost:11434"; // Default Ollama URL
const DEFAULT_OLLAMA_MODEL = "phi4:latest"; // Default model

// --- Storage Helper ---
async function getSettings() {
    // Retrieve settings from storage, providing defaults if not set
    const result = await browser.storage.local.get({
      ollamaUrl: DEFAULT_OLLAMA_URL,
      ollamaModel: DEFAULT_OLLAMA_MODEL,
      customPrompts: [ // Default example prompts
        { id: "prompt-formal", name: "Make Formal", text: "Rewrite the following text in a more formal tone:\n\n{TEXT}" },
        { id: "prompt-concise", name: "Make Concise", text: "Summarize the key points of the following text concisely:\n\n{TEXT}" },
      ]
    });
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
  async function polishTextWithOllama(text, promptTemplate, settings) {
    const apiUrl = `${settings.ollamaUrl}/api/generate`;
    const model = settings.ollamaModel;
    const fullPrompt = promptTemplate.replace('{TEXT}', text); // Inject selected text
  
    // Show "Polishing..." notification
    const polishingNotificationId = await browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon-48.png"),
        title: "AI Polisher",
        message: `Polishing text using ${model}...`
    });
  
    let response; // Declare response outside try block to access in finally
    try {
      console.log(`Sending request to Ollama: ${apiUrl} with model ${model}`);
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          prompt: fullPrompt,
          stream: false // Get the full response at once
        }),
      });
  
      // *** Improved Error Handling: Check response.ok and try to get body ***
      if (!response.ok) {
        let errorBody = await response.text(); // Attempt to read body regardless of status
        console.error("Ollama API Error Response:", response.status, response.statusText, "Body:", errorBody);
        // Construct a more informative error message
        throw new Error(`Ollama API request failed: ${response.status} ${response.statusText}. Body: ${errorBody || '(empty)'}`);
      }
  
      const data = await response.json();
  
      if (data.response) {
        return data.response.trim(); // Return the polished text
      } else if (data.error) {
          // Handle cases where Ollama returns a JSON error object
          console.error("Ollama returned an error object:", data.error);
          throw new Error(`Ollama returned an error: ${data.error}`);
      } else {
          // Handle unexpected successful response format
          console.warn("Ollama response format unexpected:", data);
          throw new Error("Received unexpected response format from Ollama.");
      }
  
    } catch (error) {
      // Catch both fetch errors and errors thrown from response handling
      console.error("Error during Ollama request processing:", error);
      // Show error notification using the detailed error message
      await browser.notifications.create({
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon-48.png"),
          title: "AI Polisher Error",
          // Use error.message which now includes status and body if available
          message: `Failed to polish text: ${error.message}`
      });
      return null; // Indicate failure
    } finally {
        // Ensure the "Polishing..." notification is always cleared
        if (polishingNotificationId) {
            await browser.notifications.clear(polishingNotificationId);
        }
    }
  }
  
  // --- Clipboard Helper (Manifest V3 requires offscreen document or scripting) ---
  async function copyToClipboard(text, tabId) {
      try {
          await browser.scripting.executeScript({
              target: { tabId: tabId },
              func: (textToCopy) => {
                  // This function runs in the content script context
                  navigator.clipboard.writeText(textToCopy)
                      .then(() => console.log("Text copied to clipboard successfully."))
                      .catch(err => console.error("Content script failed to copy text:", err));
              },
              args: [text]
          });
          // Show success notification
          await browser.notifications.create({
              type: "basic",
              iconUrl: browser.runtime.getURL("icons/icon-48.png"),
              title: "AI Polisher",
              message: "Polished text copied to clipboard!"
          });
      } catch (error) {
          console.error("Error injecting clipboard script:", error);
           // Show error notification
          await browser.notifications.create({
              type: "basic",
              iconUrl: browser.runtime.getURL("icons/icon-48.png"),
              title: "AI Polisher Error",
              message: `Failed to copy to clipboard: ${error.message}`
          });
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
  
    // --- Dynamic Host Permission Check (Still useful as a fallback/check) ---
    let hasPermission = false;
    try {
        // Check if we have permission for the configured Ollama URL
        hasPermission = await browser.permissions.contains({
            origins: [`${settings.ollamaUrl}/*`]
        });
    } catch (permError) {
        console.error("Error checking permissions:", permError);
         await browser.notifications.create({
              type: "basic",
              iconUrl: browser.runtime.getURL("icons/icon-48.png"),
              title: "AI Polisher Error",
              message: `Error checking permissions for ${settings.ollamaUrl}. Is the URL valid?`
          });
        return; // Stop if URL might be invalid causing permission check error
    }
  
  
    if (!hasPermission) {
        // Request permission if missing (might happen if URL changed or was never granted)
        console.log(`Requesting permission for ${settings.ollamaUrl}`);
        const granted = await browser.permissions.request({
            origins: [`${settings.ollamaUrl}/*`]
        });
  
        if (!granted) {
            console.error(`Permission denied for Ollama URL: ${settings.ollamaUrl}`);
            await browser.notifications.create({
                type: "basic",
                iconUrl: browser.runtime.getURL("icons/icon-48.png"),
                title: "AI Polisher Permission Needed",
                message: `Permission denied for ${settings.ollamaUrl}. Please grant permission via settings or the prompt.`
            });
            // Optionally open options page: browser.runtime.openOptionsPage();
            return; // Stop processing if permission not granted
        }
        console.log(`Permission granted for ${settings.ollamaUrl}`);
    }
    // --- End Permission Check ---
  
  
    // Polish the text using Ollama
    const polishedText = await polishTextWithOllama(selectedText, selectedPrompt.text, settings);
  
    // If polishing was successful, copy to clipboard
    if (polishedText && tab?.id) {
      await copyToClipboard(polishedText, tab.id);
    } else if (!tab?.id) {
        console.error("Cannot copy to clipboard: Tab ID is missing.");
        await browser.notifications.create({
              type: "basic",
              iconUrl: browser.runtime.getURL("icons/icon-48.png"),
              title: "AI Polisher Error",
              message: "Could not identify the current tab to copy text."
          });
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
  