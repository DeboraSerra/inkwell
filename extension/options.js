const form = document.getElementById("form");
const appUrlInput = document.getElementById("appUrl");
const tokenInput = document.getElementById("token");
const saveButton = document.getElementById("save");
const settingsLink = document.getElementById("settingsLink");
const result = document.getElementById("result");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// The token travels to this address, so it must be encrypted unless it stays on
// this computer.
const parseOrigin = (value) => {
  try {
    const url = new URL(value.trim());
    const allowed = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
    return allowed ? url.origin : null;
  } catch {
    return null;
  }
};

const DEFAULT_APP_URL = globalThis.INKWELL_DEFAULT_APP_URL;
appUrlInput.placeholder = DEFAULT_APP_URL;

// Tokens are created on the settings page of the address being typed in, or
// of the default one until that address is valid.
const updateSettingsLink = () => {
  settingsLink.href = `${parseOrigin(appUrlInput.value) ?? DEFAULT_APP_URL}/settings`;
};
appUrlInput.addEventListener("input", updateSettingsLink);
updateSettingsLink();

// Every part is set as text: the email comes from the server.
const showResult = (kind, title, detail, email) => {
  const parts = [Object.assign(document.createElement("p"), { className: "result-title", textContent: title })];
  if (email) parts.push(Object.assign(document.createElement("p"), { className: "result-email", textContent: email }));
  if (detail) parts.push(Object.assign(document.createElement("p"), { className: "result-detail", textContent: detail }));
  result.dataset.kind = kind;
  result.replaceChildren(...parts);
};

chrome.storage.local.get(["appUrl", "token"]).then(({ appUrl, token }) => {
  appUrlInput.value = appUrl ?? DEFAULT_APP_URL;
  tokenInput.value = token ?? "";
  updateSettingsLink();
});

// The manifest already allows the default address (and localhost in
// development), so Chrome only needs asking for another one. The store build
// allows no other address, and asking for one throws.
const allowAddress = async (appUrl) => {
  const origins = [`${appUrl}/*`];
  if (await chrome.permissions.contains({ origins })) return true;
  try {
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
};

const testConnection = async (appUrl, token) => {
  let response;
  try {
    response = await fetch(`${appUrl}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    showResult("error", "Saved, but Inkwell couldn't be reached", `Check the address, and that Inkwell is running at ${appUrl}.`);
    return;
  }
  if (response.status === 401) {
    showResult("error", "Saved, but the token wasn't accepted", "Create a new API token in Inkwell's Settings and paste it here.");
    return;
  }
  if (!response.ok) {
    showResult("error", "Saved, but Inkwell answered with an error", `It replied with status ${response.status}. Try again in a moment.`);
    return;
  }
  const { email } = await response.json().catch(() => ({}));
  if (typeof email === "string" && email) {
    showResult("success", "Connected as", "Saved. Imports will go to this account.", email);
  } else {
    showResult("error", "Saved, but Inkwell didn't say which account this is", "Try again, or create a new API token.");
  }
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const appUrl = parseOrigin(appUrlInput.value);
  const token = tokenInput.value.trim();
  if (!appUrl) {
    showResult("error", "Check the app URL", "It must start with https://, or http://localhost for local use.");
    appUrlInput.focus();
    return;
  }

  // Chrome only shows its prompt while the click is still being handled, and
  // `contains` is fast enough to keep it so.
  if (!(await allowAddress(appUrl))) {
    showResult("error", "Chrome can't reach that address from this extension", `Use ${DEFAULT_APP_URL}.`);
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Testing…";
  try {
    await chrome.storage.local.set({ appUrl, token });
    await testConnection(appUrl, token);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save and test";
  }
});
