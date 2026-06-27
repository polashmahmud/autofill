// popup.js

let currentTabId = null;
let currentUrlObj = null;

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

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
  setTimeout(() => {
    document.getElementById("status").textContent = "";
  }, 2500);
}

async function renderProfiles() {
  const list = document.getElementById("profileList");
  const profiles = await getAllRelevantProfiles();
  if (profiles.length === 0) {
    list.innerHTML = '<div class="empty">No saved profiles for this page yet.</div>';
    return;
  }
  list.innerHTML = "";
  profiles.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "profile-item";
    div.innerHTML = `
      <span>${escapeHtml(p.name)}</span>
      <span class="profile-actions">
        <button class="btn-primary apply-btn" data-key="${p.storageKey}" data-name="${escapeHtml(p.name)}">Fill</button>
        <button class="btn-secondary del-btn" data-key="${p.storageKey}" data-name="${escapeHtml(p.name)}">Del</button>
      </span>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll(".apply-btn").forEach((btn) => {
    btn.addEventListener("click", () => applyProfile(btn.dataset.key, btn.dataset.name));
  });
  list.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteProfile(btn.dataset.key, btn.dataset.name));
  });
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

async function deleteProfile(storageKey, name) {
  const exactKey = storageKeyForPage(true);
  const pathKey = storageKeyForPage(false);
  const keys = [exactKey, pathKey];
  const result = await chrome.storage.local.get(keys);
  const updates = {};
  keys.forEach((k) => {
    const arr = result[k] || [];
    const filtered = arr.filter((p) => p.name !== name);
    if (filtered.length !== arr.length) updates[k] = filtered;
  });
  await chrome.storage.local.set(updates);
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

  await cleanupDuplicates();
  renderProfiles();
}

init();
