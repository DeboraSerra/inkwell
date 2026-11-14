// Runs the requests, because a content script on Amazon would be blocked by CORS
// and shouldn't hold the token. Only this file and the options page read it.
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

// One wording for every request to Inkwell, so the account check and the
// batches fail the same way.
const requestInkwell = async (path, init = {}) => {
  const { appUrl, token } = await chrome.storage.local.get(["appUrl", "token"]);
  const response = await fetch(`${appUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  }).catch(() => {
    throw new Error(`Inkwell couldn't be reached at ${appUrl}. Check that it's running.`);
  });
  if (response.status === 401) {
    throw new Error("Inkwell didn't accept the API token. Check it in the extension's options.");
  }
  if (!response.ok) throw new Error(`Inkwell answered with an error (${response.status}).`);
  return response.json();
};

// Imports go to the token's account, not to whoever is signed in on the site,
// so it's looked up on every click rather than remembered from setup.
const lookUpAccount = async () => {
  try {
    const { appUrl } = await chrome.storage.local.get("appUrl");
    const { email } = await requestInkwell("/api/me");
    if (typeof email !== "string" || !email) throw new Error("Inkwell didn't say which account the token belongs to.");
    return { account: { email, site: new URL(appUrl).host } };
  } catch (error) {
    return { error: error.message };
  }
};

const startImport = (tabId, lookup) => chrome.tabs.sendMessage(tabId, { type: "start-import", ...lookup });

chrome.action.onClicked.addListener(async (tab) => {
  chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  const { appUrl, token } = await chrome.storage.local.get(["appUrl", "token"]);
  if (!appUrl || !token) {
    chrome.runtime.openOptionsPage();
    return;
  }
  const lookup = await lookUpAccount();
  try {
    // Already there after an earlier click; otherwise this fails and it's added.
    await startImport(tab.id, lookup);
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["app.js"] });
      await startImport(tab.id, lookup);
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

const sendBatch = (books, kind) =>
  requestInkwell("/api/imports/amazon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ books, kind }),
  });

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
