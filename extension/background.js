chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: setup,
    args: [tab],
  });
});

function setup() {
	scrapeBookTitles();
};
