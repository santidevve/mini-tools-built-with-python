document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-target]");
  if (!button) return;

  const targetId = button.getAttribute("data-copy-target");
  const targetEl = document.getElementById(targetId);
  if (!targetEl) return;

  const originalText = button.textContent;
  const textToCopy = targetEl.innerText || targetEl.textContent || "";

  try {
    await navigator.clipboard.writeText(textToCopy);
    button.textContent = "Copied!";
  } catch {
    button.textContent = "Copy failed";
  }

  setTimeout(() => {
    button.textContent = originalText;
  }, 1500);
});
