"use strict";
(() => {
  // src/shared/utils/domain.ts
  function extractDomain(hostname) {
    return hostname.replace(/^www\./, "");
  }
  function getDomainFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const domain = extractDomain(urlObj.hostname);
      const isLocalhost = domain === "localhost" || domain.startsWith("127.");
      const port = urlObj.port;
      if (isLocalhost && port) {
        return `${domain}:${port}`;
      }
      return domain;
    } catch (_) {
      console.error("Invalid URL:", url);
      return "";
    }
  }

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

  // src/popup/utils/constants.ts
  var CSS_CLASSES = {
    SHOW: "show",
    LOADING: "loading",
    ACTIVE: "active",
    SESSION_ITEM: "session-item",
    SESSION_BTN: "session-btn",
    NO_SESSIONS: "no-sessions"
  };
  var UI_TEXT = {
    NO_SESSIONS: "No sessions saved for this site",
    UNNAMED_SESSION: "Unnamed Session",
    LAST_USED: "Last used:",
    LOADING: "Loading...",
    SAVE_SUCCESS: "Session saved successfully",
    SWITCH_SUCCESS: "Session switched successfully",
    DELETE_SUCCESS: "Session deleted successfully"
  };

  // src/popup/components/loadingManager.ts
  var LoadingManager = class {
    constructor() {
      this.isLoading = false;
    }
    showLoading() {
      if (!this.isLoading) {
        document.body.classList.add(CSS_CLASSES.LOADING);
        this.isLoading = true;
      }
    }
    hideLoading() {
      if (this.isLoading) {
        document.body.classList.remove(CSS_CLASSES.LOADING);
        this.isLoading = false;
      }
    }
    async withLoading(operation) {
      try {
        this.showLoading();
        return await operation();
      } finally {
        this.hideLoading();
      }
    }
  };

  // src/popup/utils/dom.ts
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
  function getElementByIdSafe(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element not found with id: ${id}`);
    }
    return element;
  }

  // src/popup/components/modalManager.ts
  var ModalManager = class {
    constructor() {
      this.modals = {
        save: getElementByIdSafe("saveModal"),
        rename: getElementByIdSafe("renameModal"),
        delete: getElementByIdSafe("deleteModal"),
        error: getElementByIdSafe("errorModal"),
        about: getElementByIdSafe("aboutModal"),
        newSessionConfirm: getElementByIdSafe("newSessionConfirmModal"),
        clearSession: getElementByIdSafe("clearSessionModal"),
        exportImport: getElementByIdSafe("exportImportModal"),
        replaceConfirm: getElementByIdSafe("replaceConfirmModal")
      };
      this.inputs = {
        sessionName: getElementByIdSafe("sessionName"),
        sessionOrder: getElementByIdSafe("sessionOrder"),
        newSessionName: getElementByIdSafe("newSessionName"),
        newSessionOrder: getElementByIdSafe("newSessionOrder"),
        importFileInput: getElementByIdSafe("importFileInput")
      };
      this.setupEventListeners();
      this.setupTabSystem();
    }
    setupEventListeners() {
      const closeButtons = [
        { id: "closeSaveModal", modal: "save" },
        { id: "cancelSave", modal: "save" },
        { id: "closeRenameModal", modal: "rename" },
        { id: "cancelRename", modal: "rename" },
        { id: "closeDeleteModal", modal: "delete" },
        { id: "cancelDelete", modal: "delete" },
        { id: "closeErrorModal", modal: "error" },
        { id: "closeErrorModalBtn", modal: "error" },
        { id: "closeAboutModal", modal: "about" },
        { id: "closeAboutModalBtn", modal: "about" },
        { id: "closeNewSessionConfirmModal", modal: "newSessionConfirm" },
        { id: "cancelNewSession", modal: "newSessionConfirm" },
        { id: "closeClearSessionModal", modal: "clearSession" },
        { id: "cancelClearSession", modal: "clearSession" },
        { id: "closeExportImportModal", modal: "exportImport" },
        { id: "closeExportImportModalBtn", modal: "exportImport" },
        { id: "closeReplaceConfirmModal", modal: "replaceConfirm" },
        { id: "cancelReplaceConfirm", modal: "replaceConfirm" }
      ];
      closeButtons.forEach(({ id, modal }) => {
        getElementByIdSafe(id).addEventListener("click", () => this.hide(modal));
      });
      this.inputs.importFileInput.addEventListener("change", () => {
        const importBtn = getElementByIdSafe("importBtn");
        importBtn.disabled = !this.inputs.importFileInput.files || this.inputs.importFileInput.files.length === 0;
      });
      this.inputs.sessionName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          getElementByIdSafe("confirmSave").click();
        }
      });
      this.inputs.newSessionName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          getElementByIdSafe("confirmRename").click();
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.hideVisible();
        }
        if (e.key === "Enter") {
          if (this.isVisible("delete")) {
            e.preventDefault();
            getElementByIdSafe("confirmDelete").click();
          }
          if (this.isVisible("error")) {
            e.preventDefault();
            getElementByIdSafe("closeErrorModal").click();
          }
        }
      });
      Object.entries(this.modals).forEach(([key, modal]) => {
        modal.addEventListener("click", (e) => {
          if (e.target === modal) this.hide(key);
        });
      });
    }
    showSaveModal(defaultName = "Unnamed Session", order) {
      this.inputs.sessionName.value = defaultName;
      this.inputs.sessionOrder.value = order.toString();
      this.show("save");
      this.inputs.sessionName.focus();
      this.inputs.sessionName.select();
    }
    showRenameModal(currentName, currentOrder) {
      this.inputs.newSessionName.value = currentName;
      this.inputs.newSessionOrder.value = currentOrder.toString();
      this.show("rename");
      this.inputs.newSessionName.focus();
      this.inputs.newSessionName.select();
    }
    showDeleteModal(sessionName) {
      const deleteSessionNameEl = document.getElementById("deleteSessionName");
      if (deleteSessionNameEl) {
        deleteSessionNameEl.textContent = sessionName;
      }
      this.show("delete");
      this.modals.delete.focus();
    }
    showErrorModal(message) {
      const errorMessageEl = document.getElementById("errorMessage");
      if (errorMessageEl) {
        errorMessageEl.textContent = message;
      }
      this.show("error");
      this.modals.error.focus();
    }
    showAboutModal() {
      this.show("about");
      this.modals.about.focus();
    }
    showNewSessionConfirmModal() {
      this.show("newSessionConfirm");
      this.modals.newSessionConfirm.focus();
    }
    getSaveModalInput() {
      return {
        name: this.inputs.sessionName.value.trim(),
        order: this.inputs.sessionOrder.value
      };
    }
    getRenameModalInput() {
      return {
        name: this.inputs.newSessionName.value.trim(),
        order: this.inputs.newSessionOrder.value
      };
    }
    hideSaveModal() {
      this.hide("save");
    }
    hideRenameModal() {
      this.hide("rename");
    }
    hideDeleteModal() {
      this.hide("delete");
    }
    hideErrorModal() {
      this.hide("error");
    }
    hideAboutModal() {
      this.hide("about");
    }
    hideNewSessionConfirmModal() {
      this.hide("newSessionConfirm");
    }
    hideClearSessionModal() {
      this.hide("clearSession");
    }
    hideExportImportModal() {
      this.hide("exportImport");
    }
    hideReplaceConfirmModal() {
      this.hide("replaceConfirm");
    }
    showClearSessionModal() {
      this.show("clearSession");
      this.modals.clearSession.focus();
    }
    showExportImportModal() {
      this.show("exportImport");
      this.modals.exportImport.focus();
      this.inputs.importFileInput.value = "";
      getElementByIdSafe("importBtn").disabled = true;
    }
    showReplaceConfirmModal(sessionName) {
      const replaceSessionNameEl = document.getElementById("replaceSessionName");
      if (replaceSessionNameEl) {
        replaceSessionNameEl.textContent = sessionName;
      }
      this.show("replaceConfirm");
      this.modals.replaceConfirm.focus();
    }
    getClearSessionOption() {
      const selectElement = document.getElementById("clearOptionSelect");
      return selectElement ? selectElement.value : "current";
    }
    getExportOption() {
      const selectElement = document.getElementById("exportOptionSelect");
      return selectElement ? selectElement.value : "current";
    }
    setupTabSystem() {
      const exportTabBtn = document.getElementById("exportTabBtn");
      const importTabBtn = document.getElementById("importTabBtn");
      const exportTab = document.getElementById("exportTab");
      const importTab = document.getElementById("importTab");
      if (exportTabBtn && importTabBtn && exportTab && importTab) {
        exportTabBtn.addEventListener("click", () => {
          exportTabBtn.classList.add("active");
          importTabBtn.classList.remove("active");
          exportTab.classList.add("active");
          importTab.classList.remove("active");
        });
        importTabBtn.addEventListener("click", () => {
          importTabBtn.classList.add("active");
          exportTabBtn.classList.remove("active");
          importTab.classList.add("active");
          exportTab.classList.remove("active");
        });
      }
    }
    getImportFile() {
      return this.inputs.importFileInput.files && this.inputs.importFileInput.files.length > 0 ? this.inputs.importFileInput.files[0] : null;
    }
    hideAllModals() {
      this.hideVisible();
      this.inputs.sessionName.value = "";
      this.inputs.sessionOrder.value = "";
      this.inputs.newSessionName.value = "";
      this.inputs.newSessionOrder.value = "";
      this.inputs.importFileInput.value = "";
    }
    isVisible(modalKey) {
      return this.modals[modalKey]?.classList.contains(CSS_CLASSES.SHOW) || false;
    }
    hideVisible() {
      Object.entries(this.modals).forEach(([key, modal]) => {
        if (modal.classList.contains(CSS_CLASSES.SHOW)) {
          this.hide(key);
        }
      });
    }
    show(modalKey) {
      this.modals[modalKey].classList.add(CSS_CLASSES.SHOW);
    }
    hide(modalKey) {
      this.modals[modalKey].classList.remove(CSS_CLASSES.SHOW);
    }
  };

  // src/shared/utils/date.ts
  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
  }

  // src/popup/components/sessionList.ts
  var SessionList = class {
    constructor(container) {
      this.container = container;
      this.container.addEventListener("click", this.handleClick.bind(this));
    }
    setEventHandlers(handlers) {
      this.onSessionClick = handlers.onSessionClick;
      this.onRenameClick = handlers.onRenameClick;
      this.onDeleteClick = handlers.onDeleteClick;
    }
    render(sessions, activeSessions, currentDomain) {
      const domainSessions = sessions.filter((s) => s.domain === currentDomain).sort((a, b) => a.order - b.order);
      const activeSessionId = activeSessions[currentDomain];
      if (domainSessions.length === 0) {
        this.renderEmptyState();
        return;
      }
      this.renderSessions(domainSessions, activeSessionId);
      this.setupTooltips();
    }
    setupTooltips() {
      const gridItems = this.container.querySelectorAll(".session-item.grid-view");
      gridItems.forEach((item) => {
        const tooltip = item.querySelector(".custom-tooltip");
        if (tooltip) {
          item.addEventListener("mouseenter", () => {
            tooltip.style.opacity = "1";
          });
          item.addEventListener("mouseleave", () => {
            tooltip.style.opacity = "0";
          });
        }
      });
    }
    renderEmptyState() {
      this.container.innerHTML = `<div class="${CSS_CLASSES.NO_SESSIONS}">${UI_TEXT.NO_SESSIONS}</div>`;
    }
    renderSessions(sessions, activeSessionId) {
      const isGridView = this.container.classList.contains("grid-view");
      const sessionsHtml = sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const lastUsed = formatDate(session.lastUsed);
        if (isGridView) {
          return `
          <div class="${CSS_CLASSES.SESSION_ITEM} grid-view ${isActive ? CSS_CLASSES.ACTIVE : ""}" data-session-id="${session.id}">
            <div class="session-order">${session.order}</div>
            <div class="custom-tooltip">${escapeHtml(session.name)}</div>
          </div>
        `;
        }
        return `
        <div class="${CSS_CLASSES.SESSION_ITEM} ${isActive ? CSS_CLASSES.ACTIVE : ""} mb-8" data-session-id="${session.id}">
          <div class="session-info">
            <div class="session-name"><span class="session-order-badge">#${session.order}</span> ${escapeHtml(session.name)}</div>
            <div class="session-meta">${UI_TEXT.LAST_USED} ${lastUsed}</div>
          </div>
          <div class="session-actions">
            <button class="${CSS_CLASSES.SESSION_BTN} rename-btn" data-action="rename" data-session-id="${session.id}">
              \u270F\uFE0F
            </button>
            <button class="${CSS_CLASSES.SESSION_BTN} delete-btn" data-action="delete" data-session-id="${session.id}">
              \u{1F5D1}\uFE0F
            </button>
          </div>
        </div>
      `;
      }).join("");
      this.container.innerHTML = sessionsHtml;
    }
    handleClick(e) {
      const target = e.target;
      if (target.classList.contains(CSS_CLASSES.SESSION_BTN)) {
        e.stopPropagation();
        const action = target.dataset.action;
        const sessionId = target.dataset.sessionId;
        if (!sessionId) return;
        if (action === "rename" && this.onRenameClick) {
          this.onRenameClick(sessionId);
        } else if (action === "delete" && this.onDeleteClick) {
          this.onDeleteClick(sessionId);
        }
        return;
      }
      const sessionItem = target.closest(`.${CSS_CLASSES.SESSION_ITEM}`);
      if (sessionItem && this.onSessionClick) {
        const sessionId = sessionItem.dataset.sessionId;
        if (sessionId) {
          this.onSessionClick(sessionId);
        }
      }
    }
  };

  // src/popup/utils/defaultValue.ts
  var storedSessionDefaultValue = {
    cookies: [],
    localStorage: {},
    sessionStorage: {}
  };

  // src/shared/constants/messages.ts
  var MESSAGE_ACTIONS = {
    GET_CURRENT_SESSION: "getCurrentSession",
    SWITCH_SESSION: "switchSession",
    CLEAR_SESSION: "clearSession",
    // GET_CURRENT_DOMAIN removed - now using URL parameters
    CLEAR_SESSIONS: "clearSessions",
    EXPORT_SESSIONS: "exportSessions",
    IMPORT_SESSIONS: "importSessions"
  };

  // src/shared/constants/storageKeys.ts
  var STORAGE_KEYS = {
    SESSIONS: "sessions",
    ACTIVE_SESSIONS: "activeSessions",
    VIEW_MODE: "viewMode"
  };

  // src/shared/utils/idGenerator.ts
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // src/shared/utils/validation.ts
  function validateSessionName(name) {
    const trimmed = name.trim();
    return trimmed || "Unnamed Session";
  }

  // src/popup/services/chromeApi.service.ts
  var ChromeApiService = class {
    async getCurrentTab() {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        throw new Error("No active tab found");
      }
      return tabs[0];
    }
    async sendMessage(message) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              console.error("Chrome runtime error:", chrome.runtime.lastError);
              resolve({
                success: false,
                error: chrome.runtime.lastError.message || "Could not establish connection. Receiving end does not exist."
              });
            } else if (!response) {
              console.error("No response received from background script");
              resolve({
                success: false,
                error: "No response received from background script"
              });
            } else {
              resolve(response);
            }
          });
        } catch (error) {
          console.error("Error sending message:", error);
          resolve({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    }
    async getStorageData(keys) {
      return chrome.storage.local.get(keys);
    }
    async setStorageData(data) {
      return chrome.storage.local.set(data);
    }
  };

  // src/popup/services/popup.service.ts
  var PopupService = class {
    constructor() {
      this.chromeApi = new ChromeApiService();
      this.state = {
        currentDomain: "",
        currentTab: {},
        sessions: [],
        activeSessions: {},
        currentRenameSessionId: "",
        currentDeleteSessionId: "",
        viewMode: "list"
      };
    }
    async initialize() {
      try {
        this.state.currentTab = await this.chromeApi.getCurrentTab();
        if (!this.state.currentTab.url) {
          throw new ExtensionError("Unable to get current tab URL");
        }
        this.state.currentDomain = getDomainFromUrl(this.state.currentTab.url);
        await this.loadStorageData();
        return { ...this.state };
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.initialize"));
      }
    }
    async saveCurrentSession(name, order) {
      try {
        const validatedName = validateSessionName(name);
        const response = await this.chromeApi.sendMessage({
          action: MESSAGE_ACTIONS.GET_CURRENT_SESSION,
          domain: this.state.currentDomain,
          tabId: this.state.currentTab.id
        });
        if (!response.success) {
          throw new ExtensionError(response.error || "Failed to get current session");
        }
        const storedSession = response.data ?? storedSessionDefaultValue;
        const domainSessions = this.state.sessions.filter((s) => s.domain === this.state.currentDomain);
        if (order === void 0) {
          order = domainSessions.length > 0 ? Math.max(...domainSessions.map((s) => s.order || 0)) + 1 : 1;
        }
        this.state.sessions.forEach((s) => {
          if (s.domain === this.state.currentDomain && typeof order === "number" && s.order >= order) {
            s.order++;
          }
        });
        const newSession = {
          ...storedSession,
          id: generateId(),
          name: validatedName,
          order,
          domain: this.state.currentDomain,
          createdAt: Date.now(),
          lastUsed: Date.now()
        };
        this.state.sessions.push(newSession);
        this.state.activeSessions[this.state.currentDomain] = newSession.id;
        await this.saveStorageData();
        return newSession;
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.saveCurrentSession"));
      }
    }
    async switchToSession(sessionId) {
      if (!sessionId) {
        console.error("Invalid session ID provided");
        throw new ExtensionError("Invalid session ID");
      }
      try {
        console.log(`Attempting to switch to session: ${sessionId}`);
        const session = this.state.sessions.find((s) => s.id === sessionId);
        if (!session) {
          console.error(`Session not found: ${sessionId}`);
          throw new ExtensionError("Session not found");
        }
        if (!this.state.currentTab.id) {
          console.error("No active tab ID available");
          throw new ExtensionError("No active tab available");
        }
        console.log(`Sending switch session message for domain: ${this.state.currentDomain}, tab: ${this.state.currentTab.id}`);
        const response = await this.chromeApi.sendMessage({
          action: MESSAGE_ACTIONS.SWITCH_SESSION,
          sessionData: session,
          tabId: this.state.currentTab.id
        });
        if (!response) {
          console.error("No response received from background script");
          throw new ExtensionError("No response received from background script");
        }
        if (!response.success) {
          console.error("Background script reported error:", response.error);
          throw new ExtensionError(response.error || "Failed to switch session");
        }
        console.log(`Successfully switched to session: ${sessionId}`);
        this.state.activeSessions[this.state.currentDomain] = sessionId;
        session.lastUsed = Date.now();
        await this.saveStorageData();
        console.log("Session state updated and saved");
      } catch (error) {
        console.error("Error in switchToSession:", error);
        throw new ExtensionError(handleError(error, "PopupService.switchToSession"));
      }
    }
    async createNewSession() {
      try {
        const response = await this.chromeApi.sendMessage({
          action: MESSAGE_ACTIONS.CLEAR_SESSION,
          domain: this.state.currentDomain,
          tabId: this.state.currentTab.id
        });
        if (!response.success) {
          throw new ExtensionError(response.error || "Failed to clear session");
        }
        delete this.state.activeSessions[this.state.currentDomain];
        await this.saveStorageData();
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.createNewSession"));
      }
    }
    async renameSession(sessionId, newName, newOrder) {
      try {
        const session = this.state.sessions.find((s) => s.id === sessionId);
        if (!session) {
          throw new ExtensionError("Session not found");
        }
        const oldOrder = session.order;
        session.name = validateSessionName(newName);
        if (newOrder !== void 0 && oldOrder !== newOrder) {
          if (newOrder < oldOrder) {
            this.state.sessions.forEach((s) => {
              if (s.id !== sessionId && s.domain === this.state.currentDomain && s.order >= newOrder && s.order < oldOrder) {
                s.order++;
              }
            });
          } else if (newOrder > oldOrder) {
            this.state.sessions.forEach((s) => {
              if (s.id !== sessionId && s.domain === this.state.currentDomain && s.order <= newOrder && s.order > oldOrder) {
                s.order--;
              }
            });
          }
          session.order = newOrder;
        }
        await this.saveStorageData();
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.renameSession"));
      }
    }
    async replaceSession(sessionId) {
      try {
        const session = this.state.sessions.find((s) => s.id === sessionId);
        if (!session) {
          throw new ExtensionError("Session not found");
        }
        const response = await this.chromeApi.sendMessage({
          action: MESSAGE_ACTIONS.GET_CURRENT_SESSION,
          domain: this.state.currentDomain,
          tabId: this.state.currentTab.id
        });
        if (!response.success) {
          throw new ExtensionError(response.error || "Failed to get current session");
        }
        const storedSession = response.data ?? storedSessionDefaultValue;
        session.cookies = storedSession.cookies;
        session.localStorage = storedSession.localStorage;
        session.sessionStorage = storedSession.sessionStorage;
        session.lastUsed = Date.now();
        this.state.activeSessions[this.state.currentDomain] = sessionId;
        await this.saveStorageData();
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.replaceSession"));
      }
    }
    async deleteSession(sessionId) {
      try {
        const sessionToDelete = this.state.sessions.find((s) => s.id === sessionId);
        if (!sessionToDelete) {
          throw new ExtensionError("Session not found");
        }
        const deletedOrder = sessionToDelete.order;
        const deletedDomain = sessionToDelete.domain;
        this.state.sessions = this.state.sessions.filter((s) => s.id !== sessionId);
        this.state.sessions.forEach((s) => {
          if (s.domain === deletedDomain && s.order > deletedOrder) {
            s.order--;
          }
        });
        if (this.state.activeSessions[this.state.currentDomain] === sessionId) {
          delete this.state.activeSessions[this.state.currentDomain];
        }
        await this.saveStorageData();
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.deleteSession"));
      }
    }
    getSession(sessionId) {
      return this.state.sessions.find((s) => s.id === sessionId);
    }
    getState() {
      return { ...this.state };
    }
    setState(newState) {
      this.state = { ...this.state, ...newState };
    }
    async loadStorageData() {
      try {
        const result = await this.chromeApi.getStorageData([
          STORAGE_KEYS.SESSIONS,
          STORAGE_KEYS.ACTIVE_SESSIONS,
          STORAGE_KEYS.VIEW_MODE
        ]);
        this.state.sessions = result[STORAGE_KEYS.SESSIONS] || [];
        this.state.activeSessions = result[STORAGE_KEYS.ACTIVE_SESSIONS] || {};
        this.state.viewMode = result[STORAGE_KEYS.VIEW_MODE] || "list";
      } catch (error) {
        console.error("Error loading storage data:", error);
        this.state.sessions = [];
        this.state.activeSessions = {};
        this.state.viewMode = "list";
      }
    }
    async saveStorageData() {
      await this.chromeApi.setStorageData({
        [STORAGE_KEYS.SESSIONS]: this.state.sessions,
        [STORAGE_KEYS.ACTIVE_SESSIONS]: this.state.activeSessions,
        [STORAGE_KEYS.VIEW_MODE]: this.state.viewMode
      });
    }
    async setViewMode(mode) {
      this.state.viewMode = mode;
      await this.saveStorageData();
    }
    async clearSessions(clearOption) {
      try {
        if (clearOption === "current") {
          this.state.sessions = this.state.sessions.filter((s) => s.domain !== this.state.currentDomain);
          delete this.state.activeSessions[this.state.currentDomain];
          const response = await this.chromeApi.sendMessage({
            action: MESSAGE_ACTIONS.CLEAR_SESSION,
            domain: this.state.currentDomain,
            tabId: this.state.currentTab.id
          });
          if (!response.success) {
            throw new ExtensionError(response.error || "Failed to clear current session");
          }
        } else if (clearOption === "all") {
          this.state.sessions = [];
          this.state.activeSessions = {};
          const response = await this.chromeApi.sendMessage({
            action: MESSAGE_ACTIONS.CLEAR_SESSION,
            domain: this.state.currentDomain,
            tabId: this.state.currentTab.id
          });
          if (!response.success) {
            throw new ExtensionError(response.error || "Failed to clear current session");
          }
        }
        await this.saveStorageData();
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.clearSessions"));
      }
    }
    exportSessions(exportOption) {
      try {
        let sessionsToExport = [];
        if (exportOption === "current") {
          sessionsToExport = this.state.sessions.filter((s) => s.domain === this.state.currentDomain);
        } else if (exportOption === "all") {
          sessionsToExport = [...this.state.sessions];
        }
        const exportData = {
          sessions: sessionsToExport,
          exportDate: (/* @__PURE__ */ new Date()).toISOString(),
          version: "1.0.0"
        };
        return JSON.stringify(exportData, null, 2);
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.exportSessions"));
      }
    }
    async importSessions(jsonData) {
      try {
        const importData = JSON.parse(jsonData);
        if (!importData || !Array.isArray(importData.sessions)) {
          throw new ExtensionError("Invalid import data format");
        }
        const importedSessions = importData.sessions;
        for (const session of importedSessions) {
          if (!session.id || !session.domain || !session.name) {
            throw new ExtensionError("Invalid session data in import file");
          }
        }
        const existingIds = new Set(this.state.sessions.map((s) => s.id));
        importedSessions.forEach((session) => {
          if (existingIds.has(session.id)) {
            session.id = generateId();
          }
          existingIds.add(session.id);
        });
        this.state.sessions = [...this.state.sessions, ...importedSessions];
        await this.saveStorageData();
        return;
      } catch (error) {
        throw new ExtensionError(handleError(error, "PopupService.importSessions"));
      }
    }
  };

  // src/popup/index.ts
  var PopupController = class {
    constructor() {
      this.loadingManager = new LoadingManager();
      this.modalManager = new ModalManager();
      this.popupService = new PopupService();
      this.currentSiteElement = getElementByIdSafe("currentSite");
      this.saveBtn = getElementByIdSafe("saveBtn");
      this.newSessionBtn = getElementByIdSafe("newSessionBtn");
      this.clearSessionBtn = getElementByIdSafe("clearSessionBtn");
      this.exportImportBtn = getElementByIdSafe("exportImportBtn");
      this.viewModeBtn = getElementByIdSafe("viewModeBtn");
      this.menuBtn = getElementByIdSafe("menuBtn");
      this.menuDropdown = getElementByIdSafe("menuDropdown");
      this.aboutBtn = getElementByIdSafe("aboutBtn");
      this.sessionsListElement = getElementByIdSafe("sessionsList");
      this.sessionList = new SessionList(this.sessionsListElement);
      this.setupSessionListHandlers();
      this.setupEventListeners();
    }
    async initialize() {
      try {
        this.modalManager.hideAllModals();
        this.state = await this.loadingManager.withLoading(async () => {
          return await this.popupService.initialize();
        });
        this.currentSiteElement.textContent = this.state.currentDomain;
        if (this.state.viewMode === "grid") {
          this.switchToGridView(false);
        } else {
          this.switchToListView(false);
        }
        this.renderSessionsList();
      } catch (error) {
        this.showError(handleError(error, "PopupController.initialize"));
      }
    }
    getServiceInstance() {
      return this.popupService;
    }
    setupEventListeners() {
      this.saveBtn.addEventListener("click", () => this.handleSaveClick());
      this.newSessionBtn.addEventListener("click", () => this.handleNewSessionConfirmClick());
      this.clearSessionBtn.addEventListener("click", () => this.handleClearSessionClick());
      this.exportImportBtn.addEventListener("click", () => this.handleExportImportClick());
      this.viewModeBtn.addEventListener("click", () => this.toggleViewMode());
      this.menuBtn.addEventListener("click", () => this.toggleMenu());
      this.aboutBtn.addEventListener("click", () => this.handleAboutClick());
      document.addEventListener("click", (e) => {
        if (!this.menuBtn.contains(e.target) && !this.menuDropdown.contains(e.target)) {
          this.menuDropdown.classList.remove("show");
        }
      });
      getElementByIdSafe("confirmSave").addEventListener("click", () => this.handleConfirmSave());
      getElementByIdSafe("confirmRename").addEventListener("click", () => this.handleConfirmRename());
      getElementByIdSafe("confirmDelete").addEventListener("click", () => this.handleConfirmDelete());
      getElementByIdSafe("replaceSessionBtn").addEventListener("click", () => this.handleReplaceSessionClick());
      getElementByIdSafe("confirmReplaceSession").addEventListener("click", () => this.handleReplaceSession());
      getElementByIdSafe("confirmNewSession").addEventListener("click", () => this.handleNewSessionClick());
      getElementByIdSafe("confirmClearSession").addEventListener("click", () => this.handleConfirmClearSession());
      getElementByIdSafe("exportBtn").addEventListener("click", () => this.handleExport());
      getElementByIdSafe("importBtn").addEventListener("click", () => this.handleImport());
    }
    setupSessionListHandlers() {
      this.sessionList.setEventHandlers({
        onSessionClick: (sessionId) => this.handleSessionSwitch(sessionId),
        onRenameClick: (sessionId) => this.handleRenameClick(sessionId),
        onDeleteClick: (sessionId) => this.handleDeleteClick(sessionId)
      });
    }
    async handleSaveClick() {
      const state = this.popupService.getState();
      const currentDomain = state.currentDomain;
      const domainSessions = state.sessions.filter((s) => s.domain === currentDomain);
      const nextOrder = domainSessions.length > 0 ? Math.max(...domainSessions.map((s) => s.order || 0)) + 1 : 1;
      this.modalManager.showSaveModal("", nextOrder);
    }
    async handleConfirmSave() {
      try {
        const { name, order } = this.modalManager.getSaveModalInput();
        await this.loadingManager.withLoading(async () => {
          const orderNum = order ? parseInt(order, 10) : void 0;
          await this.popupService.saveCurrentSession(name, orderNum);
        });
        this.modalManager.hideSaveModal();
        this.renderSessionsList();
      } catch (error) {
        this.showError(handleError(error, "save session"));
      }
    }
    async handleNewSessionClick() {
      try {
        await this.loadingManager.withLoading(async () => {
          await this.popupService.createNewSession();
        });
        this.renderSessionsList();
      } catch (error) {
        this.showError(handleError(error, "create new session"));
      }
    }
    async handleSessionSwitch(sessionId) {
      if (!sessionId) {
        this.showError("Invalid session ID");
        return;
      }
      try {
        console.log("Switching to session:", sessionId);
        await this.loadingManager.withLoading(async () => {
          await this.popupService.switchToSession(sessionId);
        });
        console.log("Session switch completed successfully");
        this.renderSessionsList();
      } catch (error) {
        console.error("Error switching session:", error);
        const errorMessage = handleError(error, "switch session");
        if (errorMessage.includes("Receiving end does not exist")) {
          this.showError("Connection to background service failed. Please try reloading the extension.");
        } else {
          this.showError(errorMessage);
        }
      }
    }
    handleRenameClick(sessionId) {
      const session = this.popupService.getSession(sessionId);
      if (session) {
        this.popupService.setState({ currentRenameSessionId: sessionId });
        this.modalManager.showRenameModal(session.name, session.order);
      }
    }
    async handleConfirmRename() {
      try {
        const { name, order } = this.modalManager.getRenameModalInput();
        const sessionId = this.popupService.getState().currentRenameSessionId;
        if (name && order && sessionId) {
          const orderNum = parseInt(order, 10);
          await this.popupService.renameSession(sessionId, name, orderNum);
          this.renderSessionsList();
        }
        this.modalManager.hideRenameModal();
      } catch (error) {
        this.showError(handleError(error, "rename session"));
      }
    }
    handleReplaceSessionClick() {
      try {
        const sessionId = this.popupService.getState().currentRenameSessionId;
        if (sessionId) {
          const session = this.popupService.getSession(sessionId);
          if (session) {
            this.modalManager.showReplaceConfirmModal(session.name);
          }
        }
        return Promise.resolve();
      } catch (error) {
        this.showError(handleError(error, "prepare replace session"));
        return Promise.resolve();
      }
    }
    async handleReplaceSession() {
      try {
        const sessionId = this.popupService.getState().currentRenameSessionId;
        if (sessionId) {
          await this.loadingManager.withLoading(async () => {
            await this.popupService.replaceSession(sessionId);
          });
          this.renderSessionsList();
        }
        this.modalManager.hideReplaceConfirmModal();
        this.modalManager.hideRenameModal();
      } catch (error) {
        this.showError(handleError(error, "replace session"));
      }
    }
    handleDeleteClick(sessionId) {
      const session = this.popupService.getSession(sessionId);
      if (session) {
        this.popupService.setState({ currentDeleteSessionId: sessionId });
        this.modalManager.showDeleteModal(session.name);
      }
    }
    async handleConfirmDelete() {
      try {
        const sessionId = this.popupService.getState().currentDeleteSessionId;
        if (sessionId) {
          await this.popupService.deleteSession(sessionId);
          this.renderSessionsList();
        }
        this.modalManager.hideDeleteModal();
      } catch (error) {
        this.showError(handleError(error, "delete session"));
      }
    }
    switchToListView(savePreference = true) {
      this.sessionsListElement.classList.remove("grid-view");
      this.viewModeBtn.textContent = "Grid";
      if (savePreference) {
        this.popupService.setViewMode("list");
      }
      this.renderSessionsList();
    }
    switchToGridView(savePreference = true) {
      this.sessionsListElement.classList.add("grid-view");
      this.viewModeBtn.textContent = "List";
      if (savePreference) {
        this.popupService.setViewMode("grid");
      }
      this.renderSessionsList();
    }
    toggleViewMode() {
      const isGridView = this.sessionsListElement.classList.contains("grid-view");
      if (isGridView) {
        this.switchToListView();
      } else {
        this.switchToGridView();
      }
    }
    toggleMenu() {
      this.menuDropdown.classList.toggle("show");
    }
    handleAboutClick() {
      this.modalManager.showAboutModal();
      this.menuDropdown.classList.remove("show");
    }
    handleNewSessionConfirmClick() {
      this.modalManager.showNewSessionConfirmModal();
      this.menuDropdown.classList.remove("show");
    }
    renderSessionsList() {
      const state = this.popupService.getState();
      this.sessionList.render(state.sessions, state.activeSessions, state.currentDomain);
    }
    showError(message) {
      console.error("Popup error:", message);
      this.modalManager.showErrorModal(message);
    }
    handleClearSessionClick() {
      this.modalManager.showClearSessionModal();
      this.menuDropdown.classList.remove("show");
    }
    async handleConfirmClearSession() {
      try {
        const clearOption = this.modalManager.getClearSessionOption();
        await this.loadingManager.withLoading(async () => {
          await this.popupService.clearSessions(clearOption);
        });
        this.modalManager.hideClearSessionModal();
        this.renderSessionsList();
      } catch (error) {
        this.showError(handleError(error, "clear sessions"));
      }
    }
    handleExportImportClick() {
      this.modalManager.showExportImportModal();
      this.menuDropdown.classList.remove("show");
    }
    handleExport() {
      try {
        const exportOption = this.modalManager.getExportOption();
        const jsonData = this.popupService.exportSessions(exportOption);
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `session-switcher-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
      } catch (error) {
        this.showError(handleError(error, "export sessions"));
      }
    }
    async handleImport() {
      try {
        const file = this.modalManager.getImportFile();
        if (!file) {
          this.showError("No file selected");
          return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const jsonData = e.target?.result;
            await this.loadingManager.withLoading(async () => {
              await this.popupService.importSessions(jsonData);
            });
            this.modalManager.hideExportImportModal();
            this.renderSessionsList();
          } catch (error) {
            this.showError(handleError(error, "import sessions"));
          }
        };
        reader.onerror = () => {
          this.showError("Error reading file");
        };
        reader.readAsText(file);
      } catch (error) {
        this.showError(handleError(error, "import sessions"));
      }
    }
  };
  document.addEventListener("DOMContentLoaded", async () => {
    console.log("Session Switcher popup loaded");
    const controller = new PopupController();
    await controller.initialize();
    const service = controller.getServiceInstance();
    const state = service.getState();
    let currentDomain = state.currentDomain;
    const tabActivatedListener = async (activeInfo) => {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url) {
        const newDomain = getDomainFromUrl(tab.url);
        if (newDomain !== currentDomain) {
          currentDomain = newDomain;
          await controller.initialize();
        }
      }
    };
    const tabUpdatedListener = async (_, changeInfo, tab) => {
      if (changeInfo.status === "complete" && tab.url) {
        const newDomain = getDomainFromUrl(tab.url);
        if (newDomain !== currentDomain) {
          currentDomain = newDomain;
          await controller.initialize();
        }
      }
    };
    chrome.tabs.onActivated.addListener(tabActivatedListener);
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);
    const cleanup = () => {
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
    };
    window.addEventListener("beforeunload", cleanup);
    window.addEventListener("unload", cleanup);
  });
})();
