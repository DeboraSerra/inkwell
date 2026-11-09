// In a block because this file can be injected into the same page again.
{
  const PAGE_LOAD_MS = 3000;
  const BATCH_SIZE = 100;
  const EXPECTED_URL = "/hz/mycd/digital-console/contentlist";
  // Only a first guess for the dialog: on the real page the Docs tab's address
  // didn't match the expected "/pdocs", so the reader confirms the tab.
  const DOCS_PATH = /\/(pdocs|docs)(\/|$)/i;
  const ROW_CLASS = "ListItem-module_row";
  // Kindle ASINs start with B; found in the row's element ids or links.
  const ASIN = /(?<![0-9A-Z])B[0-9A-Z]{9}(?![0-9A-Z])/;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let running = false;

  const getBanner = () => {
    let banner = document.getElementById("inkwell-import-status");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "inkwell-import-status";
      banner.style.cssText =
        "position:fixed;top:16px;right:16px;z-index:99999;max-width:360px;padding:12px 16px;" +
        "border-radius:8px;background:#111;color:#fff;font:14px sans-serif;";
      document.body.append(banner);
    }
    return banner;
  };

  const RESULTS = {
    success: { color: "#166534", icon: "\u2713", heading: "Import finished", badge: "\u2713" },
    warning: { color: "#92400e", icon: "!", heading: "Import finished with skipped books", badge: "!" },
    error: { color: "#b91c1c", icon: "\u2715", heading: "Import failed", badge: "\u2715" },
  };

  const showStatus = (text) => {
    const banner = getBanner();
    banner.style.background = "#111";
    banner.textContent = text;
  };

  // Stays until it's closed, so a long import's result isn't missed.
  const showResult = (kind, text) => {
    const { color, icon, heading, badge } = RESULTS[kind];
    const banner = getBanner();
    banner.style.background = color;
    banner.setAttribute("role", kind === "error" ? "alert" : "status");

    const title = document.createElement("strong");
    title.textContent = `${icon} ${heading}`;
    title.style.cssText = "display:block;margin-bottom:4px;font-size:16px;";
    const message = document.createElement("div");
    message.textContent = text;
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.style.marginTop = "8px";
    close.addEventListener("click", () => banner.remove());

    banner.replaceChildren(title, message, close);
    chrome.runtime.sendMessage({ type: "import-finished", badge, color });
  };

  const makeChoice = (name, value, text, checked) => {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:4px;";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = name;
    radio.value = value;
    radio.checked = checked;
    label.append(radio, text);
    return label;
  };

  // Asks which tab this is and how many pages to read. Resolves with
  // { kind, pages }, where pages is null for all of them, or with undefined if
  // cancelled. Docs become private books in Inkwell, so the tab is confirmed by
  // the reader rather than guessed from the address alone.
  const askForOptions = (guessedKind) =>
    new Promise((resolve) => {
      const form = document.createElement("form");
      form.style.cssText = "display:flex;flex-direction:column;gap:8px;margin:0;";

      const tabs = document.createElement("fieldset");
      tabs.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin:0;padding:0;border:0;";
      const legend = document.createElement("legend");
      legend.textContent = "This page lists:";
      legend.style.cssText = "padding:0;margin-bottom:4px;";
      tabs.append(
        legend,
        makeChoice("inkwell-kind", "books", "Books", guessedKind === "books"),
        makeChoice("inkwell-kind", "docs", "Docs (kept private)", guessedKind === "docs"),
      );

      const pagesRow = document.createElement("div");
      pagesRow.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;";
      const label = document.createElement("label");
      label.htmlFor = "inkwell-pages";
      label.textContent = "Pages to import, from this one (empty for all):";
      const input = document.createElement("input");
      input.id = "inkwell-pages";
      input.type = "number";
      input.min = "1";
      input.step = "1";
      input.style.cssText = "width:72px;padding:4px;color:#111;background:#fff;";
      pagesRow.append(label, input);

      const buttons = document.createElement("div");
      buttons.style.cssText = "display:flex;gap:8px;";
      const start = document.createElement("button");
      start.type = "submit";
      start.textContent = "Import";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => {
        getBanner().remove();
        resolve(undefined);
      });
      buttons.append(start, cancel);

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const kind = form.querySelector('input[name="inkwell-kind"]:checked')?.value ?? "books";
        if (input.value === "") {
          resolve({ kind, pages: null });
          return;
        }
        const pages = Number(input.value);
        if (Number.isInteger(pages) && pages >= 1) resolve({ kind, pages });
        else input.reportValidity();
      });

      form.append(tabs, pagesRow, buttons);
      getBanner().replaceChildren(form);
      input.focus();
    });

  const findAsin = (row) => {
    const candidates = [row, ...row.querySelectorAll("[id], a[href]")].flatMap((element) => [
      element.id,
      element.getAttribute("href"),
    ]);
    for (const candidate of candidates) {
      const match = candidate && ASIN.exec(candidate);
      if (match) return match[0];
    }
    return undefined;
  };

  const scrapeRow = (row) => ({
    asin: findAsin(row),
    title: row.querySelector(".digital_entity_title, .digital_entity_title_no_link")?.innerText,
    authors: row.querySelector(".information_row")?.innerText,
    coverUrl: row.querySelector("img")?.src,
  });

  const scrapePage = () => {
    const rows = Array.from(document.querySelector("table")?.querySelector("tbody")?.children ?? []);
    return rows
      .filter((row) => Array.from(row.classList).some((name) => name.startsWith(ROW_CLASS)))
      .map(scrapeRow);
  };

  const moveToNextPage = async () => {
    const next = document.querySelector(".pagination .page-item.active")?.nextElementSibling;
    if (!next) return false;
    next.click();
    await wait(PAGE_LOAD_MS);
    return true;
  };

  const scrapePages = async (maxPages) => {
    const books = [];
    let page = 0;
    do {
      books.push(...scrapePage());
      page++;
      showStatus(`Reading your Kindle library: ${books.length} books so far\u2026`);
    } while (page !== maxPages && (await moveToNextPage()));
    return books;
  };

  const sendBooks = async (books, kind) => {
    const totals = { created: 0, existing: 0, skipped: 0 };
    for (let start = 0; start < books.length; start += BATCH_SIZE) {
      showStatus(`Sending to Inkwell: ${start} of ${books.length}\u2026`);
      const { result, error } = await chrome.runtime.sendMessage({
        type: "import-batch",
        kind,
        books: books.slice(start, start + BATCH_SIZE),
      });
      if (error) throw new Error(error);
      totals.created += result.created;
      totals.existing += result.existing;
      totals.skipped += result.skipped;
    }
    return totals;
  };

  const runImport = async () => {
    if (running) return;
    if (!(globalThis.location.hostname.startsWith("www.amazon.") && globalThis.location.pathname.includes(EXPECTED_URL))) {
      showResult("error", "Open the Books or Docs tab of Manage Your Content, then click the extension again.");
      return;
    }
    running = true;
    try {
      // Guessed before scraping, while the page is still where the user started.
      const guessedKind = DOCS_PATH.test(globalThis.location.pathname) ? "docs" : "books";
      const options = await askForOptions(guessedKind);
      if (options === undefined) return;
      const { kind, pages } = options;
      const books = await scrapePages(pages);
      if (books.length === 0) {
        showResult("error", "No books found on this page. Amazon may have changed its layout.");
        return;
      }
      const { created, existing, skipped } = await sendBooks(books, kind);
      const skippedNote = skipped ? `, ${skipped} skipped` : "";
      showResult(
        skipped ? "warning" : "success",
        `${created} new, ${existing} already in library${skippedNote}.`,
      );
    } catch (error) {
      // Already-sent books are safe: importing again won't add them twice.
      showResult("error", `${error.message} Books already sent are saved, so you can run it again.`);
    } finally {
      running = false;
    }
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "start-import") runImport();
  });
}
