"use strict";
(() => {
  // src/permissions/permissions.ts
  (() => {
    const grantBtn = document.getElementById("grant-btn");
    const successMsg = document.getElementById("success-msg");
    const scopeBox = document.getElementById("scope");
    const titleEl = document.getElementById("title");
    const descEl = document.getElementById("desc");
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
              } catch (e) {
              }
            }, 1500);
          } else {
            alert("Permission request was denied. Please grant permissions to enable API syncing.");
          }
        } catch (err) {
          alert("Error requesting permission: " + (err?.message || String(err)));
        }
      });
    }
    checkPermission();
  })();
})();
