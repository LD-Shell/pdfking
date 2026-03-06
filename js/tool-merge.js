/**
 * js/tool-merge.js
 * Logic for merging and reordering multiple PDFs.
 */

document.addEventListener('DOMContentLoaded', () => {
    let fileQueue = [];
    let isProcessing = false;
    let dragStartIndex = null;

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFiles);

    const workspace = document.getElementById('workspace');
    const uploadZone = document.getElementById('uploadZone');
    const fileList = document.getElementById('fileList');
    const queueMeta = document.getElementById('queueMeta');
    const mergeBtn = document.getElementById('mergeBtn');
    
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const loadingProgress = document.getElementById('loadingProgress');

    // Success State Elements
    const successState = document.getElementById('successState');
    const successFileName = document.getElementById('successFileName');
    const resetMergeBtn = document.getElementById('resetMergeBtn');

    async function handleFiles(files) {
        const pdfFiles = Array.from(files).filter(file => file.type === 'application/pdf');
        if (pdfFiles.length === 0) return PDFKingUtils.showToast('Please select valid PDF files.', 'error');

        // Ensure success state is hidden if user is dropping files again
        successState.classList.add('hidden');
        successState.classList.remove('flex');

        workspace.classList.remove('hidden');
        workspace.classList.add('flex');
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');
        uploadZone.querySelector('h1').innerText = 'Add Additional Documents';
        
        for (let i = 0; i < pdfFiles.length; i++) {
            const file = pdfFiles[i];
            loadingText.innerText = `Analyzing topology for ${file.name}...`;
            loadingProgress.style.width = `${((i + 1) / pdfFiles.length) * 100}%`;
            
            try {
                const arrayBuffer = await file.arrayBuffer();
                const safeBuffer = new Uint8Array(arrayBuffer);
                
                // Clone buffer for pdf.js to prevent detachment bug
                const pdf = await pdfjsLib.getDocument({ data: safeBuffer.slice(0) }).promise;
                const numPages = pdf.numPages;
                
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 0.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
                
                fileQueue.push({
                    id: 'id_' + Math.random().toString(36).substr(2, 9),
                    file: file,
                    arrayBuffer: safeBuffer, // Store master buffer
                    numPages: numPages,
                    thumbnail: canvas.toDataURL()
                });

            } catch (error) {
                console.error(error);
                PDFKingUtils.showToast(`Failed to parse ${file.name}`, 'error');
            }
        }

        loadingOverlay.classList.add('hidden');
        loadingOverlay.classList.remove('flex');
        renderFileList();
    }

    function renderFileList() {
        fileList.innerHTML = '';
        
        fileQueue.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'file-card flex items-center bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm cursor-grab';
            card.draggable = true;
            card.dataset.index = index;
            
            card.innerHTML = `
                <div class="px-3 text-slate-400 cursor-grab"><i class="fa-solid fa-grip-vertical"></i></div>
                <div class="h-16 w-12 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded overflow-hidden ml-2 mr-4 flex items-center justify-center">
                    <img src="${item.thumbnail}" class="max-w-full max-h-full object-contain">
                </div>
                <div class="flex-grow min-w-0">
                    <h4 class="font-semibold text-sm truncate">${item.file.name}</h4>
                    <div class="flex items-center text-xs text-slate-500 mt-1 gap-3">
                        <span><i class="fa-regular fa-file-lines mr-1"></i>${item.numPages} Pages</span>
                        <span><i class="fa-solid fa-weight-hanging mr-1"></i>${PDFKingUtils.formatBytes(item.file.size)}</span>
                    </div>
                </div>
                <div class="pl-4 border-l border-slate-100 dark:border-slate-800 ml-4">
                    <button class="remove-btn p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors"><i class="fa-solid fa-xmark text-lg"></i></button>
                </div>
            `;

            card.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                fileQueue.splice(index, 1);
                renderFileList();
            });

            // Reordering logic
            card.addEventListener('dragstart', function(e) {
                dragStartIndex = parseInt(this.dataset.index);
                this.classList.add('dragging');
            });
            card.addEventListener('dragover', function(e) {
                e.preventDefault();
                if (!this.classList.contains('dragging')) this.classList.add('drag-over');
            });
            card.addEventListener('dragleave', function() { this.classList.remove('drag-over'); });
            card.addEventListener('drop', function(e) {
                e.stopPropagation();
                this.classList.remove('drag-over');
                const dragEndIndex = parseInt(this.dataset.index);
                if (dragStartIndex !== null && dragStartIndex !== dragEndIndex) {
                    const itemToMove = fileQueue.splice(dragStartIndex, 1)[0];
                    fileQueue.splice(dragEndIndex, 0, itemToMove);
                    renderFileList();
                }
            });
            card.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                document.querySelectorAll('.file-card').forEach(c => c.classList.remove('drag-over'));
            });

            fileList.appendChild(card);
        });

        const totalPages = fileQueue.reduce((acc, curr) => acc + curr.numPages, 0);
        queueMeta.innerText = `${fileQueue.length} files • ${totalPages} pages`;
        mergeBtn.disabled = fileQueue.length < 2;

        if (fileQueue.length === 0) {
            workspace.classList.add('hidden');
            workspace.classList.remove('flex');
            uploadZone.querySelector('h1').innerText = 'Merge PDF Documents';
        }
    }

    document.getElementById('clearAllBtn').addEventListener('click', () => { fileQueue = []; renderFileList(); });

    // 🚀 THE MERGE EXECUTION
    mergeBtn.addEventListener('click', async () => {
        if (isProcessing || fileQueue.length < 2) return;
        
        try {
            isProcessing = true;
            const originalText = mergeBtn.innerHTML;
            mergeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Compiling...';
            mergeBtn.disabled = true;
            
            loadingOverlay.classList.remove('hidden');
            loadingOverlay.classList.add('flex');
            fileList.classList.add('hidden');

            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();

            for (let i = 0; i < fileQueue.length; i++) {
                loadingText.innerText = `Integrating document ${i + 1} of ${fileQueue.length}...`;
                loadingProgress.style.width = `${((i + 1) / fileQueue.length) * 100}%`;
                
                // Clone buffer for pdf-lib to prevent detachment bug
                const pdfDoc = await PDFDocument.load(fileQueue[i].arrayBuffer.slice(0));
                const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }

            loadingText.innerText = 'Writing final binary...';
            const mergedPdfBytes = await mergedPdf.save();
            let finalFilename = document.getElementById('exportFilename').value.trim() || 'merged_document.pdf';
            
            if (!finalFilename.endsWith('.pdf')) {
                finalFilename += '.pdf';
            }
            
            // Download the file
            PDFKingUtils.downloadBlob(mergedPdfBytes, finalFilename);
            PDFKingUtils.showToast('Documents merged successfully!', 'success');

            // --- 🚀 TRIGGER SUCCESS STATE UI 🚀 ---
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
            workspace.classList.add('hidden'); // Hide the editor
            workspace.classList.remove('flex');
            
            successFileName.innerText = finalFilename; // Show them the name of the file they just downloaded
            successState.classList.remove('hidden');
            successState.classList.add('flex'); // Show the success panel

            // Reset button states under the hood
            mergeBtn.innerHTML = originalText;
            mergeBtn.disabled = false;
            isProcessing = false;

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('A fatal error occurred during compilation.', 'error');
            
            // Reset on failure
            mergeBtn.innerHTML = '<i class="fa-solid fa-object-group mr-2"></i> Merge Files';
            mergeBtn.disabled = false;
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
            fileList.classList.remove('hidden');
            isProcessing = false;
        }
    });

    // Reset button on the Success Panel
    resetMergeBtn.addEventListener('click', () => {
        fileQueue = [];
        document.getElementById('fileInput').value = ''; // Reset input
        successState.classList.add('hidden');
        successState.classList.remove('flex');
        uploadZone.classList.remove('hidden');
        uploadZone.querySelector('h1').innerText = 'Merge PDF Documents';
    });
});