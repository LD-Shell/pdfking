/**
 * js/tool-rotate.js
 * Logic specifically for the Rotate & Organize tool.
 * FIXED: ArrayBuffer detachment via .slice(0)
 * UPGRADED: Visual drop indicator lines for drag & drop
 * UPGRADED: Added Extract/Split logic inside the correct scope
 * UPGRADED: Full-card click selection and Shift-Click range selection
 */

document.addEventListener('DOMContentLoaded', () => {
    let originalPdfBytes = null;
    let pagesState = [];
    let draggedItemIndex = null;
    let lastSelectedIndex = null; // Track the last clicked item for Shift-Click

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
            card.className = `page-card relative bg-white dark:bg-slate-800 p-3 rounded-xl border-2 ${pageObj.selected ? 'border-indigo-500 shadow-md ring-2 ring-indigo-200 dark:ring-indigo-900/50' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600/50'} flex flex-col items-center cursor-grab transition-all duration-150`;
            card.draggable = true;

            card.innerHTML = `
                <div class="absolute top-3 left-3 z-10 pointer-events-none">
                    <input type="checkbox" class="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 pointer-events-auto" ${pageObj.selected ? 'checked' : ''}>
                </div>
                <div class="absolute top-3 right-3 z-10 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md">${currentIndex + 1}</div>
                <div class="pdf-canvas-wrapper w-full aspect-[1/1.4] flex items-center justify-center overflow-hidden pointer-events-none mb-3" style="transform: rotate(${pageObj.rotationAdded}deg)">
                    <img src="${pageObj.canvasDataUrl}" class="max-w-full max-h-full object-contain drop-shadow-md">
                </div>
            `;

            // Handle the tiny checkbox directly
            const checkbox = card.querySelector('input');
            checkbox.addEventListener('change', (e) => { 
                e.stopPropagation(); // Stop the card click from firing too
                pageObj.selected = e.target.checked; 
                lastSelectedIndex = currentIndex;
                renderGrid(); 
            });

            // 🚀 UX UPGRADE: Full-card click & Shift-Click 🚀
            card.addEventListener('click', (e) => {
                // Ignore clicks on the checkbox (already handled) or during a drag
                if (e.target === checkbox || card.classList.contains('dragging')) return;

                if (e.shiftKey && lastSelectedIndex !== null) {
                    // Shift-click logic: Select a range
                    const start = Math.min(lastSelectedIndex, currentIndex);
                    const end = Math.max(lastSelectedIndex, currentIndex);
                    
                    for (let i = start; i <= end; i++) {
                        if (!pagesState[i].isDeleted) {
                            pagesState[i].selected = true;
                        }
                    }
                } else {
                    // Standard click logic: Toggle the page
                    pageObj.selected = !pageObj.selected;
                }
                
                lastSelectedIndex = currentIndex;
                renderGrid();
            });
            
            // 🚀 DRAG AND DROP UPGRADE 🚀
            card.addEventListener('dragstart', () => { 
                draggedItemIndex = currentIndex; 
                card.classList.add('dragging', 'opacity-50', 'scale-95'); 
            });
            
            card.addEventListener('dragend', () => { 
                card.classList.remove('dragging', 'opacity-50', 'scale-95');
                document.querySelectorAll('.page-card').forEach(c => {
                    c.classList.remove('border-l-indigo-500', 'border-r-indigo-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
                });
            });
            
            card.addEventListener('dragover', (e) => { 
                e.preventDefault(); 
                if (draggedItemIndex === currentIndex) return;

                const bounding = card.getBoundingClientRect();
                const offset = bounding.x + (bounding.width / 2);
                
                card.classList.remove('border-l-indigo-500', 'border-r-indigo-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');

                if (e.clientX - offset > 0) {
                    card.classList.add('border-r-4', 'border-r-indigo-500', 'mr-2');
                } else {
                    card.classList.add('border-l-4', 'border-l-indigo-500', 'ml-2');
                }
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('border-l-indigo-500', 'border-r-indigo-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('border-l-indigo-500', 'border-r-indigo-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
                
                if (draggedItemIndex === null || draggedItemIndex === currentIndex) return;
                
                const bounding = card.getBoundingClientRect();
                const offset = bounding.x + (bounding.width / 2);
                let targetIndex = currentIndex;
                
                if (e.clientX - offset > 0) {
                    targetIndex = draggedItemIndex < currentIndex ? currentIndex : currentIndex + 1;
                } else {
                    targetIndex = draggedItemIndex < currentIndex ? currentIndex - 1 : currentIndex;
                }

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
        pagesState.forEach(p => { if (p.selected) p.isDeleted = true; }); 
        lastSelectedIndex = null; // Reset shift-click anchor
        renderGrid();
    });

    document.getElementById('exportBtn').addEventListener('click', async () => {
        try {
            const btn = document.getElementById('exportBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; btn.disabled = true;

            const { PDFDocument, degrees } = PDFLib;
            
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

    // --- SPLIT / EXTRACT LOGIC ---
    document.getElementById('splitBtn').addEventListener('click', async () => {
        const selectedPages = pagesState.filter(p => p.selected && !p.isDeleted);
        
        if (selectedPages.length === 0) {
            return PDFKingUtils.showToast('Please select at least one page to extract.', 'error');
        }

        try {
            const btn = document.getElementById('splitBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extracting...';
            btn.disabled = true;

            const { PDFDocument, degrees } = PDFLib;
            const sourcePdf = await PDFDocument.load(originalPdfBytes.slice(0));
            const newPdf = await PDFDocument.create();

            const copiedPages = await newPdf.copyPages(sourcePdf, selectedPages.map(p => p.originalIndex));

            copiedPages.forEach((page, idx) => {
                const rotation = page.getRotation().angle + selectedPages[idx].rotationAdded;
                page.setRotation(degrees(rotation));
                newPdf.addPage(page);
            });

            const pdfBytes = await newPdf.save();
            const originalName = document.getElementById('exportFilename').value || 'extracted.pdf';
            const newName = originalName.replace('.pdf', '_extracted.pdf');

            PDFKingUtils.downloadBlob(pdfBytes, newName);
            PDFKingUtils.showToast(`Extracted ${selectedPages.length} pages!`, 'success');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Extraction failed.', 'error');
        } finally {
            document.getElementById('splitBtn').innerHTML = '<i class="fa-solid fa-scissors mr-1"></i> Extract Selected';
            document.getElementById('splitBtn').disabled = false;
        }
    });

});