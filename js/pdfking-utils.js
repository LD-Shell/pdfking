/**
 * js/pdfking-utils.js
 * Core utilities for PDFKing. Included on every page.
 */

const PDFKingUtils = {
    // --- 1. THEME MANAGEMENT ---
    initThemeToggle: function(toggleBtnId) {
        const btn = document.getElementById(toggleBtnId);
        if (!btn) return;

        // Apply initial state based on localStorage or OS preference
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        }

        btn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        });
    },

    // --- 2. TOAST NOTIFICATIONS ---
    showToast: function(message, type = 'info') {
        let container = document.getElementById('toastContainer');
        
        // Auto-inject container if it doesn't exist
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-3';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const bg = type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' 
                 : type === 'error' ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' 
                 : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
        
        const icon = type === 'success' ? 'fa-check-circle' 
                   : type === 'error' ? 'fa-exclamation-triangle' 
                   : 'fa-info-circle';
        
        // Add Tailwind animation classes dynamically
        toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg transition-all duration-300 transform translate-y-full opacity-0 ${bg}`;
        toast.innerHTML = `<i class="fa-solid ${icon}"></i><span class="font-medium text-sm">${message}</span>`;
        
        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-full', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');
        });

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove('translate-y-0', 'opacity-100');
            toast.classList.add('translate-y-full', 'opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // --- 3. DRAG & DROP ZONE BINDER ---
    // Takes the IDs of your drop zone and file input, and the callback function for when files arrive
    bindFileUpload: function(zoneId, inputId, onFilesReady) {
        const zone = document.getElementById(zoneId);
        const input = document.getElementById(inputId);
        if (!zone || !input) return;

        zone.addEventListener('click', () => input.click());
        
        zone.addEventListener('dragover', (e) => { 
            e.preventDefault(); 
            zone.classList.add('border-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/20'); // Highlight state
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('border-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/20');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('border-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/20');
            if (e.dataTransfer.files.length) onFilesReady(e.dataTransfer.files);
        });
        
        input.addEventListener('change', (e) => {
            if (e.target.files.length) onFilesReady(e.target.files);
            input.value = ''; // Reset so the same file can be uploaded again if needed
        });
    },

    // --- 4. FILE DOWNLOAD HELPER ---
    downloadBlob: function(bytes, filename, mimeType = 'application/pdf') {
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        a.remove();
    },

    // --- 5. BYTE FORMATTER ---
    formatBytes: function(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};