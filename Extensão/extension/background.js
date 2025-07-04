

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_USER_TOKEN") {
    chrome.storage.local.set({ user_id: message.token }, () => {
      console.log("🔐 Token salvo no storage:", message.token);
    });
  }

  if (message.type === "GET_USER_TOKEN") {
    chrome.storage.local.get(["user_id"], (result) => {
      sendResponse({ user_id: result.user_id });
    });
    return true; // necessário para permitir resposta assíncrona
  }
});

