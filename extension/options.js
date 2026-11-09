const form = document.getElementById("form");
const appUrlInput = document.getElementById("appUrl");
const tokenInput = document.getElementById("token");
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

chrome.storage.local.get(["appUrl", "token"]).then(({ appUrl, token }) => {
  appUrlInput.value = appUrl ?? DEFAULT_APP_URL;
  tokenInput.value = token ?? "";
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const appUrl = parseOrigin(appUrlInput.value);
  const token = tokenInput.value.trim();
  if (!appUrl) {
    result.textContent = "The app URL must start with https://, or http://localhost for local use.";
    return;
  }

  // Chrome only shows its prompt while the click is still being handled, and
  // `contains` is fast enough to keep it so.
  if (!(await allowAddress(appUrl))) {
    result.textContent = `Chrome can't reach that address from this extension. Use ${DEFAULT_APP_URL}.`;
    return;
  }

  await chrome.storage.local.set({ appUrl, token });
  try {
    const response = await fetch(`${appUrl}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      result.textContent = "Saved, but Inkwell didn't accept that token.";
      return;
    }
    const { email } = await response.json();
    result.textContent = `Saved. Connected as ${email}.`;
  } catch {
    result.textContent = "Saved, but Inkwell couldn't be reached at that address.";
  }
});
