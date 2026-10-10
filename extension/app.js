const BASE_URL = "https://www.amazon.";
const EXPECTED_URL = "/hz/mycd/digital-console/contentlist";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const books = [];

const checkUrl = () => {
  if (
    !globalThis.location.href.startsWith(BASE_URL) ||
    !globalThis.location.href.includes(EXPECTED_URL)
  ) {
    alert("This extension only works on Amazon Kindle Content page.");
    return false;
  }
  return true;
};

const sendToPage = async (data) => {
  try {
    await navigator?.clipboard?.writeText(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Failed to copy:", error);
  }
};

const scrapeDocTitles = async (list) => {
  list.forEach((row) => {
    const img = row.querySelector("img");
    const title = row.querySelector(".digital_entity_title_no_link").innerText;
    const author = row.querySelector(".information_row").innerText;
    books.push({ title, author, img: img.src });
  });
  console.log("scraped books: ", books.length);
  const nextPage = await moveToNextPage();
  if (nextPage) {
    scrapeBookTitles();
  } else {
    console.log("No more pages.");
    console.log("Total books scraped: ", books.length);
    console.log("All books scraped: ", books);
    sendToPage(books);
  }
};

const scrapeBookTitles = async () => {
  if (!checkUrl()) return;
  const bookClass = "ListItem-module_row";
  const booksList = Array.from(
    document.querySelector("table").querySelector("tbody").children
  );
  const bookRows = booksList.filter((row) =>
    Array.from(row.classList).some((cls) => cls.startsWith(bookClass))
  );
  if (globalThis.location.href.includes("pdocs")) return scrapeDocTitles(bookRows);
  bookRows.forEach((row) => {
    const img = row.querySelector("img");
    const title = row.querySelector(".digital_entity_title").innerText;
    const author = row.querySelector(".information_row").innerText;
    books.push({ title, author, img: img.src });
  });
  console.log("scraped books: ", books.length);
  const nextPage = await moveToNextPage();
  console.log({ nextPage });
  if (nextPage) {
    scrapeBookTitles();
  } else {
    console.log("No more pages.");
    console.log("Total books scraped: ", books.length);
    console.log("All books scraped: ", books);
    sendToPage(books);
  }
};

const moveToNextPage = async () => {
  const pagination = document.querySelector(".pagination");
  const currentPage = pagination.querySelector(".page-item.active");
  const nextPage = currentPage.nextElementSibling;
  console.log({ pagination, currentPage, nextPage });
  if (nextPage) {
    nextPage.click();
    await wait(3000); // wait for page to load
    return true;
  }
  return false;
};
