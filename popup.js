// popup.js

let currentTabId = null;
let currentUrlObj = null;
let currentView = "page"; // "page" | "all"

function pageKey(exact) {
  // storage key for this page: hostname+pathname (default) or full href (exact)
  if (!currentUrlObj) return "";
  return exact ? currentUrlObj.href : currentUrlObj.origin + currentUrlObj.pathname;
}

function storageKeyForPage(exact) {
  return "profiles::" + pageKey(exact);
}

async function getAllRelevantProfiles() {
  // gather profiles saved under both exact and path-based keys for this page
  const keys = [...new Set([storageKeyForPage(true), storageKeyForPage(false)])];
  const result = await chrome.storage.local.get(keys);
  const merged = [];
  keys.forEach((k) => {
    const arr = result[k] || [];
    arr.forEach((p) => merged.push({ ...p, storageKey: k }));
  });
  return merged;
}

async function getAllProfilesEverywhere() {
  const all = await chrome.storage.local.get(null);
  const merged = [];
  Object.entries(all).forEach(([key, arr]) => {
    if (!key.startsWith("profiles::") || !Array.isArray(arr)) return;
    const site = key.slice("profiles::".length);
    arr.forEach((p) => merged.push({ ...p, storageKey: key, site }));
  });
  merged.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return merged;
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
  setTimeout(() => {
    document.getElementById("status").textContent = "";
  }, 2500);
}

async function renderProfiles() {
  const list = document.getElementById("profileList");
  const label = document.getElementById("listLabel");
  const isAll = currentView === "all";
  label.textContent = isAll ? "All saved profiles" : "Saved profiles for this page";

  const profiles = isAll ? await getAllProfilesEverywhere() : await getAllRelevantProfiles();
  if (profiles.length === 0) {
    list.innerHTML = `<div class="empty">${isAll ? "No saved profiles yet." : "No saved profiles for this page yet."}</div>`;
    return;
  }
  list.innerHTML = "";
  profiles.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "profile-item";
    const initial = escapeHtml(p.name.trim().charAt(0).toUpperCase() || "?");
    const savedAt = p.savedAt ? new Date(p.savedAt).toLocaleDateString() : "";
    const siteLine = isAll ? `<div class="profile-site">${escapeHtml(p.site)}</div>` : "";
    div.innerHTML = `
      <div class="avatar">${initial}</div>
      <div class="profile-info">
        <div class="profile-name">${escapeHtml(p.name)}</div>
        ${siteLine}
        <div class="profile-meta">${savedAt}</div>
      </div>
      <span class="profile-actions">
        ${
          isAll
            ? `<button class="icon-btn open-fill-btn" title="Open page & fill" data-key="${p.storageKey}" data-name="${escapeHtml(p.name)}">
                 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
               </button>`
            : `<button class="icon-btn apply-btn" title="Fill" data-key="${p.storageKey}" data-name="${escapeHtml(p.name)}">
                 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>
               </button>`
        }
        <button class="icon-btn edit-btn" title="Edit" data-key="${p.storageKey}" data-name="${escapeHtml(p.name)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
        </button>
        <button class="icon-btn del-btn" title="Delete" data-key="${p.storageKey}" data-name="${escapeHtml(p.name)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2m-1 0v14a1 1 0 01-1 1H9a1 1 0 01-1-1V6"/></svg>
        </button>
      </span>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll(".apply-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyProfile(btn.dataset.key, btn.dataset.name));
  });
  list.querySelectorAll(".open-fill-btn").forEach((btn) => {
    btn.addEventListener("click", () => openAndFillProfile(btn.dataset.key, btn.dataset.name));
  });
  list.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteProfile(btn.dataset.key, btn.dataset.name));
  });
  list.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEditModal(btn.dataset.key, btn.dataset.name));
  });
}

let editingKey = null;
let editingOldName = null;

function fieldLabel(key) {
  // "id:username" -> "username (id)" / "idx:INPUT:3" -> "INPUT #3 (no id/name)"
  const [kind, ...rest] = key.split(":");
  if (kind === "idx") {
    const [tag, idx] = rest;
    return `${tag} #${idx} (no id/name)`;
  }
  return `${rest.join(":")} (${kind})`;
}

async function openEditModal(storageKey, name) {
  const arr = (await chrome.storage.local.get(storageKey))[storageKey] || [];
  const profile = arr.find((p) => p.name === name);
  if (!profile) return;

  editingKey = storageKey;
  editingOldName = name;

  document.getElementById("editProfileName").value = profile.name;

  const container = document.getElementById("editFieldsContainer");
  container.innerHTML = "";
  Object.entries(profile.data).forEach(([fieldKey, info]) => {
    const row = document.createElement("div");
    row.className = "field-row";
    row.dataset.fieldKey = fieldKey;
    row.dataset.fieldType = info.type;

    if (info.type === "checkbox" || info.type === "radio") {
      row.innerHTML = `
        <label class="checkbox-row">
          <input type="checkbox" ${info.value ? "checked" : ""} />
          ${escapeHtml(fieldLabel(fieldKey))}
        </label>
      `;
    } else if (info.isPassword) {
      row.innerHTML = `
        <label>${escapeHtml(fieldLabel(fieldKey))} (password)</label>
        <div class="password-row">
          <input type="password" value="${escapeHtml(String(info.value ?? ""))}" />
          <button type="button" class="icon-btn toggle-pw-btn" title="Show/hide">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      `;
    } else {
      row.innerHTML = `
        <label>${escapeHtml(fieldLabel(fieldKey))}</label>
        <input type="text" value="${escapeHtml(String(info.value ?? ""))}" />
      `;
    }
    container.appendChild(row);
  });

  container.querySelectorAll(".toggle-pw-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      input.type = input.type === "password" ? "text" : "password";
    });
  });

  document.getElementById("editOverlay").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("editOverlay").classList.add("hidden");
  editingKey = null;
  editingOldName = null;
}

async function saveEditModal() {
  if (!editingKey || !editingOldName) return;

  const newName = document.getElementById("editProfileName").value.trim();
  if (!newName) {
    setStatus("Profile name can't be empty.");
    return;
  }

  const arr = (await chrome.storage.local.get(editingKey))[editingKey] || [];
  if (newName !== editingOldName && arr.some((p) => p.name === newName)) {
    setStatus(`A profile named "${newName}" already exists.`);
    return;
  }
  const profile = arr.find((p) => p.name === editingOldName);
  if (!profile) {
    closeEditModal();
    renderProfiles();
    return;
  }

  document.querySelectorAll("#editFieldsContainer .field-row").forEach((row) => {
    const fieldKey = row.dataset.fieldKey;
    const fieldType = row.dataset.fieldType;
    const info = profile.data[fieldKey];
    if (!info) return;
    if (fieldType === "checkbox" || fieldType === "radio") {
      info.value = row.querySelector("input").checked;
    } else {
      info.value = row.querySelector("input").value;
    }
  });

  profile.name = newName;
  await chrome.storage.local.set({ [editingKey]: arr });
  setStatus(`Saved changes to "${newName}".`);
  closeEditModal();
  renderProfiles();
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

let isSaving = false;

async function saveCurrentForm() {
  if (isSaving) return; // guard against double-click / double trigger
  const name = document.getElementById("profileName").value.trim();
  if (!name) {
    setStatus("Please enter a profile name first.");
    return;
  }

  isSaving = true;
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;

  try {
    const exact = document.getElementById("scopeExact").checked;
    const key = storageKeyForPage(exact);

    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ["content.js"],
    });
    const [{ result: data }] = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: () => window.__formAutoFillCapture(),
    });

    // Re-read fresh right before writing, and de-duplicate by name using a Map
    // so even if two saves overlap, the final array never has repeated names.
    const otherKey = storageKeyForPage(!exact);
    const existing = (await chrome.storage.local.get(key))[key] || [];
    const byName = new Map(existing.map((p) => [p.name, p]));
    byName.set(name, { name, data, savedAt: Date.now() });
    const deduped = Array.from(byName.values());

    const updates = { [key]: deduped };
    if (otherKey !== key) {
      const otherExisting = (await chrome.storage.local.get(otherKey))[otherKey] || [];
      updates[otherKey] = otherExisting.filter((p) => p.name !== name);
    }
    await chrome.storage.local.set(updates);

    document.getElementById("profileName").value = "";
    setStatus(`Saved "${name}".`);
    renderProfiles();
  } finally {
    isSaving = false;
    saveBtn.disabled = false;
  }
}

async function applyProfile(storageKey, name) {
  const arr = (await chrome.storage.local.get(storageKey))[storageKey] || [];
  const profile = arr.find((p) => p.name === name);
  if (!profile) return;

  await chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    files: ["content.js"],
  });
  const [{ result: filledCount }] = await chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: (data) => window.__formAutoFillApply(data),
    args: [profile.data],
  });
  setStatus(`Filled ${filledCount} field(s) from "${name}".`);
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function openAndFillProfile(storageKey, name) {
  const arr = (await chrome.storage.local.get(storageKey))[storageKey] || [];
  const profile = arr.find((p) => p.name === name);
  if (!profile) return;

  const site = storageKey.slice("profiles::".length);
  setStatus(`Opening ${site}...`);

  const tab = await chrome.tabs.create({ url: site });
  await waitForTabLoad(tab.id);
  // Give SPA/dynamic pages a moment to render form fields after "complete".
  await new Promise((r) => setTimeout(r, 600));

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    let filledCount = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (data) => window.__formAutoFillApply(data),
        args: [profile.data],
      });
      filledCount = result;
      if (filledCount > 0) break;
      await new Promise((r) => setTimeout(r, 700));
    }
    setStatus(`Filled ${filledCount} field(s) from "${name}".`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

async function deleteProfile(storageKey, name) {
  const result = await chrome.storage.local.get(storageKey);
  const arr = result[storageKey] || [];
  const filtered = arr.filter((p) => p.name !== name);
  if (filtered.length === 0) {
    await chrome.storage.local.remove(storageKey);
  } else {
    await chrome.storage.local.set({ [storageKey]: filtered });
  }
  setStatus(`Deleted "${name}".`);
  renderProfiles();
}

async function cleanupDuplicates() {
  const keys = [...new Set([storageKeyForPage(true), storageKeyForPage(false)])];
  const result = await chrome.storage.local.get(keys);
  const updates = {};
  keys.forEach((k) => {
    const arr = result[k] || [];
    if (arr.length === 0) return;
    const byName = new Map();
    arr.forEach((p) => byName.set(p.name, p)); // last one wins, removes dupes
    if (byName.size !== arr.length) {
      updates[k] = Array.from(byName.values());
    }
  });
  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  currentUrlObj = new URL(tab.url);
  document.getElementById("currentUrl").textContent = tab.url;

  document.getElementById("saveBtn").addEventListener("click", saveCurrentForm);
  document.getElementById("scopeExact").addEventListener("change", renderProfiles);

  document.getElementById("editCloseBtn").addEventListener("click", closeEditModal);
  document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);
  document.getElementById("editSaveBtn").addEventListener("click", saveEditModal);
  document.getElementById("editOverlay").addEventListener("click", (e) => {
    if (e.target.id === "editOverlay") closeEditModal();
  });

  const tabThisPage = document.getElementById("tabThisPage");
  const tabAllProfiles = document.getElementById("tabAllProfiles");
  tabThisPage.addEventListener("click", () => {
    currentView = "page";
    tabThisPage.classList.add("active");
    tabAllProfiles.classList.remove("active");
    renderProfiles();
  });
  tabAllProfiles.addEventListener("click", () => {
    currentView = "all";
    tabAllProfiles.classList.add("active");
    tabThisPage.classList.remove("active");
    renderProfiles();
  });

  await cleanupDuplicates();
  renderProfiles();
}

init();
