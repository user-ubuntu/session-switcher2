"use strict";
var SessionSwitcher = (() => {
  // src/shared/constants/storageKeys.ts
  var STORAGE_KEYS = {
    SESSIONS: "sessions",
    ACTIVE_SESSIONS: "activeSessions",
    VIEW_MODE: "viewMode"
  };

  // src/shared/utils/errorHandling.ts
  var ExtensionError = class extends Error {
    constructor(message, code) {
      super(message);
      this.code = code;
      this.name = "ExtensionError";
    }
  };
  function handleError(error, context) {
    console.error(`Error in ${context}:`, error);
    if (error instanceof ExtensionError) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return "An unexpected error occurred";
  }

  // src/background/handlers/cookie.handler.ts
  var CookieHandler = class {
    async getCookiesForDomain(domain) {
      try {
        const stores = await chrome.cookies.getAllCookieStores();
        const allCookies = [];
        const currentDomain = domain.split(":")[0];
        for (const store of stores) {
          const cookies = await chrome.cookies.getAll({ storeId: store.id });
          const domainCookies = cookies.filter((cookie) => {
            const slicedCookieDomain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
            return slicedCookieDomain === currentDomain || slicedCookieDomain === `www.${currentDomain}` || currentDomain.endsWith(slicedCookieDomain);
          });
          allCookies.push(...domainCookies);
        }
        return allCookies;
      } catch (error) {
        console.error("Error getting cookies for domain:", domain, error);
        return [];
      }
    }
    async clearCookiesForDomain(domain) {
      const cookies = await this.getCookiesForDomain(domain);
      const clearPromises = cookies.map(async (cookie) => {
        try {
          await chrome.cookies.remove({
            url: this.buildCookieUrl(cookie, domain),
            name: cookie.name,
            storeId: cookie.storeId
          });
        } catch (error) {
          console.warn("Failed to remove cookie:", cookie.name, error);
        }
      });
      await Promise.all(clearPromises);
    }
    async restoreCookies(cookies, domain) {
      if (!cookies || !Array.isArray(cookies)) {
        console.error("Invalid cookies array provided:", cookies);
        return;
      }
      if (!domain) {
        console.error("Invalid domain provided for cookie restoration");
        return;
      }
      console.log(`Restoring ${cookies.length} cookies for domain: ${domain}`);
      let successCount = 0;
      let failureCount = 0;
      const restorePromises = cookies.map(async (cookie) => {
        if (!cookie || !cookie.name) {
          console.warn("Skipping invalid cookie:", cookie);
          failureCount++;
          return;
        }
        try {
          const cookieDetails = this.prepareCookieForRestore(cookie, domain);
          await chrome.cookies.set(cookieDetails);
          successCount++;
        } catch (error) {
          failureCount++;
          console.warn(`Failed to restore cookie: ${cookie.name}`, error);
        }
      });
      await Promise.all(restorePromises);
      console.log(`Cookie restoration complete - Success: ${successCount}, Failed: ${failureCount}`);
    }
    buildCookieUrl(cookie, fallbackDomain) {
      const protocol = cookie.secure ? "https" : "http";
      let domain = cookie.domain;
      if (domain.startsWith(".")) {
        domain = domain.slice(1);
      }
      if (!domain && fallbackDomain) {
        domain = fallbackDomain;
      }
      if (!domain) {
        throw new Error(`Invalid domain for cookie ${cookie.name}: ${cookie.domain}`);
      }
      const path = cookie.path || "/";
      return `${protocol}://${domain}${path}`;
    }
    prepareCookieForRestore(cookie, fallbackDomain) {
      const url = this.buildCookieUrl(cookie, fallbackDomain);
      const cookieDetails = {
        url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        storeId: cookie.storeId
      };
      if (cookie.domain && cookie.domain.startsWith(".")) {
        cookieDetails.domain = cookie.domain;
      }
      if (!cookie.session && cookie.expirationDate) {
        cookieDetails.expirationDate = cookie.expirationDate;
      }
      if (cookie.sameSite && cookie.sameSite !== "unspecified") {
        cookieDetails.sameSite = cookie.sameSite;
      }
      return cookieDetails;
    }
  };

  // src/background/services/storageData.service.ts
  function extractStorageData() {
    try {
      const localStorageData = {};
      const sessionStorageData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            localStorageData[key] = value;
          }
        }
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          const value = sessionStorage.getItem(key);
          if (value !== null) {
            sessionStorageData[key] = value;
          }
        }
      }
      return {
        localStorage: localStorageData,
        sessionStorage: sessionStorageData
      };
    } catch (error) {
      console.error("Error extracting storage data:", error);
      return { localStorage: {}, sessionStorage: {} };
    }
  }
  function injectStorageData(localData, sessionData) {
    try {
      localStorage.clear();
      sessionStorage.clear();
      Object.entries(localData).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
      Object.entries(sessionData).forEach(([key, value]) => {
        sessionStorage.setItem(key, value);
      });
      return true;
    } catch (error) {
      console.error("Error injecting storage data:", error);
      return false;
    }
  }
  function clearStorage() {
    try {
      localStorage.clear();
      sessionStorage.clear();
      return true;
    } catch (error) {
      console.error("Error clearing storage:", error);
      return false;
    }
  }

  // src/background/handlers/storage.handler.ts
  var StorageHandler = class {
    async getStorageData(tabId) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractStorageData
        });
        return results?.[0]?.result || { localStorage: {}, sessionStorage: {} };
      } catch (error) {
        console.error("Error getting storage data:", error);
        return { localStorage: {}, sessionStorage: {} };
      }
    }
    async restoreStorageData(tabId, data) {
      if (!tabId) {
        console.error("Invalid tab ID for restoring storage data:", tabId);
        throw new ExtensionError("Invalid tab ID for restoring storage data");
      }
      if (!data || !data.localStorage && !data.sessionStorage) {
        console.warn("Empty storage data provided for restoration");
      }
      console.log(`Restoring storage data for tab ${tabId}:`, {
        localStorageKeys: data.localStorage ? Object.keys(data.localStorage).length : 0,
        sessionStorageKeys: data.sessionStorage ? Object.keys(data.sessionStorage).length : 0
      });
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: injectStorageData,
          args: [data.localStorage || {}, data.sessionStorage || {}]
        });
        if (!results || results.length === 0 || results[0].result !== true) {
          console.error("Storage data injection failed:", results);
          throw new ExtensionError("Failed to inject storage data into the page");
        }
        console.log("Storage data successfully restored");
      } catch (error) {
        console.error("Error restoring storage data:", error);
        throw new ExtensionError(`Failed to restore storage data: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    async clearStorageData(tabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: clearStorage
        });
      } catch (error) {
        throw new ExtensionError(`Failed to clear storage data: ${error}`);
      }
    }
  };

  // src/background/handlers/session.handler.ts
  var SessionHandler = class {
    constructor() {
      this.cookieHandler = new CookieHandler();
      this.storageHandler = new StorageHandler();
    }
    async getCurrentSession(domain, tabId) {
      try {
        const [cookies, storageData] = await Promise.all([
          this.cookieHandler.getCookiesForDomain(domain),
          this.storageHandler.getStorageData(tabId)
        ]);
        return {
          cookies,
          localStorage: storageData.localStorage,
          sessionStorage: storageData.sessionStorage
        };
      } catch (error) {
        throw new ExtensionError(`Failed to get current session: ${error}`);
      }
    }
    async switchToSession(sessionData, tabId) {
      if (!sessionData || !tabId) {
        console.error("Invalid session data or tab ID:", { sessionData, tabId });
        throw new ExtensionError("Invalid session data or tab ID");
      }
      const { domain, cookies, localStorage: localStorage2, sessionStorage: sessionStorage2 } = sessionData;
      if (!domain) {
        console.error("Missing domain in session data:", sessionData);
        throw new ExtensionError("Missing domain in session data");
      }
      console.log(`Switching to session for domain: ${domain}, tab: ${tabId}`);
      try {
        console.log("Clearing cookies for domain:", domain);
        await this.cookieHandler.clearCookiesForDomain(domain);
        console.log("Restoring session data...");
        const results = await Promise.allSettled([
          this.cookieHandler.restoreCookies(cookies, domain),
          this.storageHandler.restoreStorageData(tabId, {
            localStorage: localStorage2,
            sessionStorage: sessionStorage2
          })
        ]);
        const failures = results.filter((r) => r.status === "rejected");
        if (failures.length > 0) {
          console.error(
            "Some operations failed during session switch:",
            failures.map((f) => f.reason)
          );
        }
        console.log("Reloading tab:", tabId);
        await chrome.tabs.reload(tabId);
        console.log("Session switch completed successfully");
      } catch (error) {
        console.error("Failed to switch session:", error);
        throw new ExtensionError(`Failed to switch session: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    async clearSession(domain, tabId) {
      try {
        await Promise.all([
          this.cookieHandler.clearCookiesForDomain(domain),
          this.storageHandler.clearStorageData(tabId)
        ]);
        await chrome.tabs.reload(tabId);
      } catch (error) {
        throw new ExtensionError(`Failed to clear session: ${error}`);
      }
    }
  };

  // PERBAIKAN PENTING: Definisikan MESSAGE_ACTIONS di sini juga
  var MESSAGE_ACTIONS = {
    GET_CURRENT_SESSION: "getCurrentSession",
    SWITCH_SESSION: "switchSession",
    CLEAR_SESSION: "clearSession",
    CLEAR_SESSIONS: "clearSessions",
    EXPORT_SESSIONS: "exportSessions",
    IMPORT_SESSIONS: "importSessions"
  };

  // src/shared/constants/requiredPermission.ts
  var REQUIRED_PERMISSIONS = [
    "storage",
    "tabs",
    "cookies",
    "activeTab",
    "scripting"
  ];

  // src/background/services/message.service.ts
  var MessageService = class {
    constructor() {
      this.sessionHandler = new SessionHandler();
    }
    handleMessage(message, _, sendResponse) {
      if (!message || typeof message !== "object" || !message.action) {
        console.error("Invalid message received:", message);
        sendResponse({ success: false, error: "Invalid message format" });
        return true;
      }
      console.log("Received message:", message.action);
      this.checkPermissions().then(() => {
        return this.processMessage(message, sendResponse);
      }).catch((error) => {
        const errorMessage = handleError(error, "MessageService.handleMessage");
        console.error("Error in message handling:", errorMessage);
        sendResponse({ success: false, error: errorMessage });
      });
      return true;
    }
    async checkPermissions() {
      try {
        const permissions = await chrome.permissions.getAll();
        this.validateRequiredPermissions(permissions);
        this.validateOriginPermissions(permissions);
      } catch (error) {
        throw error;
      }
    }
    validateRequiredPermissions(permissions) {
      for (const permission of REQUIRED_PERMISSIONS) {
        if (!permissions.permissions?.includes(permission)) {
          throw new Error("Data access permission is required.");
        }
      }
    }
    validateOriginPermissions(permissions) {
      const origins = permissions.origins || [];
      if (origins.length === 0) {
        throw new Error("Data access permission is required.");
      }
      const hasBroadAccess = origins.some(
        (origin) => origin === "<all_urls>" || origin === "*://*/*" || origin === "http://*/*" || origin === "https://*/*"
      );
      if (!hasBroadAccess) {
        throw new Error("Data access permission is required.");
      }
    }
    async processMessage(message, sendResponse) {
      try {
        console.log(`Processing action: ${message.action}`);
        
        // PERBAIKAN UTAMA: Gunakan switch case yang benar
        switch (message.action) {
          case MESSAGE_ACTIONS.GET_CURRENT_SESSION:
          case "getCurrentSession":
            await this.handleGetCurrentSession(message, sendResponse);
            break;
            
          case MESSAGE_ACTIONS.SWITCH_SESSION:
          case "switchSession":
            await this.handleSwitchSession(message, sendResponse);
            break;
            
          case MESSAGE_ACTIONS.CLEAR_SESSION:
          case "clearSession":
            await this.handleClearSession(message, sendResponse);
            break;
            
          case MESSAGE_ACTIONS.CLEAR_SESSIONS:
          case "clearSessions":
            await this.handleClearSessions(message, sendResponse);
            break;
            
          case MESSAGE_ACTIONS.EXPORT_SESSIONS:
          case "exportSessions":
            await this.handleExportSessions(message, sendResponse);
            break;
            
          case MESSAGE_ACTIONS.IMPORT_SESSIONS:
          case "importSessions":
            await this.handleImportSessions(message, sendResponse);
            break;
            
          case "IMPORT_SESSIONS": // Juga handle uppercase version
            await this.handleImportSessions(message, sendResponse);
            break;
            
          default:
            console.error(`Unknown action: ${message.action}`);
            sendResponse({ 
              success: false, 
              error: `Unknown action: ${message.action}. Available actions: ${Object.values(MESSAGE_ACTIONS).join(', ')}` 
            });
        }
      } catch (error) {
        console.error(`Error processing message ${message.action}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ 
          success: false, 
          error: `Error processing ${message.action}: ${errorMessage}` 
        });
      }
    }
    async handleGetCurrentSession(message, sendResponse) {
      try {
        const sessionData = await this.sessionHandler.getCurrentSession(message.domain, message.tabId);
        sendResponse({ success: true, data: sessionData });
      } catch (error) {
        console.error("Error getting current session:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    async handleSwitchSession(message, sendResponse) {
      try {
        console.log("Switching to session:", message.sessionData?.id, "for tab:", message.tabId);
        if (!message.sessionData || !message.tabId) {
          console.error("Invalid session data or tab ID:", message);
          sendResponse({ success: false, error: "Invalid session data or tab ID" });
          return;
        }
        await this.sessionHandler.switchToSession(message.sessionData, message.tabId);
        console.log("Successfully switched to session:", message.sessionData.id);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error switching session:", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    async handleClearSession(message, sendResponse) {
      try {
        await this.sessionHandler.clearSession(message.domain, message.tabId);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error clearing session:", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    async handleClearSessions(message, sendResponse) {
      try {
        const { clearOption, domain } = message;
        if (clearOption === "current") {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.id) {
            await this.sessionHandler.clearSession(domain, tab.id);
            const sessions = await this.getStoredSessions();
            const updatedSessions = sessions.filter((s) => s.domain !== domain);
            await this.saveStoredSessions(updatedSessions);
          }
        } else if (clearOption === "all") {
          await this.saveStoredSessions([]);
          await this.saveActiveSessionsMap({});
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error clearing sessions:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    async handleExportSessions(message, sendResponse) {
      try {
        const { exportOption, domain } = message;
        const sessions = await this.getStoredSessions();
        let sessionsToExport = sessions;
        if (exportOption === "current") {
          sessionsToExport = sessions.filter((s) => s.domain === domain);
        }
        const exportData = {
          version: "1.0",
          exportDate: new Date().toISOString(),
          sessions: sessionsToExport
        };
        sendResponse({ success: true, data: JSON.stringify(exportData, null, 2) });
      } catch (error) {
        console.error("Error exporting sessions:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    async handleImportSessions(message, sendResponse) {
      try {
        console.log("Handling import sessions with message:", message);
        
        // Parse the data
        let importData;
        if (typeof message.data === 'string') {
          try {
            importData = JSON.parse(message.data);
          } catch (e) {
            console.error("Failed to parse JSON string:", e);
            sendResponse({ success: false, error: "Invalid JSON format in data field" });
            return;
          }
        } else if (typeof message.data === 'object') {
          importData = message.data;
        } else {
          sendResponse({ success: false, error: "Invalid data format. Expected object or JSON string." });
          return;
        }
        
        console.log("Parsed import data:", importData);
        
        if (!importData || !importData.sessions || !Array.isArray(importData.sessions)) {
          console.error("Invalid import data structure:", importData);
          sendResponse({ 
            success: false, 
            error: "Invalid import data format. Expected object with 'sessions' array." 
          });
          return;
        }
        
        const importedSessions = importData.sessions;
        console.log(`Importing ${importedSessions.length} sessions`);
        
        // Validate each session
        for (let i = 0; i < importedSessions.length; i++) {
          const session = importedSessions[i];
          if (!session.name || !session.domain) {
            console.error(`Invalid session at index ${i}:`, session);
            sendResponse({ 
              success: false, 
              error: `Invalid session at index ${i}: missing name or domain` 
            });
            return;
          }
          
          // Ensure session has required fields
          if (!session.id) {
            session.id = this.generateUniqueId();
          }
          if (!session.createdAt) {
            session.createdAt = Date.now();
          }
          if (!session.lastUsed) {
            session.lastUsed = Date.now();
          }
          if (!session.order) {
            session.order = i + 1;
          }
        }
        
        const currentSessions = await this.getStoredSessions();
        const currentIds = new Set(currentSessions.map(s => s.id));
        
        // Generate new IDs for sessions that have duplicate IDs
        const sessionsWithNewIds = importedSessions.map((session) => {
          const newSession = { ...session };
          if (currentIds.has(session.id)) {
            newSession.id = this.generateUniqueId();
            console.log(`Generated new ID for duplicate session: ${session.name} (${session.id} -> ${newSession.id})`);
          }
          return newSession;
        });
        
        const mergedSessions = [...currentSessions, ...sessionsWithNewIds];
        await this.saveStoredSessions(mergedSessions);
        
        console.log(`Successfully imported ${importedSessions.length} sessions. Total sessions now: ${mergedSessions.length}`);
        sendResponse({ success: true, importedCount: importedSessions.length, totalCount: mergedSessions.length });
      } catch (error) {
        console.error("Error importing sessions:", error);
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    generateUniqueId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    async getStoredSessions() {
      const result = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
      return result[STORAGE_KEYS.SESSIONS] || [];
    }
    
    async saveStoredSessions(sessions) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
    }
    
    async getActiveSessionsMap() {
      const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSIONS);
      return result[STORAGE_KEYS.ACTIVE_SESSIONS] || {};
    }
    
    async saveActiveSessionsMap(activeSessions) {
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSIONS]: activeSessions });
    }
  };

  // src/background/index.ts
  var messageService = new MessageService();
  
  var initializeExtension = () => {
    console.log("Session Switcher extension initializing...");
    if (!messageService) {
      console.error("Message service not initialized!");
    } else {
      console.log("Message service ready");
    }
  };
  
  chrome.runtime.onStartup.addListener(() => {
    console.log("Session Switcher extension started");
    initializeExtension();
  });
  
  chrome.runtime.onInstalled.addListener((details) => {
    console.log("Session Switcher extension installed/updated", details);
    if (details.reason === "install") {
      chrome.storage.local.set({
        [STORAGE_KEYS.SESSIONS]: [],
        [STORAGE_KEYS.ACTIVE_SESSIONS]: {}
      });
    }
    initializeExtension();
  });
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Received message:", message?.action || "unknown");
    try {
      return messageService.handleMessage(message, sender, sendResponse);
    } catch (error) {
      console.error("Error in message listener:", error);
      sendResponse({ success: false, error: String(error) });
      return true;
    }
  });
})();