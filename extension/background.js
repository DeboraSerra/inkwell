// Runs the requests, because a content script on Amazon would be blocked by CORS
// and shouldn't hold the token. Only this file and the options page read it.
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

const startImport = (tabId) => chrome.tabs.sendMessage(tabId, { type: "start-import" });

chrome.action.onClicked.addListener(async (tab) => {
  chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  const { appUrl, token } = await chrome.storage.local.get(["appUrl", "token"]);
  if (!appUrl || !token) {
    chrome.runtime.openOptionsPage();
    return;
  }
  try {
    // Already there after an earlier click; otherwise this fails and it's added.
    await startImport(tab.id);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["app.js"] });
      await startImport(tab.id);
    } catch {
      // Chrome doesn't let extensions into its own pages.
      chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
      chrome.action.setTitle({
        tabId: tab.id,
        title: "This page can't be read. Open Amazon's Manage Your Content page and click again.",
      });
    }
  }
});

const sendBatch = async (books, kind) => {
  const { appUrl, token } = await chrome.storage.local.get(["appUrl", "token"]);
  const response = await fetch(`${appUrl}/api/imports/amazon`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ books, kind }),
  }).catch(() => {
    throw new Error(`Inkwell couldn't be reached at ${appUrl}. Check that it's running.`);
  });
  if (response.status === 401) {
    throw new Error("Inkwell didn't accept the API token. Check it in the extension's options.");
  }
  if (!response.ok) throw new Error(`Inkwell answered with an error (${response.status}).`);
  return response.json();
};

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!sender.tab) return false;
  if (message.type === "import-finished") {
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: message.color });
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: message.badge });
    return false;
  }
  if (message.type !== "import-batch") return false;
  sendBatch(message.books, message.kind)
    .then((result) => reply({ result }))
    .catch((error) => reply({ error: error.message }));
  return true; // The reply comes after the request finishes.
});
