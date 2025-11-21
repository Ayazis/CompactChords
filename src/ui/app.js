import { processSong } from "../app/app.js";

const inputField = document.getElementById("inputField");
const processButton = document.getElementById("processButton");
const resultField = document.getElementById("resultField");
const fixturePath = "../fixtures/shapeofyou.md";

const createSummaryElement = (stats) => {
  const summary = document.createElement("p");
  summary.className = "result__summary";
  summary.textContent = `Lines: ${stats.totalLines} — Chord: ${stats.chordLines} — Lyric: ${stats.lyricLines}`;
  return summary;
};

const createBlockElement = (block) => {
  const article = document.createElement("article");
  article.className = "result__block";

  const header = document.createElement("header");
  header.className = "result__blockHeader";

  const title = document.createElement("span");
  title.className = "result__blockTitle";
  title.textContent = block.label;

  header.appendChild(title);

  const content = document.createElement("pre");
  content.className = "result__content";
  content.textContent = block.content;

  article.appendChild(header);
  article.appendChild(content);

  return article;
};

const renderEmptyState = () => {
  if (!resultField) {
    return;
  }

  resultField.innerHTML = "";
  const empty = document.createElement("p");
  empty.className = "result__empty";
  empty.textContent = "Paste chords or lyrics, then click Process.";
  resultField.appendChild(empty);
};

const renderResult = (payload) => {
  if (!resultField) {
    return;
  }

  if (
    !payload ||
    payload.lines.every((line) => line.classification.type === "Blank")
  ) {
    renderEmptyState();
    return;
  }

  resultField.innerHTML = "";
  resultField.appendChild(createSummaryElement(payload.stats));

  payload.blocks.forEach((block) => {
    resultField.appendChild(createBlockElement(block));
  });
};

const processInput = () => {
  if (!inputField) {
    return;
  }

  const value = inputField.value ?? "";
  const output = processSong(value);
  renderResult(output);
};

let debounceHandle;
const requestProcess = () => {
  window.clearTimeout(debounceHandle);
  debounceHandle = window.setTimeout(processInput, 250);
};

processButton?.addEventListener("click", processInput);
inputField?.addEventListener("input", requestProcess);

renderEmptyState();

const loadDefaultInput = async () => {
  if (!inputField) {
    return;
  }

  try {
    const response = await fetch(fixturePath);
    if (!response.ok) {
      throw new Error(`Failed to fetch fixture: ${response.status}`);
    }

    const text = await response.text();
    inputField.value = text;
    processInput();
  } catch (error) {
    // Leave the empty state in place if the fixture cannot be loaded.
    console.error(error);
  }
};

loadDefaultInput();
