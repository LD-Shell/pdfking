/**
 * js/tool-protect.js
 * Logic for the Password Protect PDF tool.
 * Uses qpdf-wasm for AES-256 encryption with user/owner passwords and permission flags.
 */

document.addEventListener('DOMContentLoaded', () => {
    let originalPdfBytes = null;

    // Use the shared utility — works because pdfking-utils.js loads first in HTML
    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    // ─── File Selection ───────────────────────────────────────────────────────

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        document.getElementById('uploadZone').classList.add('hidden');
        document.getElementById('loadingOverlay').classList.remove('hidden');
        document.getElementById('loadingOverlay').classList.add('flex');
        document.getElementById('loadingText').innerText = 'Reading document...';

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes = new Uint8Array(arrayBuffer);

            document.getElementById('fileName').innerText = file.name;
            document.getElementById('fileMeta').innerText = PDFKingUtils.formatBytes(file.size);
            document.getElementById('exportFilename').value = file.name.replace(/\.pdf$/i, '_protected.pdf');

            document.getElementById('loadingOverlay').classList.add('hidden');
            document.getElementById('loadingOverlay').classList.remove('flex');
            document.getElementById('workspace').classList.remove('hidden');
            document.getElementById('workspace').classList.add('flex');

            PDFKingUtils.showToast('PDF loaded. Set your passwords below.', 'success');
        } catch (err) {
            console.error(err);
            PDFKingUtils.showToast('Could not read the PDF file.', 'error');
            resetToUpload();
        }
    }

    // ─── Password Visibility Toggles ──────────────────────────────────────────

    function bindVisibilityToggle(btnId, inputId) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        btn.addEventListener('click', () => {
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.querySelector('i').className = isHidden
                ? 'fa-solid fa-eye-slash text-sm'
                : 'fa-solid fa-eye text-sm';
        });
    }

    bindVisibilityToggle('toggleUserPw',    'userPassword');
    bindVisibilityToggle('toggleConfirmPw', 'confirmPassword');
    bindVisibilityToggle('toggleOwnerPw',   'ownerPassword');

    // ─── Password Strength Meter ──────────────────────────────────────────────

    function getStrength(pw) {
        if (!pw) return { label: '', color: '', pct: '0' };
        let score = 0;
        if (pw.length >= 8)  score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        const levels = [
            { label: 'Too short',   color: 'bg-red-500',    pct: '10%'  },
            { label: 'Weak',        color: 'bg-red-400',    pct: '25%'  },
            { label: 'Fair',        color: 'bg-yellow-400', pct: '50%'  },
            { label: 'Good',        color: 'bg-blue-400',   pct: '75%'  },
            { label: 'Strong',      color: 'bg-green-500',  pct: '90%'  },
            { label: 'Very strong', color: 'bg-green-600',  pct: '100%' },
        ];
        return levels[Math.min(score, 5)];
    }

    document.getElementById('userPassword').addEventListener('input', (e) => {
        const { label, color, pct } = getStrength(e.target.value);
        const bar = document.getElementById('strengthBar');
        const lbl = document.getElementById('strengthLabel');
        bar.className = bar.className.replace(/bg-\S+/g, '').trim();
        bar.classList.add(color || 'bg-transparent');
        bar.style.width = pct || '0';
        lbl.innerText = label;
        validateMatch();
    });

    document.getElementById('confirmPassword').addEventListener('input', validateMatch);

    function validateMatch() {
        const pw  = document.getElementById('userPassword').value;
        const cpw = document.getElementById('confirmPassword').value;
        const lbl = document.getElementById('matchLabel');
        if (!cpw) { lbl.innerText = '\u00A0'; lbl.className = 'text-xs mt-1 text-slate-400'; return; }
        if (pw === cpw) {
            lbl.innerText   = '✓ Passwords match';
            lbl.className   = 'text-xs mt-1 text-green-500';
        } else {
            lbl.innerText   = '✗ Passwords do not match';
            lbl.className   = 'text-xs mt-1 text-red-500';
        }
    }

    // ─── Encryption (WASM) ────────────────────────────────────────────────────

    document.getElementById('encryptBtn').addEventListener('click', async () => {
        const userPw    = document.getElementById('userPassword').value;
        const confirmPw = document.getElementById('confirmPassword').value;
        let ownerPw     = document.getElementById('ownerPassword').value.trim();

        if (!userPw) return PDFKingUtils.showToast('Please enter an open password.', 'error');
        if (userPw !== confirmPw) return PDFKingUtils.showToast('Passwords do not match.', 'error');
        if (userPw.length < 4) return PDFKingUtils.showToast('Password must be at least 4 characters.', 'error');

        // Enforce distinct owner password so restrictions actually apply
        if (!ownerPw) {
            ownerPw = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
        } else if (ownerPw === userPw) {
            return PDFKingUtils.showToast('Owner password must differ from the open password to enforce restrictions.', 'error');
        }

        const btn = document.getElementById('encryptBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Encrypting...';
        btn.disabled  = true;

        let qpdf = null;

        try {
            qpdf = await window.Module({
                locateFile: () => 'js/qpdf.wasm',
                noInitialRun: true,
            });

            qpdf.FS.writeFile('/input.pdf', originalPdfBytes);

            const allowPrint = document.getElementById('allowPrinting').checked;
            const allowCopy  = document.getElementById('allowCopying').checked;
            const allowMod   = document.getElementById('allowModifying').checked;

            const cmdArgs = [
                '--encrypt', userPw, ownerPw, '256',
                ...(!allowPrint ? ['--print=none']   : []),
                ...(!allowCopy  ? ['--extract=n']    : []),
                ...(allowMod    ? ['--modify=all']   : ['--modify=none']),
                '--',
                '/input.pdf',
                '/output.pdf',
            ];

            const exitCode = qpdf.callMain(cmdArgs);

            // Exit 0 = success, 3 = success with warnings
            if (exitCode !== 0 && exitCode !== 3) {
                throw new Error('QPDF exited with code: ' + exitCode);
            }

            const encryptedBytes = qpdf.FS.readFile('/output.pdf');

            let filename = document.getElementById('exportFilename').value.trim() || 'protected.pdf';
            if (!filename.endsWith('.pdf')) filename += '.pdf';

            PDFKingUtils.downloadBlob(encryptedBytes, filename);
            PDFKingUtils.showToast('PDF encrypted with AES-256!', 'success');

            document.getElementById('workspace').classList.add('hidden');
            document.getElementById('workspace').classList.remove('flex');
            document.getElementById('nextSteps').classList.remove('hidden');

        } catch (err) {
            console.error('WASM Error:', err);
            if (err.message && err.message.includes('code: 2')) {
                PDFKingUtils.showToast('This PDF may already be password protected.', 'error');
            } else {
                PDFKingUtils.showToast('Encryption failed. Please ensure this is a valid PDF.', 'error');
            }
        } finally {
            if (qpdf && qpdf.FS) {
                try { qpdf.FS.unlink('/input.pdf');  } catch (e) { /* ignore */ }
                try { qpdf.FS.unlink('/output.pdf'); } catch (e) { /* ignore */ }
            }
            btn.innerHTML = '<i class="fa-solid fa-lock"></i> Encrypt & Download';
            btn.disabled  = false;
        }
    });

    // ─── Change File / Start Over ─────────────────────────────────────────────

    document.getElementById('changeFileBtn').addEventListener('click', resetToUpload);
    document.getElementById('startOverBtn').addEventListener('click', resetToUpload);

    function resetToUpload() {
        originalPdfBytes = null;

        document.getElementById('userPassword').value     = '';
        document.getElementById('confirmPassword').value  = '';
        document.getElementById('ownerPassword').value    = '';
        document.getElementById('strengthBar').style.width = '0';
        document.getElementById('strengthLabel').innerText = '\u00A0';
        document.getElementById('matchLabel').innerText    = '\u00A0';
        document.getElementById('allowPrinting').checked  = true;
        document.getElementById('allowCopying').checked   = true;
        document.getElementById('allowModifying').checked = false;

        document.getElementById('nextSteps').classList.add('hidden');
        document.getElementById('workspace').classList.add('hidden');
        document.getElementById('workspace').classList.remove('flex');
        document.getElementById('uploadZone').classList.remove('hidden');
    }
});
