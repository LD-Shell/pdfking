/**
 * js/tool-rotate.js
 * Logic specifically for the Rotate & Organize tool.
 * FIXED: ArrayBuffer detachment via .slice(0)
 * UPGRADED: Visual drop indicator lines for drag & drop
 */

document.addEventListener('DOMContentLoaded', () => {
    let originalPdfBytes = null;
    let pagesState = [];
    let draggedItemIndex = null;

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        document.getElementById('exportFilename').value = file.name.replace('.pdf', '_edited.pdf');
        document.getElementById('uploadZone').classList.add('hidden');
        document.getElementById('loadingOverlay').classList.remove('hidden');
        document.getElementById('loadingOverlay').classList.add('flex');

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes = new Uint8Array(arrayBuffer);
            
            // 🔥 BUG FIX: Pass a cloned buffer to pdf.js
            const pdf = await pdfjsLib.getDocument({ data: originalPdfBytes.slice(0) }).promise;
            document.getElementById('fileMeta').innerText = `${pdf.numPages} pages • ${PDFKingUtils.formatBytes(file.size)}`;
            
            pagesState = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                document.getElementById('loadingText').innerText = `Rendering page ${i} of ${pdf.numPages}...`;
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.5 }); 
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
                
                pagesState.push({ originalIndex: i - 1, rotationAdded: 0, selected: false, isDeleted: false, canvasDataUrl: canvas.toDataURL() });
            }

            renderGrid();
            
            document.getElementById('loadingOverlay').classList.add('hidden');
            document.getElementById('loadingOverlay').classList.remove('flex');
            document.getElementById('workspace').classList.remove('hidden');
            document.getElementById('workspace').classList.add('flex');
            PDFKingUtils.showToast('PDF loaded successfully!', 'success');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Error reading PDF.', 'error');
        }
    }

    function renderGrid() {
        const grid = document.getElementById('pageGrid');
        grid.innerHTML = '';
        
        pagesState.forEach((pageObj, currentIndex) => {
            if (pageObj.isDeleted) return;

            const card = document.createElement('div');
            // Added transition classes for smooth border snapping
            card.className = `page-card relative bg-white dark:bg-slate-800 p-3 rounded-xl border-2 ${pageObj.selected ? 'border-indigo-500' : 'border-slate-200 dark:border-slate-700'} flex flex-col items-center cursor-grab transition-all duration-150`;
            card.draggable = true;

            card.innerHTML = `
                <div class="absolute top-3 left-3 z-10">
                    <input type="checkbox" class="w-5 h-5 rounded" ${pageObj.selected ? 'checked' : ''}>
                </div>
                <div class="absolute top-3 right-3 z-10 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md">${currentIndex + 1}</div>
                <div class="pdf-canvas-wrapper w-full aspect-[1/1.4] flex items-center justify-center overflow-hidden pointer-events-none mb-3" style="transform: rotate(${pageObj.rotationAdded}deg)">
                    <img src="${pageObj.canvasDataUrl}" class="max-w-full max-h-full object-contain drop-shadow-md">
                </div>
            `;

            card.querySelector('input').addEventListener('change', (e) => { 
                pageObj.selected = e.target.checked; 
                renderGrid(); 
            });
            
            // 🚀 DRAG AND DROP UPGRADE 🚀
            
            card.addEventListener('dragstart', () => { 
                draggedItemIndex = currentIndex; 
                card.classList.add('dragging', 'opacity-50', 'scale-95'); 
            });
            
            card.addEventListener('dragend', () => { 
                card.classList.remove('dragging', 'opacity-50', 'scale-95');
                // Cleanup any stray visual indicators
                document.querySelectorAll('.page-card').forEach(c => {
                    c.classList.remove('border-l-indigo-500', 'border-r-indigo-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
                });
            });
            
            card.addEventListener('dragover', (e) => { 
                e.preventDefault(); 
                if (draggedItemIndex === currentIndex) return;

                // Math: Figure out if mouse is on left half or right half of the card
                const bounding = card.getBoundingClientRect();
                const offset = bounding.x + (bounding.width / 2);
                
                // Reset this specific card's borders first
                card.classList.remove('border-l-indigo-500', 'border-r-indigo-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');

                if (e.clientX - offset > 0) {
                    // Mouse is on the RIGHT side -> show right drop indicator
                    card.classList.add('border-r-4', 'border-r-indigo-500', 'mr-2');
                } else {
                    // Mouse is on the LEFT side -> show left drop indicator
                    card.classList.add('border-l-4', 'border-l-indigo-500', 'ml-2');
                }
            });

            card.addEventListener('dragleave', () => {
                // Wipe indicators when mouse leaves
                card.classList.remove('border-l-indigo-500', 'border-r-indigo-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('border-l-indigo-500', 'border-r-indigo-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
                
                if (draggedItemIndex === null || draggedItemIndex === currentIndex) return;
                
                // Math: Determine final drop index based on left/right mouse position
                const bounding = card.getBoundingClientRect();
                const offset = bounding.x + (bounding.width / 2);
                
                let targetIndex = currentIndex;
                
                // If dropping on the right half, and the item we dragged came from BEFORE this one,
                // we don't need to increment because the array splice will shift everything down naturally.
                // But if dropping on the right half, and it came from AFTER, we increment.
                if (e.clientX - offset > 0) {
                    targetIndex = draggedItemIndex < currentIndex ? currentIndex : currentIndex + 1;
                } else {
                    targetIndex = draggedItemIndex < currentIndex ? currentIndex - 1 : currentIndex;
                }

                // Execute Array Swap
                const itemToMove = pagesState.splice(draggedItemIndex, 1)[0];
                pagesState.splice(targetIndex, 0, itemToMove);
                renderGrid();
            });

            grid.appendChild(card);
        });
    }

    document.getElementById('selectAllBtn').addEventListener('click', () => {
        const allSelected = pagesState.filter(p => !p.isDeleted).every(p => p.selected);
        pagesState.forEach(p => { if (!p.isDeleted) p.selected = !allSelected; }); renderGrid();
    });
    document.getElementById('rotateLeftSelectedBtn').addEventListener('click', () => {
        pagesState.forEach(p => { if (!p.isDeleted && p.selected) p.rotationAdded = (p.rotationAdded - 90) % 360; }); renderGrid();
    });
    document.getElementById('rotateRightSelectedBtn').addEventListener('click', () => {
        pagesState.forEach(p => { if (!p.isDeleted && p.selected) p.rotationAdded = (p.rotationAdded + 90) % 360; }); renderGrid();
    });
    document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
        pagesState.forEach(p => { if (p.selected) p.isDeleted = true; }); renderGrid();
    });

    document.getElementById('exportBtn').addEventListener('click', async () => {
        try {
            const btn = document.getElementById('exportBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn.disabled = true;

            const { PDFDocument, degrees } = PDFLib;
            
            // 🔥 BUG FIX: Pass a cloned buffer to pdf-lib
            const sourcePdf = await PDFDocument.load(originalPdfBytes.slice(0));
            const finalPdf = await PDFDocument.create();

            const activePages = pagesState.filter(p => !p.isDeleted);
            const copiedPages = await finalPdf.copyPages(sourcePdf, activePages.map(p => p.originalIndex));

            copiedPages.forEach((page, newIndex) => {
                const finalRotation = page.getRotation().angle + activePages[newIndex].rotationAdded;
                page.setRotation(degrees(finalRotation));
                finalPdf.addPage(page);
            });

            const pdfBytes = await finalPdf.save();
            let filename = document.getElementById('exportFilename').value.trim() || 'rotated.pdf';
            if (!filename.endsWith('.pdf')) filename += '.pdf';
            
            PDFKingUtils.downloadBlob(pdfBytes, filename);
            PDFKingUtils.showToast('PDF successfully saved!', 'success');

        } catch (error) {
            PDFKingUtils.showToast('Failed to save document.', 'error');
            console.error(error);
        } finally {
            document.getElementById('exportBtn').innerHTML = '<i class="fa-solid fa-download"></i> Save PDF';
            document.getElementById('exportBtn').disabled = false;
        }
    });
});