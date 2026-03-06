/**
 * js/tool-delete.js
 * Dedicated logic for the PDF Page Deletion tool.
 * FIXED: Ensures the final output is a single PDF with the selected pages completely removed.
 */

document.addEventListener('DOMContentLoaded', () => {
    let originalPdfBytes = null;
    let pagesState = [];
    let lastSelectedIndex = null;

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    const rangeInput = document.getElementById('rangeInput');

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        document.getElementById('uploadZone').classList.add('hidden');
        document.getElementById('loadingOverlay').classList.remove('hidden');
        document.getElementById('loadingOverlay').classList.add('flex');
        document.getElementById('nextSteps').classList.add('hidden');

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes = new Uint8Array(arrayBuffer);
            
            const pdf = await pdfjsLib.getDocument({ data: originalPdfBytes.slice(0) }).promise;
            
            pagesState = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                document.getElementById('loadingText').innerText = `Rendering page ${i} of ${pdf.numPages}...`;
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.4 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
                
                // For this tool, 'selected' means "Selected for DELETION"
                pagesState.push({ pageNum: i, selected: false, canvasDataUrl: canvas.toDataURL() });
            }

            renderGrid();
            updateRangeInputFromState();
            
            document.getElementById('loadingOverlay').classList.add('hidden');
            document.getElementById('loadingOverlay').classList.remove('flex');
            document.getElementById('workspace').classList.remove('hidden');
            document.getElementById('workspace').classList.add('flex');
            PDFKingUtils.showToast('Ready to delete!', 'success');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Error reading PDF.', 'error');
        }
    }

    function renderGrid() {
        const grid = document.getElementById('pageGrid');
        grid.innerHTML = '';
        
        pagesState.forEach((pageObj, currentIndex) => {
            const card = document.createElement('div');
            
            // Visual feedback: If selected for deletion, it turns red
            const borderClass = pageObj.selected 
                ? 'border-red-500 ring-2 ring-red-200 dark:ring-red-900/50 opacity-75' 
                : 'border-slate-200 dark:border-slate-700 hover:border-red-300';

            card.className = `page-card relative bg-white dark:bg-slate-800 p-3 rounded-xl border-2 ${borderClass} flex flex-col items-center cursor-pointer transition-all duration-150`;

            card.innerHTML = `
                <div class="absolute top-3 right-3 z-10 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md">
                    Page ${pageObj.pageNum}
                </div>
                ${pageObj.selected ? '<div class="absolute inset-0 bg-red-500/10 rounded-xl z-0 pointer-events-none"></div>' : ''}
                ${pageObj.selected ? '<div class="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"><i class="fa-solid fa-trash-can text-red-500 text-4xl drop-shadow-md opacity-80"></i></div>' : ''}
                
                <div class="w-full aspect-[1/1.4] flex items-center justify-center overflow-hidden pointer-events-none mb-2">
                    <img src="${pageObj.canvasDataUrl}" class="max-w-full max-h-full object-contain drop-shadow-md ${pageObj.selected ? 'grayscale opacity-50' : ''}">
                </div>
                
                <div class="w-full flex justify-center mt-2 pointer-events-none">
                    <input type="checkbox" class="w-5 h-5 rounded border-slate-300 text-red-500 focus:ring-red-500 pointer-events-auto" ${pageObj.selected ? 'checked' : ''}>
                </div>
            `;

            // Handle Checkbox Click
            const checkbox = card.querySelector('input');
            checkbox.addEventListener('change', (e) => { 
                e.stopPropagation();
                pageObj.selected = e.target.checked; 
                lastSelectedIndex = currentIndex;
                updateRangeInputFromState();
                renderGrid(); 
            });

            // Full-Card Selection & Shift-Click logic
            card.addEventListener('click', (e) => {
                if (e.target === checkbox) return;

                if (e.shiftKey && lastSelectedIndex !== null) {
                    const start = Math.min(lastSelectedIndex, currentIndex);
                    const end = Math.max(lastSelectedIndex, currentIndex);
                    for (let i = start; i <= end; i++) {
                        pagesState[i].selected = true;
                    }
                } else {
                    pageObj.selected = !pageObj.selected;
                }
                
                lastSelectedIndex = currentIndex;
                updateRangeInputFromState();
                renderGrid();
            });

            grid.appendChild(card);
        });
    }

    // --- UI BUTTON LOGIC ---
    document.getElementById('selOddBtn').addEventListener('click', () => {
        pagesState.forEach((p, idx) => p.selected = (idx % 2 === 0));
        updateRangeInputFromState();
        renderGrid();
    });

    document.getElementById('selEvenBtn').addEventListener('click', () => {
        pagesState.forEach((p, idx) => p.selected = (idx % 2 !== 0));
        updateRangeInputFromState();
        renderGrid();
    });

    document.getElementById('clearSelBtn').addEventListener('click', () => {
        pagesState.forEach(p => p.selected = false);
        updateRangeInputFromState();
        renderGrid();
    });

    // --- RANGE INPUT PARSER ---
    rangeInput.addEventListener('input', (e) => {
        const inputStr = e.target.value;
        const toDelete = new Set();
        
        const parts = inputStr.split(',').map(s => s.trim());
        parts.forEach(part => {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                if (start && end && start <= end) {
                    for (let i = start; i <= end; i++) toDelete.add(i);
                }
            } else {
                const num = Number(part);
                if (num) toDelete.add(num);
            }
        });

        pagesState.forEach(p => {
            p.selected = toDelete.has(p.pageNum);
        });
        
        renderGrid();
    });

    function updateRangeInputFromState() {
        const selectedNums = pagesState.filter(p => p.selected).map(p => p.pageNum);
        if (selectedNums.length === 0) {
            rangeInput.value = '';
            return;
        }
        
        let ranges = [];
        let start = selectedNums[0];
        let prev = start;

        for (let i = 1; i <= selectedNums.length; i++) {
            if (selectedNums[i] === prev + 1) {
                prev = selectedNums[i];
            } else {
                ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
                start = selectedNums[i];
                prev = start;
            }
        }
        
        rangeInput.value = ranges.join(', ');
    }

    // --- EXECUTE DELETION (MERGES RETAINED PAGES INTO ONE PDF) ---
    document.getElementById('exportBtn').addEventListener('click', async () => {
        const pagesToKeep = pagesState.filter(p => !p.selected);
        const pagesToDeleteCount = pagesState.filter(p => p.selected).length;
        
        if (pagesToDeleteCount === 0) {
            return PDFKingUtils.showToast('No pages selected to delete.', 'error');
        }
        if (pagesToKeep.length === 0) {
            return PDFKingUtils.showToast('You cannot delete every page! The PDF must have at least one page left.', 'error');
        }

        try {
            const btn = document.getElementById('exportBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; 
            btn.disabled = true;

            const { PDFDocument } = PDFLib;
            const sourcePdf = await PDFDocument.load(originalPdfBytes.slice(0));
            const finalPdf = await PDFDocument.create();

            // Copy only the pages we want to keep (subtract 1 for 0-based index)
            const copiedPages = await finalPdf.copyPages(sourcePdf, pagesToKeep.map(p => p.pageNum - 1));

            // Add them back sequentially into the new, single PDF document
            copiedPages.forEach(page => finalPdf.addPage(page));

            // Export as a single file
            const pdfBytes = await finalPdf.save();
            PDFKingUtils.downloadBlob(pdfBytes, 'PDFKing_Pages_Removed.pdf');
            PDFKingUtils.showToast(`Successfully removed ${pagesToDeleteCount} pages!`, 'success');

            // Show "What's Next" UI
            document.getElementById('workspace').classList.add('hidden');
            document.getElementById('workspace').classList.remove('flex');
            document.getElementById('nextSteps').classList.remove('hidden');

        } catch (error) {
            PDFKingUtils.showToast('Failed to delete pages.', 'error');
            console.error(error);
        } finally {
            document.getElementById('exportBtn').innerHTML = '<i class="fa-solid fa-trash-can mr-2"></i> Delete & Save';
            document.getElementById('exportBtn').disabled = false;
        }
    });

    // Reset Tool Functionality
    document.getElementById('startOverBtn').addEventListener('click', () => {
        document.getElementById('nextSteps').classList.add('hidden');
        document.getElementById('uploadZone').classList.remove('hidden');
        originalPdfBytes = null;
        pagesState = [];
        rangeInput.value = '';
    });
});