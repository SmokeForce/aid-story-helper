// Runs in the tab's extension context where browser.permissions is fully supported.
(() => {
  const grantBtn = document.getElementById("grant-btn") as HTMLButtonElement | null;
  const successMsg = document.getElementById("success-msg") as HTMLDivElement | null;
  const scopeBox = document.getElementById("scope") as HTMLDivElement | null;
  const titleEl = document.getElementById("title") as HTMLHeadingElement | null;
  const descEl = document.getElementById("desc") as HTMLParagraphElement | null;

  const targetOrigins = [
    "*://*.aidungeon.com/*",
    "https://api.anthropic.com/*",
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ];

  async function checkPermission() {
    try {
      const hasPermission = await browser.permissions.contains({ origins: targetOrigins });
      if (hasPermission) {
        showSuccess();
      }
    } catch (err) {
      console.error("Error checking permissions:", err);
    }
  }

  function showSuccess() {
    if (grantBtn) grantBtn.style.display = "none";
    if (scopeBox) scopeBox.style.display = "none";
    if (successMsg) successMsg.style.display = "block";
    if (titleEl) titleEl.textContent = "Permissions Granted";
    if (descEl) descEl.textContent = "The extension has full authorization to access the AI Dungeon API and third-party/local inference endpoints. You can safely close this page now.";
  }

  if (grantBtn) {
    grantBtn.addEventListener("click", async () => {
      try {
        const granted = await browser.permissions.request({ origins: targetOrigins });
        if (granted) {
          showSuccess();
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {}
          }, 1500);
        } else {
          alert("Permission request was denied. Please grant permissions to enable API syncing.");
        }
      } catch (err: any) {
        alert("Error requesting permission: " + (err?.message || String(err)));
      }
    });
  }

  // Initial check
  checkPermission();
})();
