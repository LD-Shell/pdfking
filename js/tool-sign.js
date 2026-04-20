/**
 * js/tool-sign.js
 * Logic for the Sign PDF tool.
 *
 * Flow:
 *  1. Upload PDF → render page 1 via pdf.js
 *  2. Create signature via Draw / Type / Upload tab
 *  3. "Place on Document" → signature appears as a draggable overlay
 *  4. User drags to position, corner-drags to resize
 *  5. Save → pdf-lib embeds signature PNG at the recorded position, downloads
 *
 * Libraries:
 *  - signature_pad  → smooth draw-mode canvas
 *  - pdf.js         → page rendering + coordinate transform
 *  - pdf-lib        → image embedding + PDF save
 */

document.addEventListener('DOMContentLoaded', () => {

    // ── State ──────────────────────────────────────────────────────────────────
    let originalPdfBytes = null;
    let pdfJsDoc         = null;
    let currentPage      = 1;
    let totalPages       = 1;
    const RENDER_SCALE   = 1.5;

    // Signature state
    let signaturePad     = null;
    let activeTab        = 'draw';
    let selectedFont     = 'Dancing Script';
    let uploadedSigDataUrl = null;

    // Overlay placement state
    let sigDataUrl       = null;   // final PNG data URL of the signature
    let overlayPlaced    = false;

    // Overlay drag state
    let isDragging       = false;
    let isResizing       = false;
    let dragStartX       = 0;
    let dragStartY       = 0;
    let overlayStartLeft = 0;
    let overlayStartTop  = 0;
    let overlayStartW    = 0;
    let overlayStartH    = 0;

    // ── Init ───────────────────────────────────────────────────────────────────
    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    // ── File handling ──────────────────────────────────────────────────────────
    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        showLoading('Loading document...');

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes  = new Uint8Array(arrayBuffer);

            pdfJsDoc   = await pdfjsLib.getDocument({ data: originalPdfBytes.slice(0) }).promise;
            totalPages = pdfJsDoc.numPages;
            currentPage = 1;

            document.getElementById('workspaceFileName').innerText = file.name;
            document.getElementById('exportFilename').value = file.name.replace(/\.pdf$/i, '_signed.pdf');

            buildPagePills();
            hideLoading();
            showPanel('workspace');

            await renderPage(currentPage);
            initSignaturePad();

        } catch (err) {
            console.error(err);
            PDFKingUtils.showToast('Could not read the PDF file.', 'error');
            hideLoading();
            resetToUpload();
        }
    }

    // ── PDF page rendering ─────────────────────────────────────────────────────
    async function renderPage(pageNum) {
        removeOverlay();

        const page     = await pdfJsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas   = document.getElementById('previewCanvas');
        const ctx      = canvas.getContext('2d');

        canvas.width  = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
        updatePagePills(pageNum);
    }

    // ── Signature Pad (Draw tab) ───────────────────────────────────────────────
    function initSignaturePad() {
        const canvas = document.getElementById('drawCanvas');
        // Size the canvas to its CSS dimensions
        const rect = canvas.getBoundingClientRect();
        canvas.width  = rect.width  * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        const ctx = canvas.getContext('2d');
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        if (signaturePad) signaturePad.off();
        signaturePad = new SignaturePad(canvas, {
            penColor: document.getElementById('penColor').value,
            minWidth: 1.5,
            maxWidth: 3,
            velocityFilterWeight: 0.7,
        });

        signaturePad.addEventListener('beginStroke', () => {
            document.getElementById('drawHint').style.display = 'none';
        });
    }

    document.getElementById('penColor').addEventListener('input', (e) => {
        if (signaturePad) signaturePad.penColor = e.target.value;
    });

    document.getElementById('clearDrawBtn').addEventListener('click', () => {
        if (signaturePad) signaturePad.clear();
        document.getElementById('drawHint').style.display = '';
    });

    // ── Tabs ───────────────────────────────────────────────────────────────────
    document.querySelectorAll('.sig-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            document.querySelectorAll('.sig-tab').forEach(b => {
                b.classList.remove('active');
                b.classList.add('text-slate-500', 'dark:text-slate-400');
            });
            btn.classList.add('active');
            btn.classList.remove('text-slate-500', 'dark:text-slate-400');

            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            document.getElementById(`tab${capitalize(activeTab)}`).classList.remove('hidden');

            // Re-init pad when switching back to draw — canvas may have resized
            if (activeTab === 'draw') setTimeout(initSignaturePad, 50);
        });
    });

    // ── Font selection ─────────────────────────────────────────────────────────
    document.querySelectorAll('.font-option').forEach(el => {
        el.addEventListener('click', () => {
            document.querySelectorAll('.font-option').forEach(f => f.classList.remove('selected'));
            el.classList.add('selected');
            selectedFont = el.dataset.font;
        });
    });

    // Live preview: update font option labels with typed name
    document.getElementById('typeInput').addEventListener('input', (e) => {
        const val = e.target.value || 'Your Signature';
        document.querySelectorAll('.font-option span').forEach(span => {
            span.textContent = val;
        });
    });

    // ── Upload tab ─────────────────────────────────────────────────────────────
    const uploadSigZone  = document.getElementById('uploadSigZone');
    const sigImageInput  = document.getElementById('sigImageInput');

    uploadSigZone.addEventListener('click', () => sigImageInput.click());
    uploadSigZone.addEventListener('dragover', e => { e.preventDefault(); uploadSigZone.classList.add('border-indigo-400'); });
    uploadSigZone.addEventListener('dragleave', () => uploadSigZone.classList.remove('border-indigo-400'));
    uploadSigZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadSigZone.classList.remove('border-indigo-400');
        if (e.dataTransfer.files[0]) loadSigImage(e.dataTransfer.files[0]);
    });

    sigImageInput.addEventListener('change', e => {
        if (e.target.files[0]) loadSigImage(e.target.files[0]);
    });

    function loadSigImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedSigDataUrl = e.target.result;
            document.getElementById('uploadedSigImg').src = uploadedSigDataUrl;
            document.getElementById('uploadPreview').classList.remove('hidden');
            uploadSigZone.classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }

    document.getElementById('clearUploadBtn').addEventListener('click', () => {
        uploadedSigDataUrl = null;
        sigImageInput.value = '';
        document.getElementById('uploadPreview').classList.add('hidden');
        uploadSigZone.classList.remove('hidden');
    });

    // ── Apply signature → place overlay ───────────────────────────────────────
    document.getElementById('applySignatureBtn').addEventListener('click', async () => {
        const dataUrl = await buildSignatureDataUrl();
        if (!dataUrl) return;

        sigDataUrl = dataUrl;
        placeOverlay(dataUrl);
    });

    async function buildSignatureDataUrl() {
        if (activeTab === 'draw') {
            if (!signaturePad || signaturePad.isEmpty()) {
                PDFKingUtils.showToast('Please draw your signature first.', 'error');
                return null;
            }
            return signaturePad.toDataURL('image/png');

        } else if (activeTab === 'type') {
            const text = document.getElementById('typeInput').value.trim();
            if (!text) {
                PDFKingUtils.showToast('Please type your name first.', 'error');
                return null;
            }
            return renderTextSignature(text, selectedFont);

        } else if (activeTab === 'upload') {
            if (!uploadedSigDataUrl) {
                PDFKingUtils.showToast('Please upload a signature image first.', 'error');
                return null;
            }
            return uploadedSigDataUrl;
        }
        return null;
    }

    function renderTextSignature(text, font) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d');
        const fontSize = 72;
        ctx.font = `${fontSize}px "${font}"`;
        const metrics = ctx.measureText(text);
        const w = Math.ceil(metrics.width) + 40;
        const h = fontSize + 30;
        canvas.width  = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.font      = `${fontSize}px "${font}"`;
        ctx.fillStyle = '#1e293b';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 20, h / 2);
        return canvas.toDataURL('image/png');
    }

    // ── Overlay: place, drag, resize, remove ──────────────────────────────────
    function placeOverlay(dataUrl) {
        removeOverlay();

        const wrapper = document.getElementById('previewWrapper');
        const canvas  = document.getElementById('previewCanvas');

        // Default size: 30% of canvas width, proportional height
        const img = new Image();
        img.onload = () => {
            const defaultW = Math.round(canvas.width * 0.30);
            const aspect   = img.naturalHeight / img.naturalWidth;
            const defaultH = Math.round(defaultW * aspect);

            // Place bottom-centre of the page
            const left = Math.round((canvas.width - defaultW) / 2);
            const top  = Math.round(canvas.height * 0.72);

            const overlay = document.createElement('div');
            overlay.id = 'sigOverlay';
            overlay.style.left   = `${left}px`;
            overlay.style.top    = `${top}px`;
            overlay.style.width  = `${defaultW}px`;
            overlay.style.height = `${defaultH}px`;

            const imgEl = document.createElement('img');
            imgEl.src    = dataUrl;
            imgEl.style.width  = '100%';
            imgEl.style.height = '100%';
            imgEl.style.objectFit = 'contain';
            overlay.appendChild(imgEl);

            // Resize handle
            const resizeHandle = document.createElement('div');
            resizeHandle.id = 'resizeHandle';
            overlay.appendChild(resizeHandle);

            // Delete handle
            const deleteHandle = document.createElement('div');
            deleteHandle.id = 'deleteHandle';
            deleteHandle.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            deleteHandle.addEventListener('click', removeOverlay);
            overlay.appendChild(deleteHandle);

            wrapper.appendChild(overlay);
            overlayPlaced = true;

            // Show step 2 hint
            document.getElementById('step2hint').classList.remove('hidden');

            bindOverlayEvents(overlay, resizeHandle);
        };
        img.src = dataUrl;
    }

    function removeOverlay() {
        const existing = document.getElementById('sigOverlay');
        if (existing) existing.remove();
        overlayPlaced = false;
        document.getElementById('step2hint').classList.add('hidden');
    }

    function bindOverlayEvents(overlay, resizeHandle) {
        // ── Drag ────────────────────────────────────────────
        overlay.addEventListener('mousedown', startDrag);
        overlay.addEventListener('touchstart', startDragTouch, { passive: false });

        function startDrag(e) {
            if (e.target === resizeHandle || e.target.id === 'deleteHandle' || e.target.closest('#deleteHandle')) return;
            e.preventDefault();
            isDragging      = true;
            dragStartX      = e.clientX;
            dragStartY      = e.clientY;
            overlayStartLeft = parseInt(overlay.style.left);
            overlayStartTop  = parseInt(overlay.style.top);
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
        }

        function startDragTouch(e) {
            if (e.target === resizeHandle || e.target.id === 'deleteHandle' || e.target.closest('#deleteHandle')) return;
            e.preventDefault();
            const t = e.touches[0];
            isDragging       = true;
            dragStartX       = t.clientX;
            dragStartY       = t.clientY;
            overlayStartLeft = parseInt(overlay.style.left);
            overlayStartTop  = parseInt(overlay.style.top);
            document.addEventListener('touchmove', onDragTouch, { passive: false });
            document.addEventListener('touchend', stopDrag);
        }

        function onDrag(e) {
            if (!isDragging) return;
            clampAndMove(e.clientX - dragStartX, e.clientY - dragStartY);
        }

        function onDragTouch(e) {
            if (!isDragging) return;
            e.preventDefault();
            const t = e.touches[0];
            clampAndMove(t.clientX - dragStartX, t.clientY - dragStartY);
        }

        function clampAndMove(dx, dy) {
            const canvas = document.getElementById('previewCanvas');
            const w = parseInt(overlay.style.width);
            const h = parseInt(overlay.style.height);
            const newLeft = Math.max(0, Math.min(overlayStartLeft + dx, canvas.width  - w));
            const newTop  = Math.max(0, Math.min(overlayStartTop  + dy, canvas.height - h));
            overlay.style.left = `${newLeft}px`;
            overlay.style.top  = `${newTop}px`;
        }

        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchmove', onDragTouch);
            document.removeEventListener('touchend', stopDrag);
        }

        // ── Resize ──────────────────────────────────────────
        resizeHandle.addEventListener('mousedown', startResize);
        resizeHandle.addEventListener('touchstart', startResizeTouch, { passive: false });

        function startResize(e) {
            e.preventDefault();
            e.stopPropagation();
            isResizing       = true;
            dragStartX       = e.clientX;
            dragStartY       = e.clientY;
            overlayStartW    = parseInt(overlay.style.width);
            overlayStartH    = parseInt(overlay.style.height);
            document.addEventListener('mousemove', onResize);
            document.addEventListener('mouseup', stopResize);
        }

        function startResizeTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            const t = e.touches[0];
            isResizing    = true;
            dragStartX    = t.clientX;
            dragStartY    = t.clientY;
            overlayStartW = parseInt(overlay.style.width);
            overlayStartH = parseInt(overlay.style.height);
            document.addEventListener('touchmove', onResizeTouch, { passive: false });
            document.addEventListener('touchend', stopResize);
        }

        function onResize(e) {
            if (!isResizing) return;
            applyResize(e.clientX - dragStartX, e.clientY - dragStartY);
        }

        function onResizeTouch(e) {
            if (!isResizing) return;
            e.preventDefault();
            const t = e.touches[0];
            applyResize(t.clientX - dragStartX, t.clientY - dragStartY);
        }

        function applyResize(dx, dy) {
            const aspect = overlayStartH / overlayStartW;
            const newW   = Math.max(40, overlayStartW + dx);
            const newH   = Math.round(newW * aspect);
            overlay.style.width  = `${newW}px`;
            overlay.style.height = `${newH}px`;
        }

        function stopResize() {
            isResizing = false;
            document.removeEventListener('mousemove', onResize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('touchmove', onResizeTouch);
            document.removeEventListener('touchend', stopResize);
        }
    }

    // ── Save PDF ───────────────────────────────────────────────────────────────
    document.getElementById('downloadBtn').addEventListener('click', async () => {
        if (!overlayPlaced || !sigDataUrl) {
            return PDFKingUtils.showToast('Please create and place your signature first.', 'error');
        }

        const btn = document.getElementById('downloadBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        btn.disabled  = true;

        try {
            const { PDFDocument } = PDFLib;
            const pdfDoc  = await PDFDocument.load(originalPdfBytes.slice(0));
            const pages   = pdfDoc.getPages();
            const page    = pages[currentPage - 1];

            const { width: pdfW, height: pdfH } = page.getSize();
            const canvas   = document.getElementById('previewCanvas');
            const overlay  = document.getElementById('sigOverlay');

            // Convert canvas-space position → PDF coordinate space
            // PDF origin is bottom-left; canvas is top-left
            const scaleX   = pdfW / canvas.width;
            const scaleY   = pdfH / canvas.height;

            const overlayL = parseInt(overlay.style.left);
            const overlayT = parseInt(overlay.style.top);
            const overlayW = parseInt(overlay.style.width);
            const overlayH = parseInt(overlay.style.height);

            const pdfX = overlayL * scaleX;
            const pdfY = pdfH - (overlayT + overlayH) * scaleY;   // flip Y
            const pdfSigW = overlayW * scaleX;
            const pdfSigH = overlayH * scaleY;

            // Embed signature image
            const base64 = sigDataUrl.split(',')[1];
            const sigBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

            let embeddedImg;
            if (sigDataUrl.startsWith('data:image/png')) {
                embeddedImg = await pdfDoc.embedPng(sigBytes);
            } else {
                embeddedImg = await pdfDoc.embedJpg(sigBytes);
            }

            page.drawImage(embeddedImg, {
                x:      pdfX,
                y:      pdfY,
                width:  pdfSigW,
                height: pdfSigH,
            });

            const pdfBytes = await pdfDoc.save();

            let filename = document.getElementById('exportFilename').value.trim() || 'signed.pdf';
            if (!filename.endsWith('.pdf')) filename += '.pdf';

            PDFKingUtils.downloadBlob(pdfBytes, filename);
            PDFKingUtils.showToast('PDF signed and downloaded!', 'success');

            showPanel('nextSteps');

        } catch (err) {
            console.error(err);
            PDFKingUtils.showToast('Failed to save the PDF. Please try again.', 'error');
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-download"></i> Save PDF';
            btn.disabled  = false;
        }
    });

    // ── Page navigation ────────────────────────────────────────────────────────
    function buildPagePills() {
        const container = document.getElementById('pagePills');
        container.innerHTML = '';
        const max = Math.min(totalPages, 10);
        for (let i = 1; i <= max; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = 'page-pill w-8 h-8 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 transition-all';
            btn.addEventListener('click', () => goToPage(i));
            container.appendChild(btn);
        }
        if (totalPages > 10) {
            const span = document.createElement('span');
            span.textContent = `… ${totalPages}`;
            span.className = 'text-xs text-slate-400 px-1';
            container.appendChild(span);
        }
        updatePageNav();
    }

    function updatePagePills(pageNum) {
        document.querySelectorAll('.page-pill').forEach((btn, idx) => {
            btn.classList.toggle('active', idx + 1 === pageNum);
        });
        updatePageNav();
    }

    function updatePageNav() {
        document.getElementById('prevPageBtn').disabled = currentPage <= 1;
        document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
    }

    async function goToPage(pageNum) {
        if (pageNum === currentPage || pageNum < 1 || pageNum > totalPages) return;
        currentPage = pageNum;
        await renderPage(currentPage);
        document.getElementById('previewWrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('prevPageBtn').addEventListener('click', () => goToPage(currentPage - 1));
    document.getElementById('nextPageBtn').addEventListener('click', () => goToPage(currentPage + 1));

    // ── Panel helpers ──────────────────────────────────────────────────────────
    const ALL_PANELS = ['uploadZone', 'loadingOverlay', 'workspace', 'nextSteps'];

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
        if (id === 'loadingOverlay') target.classList.add('flex');
    }

    function showLoading(text) {
        document.getElementById('loadingText').innerText = text || 'Loading...';
        showPanel('loadingOverlay');
    }

    function hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
        document.getElementById('loadingOverlay').classList.remove('flex');
    }

    // ── Reset ──────────────────────────────────────────────────────────────────
    document.getElementById('changeFileBtn').addEventListener('click', resetToUpload);
    document.getElementById('startOverBtn').addEventListener('click', resetToUpload);

    function resetToUpload() {
        originalPdfBytes   = null;
        pdfJsDoc           = null;
        currentPage        = 1;
        totalPages         = 1;
        sigDataUrl         = null;
        uploadedSigDataUrl = null;
        overlayPlaced      = false;

        if (signaturePad) { signaturePad.clear(); }
        document.getElementById('drawHint').style.display = '';
        document.getElementById('typeInput').value = '';
        document.querySelectorAll('.font-option span').forEach(s => s.textContent = 'Your Signature');
        document.getElementById('uploadPreview').classList.add('hidden');
        document.getElementById('uploadSigZone').classList.remove('hidden');
        document.getElementById('pagePills').innerHTML = '';
        document.getElementById('step2hint').classList.add('hidden');
        document.getElementById('exportFilename').value = '';

        const ctx = document.getElementById('previewCanvas').getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        showPanel('uploadZone');
    }

    // ── Utility ────────────────────────────────────────────────────────────────
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
});
