# Form AutoFill Saver

A Chrome extension (Manifest V3) that saves the values of every form field on a page and refills them later with one click — built for repeatedly testing the same forms during development/QA.

## Features

- **Capture all fields** — text, checkbox, radio, select, textarea (file inputs are skipped since they can't be set programmatically).
- **Named profiles** — save multiple profiles per page, switch between them.
- **Scoped saving** — save per exact URL or per path (`origin + pathname`), toggled via a checkbox.
- **Two views** — *This page* (profiles relevant to the current tab) and *All profiles* (every saved profile across all sites).
- **Open & fill** — from the *All profiles* view, open any saved site in a new tab and auto-fill it, with retries while the page finishes rendering (handles SPA/dynamic forms).
- **Framework-friendly fill** — dispatches `input`/`change` events after setting values so React/Vue-controlled inputs pick up the change.
- **Dedup-safe storage** — saving with an existing profile name overwrites it instead of creating a duplicate; a cleanup pass removes any stray dupes on popup open.

## How it works

| File | Role |
|---|---|
| [manifest.json](manifest.json) | MV3 manifest — permissions (`storage`, `activeTab`, `scripting`, `tabs`), popup action. |
| [popup.html](popup.html) | Popup UI markup/styles. |
| [popup.js](popup.js) | Popup logic — profile CRUD, tab switching, `chrome.storage.local` reads/writes, injects `content.js` via `chrome.scripting.executeScript`. |
| [content.js](content.js) | Runs in the page context. Builds a stable key per field (`id:` → `name:` → `idx:tag:position`) and exposes `window.__formAutoFillCapture()` / `window.__formAutoFillApply(data)`. |

Profiles are stored in `chrome.storage.local` under keys shaped like `profiles::<origin><pathname>` (or `profiles::<href>` when "exact URL" scope is used), each holding an array of `{ name, data, savedAt }` objects.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. Pin the **Form AutoFill Saver** icon to the toolbar.

## Usage

1. Fill out a form on any page.
2. Click the extension icon, type a profile name, and hit **Save**.
3. Choose **exact URL** scope if you want the profile tied to that specific page only (default is path-based, so it matches any query-string variant of the same path).
4. To refill: open the popup on a matching page → **This page** tab → click the check/fill icon next to the profile.
5. To refill on a different tab/site: switch to **All profiles** → click the open-and-fill icon to launch the page in a new tab and auto-fill it.
6. Delete unwanted profiles with the trash icon.

## Notes / limitations

- Password fields are captured (marked `isPassword: true`) for testing convenience — be mindful of where you load this extension if forms contain real credentials.
- File inputs cannot be auto-filled (browser security restriction).
- Field matching relies on `id` → `name` → tag+index fallback, so heavily dynamic DOMs (no stable id/name) may not match reliably across page loads.
