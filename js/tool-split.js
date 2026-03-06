/**
 * js/tool-split.js
 * Visual PDF Splitter. Combines text-based logic with a visual grid
 * showing dynamic "Part X" badges based on split rules.
 */

document.addEventListener('DOMContentLoaded', () => {
    let originalPdfBytes = null;
    let pagesState = [];
    
    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    const splitModeSelect = document.getElementById('splitMode');
    const splitInputContainer = document.getElementById('splitInputContainer');
    const splitInput = document.getElementById('splitInput');
    const chunkCountMeta = document.getElementById('chunkCountMeta');

    // Toggle logic and re-render visual grid when modes change
    splitModeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'all') {
            splitInputContainer.classList.add('hidden');
        } else {
            splitInputContainer.classList.remove('hidden');
            splitInput.placeholder = e.target.value === 'fixed' ? "e.g. 2 (splits every 2 pages)" : "e.g. 1-3, 5";
        }
        renderGrid();
    });

    splitInput.addEventListener('input', () => {
        renderGrid(); // Visually update the grid as they type
    });

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') return PDFKingUtils.showToast('Invalid PDF.', 'error');

        document.getElementById('uploadZone').classList.add('hidden');
        document.getElementById('loadingOverlay').classList.remove('hidden');
        document.getElementById('loadingOverlay').classList.add('flex');

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
                
                pagesState.push({ pageNum: i, selected: false, canvasDataUrl: canvas.toDataURL() });
            }

            // In custom mode, start with empty input
            splitInput.value = '';
            renderGrid();
            
            document.getElementById('loadingOverlay').classList.add('hidden');
            document.getElementById('loadingOverlay').classList.remove('flex');
            document.getElementById('workspace').classList.remove('hidden');
            document.getElementById('workspace').classList.add('flex');
            PDFKingUtils.showToast('Ready to split!', 'success');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Error reading PDF.', 'error');
        }
    }

    // Core Logic: Turns input rules into an array of chunks (e.g. [[1,2], [3,4]])
    function calculateChunks() {
        const mode = splitModeSelect.value;
        const inputValue = splitInput.value.trim();
        let chunks = [];

        if (mode === 'all') {
            for (let i = 1; i <= pagesState.length; i++) chunks.push([i]);
        } 
        else if (mode === 'fixed') {
            const step = parseInt(inputValue, 10);
            if (step && step > 0) {
                let currentChunk = [];
                for (let i = 1; i <= pagesState.length; i++) {
                    currentChunk.push(i);
                    if (currentChunk.length === step || i === pagesState.length) {
                        chunks.push(currentChunk);
                        currentChunk = [];
                    }
                }
            }
        } 
        else if (mode === 'custom') {
            if (inputValue) {
                // Parse text input
                const parts = inputValue.split(',').map(s => s.trim());
                parts.forEach(part => {
                    let currentChunk = [];
                    if (part.includes('-')) {
                        let [start, end] = part.split('-').map(Number);
                        start = Math.max(1, start); end = Math.min(pagesState.length, end);
                        if (start <= end) { for (let i = start; i <= end; i++) currentChunk.push(i); }
                    } else {
                        const num = Number(part);
                        if (num >= 1 && num <= pagesState.length) currentChunk.push(num);
                    }
                    if (currentChunk.length > 0) chunks.push(currentChunk);
                });
            } else {
                // If text is empty, check if they manually clicked/selected pages
                const selectedPages = pagesState.filter(p => p.selected).map(p => p.pageNum);
                if (selectedPages.length > 0) chunks.push(selectedPages);
            }
        }
        return chunks;
    }

    // Sync physical page clicks to the input string (for 'custom' mode)
    function syncStateToInput() {
        const selectedNums = pagesState.filter(p => p.selected).map(p => p.pageNum);
        if (selectedNums.length === 0) return splitInput.value = '';
        
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
        splitInput.value = ranges.join(', ');
    }

    function renderGrid() {
        const grid = document.getElementById('pageGrid');
        grid.innerHTML = '';
        
        const chunks = calculateChunks();
        
        // Update UI Meta text
        chunkCountMeta.innerText = chunks.length > 0 ? `Will output ${chunks.length} file(s)` : 'No pages selected';
        
        // Map which page belongs to which output file
        const pageToPartMap = {};
        chunks.forEach((chunk, chunkIdx) => {
            chunk.forEach(pageNum => {
                pageToPartMap[pageNum] = chunkIdx + 1; // 1-based part number
            });
        });

        pagesState.forEach((pageObj) => {
            const partNumber = pageToPartMap[pageObj.pageNum];
            const isIncluded = !!partNumber;

            const card = document.createElement('div');
            
            // Visual Feedback: Emerald if included, faded if ignored
            const borderClass = isIncluded 
                ? 'border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900/50' 
                : 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100';

            card.className = `page-card relative bg-white dark:bg-slate-800 p-3 rounded-xl border-2 ${borderClass} flex flex-col items-center cursor-pointer`;

            card.innerHTML = `
                <div class="absolute top-2 left-2 z-10 pointer-events-none transition-opacity ${isIncluded ? 'opacity-100' : 'opacity-0'}">
                    <span class="bg-emerald-500 text-white text-[10px] font-black uppercase px-2 py-1 rounded shadow-sm">
                        <i class="fa-solid fa-file-pdf mr-1"></i> Part ${partNumber}
                    </span>
                </div>
                
                <div class="absolute top-3 right-3 z-10 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-md">
                    ${pageObj.pageNum}
                </div>
                
                <div class="w-full aspect-[1/1.4] flex items-center justify-center overflow-hidden pointer-events-none mb-2 mt-4">
                    <img src="${pageObj.canvasDataUrl}" class="max-w-full max-h-full object-contain drop-shadow-md">
                </div>
            `;

            // Allow clicking to select in 'custom' mode
            card.addEventListener('click', () => {
                if (splitModeSelect.value === 'custom') {
                    pageObj.selected = !pageObj.selected;
                    syncStateToInput();
                    renderGrid();
                }
            });

            grid.appendChild(card);
        });
    }

    document.getElementById('exportBtn').addEventListener('click', async () => {
        const chunks = calculateChunks();
        if (chunks.length === 0) return PDFKingUtils.showToast('No pages selected to split/extract.', 'error');

        try {
            const btn = document.getElementById('exportBtn');
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...'; 
            btn.disabled = true;

            const { PDFDocument } = PDFLib;
            const sourcePdf = await PDFDocument.load(originalPdfBytes.slice(0));
            const generatedFiles = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const newPdf = await PDFDocument.create();
                
                const copiedPages = await newPdf.copyPages(sourcePdf, chunk.map(n => n - 1));
                copiedPages.forEach(page => newPdf.addPage(page));
                
                const pdfBytes = await newPdf.save();
                // Name files dynamically based on content
                const fileName = chunks.length === 1 && splitModeSelect.value === 'custom'
                    ? `extracted_pages.pdf`
                    : `split_part_${i + 1}.pdf`;
                
                generatedFiles.push({ name: fileName, data: pdfBytes });
            }

            // Export Logic
            if (generatedFiles.length === 1) {
                PDFKingUtils.downloadBlob(generatedFiles[0].data, generatedFiles[0].name);
                PDFKingUtils.showToast('PDF extracted successfully!', 'success');
            } else {
                btn.innerHTML = '<i class="fa-solid fa-file-zipper fa-spin"></i> Zipping...';
                const zip = new JSZip();
                generatedFiles.forEach(file => zip.file(file.name, file.data));
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                PDFKingUtils.downloadBlob(zipBlob, 'PDFKing_Split.zip');
                PDFKingUtils.showToast(`Zipped ${generatedFiles.length} files successfully!`, 'success');
            }

        } catch (error) {
            PDFKingUtils.showToast('Failed to split document.', 'error');
            console.error(error);
        } finally {
            document.getElementById('exportBtn').innerHTML = '<i class="fa-solid fa-scissors mr-2"></i> Split PDF';
            document.getElementById('exportBtn').disabled = false;
        }
    });
});