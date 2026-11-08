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

chrome.storage.local.get(["appUrl", "token"]).then(({ appUrl, token }) => {
  appUrlInput.value = appUrl ?? "";
  tokenInput.value = token ?? "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const appUrl = parseOrigin(appUrlInput.value);
  const token = tokenInput.value.trim();
  if (!appUrl) {
    result.textContent = "The app URL must start with https://, or http://localhost for local use.";
    return;
  }

  // Must come before any other await: Chrome only asks during the click itself.
  // Local addresses are already allowed by the manifest.
  if (appUrl.startsWith("https:") && !(await chrome.permissions.request({ origins: [`${appUrl}/*`] }))) {
    result.textContent = "Chrome needs permission to reach that address.";
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
