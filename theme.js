"use strict";

const ecoTheme = (() => {
  const root = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  const key = "ecovis-theme";
  let preference = "system";

  function storedTheme() {
    try {
      const value = localStorage.getItem(key);
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  }

  function applyTheme() {
    const mode = preference === "system" ? (system.matches ? "dark" : "light") : preference;
    root.dataset.theme = mode;
    for (const control of document.querySelectorAll("[data-theme-control]")) control.value = preference;
    const chromeColor = document.querySelector('meta[name="theme-color"]');
    if (chromeColor) chromeColor.content = getComputedStyle(root).getPropertyValue("--ground").trim();
    document.dispatchEvent(new CustomEvent("ecovis-themechange"));
  }

  preference = storedTheme();
  applyTheme();
  system.addEventListener("change", applyTheme);
  window.addEventListener("storage", event => {
    if (event.key !== key && event.key !== null) return;
    preference = storedTheme();
    applyTheme();
  });
  document.addEventListener("DOMContentLoaded", () => {
    for (const control of document.querySelectorAll("[data-theme-control]")) {
      control.addEventListener("change", () => {
        preference = control.value;
        try {
          if (preference === "system") localStorage.removeItem(key);
          else localStorage.setItem(key, preference);
        } catch { /* The selection still applies to this page. */ }
        applyTheme();
      });
    }
    applyTheme();
  });

  return { get mode() { return root.dataset.theme; } };
})();
