// options.js

const form = document.getElementById('settings-form');
const ollamaUrlInput = document.getElementById('ollama-url');
const ollamaModelInput = document.getElementById('ollama-model');
const promptsListDiv = document.getElementById('prompts-list');
const addPromptBtn = document.getElementById('add-prompt-btn');
const promptTemplate = document.getElementById('prompt-template');
const statusMessage = document.getElementById('status-message');

// --- Functions ---

function displayStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = isError ? 'status-message error' : 'status-message success';
    // Clear the message after a few seconds
    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = 'status-message';
    }, 3000);
}

function addPromptEntry(prompt = { id: '', name: '', text: '' }) {
    const newPromptEntry = promptTemplate.cloneNode(true);
    newPromptEntry.style.display = 'block'; // Make it visible
    newPromptEntry.removeAttribute('id'); // Remove template ID

    // Generate a unique ID if it's a new prompt
    const promptId = prompt.id || `prompt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    newPromptEntry.dataset.id = promptId; // Store ID in data attribute

    const nameInput = newPromptEntry.querySelector('.prompt-name');
    const textInput = newPromptEntry.querySelector('.prompt-text');
    const removeBtn = newPromptEntry.querySelector('.remove-prompt-btn');

    nameInput.value = prompt.name;
    textInput.value = prompt.text;

    // Add event listener for the remove button
    removeBtn.addEventListener('click', () => {
        newPromptEntry.remove(); // Remove the element from the DOM
    });

    promptsListDiv.appendChild(newPromptEntry);
}

async function loadSettings() {
    console.log("Loading settings...");
    // Defaults come from the shared defaults.js (DEFAULT_SETTINGS), loaded
    // before this script in options.html so both contexts stay in sync.
    const result = await browser.storage.local.get(DEFAULT_SETTINGS);

    console.log("Settings loaded:", result);
    ollamaUrlInput.value = result.ollamaUrl;
    ollamaModelInput.value = result.ollamaModel;

    // Clear existing prompts before loading new ones
    promptsListDiv.innerHTML = '';
    if (result.customPrompts && result.customPrompts.length > 0) {
        result.customPrompts.forEach(prompt => addPromptEntry(prompt));
    } else {
        // Add one blank prompt entry if none exist
        addPromptEntry();
    }
}

async function saveSettings(event) {
    event.preventDefault(); // Prevent default form submission
    console.log("Saving settings...");

    const prompts = [];
    const promptEntries = promptsListDiv.querySelectorAll('.prompt-entry');

    promptEntries.forEach(entry => {
        const nameInput = entry.querySelector('.prompt-name');
        const textInput = entry.querySelector('.prompt-text');
        const id = entry.dataset.id; // Get the unique ID

        // Only save if both name and text are provided
        if (nameInput.value.trim() && textInput.value.trim() && id) {
            prompts.push({
                id: id,
                name: nameInput.value.trim(),
                text: textInput.value.trim()
            });
        } else {
            console.warn("Skipping incomplete prompt entry:", entry);
        }
    });

    // Basic validation for URL
    let urlValue = ollamaUrlInput.value.trim();
     if (urlValue.endsWith('/')) {
      urlValue = urlValue.slice(0, -1); // Remove trailing slash
    }

    if (!urlValue || !ollamaModelInput.value.trim()) {
        displayStatus("Ollama URL and Model Name cannot be empty.", true);
        return;
    }

    try {
        // Validate URL format (simple check)
        new URL(urlValue);
    } catch (e) {
        displayStatus("Invalid Ollama URL format.", true);
        return;
    }


    const settings = {
        ollamaUrl: urlValue,
        ollamaModel: ollamaModelInput.value.trim(),
        customPrompts: prompts
    };

    try {
        // --- Dynamic Host Permission Request on Save ---
        // Check if we need to request permission for the new URL
        const hasPermission = await browser.permissions.contains({
            origins: [`${settings.ollamaUrl}/*`]
        });

        let permissionGranted = hasPermission;
        if (!hasPermission) {
            console.log(`Requesting permission for ${settings.ollamaUrl}`);
            permissionGranted = await browser.permissions.request({
                origins: [`${settings.ollamaUrl}/*`]
            });
        }
        // --- End Permission Request ---

        if (permissionGranted) {
            await browser.storage.local.set(settings);
            console.log("Settings saved:", settings);
            displayStatus("Settings saved successfully!");
            // The background script's storage listener will handle updating the context menu
        } else {
             console.error(`Permission denied for saving settings with URL: ${settings.ollamaUrl}`);
             displayStatus("Permission denied for Ollama URL. Settings not saved.", true);
        }

    } catch (error) {
        console.error("Error saving settings:", error);
        displayStatus(`Error saving settings: ${error.message}`, true);
    }
}

// --- Event Listeners ---

// Load settings when the options page opens
document.addEventListener('DOMContentLoaded', loadSettings);

// Handle form submission
form.addEventListener('submit', saveSettings);

// Handle adding a new prompt
addPromptBtn.addEventListener('click', () => {
    addPromptEntry(); // Add a blank entry
});
