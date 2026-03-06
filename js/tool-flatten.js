/**
 * js/tool-flatten.js
 * Logic for permanently flattening AcroForm data fields.
 */

document.addEventListener('DOMContentLoaded', () => {
    let originalPdfBytes = null;
    let pdfDocInstance = null;

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    const uploadZone = document.getElementById('uploadZone');
    const workspace = document.getElementById('workspace');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const pdfPreview = document.getElementById('pdfPreview');
    const fileNameEl = document.getElementById('fileName');
    const fieldCountEl = document.getElementById('fieldCount');
    const fileSizeEl = document.getElementById('fileSize');
    const exportFilename = document.getElementById('exportFilename');
    const flattenBtn = document.getElementById('flattenBtn');

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        uploadZone.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');
        
        fileNameEl.innerText = file.name;
        exportFilename.value = file.name.replace('.pdf', '_locked.pdf');
        fileSizeEl.innerText = PDFKingUtils.formatBytes(file.size);

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes = new Uint8Array(arrayBuffer);
            
            const { PDFDocument } = PDFLib;
            // 🛡️ Clone buffer for pdf-lib analysis
            pdfDocInstance = await PDFDocument.load(originalPdfBytes.slice(0));
            const form = pdfDocInstance.getForm();
            const fields = form.getFields();
            
            fieldCountEl.innerHTML = `<i class="fa-solid fa-table-list mr-1"></i> ${fields.length} Fields Found`;

            if (fields.length === 0) {
                PDFKingUtils.showToast('No fillable fields found. This PDF might already be flat!', 'info');
                fieldCountEl.className = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400 px-3 py-1 rounded-full text-sm font-medium";
            } else {
                fieldCountEl.className = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400 px-3 py-1 rounded-full text-sm font-medium";
            }

            // 🛡️ Clone buffer for pdf.js thumbnail
            const pdfPreviewDoc = await pdfjsLib.getDocument({ data: originalPdfBytes.slice(0) }).promise;
            const page = await pdfPreviewDoc.getPage(1);
            const viewport = page.getViewport({ scale: 0.5 }); 
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            
            pdfPreview.src = canvas.toDataURL();

            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Error analyzing document.', 'error');
            resetUI();
        }
    }

    flattenBtn.addEventListener('click', async () => {
        if (!pdfDocInstance) return;

        try {
            const originalText = flattenBtn.innerHTML;
            flattenBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            flattenBtn.disabled = true;

            const form = pdfDocInstance.getForm();
            form.flatten();

            const pdfBytes = await pdfDocInstance.save();
            const filename = exportFilename.value || 'locked.pdf';
            
            PDFKingUtils.downloadBlob(pdfBytes, filename);
            PDFKingUtils.showToast('Form flattened successfully!', 'success');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Failed to flatten document.', 'error');
        } finally {
            flattenBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Flatten';
            flattenBtn.disabled = false;
        }
    });

    document.getElementById('resetBtn').addEventListener('click', resetUI);

    function resetUI() {
        originalPdfBytes = null;
        pdfDocInstance = null;
        document.getElementById('fileInput').value = '';
        workspace.classList.add('hidden');
        workspace.classList.remove('flex');
        uploadZone.classList.remove('hidden');
    }
});