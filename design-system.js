"use strict";

const root = document.documentElement;
const note = document.querySelector("#field-note");
const noteHelp = document.querySelector("#note-help");
const dialog = document.querySelector("#example-dialog");
const toast = document.querySelector("#example-toast");
const status = document.querySelector("#example-status");
const timeline = document.querySelector("#example-year");
const yearLabel = document.querySelector("#example-year-value");
let toastTimer;
let announcement;

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
  const linear = rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
  const a = luminance(first);
  const b = luminance(second);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio.toFixed(2) + ":1";
}

function showTokens() {
  const style = getComputedStyle(root);
  const token = name => style.getPropertyValue("--" + name).trim();
  for (const sample of document.querySelectorAll("[data-swatch]")) {
    sample.style.backgroundColor = token(sample.dataset.swatch);
  }
  for (const value of document.querySelectorAll("[data-value]")) {
    value.textContent = token(value.dataset.value);
  }
  const paper = token("paper");
  document.querySelector("#contrast-values").textContent =
    "Current theme · Body text " + contrast(token("ink"), paper) +
    " · Secondary text " + contrast(token("muted"), paper) +
    " · Primary button " + contrast(token("on-action"), token("action")) +
    " · Control border " + contrast(token("control-edge"), paper);
}

function showToast(message) {
  clearTimeout(toastTimer);
  clearTimeout(announcement);
  toast.textContent = message;
  toast.hidden = false;
  status.textContent = "";
  announcement = setTimeout(() => { status.textContent = message; }, 50);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}

function updateYear() {
  const fill = (Number(timeline.value) - Number(timeline.min)) / (Number(timeline.max) - Number(timeline.min));
  timeline.style.setProperty("--timeline-fill", fill * 100 + "%");
  yearLabel.value = "Year " + timeline.value;
}

function openExampleDialog() {
  dialog.returnValue = "";
  dialog.showModal();
}

document.querySelector("#primary-example").addEventListener("click", openExampleDialog);
document.querySelector("#show-modal").addEventListener("click", openExampleDialog);
document.querySelector("#button-secondary").addEventListener("click", () => {
  showToast("Move the timeline to see how the meadow changes over the years.");
});
document.querySelector("#show-toast").addEventListener("click", () => showToast("Observation recorded."));
dialog.addEventListener("close", () => {
  if (dialog.returnValue === "confirm") showToast("Observation recorded.");
});

function clearNoteError() {
  note.removeAttribute("aria-invalid");
  noteHelp.textContent = "The example clears when you reload the page.";
}

document.querySelector("#input-example").addEventListener("submit", event => {
  event.preventDefault();
  if (!note.value.trim()) {
    note.setAttribute("aria-invalid", "true");
    noteHelp.textContent = "Enter a field note.";
    note.focus();
    return;
  }
  clearNoteError();
  showToast("Field note saved.");
});
note.addEventListener("input", clearNoteError);

const comparisons = document.querySelectorAll("#compare-example button");
for (const button of comparisons) {
  button.addEventListener("click", () => {
    for (const option of comparisons) option.setAttribute("aria-pressed", String(option === button));
  });
}
const grid = document.querySelector(".grid-demo");
for (let column = 0; column < 12; column++) grid.append(document.createElement("span"));
timeline.addEventListener("input", updateYear);
document.addEventListener("ecovis-themechange", showTokens);
updateYear();
showTokens();
