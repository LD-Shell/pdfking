/**
 * js/tool-unlock.js
 * Logic for the Unlock PDF tool.
 * Uses qpdf-wasm to remove password encryption from PDFs the user owns.
 *
 * Flow:
 *  1. User uploads a PDF.
 *  2. We attempt to load it with pdf-lib (no password) to detect encryption.
 *  3a. Not encrypted → show "already open" panel.
 *  3b. Encrypted → show password entry workspace.
 *  4. User enters password → qpdf --decrypt removes all encryption.
 *  5. Wrong password → shake animation + error message, stay on form.
 */

document.addEventListener('DOMContentLoaded', () => {
    let originalPdfBytes = null;
    let originalFileName = '';

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    // ─── File Selection ───────────────────────────────────────────────────────

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        originalFileName = file.name;

        showLoading('Inspecting document...');

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes = new Uint8Array(arrayBuffer);

            // ── Encryption detection via pdf-lib ──
            // pdf-lib throws when it hits an encrypted PDF without a password.
            // We exploit that to detect encryption without needing qpdf.
            let isEncrypted = false;
            try {
                await PDFLib.PDFDocument.load(originalPdfBytes.slice(0));
                // Loaded fine → not encrypted (or encryption is owner-only with no open password)
                isEncrypted = false;
            } catch (e) {
                // pdf-lib throws "is encrypted" in the message for password-protected files
                if (e.message && e.message.toLowerCase().includes('encrypt')) {
                    isEncrypted = true;
                } else {
                    // Some other parse error — still try to unlock, let qpdf handle it
                    isEncrypted = true;
                }
            }

            hideLoading();

            if (isEncrypted) {
                // Show the locked workspace
                document.getElementById('fileNameLocked').innerText = file.name;
                document.getElementById('fileMetaLocked').innerText = PDFKingUtils.formatBytes(file.size);
                document.getElementById('exportFilename').value = file.name.replace(/\.pdf$/i, '_unlocked.pdf');
                showPanel('workspaceLocked');
                // Auto-focus the password field
                setTimeout(() => document.getElementById('passwordInput').focus(), 50);
            } else {
                // Show the "already open" panel
                document.getElementById('fileNameOpen').innerText = file.name;
                document.getElementById('fileMetaOpen').innerText = PDFKingUtils.formatBytes(file.size);
                showPanel('workspaceOpen');
            }

        } catch (err) {
            console.error(err);
            PDFKingUtils.showToast('Could not read the PDF file.', 'error');
            hideLoading();
            resetToUpload();
        }
    }

    // ─── Password Visibility Toggle ───────────────────────────────────────────

    document.getElementById('togglePw').addEventListener('click', () => {
        const input = document.getElementById('passwordInput');
        const icon  = document.querySelector('#togglePw i');
        const isHidden = input.type === 'password';
        input.type     = isHidden ? 'text' : 'password';
        icon.className = isHidden ? 'fa-solid fa-eye-slash text-sm' : 'fa-solid fa-eye text-sm';
    });

    // Clear error state when user starts retyping
    document.getElementById('passwordInput').addEventListener('input', () => {
        document.getElementById('passwordError').classList.add('hidden');
        document.getElementById('passwordInput').classList.remove(
            'border-red-400', 'dark:border-red-600', 'focus:ring-red-500'
        );
    });

    // Allow Enter key to submit
    document.getElementById('passwordInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('unlockBtn').click();
    });

    // ─── Unlock ───────────────────────────────────────────────────────────────

    document.getElementById('unlockBtn').addEventListener('click', async () => {
        const password = document.getElementById('passwordInput').value;

        if (!password) {
            document.getElementById('passwordInput').focus();
            return PDFKingUtils.showToast('Please enter the PDF password.', 'error');
        }

        const btn = document.getElementById('unlockBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Removing password...';
        btn.disabled  = true;

        let qpdf = null;

        try {
            qpdf = await window.Module({
                locateFile: () => 'js/qpdf.wasm',
                noInitialRun: true,
            });

            qpdf.FS.writeFile('/input.pdf', originalPdfBytes);

            // --decrypt with the supplied password removes all encryption
            // --password= supplies the open (user) password
            const cmdArgs = [
                `--password=${password}`,
                '--decrypt',
                '/input.pdf',
                '/output.pdf',
            ];

            const exitCode = qpdf.callMain(cmdArgs);

            if (exitCode === 2) {
                // Exit code 2 from qpdf = bad password
                showPasswordError();
                return;
            }

            // Exit 0 = success, 3 = success with warnings
            if (exitCode !== 0 && exitCode !== 3) {
                throw new Error('QPDF exited with code: ' + exitCode);
            }

            const decryptedBytes = qpdf.FS.readFile('/output.pdf');

            let filename = document.getElementById('exportFilename').value.trim() || 'unlocked.pdf';
            if (!filename.endsWith('.pdf')) filename += '.pdf';

            PDFKingUtils.downloadBlob(decryptedBytes, filename);
            PDFKingUtils.showToast('Password removed successfully!', 'success');

            showPanel('nextSteps');

        } catch (err) {
            console.error('WASM Error:', err);

            // qpdf surfaces wrong-password errors in the message too
            const msg = (err.message || '').toLowerCase();
            if (msg.includes('password') || msg.includes('code: 2') || msg.includes('invalid password')) {
                showPasswordError();
            } else {
                PDFKingUtils.showToast('Decryption failed. Please ensure this is a valid PDF.', 'error');
            }
        } finally {
            if (qpdf && qpdf.FS) {
                try { qpdf.FS.unlink('/input.pdf');  } catch (e) { /* ignore */ }
                try { qpdf.FS.unlink('/output.pdf'); } catch (e) { /* ignore */ }
            }
            btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Remove Password & Download';
            btn.disabled  = false;
        }
    });

    // ─── Wrong password UX ───────────────────────────────────────────────────

    function showPasswordError() {
        const input = document.getElementById('passwordInput');
        const error = document.getElementById('passwordError');

        // Red border on input
        input.classList.add('border-red-400', 'dark:border-red-600', 'focus:ring-red-500');

        // Shake animation — remove then re-add to retrigger
        input.classList.remove('shake');
        void input.offsetWidth; // force reflow
        input.classList.add('shake');

        // Show error label
        error.classList.remove('hidden');

        // Clear field and refocus
        input.value = '';
        setTimeout(() => input.focus(), 50);

        PDFKingUtils.showToast('Incorrect password. Please try again.', 'error');
    }

    // ─── Panel Management ─────────────────────────────────────────────────────

    const ALL_PANELS = ['uploadZone', 'loadingOverlay', 'workspaceOpen', 'workspaceLocked', 'nextSteps'];

    function showPanel(id) {
        ALL_PANELS.forEach(panelId => {
            const el = document.getElementById(panelId);
            if (!el) return;
            el.classList.add('hidden');
            el.classList.remove('flex');
        });
        const target = document.getElementById(id);
        if (!target) return;
        target.classList.remove('hidden');
        // Sections that use flex layout
        if (['loadingOverlay', 'workspaceOpen', 'workspaceLocked'].includes(id)) {
            target.classList.add('flex');
        }
    }

    function showLoading(text) {
        document.getElementById('loadingText').innerText = text || 'Loading...';
        showPanel('loadingOverlay');
        document.getElementById('uploadZone').classList.add('hidden');
    }

    function hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
        document.getElementById('loadingOverlay').classList.remove('flex');
    }

    // ─── Change File / Reset ──────────────────────────────────────────────────

    document.getElementById('changeFileLockedBtn').addEventListener('click', resetToUpload);
    document.getElementById('changeFileOpenBtn').addEventListener('click', resetToUpload);
    document.getElementById('changeFileOpenBtn2').addEventListener('click', resetToUpload);
    document.getElementById('startOverBtn').addEventListener('click', resetToUpload);

    function resetToUpload() {
        originalPdfBytes = null;
        originalFileName = '';

        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordInput').classList.remove(
            'border-red-400', 'dark:border-red-600', 'focus:ring-red-500', 'shake'
        );
        document.getElementById('passwordError').classList.add('hidden');
        document.getElementById('exportFilename').value = '';

        showPanel('uploadZone');
    }
});
