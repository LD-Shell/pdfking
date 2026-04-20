/**
 * js/tool-fill.js
 * Logic for the Fill PDF Forms tool.
 *
 * Architecture:
 *  - pdf.js  → render each page to <canvas> + read field geometry (viewport coords)
 *  - pdf-lib → read field names/types/values, write filled values back, export bytes
 *
 * Field types handled:
 *  - PDFTextField        → <input type="text"> or <textarea> (multiline)
 *  - PDFCheckBox         → <input type="checkbox">
 *  - PDFRadioGroup       → <input type="radio"> per option
 *  - PDFDropdown         → <select>
 *  - PDFOptionList       → <select multiple>
 *
 * Per-page flow:
 *  1. Render page N to canvas via pdf.js at a fixed display scale.
 *  2. For every field whose page === N, compute its position in canvas-space
 *     and absolutely-position an HTML input on top of the canvas.
 *  3. On page change, collect all current input values into `fieldValues`,
 *     then re-render the new page.
 *  4. On Save, push all `fieldValues` into the pdf-lib document and download.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ── State ──────────────────────────────────────────────────────────────────
    let originalPdfBytes = null;   // Uint8Array of the original file
    let pdfJsDoc         = null;   // pdf.js PDFDocumentProxy
    let pdfLibDoc        = null;   // pdf-lib PDFDocument
    let allFields        = [];     // Array of field descriptors (see buildFieldList)
    let fieldValues      = {};     // { fieldName: value } – persisted across page turns
    let currentPage      = 1;
    let totalPages       = 1;
    const RENDER_SCALE   = 1.5;    // Canvas render quality (1.5× → crisp on retina)

    // ── Init ───────────────────────────────────────────────────────────────────
    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    // ── File Selection ─────────────────────────────────────────────────────────
    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        showLoading('Loading document...');

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes  = new Uint8Array(arrayBuffer);

            // Load with both libraries in parallel
            showLoading('Reading form fields...');
            [pdfJsDoc, pdfLibDoc] = await Promise.all([
                pdfjsLib.getDocument({ data: originalPdfBytes.slice(0) }).promise,
                PDFLib.PDFDocument.load(originalPdfBytes.slice(0), { ignoreEncryption: false }),
            ]);

            totalPages   = pdfJsDoc.numPages;
            currentPage  = 1;
            fieldValues  = {};
            allFields    = buildFieldList(pdfLibDoc);

            if (allFields.length === 0) {
                // No AcroForm fields — show the info panel
                document.getElementById('noFieldsFileName').innerText  = file.name;
                document.getElementById('noFieldsFileMeta').innerText  = PDFKingUtils.formatBytes(file.size);
                hideLoading();
                showPanel('noFieldsPanel');
                return;
            }

            // Populate toolbar
            document.getElementById('workspaceFileName').innerText  = file.name;
            document.getElementById('workspaceFieldCount').innerText =
                `${allFields.length} field${allFields.length !== 1 ? 's' : ''}`;
            document.getElementById('exportFilename').value =
                file.name.replace(/\.pdf$/i, '_filled.pdf');

            buildPagePills();
            hideLoading();
            showPanel('workspace');

            await renderPage(currentPage);
            PDFKingUtils.showToast(`${allFields.length} form field${allFields.length !== 1 ? 's' : ''} found.`, 'success');

        } catch (err) {
            console.error(err);
            if (err.message && err.message.toLowerCase().includes('encrypt')) {
                PDFKingUtils.showToast('This PDF is password protected. Use Unlock PDF first.', 'error');
            } else {
                PDFKingUtils.showToast('Could not read the PDF file.', 'error');
            }
            hideLoading();
            resetToUpload();
        }
    }

    // ── Build field descriptor list from pdf-lib ───────────────────────────────
    function buildFieldList(doc) {
        let form;
        try { form = doc.getForm(); } catch (e) { return []; }

        const fields = [];
        for (const field of form.getFields()) {
            const widgets = field.acroField.getWidgets();
            if (!widgets || widgets.length === 0) continue;

            const type = getFieldType(field);
            if (!type) continue;

            // Each widget = one visual instance of the field (usually one per page)
            widgets.forEach((widget, widgetIdx) => {
                const pageRef  = widget.P();
                const pageIdx  = pageRef ? doc.getPages().findIndex(p => p.ref === pageRef) : 0;
                const rect     = widget.getRectangle();

                fields.push({
                    name:      field.getName(),
                    type,
                    pageIndex: pageIdx >= 0 ? pageIdx : 0,   // 0-based
                    rect,                                      // { x, y, width, height } in PDF units
                    field,                                     // pdf-lib field object
                    widgetIdx,
                    // Type-specific extras
                    options:   getOptions(field, type),
                    isMultiline: type === 'text' && isMultiline(field),
                });
            });
        }
        return fields;
    }

    function getFieldType(field) {
        const { PDFTextField, PDFCheckBox, PDFRadioGroup, PDFDropdown, PDFOptionList } = PDFLib;
        if (field instanceof PDFTextField)  return 'text';
        if (field instanceof PDFCheckBox)   return 'checkbox';
        if (field instanceof PDFRadioGroup) return 'radio';
        if (field instanceof PDFDropdown)   return 'dropdown';
        if (field instanceof PDFOptionList) return 'optionlist';
        return null;
    }

    function getOptions(field, type) {
        try {
            if (type === 'dropdown' || type === 'optionlist') return field.getOptions();
            if (type === 'radio') return field.getOptions();
        } catch (e) { /* ignore */ }
        return [];
    }

    function isMultiline(field) {
        try {
            return field.isMultiline();
        } catch (e) { return false; }
    }

    // ── Page rendering ─────────────────────────────────────────────────────────
    async function renderPage(pageNum) {
        // 1. Collect current overlay values before destroying them
        collectOverlayValues();

        // 2. Render the page to canvas
        const page     = await pdfJsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: RENDER_SCALE });

        const canvas  = document.getElementById('previewCanvas');
        const ctx     = canvas.getContext('2d');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        // 3. Inject overlays for fields on this page
        injectOverlays(pageNum, viewport, page.getViewport({ scale: 1 }));

        // 4. Update page pills
        updatePagePills(pageNum);
    }

    // ── Overlay injection ──────────────────────────────────────────────────────
    function injectOverlays(pageNum, scaledViewport, unscaledViewport) {
        const wrapper  = document.getElementById('previewWrapper');

        // Remove old overlays
        wrapper.querySelectorAll('.field-overlay').forEach(el => el.remove());

        const pageFields = allFields.filter(f => f.pageIndex === pageNum - 1);

        pageFields.forEach(fd => {
            const div = document.createElement('div');
            div.className = 'field-overlay';

            // Convert PDF rect (bottom-left origin) → canvas space (top-left origin)
            // scaledViewport.convertToViewportRectangle handles the Y-flip + scale
            const [x1, y1, x2, y2] = scaledViewport.convertToViewportRectangle([
                fd.rect.x,
                fd.rect.y,
                fd.rect.x + fd.rect.width,
                fd.rect.y + fd.rect.height,
            ]);

            const left   = Math.min(x1, x2);
            const top    = Math.min(y1, y2);
            const width  = Math.abs(x2 - x1);
            const height = Math.abs(y2 - y1);

            div.style.left   = `${left}px`;
            div.style.top    = `${top}px`;
            div.style.width  = `${width}px`;
            div.style.height = `${height}px`;

            // Scale font to fit the field height reasonably
            const fontSize = Math.min(Math.max(height * 0.55, 8), 14);
            div.style.fontSize = `${fontSize}px`;

            const savedValue = fieldValues[fd.name];

            if (fd.type === 'text') {
                const el = fd.isMultiline
                    ? document.createElement('textarea')
                    : document.createElement('input');
                if (!fd.isMultiline) el.type = 'text';
                el.dataset.fieldName = fd.name;
                el.value = savedValue !== undefined ? savedValue : getInitialTextValue(fd.field);
                el.placeholder = fd.name;
                div.appendChild(el);

            } else if (fd.type === 'checkbox') {
                div.classList.add('check-field');
                const el = document.createElement('input');
                el.type = 'checkbox';
                el.dataset.fieldName = fd.name;
                el.checked = savedValue !== undefined
                    ? savedValue === 'true'
                    : isChecked(fd.field);
                div.appendChild(el);

            } else if (fd.type === 'radio') {
                div.classList.add('check-field');
                const el = document.createElement('input');
                el.type = 'radio';
                el.name = `radio_${fd.name}`;
                el.value = fd.options[fd.widgetIdx] || String(fd.widgetIdx);
                el.dataset.fieldName = fd.name;
                const currentVal = savedValue !== undefined ? savedValue : getInitialRadioValue(fd.field);
                el.checked = currentVal === el.value;
                // Sync all radios in group on change
                el.addEventListener('change', () => {
                    if (el.checked) {
                        wrapper.querySelectorAll(`input[name="radio_${fd.name}"]`).forEach(r => {
                            if (r !== el) r.checked = false;
                        });
                    }
                });
                div.appendChild(el);

            } else if (fd.type === 'dropdown' || fd.type === 'optionlist') {
                const el = document.createElement('select');
                el.dataset.fieldName = fd.name;
                if (fd.type === 'optionlist') el.multiple = true;

                // Blank placeholder option for dropdowns
                if (fd.type === 'dropdown') {
                    const blank = document.createElement('option');
                    blank.value = '';
                    blank.textContent = '';
                    el.appendChild(blank);
                }

                fd.options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value       = opt;
                    option.textContent = opt;
                    el.appendChild(option);
                });

                const initialVal = savedValue !== undefined ? savedValue : getInitialSelectValue(fd.field);
                el.value = initialVal;
                div.appendChild(el);
            }

            wrapper.appendChild(div);
        });
    }

    // ── Helpers to read existing field values from pdf-lib ─────────────────────
    function getInitialTextValue(field) {
        try { return field.getText() || ''; } catch (e) { return ''; }
    }
    function isChecked(field) {
        try { return field.isChecked(); } catch (e) { return false; }
    }
    function getInitialRadioValue(field) {
        try { return field.getSelected() || ''; } catch (e) { return ''; }
    }
    function getInitialSelectValue(field) {
        try {
            const sel = field.getSelected();
            return Array.isArray(sel) ? sel[0] || '' : sel || '';
        } catch (e) { return ''; }
    }

    // ── Collect values from DOM overlays into fieldValues map ─────────────────
    function collectOverlayValues() {
        const wrapper = document.getElementById('previewWrapper');
        if (!wrapper) return;

        wrapper.querySelectorAll('[data-field-name]').forEach(el => {
            const name = el.dataset.fieldName;
            if (!name) return;
            if (el.type === 'checkbox') {
                fieldValues[name] = String(el.checked);
            } else if (el.type === 'radio') {
                // Only store if checked; don't overwrite a previously selected value
                if (el.checked) fieldValues[name] = el.value;
                else if (fieldValues[name] === undefined) fieldValues[name] = '';
            } else {
                fieldValues[name] = el.value;
            }
        });
    }

    // ── Page navigation ────────────────────────────────────────────────────────
    function buildPagePills() {
        const container = document.getElementById('pagePills');
        container.innerHTML = '';
        const max = Math.min(totalPages, 10); // Show up to 10 pills; add … if more
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
        if (pageNum === currentPage) return;
        if (pageNum < 1 || pageNum > totalPages) return;
        currentPage = pageNum;
        await renderPage(currentPage);
        // Scroll preview into view smoothly
        document.getElementById('previewWrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('prevPageBtn').addEventListener('click', () => goToPage(currentPage - 1));
    document.getElementById('nextPageBtn').addEventListener('click', () => goToPage(currentPage + 1));

    // ── Clear all fields ───────────────────────────────────────────────────────
    document.getElementById('clearBtn').addEventListener('click', () => {
        fieldValues = {};
        // Clear DOM overlays on current page
        document.getElementById('previewWrapper').querySelectorAll('[data-field-name]').forEach(el => {
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
            else el.value = '';
        });
        PDFKingUtils.showToast('All fields cleared.', 'success');
    });

    // ── Download filled PDF ────────────────────────────────────────────────────
    document.getElementById('downloadBtn').addEventListener('click', async () => {
        // Collect current page's values before saving
        collectOverlayValues();

        const btn = document.getElementById('downloadBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        btn.disabled  = true;

        try {
            const form = pdfLibDoc.getForm();

            for (const fd of allFields) {
                const val = fieldValues[fd.name];
                if (val === undefined) continue;

                try {
                    if (fd.type === 'text') {
                        fd.field.setText(val);

                    } else if (fd.type === 'checkbox') {
                        if (val === 'true') fd.field.check();
                        else fd.field.uncheck();

                    } else if (fd.type === 'radio') {
                        if (val) fd.field.select(val);

                    } else if (fd.type === 'dropdown') {
                        if (val) fd.field.select(val);

                    } else if (fd.type === 'optionlist') {
                        if (val) fd.field.select(val);
                    }
                } catch (fieldErr) {
                    // Non-fatal: one bad field shouldn't abort the whole save
                    console.warn(`Could not set field "${fd.name}":`, fieldErr.message);
                }
            }

            const pdfBytes = await pdfLibDoc.save();

            let filename = document.getElementById('exportFilename').value.trim() || 'filled.pdf';
            if (!filename.endsWith('.pdf')) filename += '.pdf';

            PDFKingUtils.downloadBlob(pdfBytes, filename);
            PDFKingUtils.showToast('Form saved and downloaded!', 'success');

            showPanel('nextSteps');

        } catch (err) {
            console.error(err);
            PDFKingUtils.showToast('Failed to save the form. Please try again.', 'error');
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-download"></i> Save PDF';
            btn.disabled  = false;
        }
    });

    // ── Panel helpers ──────────────────────────────────────────────────────────
    const ALL_PANELS = ['uploadZone', 'loadingOverlay', 'noFieldsPanel', 'workspace', 'nextSteps'];

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
        if (['loadingOverlay', 'noFieldsPanel'].includes(id)) target.classList.add('flex');
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
    const changeHandlers = [
        'changeFileWorkspaceBtn',
        'changeFileNoFieldsBtn',
        'changeFileNoFieldsBtn2',
        'startOverBtn',
    ];
    changeHandlers.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', resetToUpload);
    });

    function resetToUpload() {
        originalPdfBytes = null;
        pdfJsDoc         = null;
        pdfLibDoc        = null;
        allFields        = [];
        fieldValues      = {};
        currentPage      = 1;
        totalPages       = 1;

        // Clear canvas & overlays
        const wrapper = document.getElementById('previewWrapper');
        wrapper.querySelectorAll('.field-overlay').forEach(el => el.remove());
        const ctx = document.getElementById('previewCanvas').getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        document.getElementById('pagePills').innerHTML = '';
        document.getElementById('exportFilename').value = '';

        showPanel('uploadZone');
    }
});
