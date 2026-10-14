const tabStrip = document.querySelector("#tabs");
const webviewHost = document.querySelector("#webviewHost");
const homeView = document.querySelector("#homeView");
const addressInput = document.querySelector("#addressInput");
const homeSearchInput = document.querySelector("#homeSearchInput");
const settingsOverlay = document.querySelector("#settingsOverlay");
const tabs = [];
let activeTabId = null;
let settings = { searchEngine: "google", adBlock: true };
let bookmarks = JSON.parse(localStorage.getItem("noir-bookmarks") || "[]");
let history = JSON.parse(localStorage.getItem("noir-history") || "[]");

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function searchUrl(query) {
  const base = settings.searchEngine === "yandex" ? "https://yandex.ru/search/?text=" : "https://www.google.com/search?q=";
  return base + encodeURIComponent(query);
}

function resolveAddress(value) {
  const input = value.trim();
  if (!input) return "";
  if (/^https?:\/\//i.test(input)) return input;
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) return searchUrl(input);
  if (!/\s/.test(input) && (input === "localhost" || input.includes(".") || input.startsWith("["))) {
    return "https://" + input;
  }
  return searchUrl(input);
}

function currentPageTitle(tab) {
  if (!tab.url) return "Новая вкладка";
  try { return new URL(tab.url).hostname.replace(/^www\./, ""); } catch { return "Новая вкладка"; }
}

function renderTabs() {
  tabStrip.replaceChildren();
  for (const tab of tabs) {
    const button = document.createElement("button");
    button.className = "tab" + (tab.id === activeTabId ? " active" : "");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.id === activeTabId));
    button.title = tab.title || currentPageTitle(tab);

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.loading ? "Загрузка…" : (tab.title || currentPageTitle(tab));
    button.append(title);

    const close = document.createElement("span");
    close.className = "tab-close";
    close.textContent = "×";
    close.title = "Закрыть вкладку";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });
    button.append(close);
    button.addEventListener("click", () => activateTab(tab.id));
    tabStrip.append(button);
  }
}

function createTab(url = "") {
  const tab = { id: crypto.randomUUID(), title: "", url, loading: false, view: null };
  tabs.push(tab);
  if (url) createWebview(tab);
  activateTab(tab.id);
  return tab;
}

function createWebview(tab) {
  if (tab.view) return tab.view;
  const view = document.createElement("webview");
  view.className = "browser-tab";
  view.setAttribute("partition", "persist:noir-browser");
  view.setAttribute("webpreferences", "contextIsolation=yes,nodeIntegration=no,sandbox=yes");
  view.setAttribute("allowpopups", "false");
  view.src = tab.url;
  view.addEventListener("did-start-loading", () => {
    tab.loading = true;
    renderTabs();
  });
  view.addEventListener("did-stop-loading", () => {
    tab.loading = false;
    if (activeTabId === tab.id) updateNavigationState();
    renderTabs();
  });
  view.addEventListener("page-title-updated", (event) => {
    tab.title = event.title;
    renderTabs();
  });
  view.addEventListener("did-navigate", (_event) => {
    tab.url = view.getURL();
    tab.title = "";
    addHistory(tab.url);
    if (activeTabId === tab.id) {
      addressInput.value = tab.url;
      updateNavigationState();
    }
    renderTabs();
  });
  view.addEventListener("did-navigate-in-page", (_event) => {
    tab.url = view.getURL();
    if (activeTabId === tab.id) addressInput.value = tab.url;
  });
  view.addEventListener("did-fail-load", (event) => {
    if (event.errorCode !== -3 && activeTabId === tab.id) {
      document.querySelector("#homeStatus").textContent = "Не удалось открыть страницу: " + event.errorDescription;
    }
  });
  tab.view = view;
  webviewHost.append(view);
  return view;
}

function activateTab(id) {
  activeTabId = id;
  const tab = activeTab();
  for (const item of tabs) item.view?.classList.toggle("inactive", item.id !== id);
  const showHome = !tab || !tab.url;
  homeView.classList.toggle("hidden", !showHome);
  webviewHost.classList.toggle("hidden", showHome);
  addressInput.value = tab?.url || "";
  renderTabs();
  updateNavigationState();
  if (showHome) homeSearchInput.focus();
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  tabs[index].view?.remove();
  tabs.splice(index, 1);
  if (tabs.length === 0) {
    createTab();
    return;
  }
  if (activeTabId === id) activateTab(tabs[Math.max(0, index - 1)].id);
  else renderTabs();
}

function navigate(value) {
  const url = resolveAddress(value);
  if (!url) return;
  let tab = activeTab();
  if (!tab) tab = createTab();
  tab.url = url;
  tab.title = "";
  const view = createWebview(tab);
  if (view.getURL() !== url) view.loadURL(url);
  homeView.classList.add("hidden");
  webviewHost.classList.remove("hidden");
  addressInput.value = url;
  renderTabs();
}

function updateNavigationState() {
  const view = activeTab()?.view;
  document.querySelector("#backButton").disabled = !view?.canGoBack();
  document.querySelector("#forwardButton").disabled = !view?.canGoForward();
}

function addHistory(url) {
  if (!/^https?:\/\//i.test(url)) return;
  history = [{ url, visitedAt: Date.now() }, ...history.filter((entry) => entry.url !== url)].slice(0, 300);
  localStorage.setItem("noir-history", JSON.stringify(history));
}

function updateEngineButtons() {
  document.querySelectorAll(".engine-choice").forEach((button) => {
    button.classList.toggle("active", button.dataset.engine === settings.searchEngine);
  });
}

function renderBookmarks() {
  const list = document.querySelector("#bookmarkList");
  list.replaceChildren();
  if (bookmarks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Пока нет закладок";
    list.append(empty);
    return;
  }
  for (const bookmark of bookmarks) {
    const row = document.createElement("div");
    row.className = "bookmark-item";
    const open = document.createElement("button");
    open.className = "bookmark-item";
    open.textContent = bookmark.title;
    open.title = bookmark.url;
    open.addEventListener("click", () => navigate(bookmark.url));
    const remove = document.createElement("button");
    remove.className = "bookmark-remove";
    remove.textContent = "×";
    remove.title = "Удалить закладку";
    remove.addEventListener("click", () => {
      bookmarks = bookmarks.filter((item) => item.url !== bookmark.url);
      localStorage.setItem("noir-bookmarks", JSON.stringify(bookmarks));
      renderBookmarks();
    });
    row.append(open, remove);
    list.append(row);
  }
}

function addBookmark() {
  const tab = activeTab();
  if (!tab?.url) return;
  if (!bookmarks.some((item) => item.url === tab.url)) {
    bookmarks.push({ title: tab.title || currentPageTitle(tab), url: tab.url });
    localStorage.setItem("noir-bookmarks", JSON.stringify(bookmarks));
  }
  renderBookmarks();
  document.querySelector("#bookmarkButton").textContent = "★";
  setTimeout(() => { document.querySelector("#bookmarkButton").textContent = "☆"; }, 900);
}

async function refreshSettings() {
  settings = await window.noir.getSettings();
  document.querySelector("#engineSelect").value = settings.searchEngine;
  document.querySelector("#adBlockToggle").checked = settings.adBlock;
  document.querySelector("#adblockIndicator").classList.toggle("off", !settings.adBlock);
  document.querySelector("#homeStatus").textContent = settings.adBlock ? "Защита от рекламы включена" : "Блокировка рекламы выключена";
  updateEngineButtons();
}

async function renderExtensions() {
  const list = document.querySelector("#extensionList");
  list.replaceChildren();
  const extensions = await window.noir.getExtensions();
  if (extensions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Расширения не установлены";
    list.append(empty);
    return;
  }
  for (const extension of extensions) {
    const row = document.createElement("div");
    row.className = "extension-row";
    const title = document.createElement("span");
    title.textContent = `${extension.name} · ${extension.version}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Удалить";
    remove.addEventListener("click", async () => {
      await window.noir.removeExtension(extension.id);
      renderExtensions();
    });
    row.append(title, remove);
    list.append(row);
  }
}

document.querySelector("#newTab").addEventListener("click", () => createTab());
document.querySelector("#addressForm").addEventListener("submit", (event) => {
  event.preventDefault();
  navigate(addressInput.value);
});
document.querySelector("#homeSearchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  navigate(homeSearchInput.value);
});
document.querySelector("#backButton").addEventListener("click", () => activeTab()?.view?.goBack());
document.querySelector("#forwardButton").addEventListener("click", () => activeTab()?.view?.goForward());
document.querySelector("#reloadButton").addEventListener("click", () => activeTab()?.view?.reload());
document.querySelector("#bookmarkButton").addEventListener("click", addBookmark);
document.querySelector("#addBookmarkShortcut").addEventListener("click", addBookmark);
document.querySelector("#bookmarksButton").addEventListener("click", () => document.querySelector("#bookmarksPopover").classList.toggle("hidden"));
document.querySelector(".close-popover").addEventListener("click", () => document.querySelector("#bookmarksPopover").classList.add("hidden"));
document.querySelector("#downloadsButton").addEventListener("click", () => window.noir.showDownloads());
document.querySelector("#openDownloads").addEventListener("click", () => window.noir.showDownloads());
document.querySelector("#settingsButton").addEventListener("click", async () => {
  await refreshSettings();
  await renderExtensions();
  settingsOverlay.classList.remove("hidden");
});
document.querySelector("#closeSettings").addEventListener("click", () => settingsOverlay.classList.add("hidden"));
settingsOverlay.addEventListener("click", (event) => {
  if (event.target === settingsOverlay) settingsOverlay.classList.add("hidden");
});
document.querySelector("#engineSelect").addEventListener("change", async (event) => {
  settings = await window.noir.saveSettings({ ...settings, searchEngine: event.target.value });
  updateEngineButtons();
});
document.querySelector("#adBlockToggle").addEventListener("change", async (event) => {
  settings = await window.noir.saveSettings({ ...settings, adBlock: event.target.checked });
  await refreshSettings();
});
document.querySelector("#installExtension").addEventListener("click", async () => {
  const result = await window.noir.installExtension();
  if (result.error) window.alert(result.error);
  await renderExtensions();
});
document.querySelectorAll(".engine-choice").forEach((button) => {
  button.addEventListener("click", async () => {
    settings = await window.noir.saveSettings({ ...settings, searchEngine: button.dataset.engine });
    updateEngineButtons();
    homeSearchInput.focus();
  });
});
document.querySelectorAll(".quick-links [data-url]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.url));
});

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "t") {
    event.preventDefault();
    createTab();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
    event.preventDefault();
    if (activeTabId) closeTab(activeTabId);
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
    event.preventDefault();
    addressInput.focus();
    addressInput.select();
  } else if (event.key === "Escape") {
    settingsOverlay.classList.add("hidden");
  }
});

window.noir.onDownload(({ name, state }) => {
  const message = state === "completed" ? `Скачано: ${name}` : state === "started" ? `Загрузка: ${name}` : `Загрузка прервана: ${name}`;
  document.querySelector("#downloadStatus").textContent = message;
});
window.noir.onNewTab((url) => createTab(url));

window.addEventListener("DOMContentLoaded", async () => {
  await refreshSettings();
  renderBookmarks();
  createTab();
});