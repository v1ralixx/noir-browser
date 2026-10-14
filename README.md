# Noir Browser

A compact monochrome desktop browser for Windows 10 and 11, built on Electron and Chromium.

## Features

- Tabs, back/forward, reload, home, and an address/search bar.
- Choose Google or Yandex for search queries.
- Built-in ad and tracker blocking powered by Ghostery's open-source filter engine.
- Import unpacked Chromium extensions from a local folder.
- Persistent browser profile, bookmarks, settings, and download notifications.
- An installer build and an optional portable build.

## Requirements

- Windows 10 or Windows 11. Current Chromium-based browsers no longer support Windows 7 or 8; this project does not ship an obsolete browser engine.
- Node.js 24 or a compatible supported release for development and packaging.

## Run from source

```powershell
npm install
npm start
```

Build the Windows installer with `npm run dist`. The installer is written to `artifacts/`. Use `npm run dist:portable` for a portable executable.

## Extensions

Use **Settings → Install unpacked extension** to choose an extracted Chromium extension folder containing `manifest.json`. Electron implements only part of the Chrome extension API. An extension may fail or have limited functionality; compatibility with AdGuard, SaveFrom, or any other specific extension is not guaranteed. Packed `.crx` files and the Chrome Web Store are not supported by the extension loader.

## Limits

No browser can guarantee access to every blocked website. Noir Browser does not include a VPN, proxy, or network-block bypass. A site's availability depends on the user's network and local rules.

Browser rendering does not have a user-settable 60–1000 FPS mode. Smoothness depends on the page, device, Chromium, and display refresh rate; this app does not claim to override those limits.

## Security and releases

The app uses Chromium's default certificate checks and a sandboxed UI renderer. Install only extensions you trust. Release artifacts should be built from reviewed source and signed before broad distribution; this project currently has no code-signing certificate.

## License

The source code is available under the MIT License. Electron and other dependencies retain their own licenses.