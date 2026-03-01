"use strict";

class ImportManager {
    constructor() {
        this.selectedFile = null;
        this.fileData = null;
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.dragDropArea = document.getElementById('dragDropArea');
        this.fileInput = document.getElementById('fileInput');
        this.browseBtn = document.getElementById('browseBtn');
        this.fileInfo = document.getElementById('fileInfo');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.previewInfo = document.getElementById('previewInfo');
        this.stats = document.getElementById('stats');
        this.totalSessions = document.getElementById('totalSessions');
        this.uniqueDomains = document.getElementById('uniqueDomains');
        this.message = document.getElementById('message');
        this.importBtn = document.getElementById('importBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.backLink = document.getElementById('backLink');
    }

    setupEventListeners() {
        // Drag and drop events
        this.dragDropArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.dragDropArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.dragDropArea.addEventListener('drop', this.handleDrop.bind(this));

        // Click events
        this.browseBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Button events
        this.importBtn.addEventListener('click', this.handleImport.bind(this));
        this.cancelBtn.addEventListener('click', this.handleCancel.bind(this));
        this.backLink.addEventListener('click', this.handleBack.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dragDropArea.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dragDropArea.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dragDropArea.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    async processFile(file) {
        if (!file.name.toLowerCase().endsWith('.json')) {
            this.showMessage('Please select a JSON file', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            this.showMessage('File too large (max 10MB)', 'error');
            return;
        }

        this.selectedFile = file;

        // Update file info display
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);

        try {
            const text = await file.text();
            this.fileData = JSON.parse(text);

            if (!this.validateFileData(this.fileData)) {
                throw new Error('Invalid session data format. File must contain a "sessions" array.');
            }

            this.updatePreview();
            this.fileInfo.classList.add('show');
            this.importBtn.disabled = false;
            this.showMessage('File loaded successfully', 'success');

        } catch (error) {
            console.error('Error processing file:', error);
            this.showMessage(`Error: ${error.message}`, 'error');
            this.resetFileSelection();
        }
    }

    validateFileData(data) {
        if (!data || typeof data !== 'object') {
            return false;
        }

        if (!Array.isArray(data.sessions)) {
            return false;
        }

        if (data.sessions.length === 0) {
            return false;
        }

        // Validate each session has required fields
        for (const session of data.sessions) {
            if (!session.name || !session.domain) {
                return false;
            }
        }

        return true;
    }

    updatePreview() {
        if (!this.fileData) return;

        const sessions = this.fileData.sessions;
        const domains = new Set(sessions.map(s => s.domain));

        // Update stats
        this.totalSessions.textContent = sessions.length;
        this.uniqueDomains.textContent = domains.size;
        this.stats.style.display = 'grid';

        // Create preview text
        let previewText = 'Session data preview:\n\n';

        // Show first 3 sessions as preview
        sessions.slice(0, 3).forEach((session, index) => {
            previewText += `${index + 1}. ${session.name}\n`;
            previewText += `   Domain: ${session.domain}\n`;
            previewText += `   Created: ${new Date(session.createdAt || Date.now()).toLocaleDateString()}\n\n`;
        });

        if (sessions.length > 3) {
            previewText += `... and ${sessions.length - 3} more sessions`;
        }

        this.previewInfo.textContent = previewText;
    }

    async handleImport() {
        if (!this.selectedFile || !this.fileData) {
            this.showMessage('No file selected', 'error');
            return;
        }

        this.showLoading(true);
        this.showMessage('Importing sessions...', 'warning');

        try {
            // Send the import request to background script
            const response = await this.sendMessageToBackground({
                action: 'IMPORT_SESSIONS',
                data: this.fileData  // Send the parsed object directly
            });

            if (response && response.success) {
                this.showMessage(`Successfully imported ${this.fileData.sessions.length} sessions!`, 'success');
                this.importBtn.disabled = true;

                // Auto-close after successful import
                setTimeout(() => {
                    window.close();
                }, 3000);
            } else {
                const errorMsg = response ? response.error : 'No response from extension';
                throw new Error(errorMsg || 'Import failed');
            }
        } catch (error) {
            console.error('Import error:', error);
            this.showMessage(`Import failed: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async sendMessageToBackground(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Runtime error:', chrome.runtime.lastError);
                    resolve({
                        success: false,
                        error: chrome.runtime.lastError.message || 'Could not connect to extension'
                    });
                    return;
                }
                resolve(response || { success: false, error: 'No response received' });
            });
        });
    }

    handleCancel() {
        this.resetFileSelection();
    }

    handleBack(e) {
        if (e) e.preventDefault();
        window.close();
    }

    resetFileSelection() {
        this.selectedFile = null;
        this.fileData = null;
        this.fileInput.value = '';
        this.fileInfo.classList.remove('show');
        this.importBtn.disabled = true;
        this.message.classList.remove('show');
        this.stats.style.display = 'none';
    }

    showMessage(text, type) {
        this.message.textContent = text;
        this.message.className = 'message ' + type;
        this.message.classList.add('show');

        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                this.message.classList.remove('show');
            }, 5000);
        }
    }

    showLoading(show) {
        const loading = this.importBtn.querySelector('.loading');
        if (show) {
            loading.style.display = 'inline-block';
            this.importBtn.disabled = true;
        } else {
            loading.style.display = 'none';
            if (this.fileData) {
                this.importBtn.disabled = false;
            }
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ImportManager();
});