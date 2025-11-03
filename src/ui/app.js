const inputField = document.getElementById("inputField");
const processButton = document.getElementById("processButton");
const resultField = document.getElementById("resultField");

const renderEmptyState = () => {
  resultField.textContent = "Ready when you are.";
};

const renderResult = (text) => {
  if (text.trim().length === 0) {
    renderEmptyState();
    return;
  }

  resultField.textContent = `Preview:\n${text}`;
};

processButton?.addEventListener("click", () => {
  if (!inputField) {
    return;
  }

  const value = inputField.value;
  renderResult(value);
});

inputField?.addEventListener("input", (event) => {
  const target = event.currentTarget;

  if (!target || !(target instanceof HTMLTextAreaElement)) {
    return;
  }

  if (target.value.trim().length === 0) {
    renderEmptyState();
  }
});

renderEmptyState();
