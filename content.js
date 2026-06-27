// content.js
// These functions run in the context of the page (injected via chrome.scripting.executeScript)

// Build a stable-ish selector for a field
function buildFieldKey(el) {
  if (el.id) return "id:" + el.id;
  if (el.name) return "name:" + el.name;
  // fallback: tag + index among same tag
  const all = Array.from(document.querySelectorAll(el.tagName));
  const idx = all.indexOf(el);
  return "idx:" + el.tagName + ":" + idx;
}

function findFieldByKey(key) {
  if (key.startsWith("id:")) {
    return document.getElementById(key.slice(3));
  }
  if (key.startsWith("name:")) {
    return document.querySelector(`[name="${CSS.escape(key.slice(5))}"]`);
  }
  if (key.startsWith("idx:")) {
    const [, tag, idxStr] = key.split(":");
    const idx = parseInt(idxStr, 10);
    const all = document.querySelectorAll(tag);
    return all[idx] || null;
  }
  return null;
}

// Captures all input/select/textarea values on the page
window.__formAutoFillCapture = function () {
  const fields = document.querySelectorAll("input, select, textarea");
  const data = {};
  fields.forEach((el) => {
    if (el.type === "password") {
      // still capture password for test convenience, but mark it
      data[buildFieldKey(el)] = { value: el.value, type: el.type, isPassword: true };
      return;
    }
    if (el.type === "checkbox" || el.type === "radio") {
      data[buildFieldKey(el)] = { value: el.checked, type: el.type };
      return;
    }
    if (el.type === "file") return; // can't set file inputs programmatically
    data[buildFieldKey(el)] = { value: el.value, type: el.type || el.tagName };
  });
  return data;
};

// Fills fields based on captured data object
window.__formAutoFillApply = function (data) {
  let filled = 0;
  Object.entries(data).forEach(([key, info]) => {
    const el = findFieldByKey(key);
    if (!el) return;
    if (info.type === "checkbox" || info.type === "radio") {
      el.checked = !!info.value;
    } else {
      el.value = info.value;
    }
    // trigger events so frameworks (Vue/React) pick up the change
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    filled++;
  });
  return filled;
};
