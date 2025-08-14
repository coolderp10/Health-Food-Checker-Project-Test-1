// service_worker.js
// Handles settings & simple message routing between popup and content script.

const DEFAULT_SETTINGS = {
  sugarSensitivity: 1.0, // 1.0 = neutral, >1.0 penalizes sugar more
  sodiumSensitivity: 1.0, // >1.0 penalizes sodium more
  vegetarianEmphasis: false
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(["settings"]);
  if (!stored.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "getSettings") {
    chrome.storage.sync.get(["settings"]).then(({ settings }) => {
      sendResponse({ settings: settings || DEFAULT_SETTINGS });
    });
    return true; // async response
  }
  if (msg?.type === "saveSettings") {
    chrome.storage.sync.set({ settings: msg.settings }).then(() => sendResponse({ ok: true }));
    return true;
  }
});
