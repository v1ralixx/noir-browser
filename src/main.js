const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");
const fetch = require("cross-fetch");

const profile = session.fromPartition("persist:noir-browser");
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
const defaultSettings = { searchEngine: "google", adBlock: true, extensionPaths: [] };
let settings = { ...defaultSettings };
let blocker = null;
let mainWindow = null;
const loadedExtensionPaths = new Map();

function loadSettings() {
  try {
    const stored = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    settings = {
      searchEngine: stored.searchEngine === "yandex" ? "yandex" : "google",
      adBlock: stored.adBlock !== false,
      extensionPaths: Array.isArray(stored.extensionPaths) ? stored.extensionPaths.filter((item) => typeof item === "string") : [],
    };
  } catch {
    settings = { ...defaultSettings };
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

async function enableAdBlock() {
  if (!blocker) {
    const cachePath = path.join(app.getPath("userData"), "filters.bin");
    try {
      if (fs.existsSync(cachePath)) {
        blocker = ElectronBlocker.deserialize(fs.readFileSync(cachePath));
      } else {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
        fs.writeFileSync(cachePath, blocker.serialize());
      }
    } catch (error) {
      console.error("Could not initialize the ad blocker:", error);
      return false;
    }
  }

  blocker.enableBlockingInSession(profile);
  return true;
}

async function loadExtensions() {
  const loaded = [];
  for (const extensionPath of settings.extensionPaths) {
    try {
      if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) continue;
      const extension = await profile.extensions.loadExtension(extensionPath);
      loadedExtensionPaths.set(extension.id, extensionPath);
      loaded.push(extension.id);
    } catch (error) {
      console.warn(`Could not load extension at ${extensionPath}:`, error.message);
    }
  }
  return loaded;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 880,
    minHeight: 620,
    backgroundColor: "#111111",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.noirbrowser.app");
  loadSettings();
  createWindow();

  if (settings.adBlock) {
    const enabled = await enableAdBlock();
    if (!enabled) settings.adBlock = false;
  }
  await loadExtensions();

  profile.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = new Set(["fullscreen", "media", "notifications", "clipboard-sanitized-write"]);
    if (!allowed.has(permission)) return callback(false);
    let hostname = "this website";
    try { hostname = new URL(webContents.getURL()).hostname || hostname; } catch { return callback(false); }
    dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Allow", "Block"],
      defaultId: 1,
      cancelId: 1,
      title: "Website permission",
      message: `${hostname} requests ${permission} permission.`,
    }).then(({ response }) => callback(response === 0));
  });

  profile.on("will-download", (event, item) => {
    const name = item.getFilename();
    const destination = path.join(app.getPath("downloads"), name);
    item.setSavePath(destination);
    mainWindow?.webContents.send("download:status", { name, state: "started" });
    item.once("done", (_downloadEvent, state) => {
      mainWindow?.webContents.send("download:status", { name, state });
    });
  });

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://") || url.startsWith("http://")) {
        mainWindow?.webContents.send("browser:new-tab", url);
      }
      return { action: "deny" };
    });
    contents.on("will-navigate", (event, url) => {
      if (!url.startsWith("https://") && !url.startsWith("http://")) {
        event.preventDefault();
      }
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("settings:get", () => ({ searchEngine: settings.searchEngine, adBlock: settings.adBlock }));

ipcMain.handle("settings:save", async (_event, incoming) => {
  settings.searchEngine = incoming?.searchEngine === "yandex" ? "yandex" : "google";
  settings.adBlock = Boolean(incoming?.adBlock);
  if (settings.adBlock) {
    const enabled = await enableAdBlock();
    if (!enabled) settings.adBlock = false;
  } else if (blocker) {
    blocker.disableBlockingInSession(profile);
  }
  saveSettings();
  return { searchEngine: settings.searchEngine, adBlock: settings.adBlock };
});

ipcMain.handle("extensions:list", () => profile.extensions.getAllExtensions().map(({ id, name, version }) => ({ id, name, version })));

ipcMain.handle("extensions:install", async () => {
  const choice = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (choice.canceled || !choice.filePaths[0]) return { canceled: true };
  const extensionPath = choice.filePaths[0];
  if (!fs.existsSync(path.join(extensionPath, "manifest.json"))) {
    return { error: "Выбери распакованную папку расширения с файлом manifest.json." };
  }
  try {
    const extension = await profile.extensions.loadExtension(extensionPath);
    loadedExtensionPaths.set(extension.id, extensionPath);
    if (!settings.extensionPaths.includes(extensionPath)) settings.extensionPaths.push(extensionPath);
    saveSettings();
    return { extension: { id: extension.id, name: extension.name, version: extension.version } };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle("extensions:remove", (_event, id) => {
  if (typeof id !== "string") return false;
  const extension = profile.extensions.getExtension(id);
  if (!extension) return false;
  profile.extensions.removeExtension(id);
  const extensionPath = loadedExtensionPaths.get(id);
  loadedExtensionPaths.delete(id);
  settings.extensionPaths = settings.extensionPaths.filter((savedPath) => savedPath !== extensionPath);
  saveSettings();
  return true;
});

ipcMain.handle("downloads:open", () => shell.openPath(app.getPath("downloads")));