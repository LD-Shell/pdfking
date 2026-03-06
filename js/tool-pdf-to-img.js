/**
 * js/tool-pdf-to-img.js
 * Logic for extracting specific PDF pages to Images (JPG, PNG, WEBP).
 */

document.addEventListener('DOMContentLoaded', () => {
    let currentPdf = null;
    let fileNameBase = "document";
    
    // Tracks the selection state of each page
    let pagesState = []; 

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    const uploadZone = document.getElementById('uploadZone');
    const workspace = document.getElementById('workspace');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const loadingProgress = document.getElementById('loadingProgress');
    const previewGrid = document.getElementById('previewGrid');
    
    const metaSelected = document.getElementById('metaSelected');
    const metaName = document.getElementById('metaName');
    
    const extractBtn = document.getElementById('extractBtn');
    const resetBtn = document.getElementById('resetBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');

    const successState = document.getElementById('successState');
    const successFileName = document.getElementById('successFileName');
    const resetConvertBtn = document.getElementById('resetConvertBtn');

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        fileNameBase = file.name.replace('.pdf', '');
        metaName.innerText = file.name;

        successState.classList.add('hidden');
        successState.classList.remove('flex');
        uploadZone.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const typedarray = new Uint8Array(arrayBuffer).slice(0);
            
            currentPdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            const numPages = currentPdf.numPages;
            
            pagesState = [];
            previewGrid.innerHTML = '';

            for (let i = 1; i <= numPages; i++) {
                loadingText.innerText = `Loading preview ${i} of ${numPages}...`;
                loadingProgress.style.width = `${(i / numPages) * 100}%`;
                
                const page = await currentPdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.3 }); 
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                // Default all pages to true
                pagesState.push({ pageNum: i, selected: true });

                const card = document.createElement('div');
                // The card itself acts as a massive click target for the checkbox
                card.className = "page-card relative bg-white dark:bg-slate-800 p-2 rounded-xl border-2 border-orange-500 shadow-sm flex flex-col items-center justify-between cursor-pointer transition-all select-none";
                card.dataset.index = i - 1;

                card.innerHTML = `
                    <div class="absolute top-3 left-3 z-10">
                        <input type="checkbox" class="w-5 h-5 rounded text-orange-500 focus:ring-orange-500 cursor-pointer pointer-events-none" checked>
                    </div>
                    <div class="w-full aspect-[1/1.4] flex items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-900 rounded mb-2">
                        <img src="${canvas.toDataURL()}" class="max-w-full max-h-full object-contain drop-shadow-sm pointer-events-none">
                    </div>
                    <span class="text-xs font-bold text-slate-400 pointer-events-none">Page ${i}</span>
                `;

                // Toggle selection state when clicking anywhere on the card
                card.addEventListener('click', () => {
                    const idx = parseInt(card.dataset.index);
                    pagesState[idx].selected = !pagesState[idx].selected;
                    updateGridVisuals();
                });

                previewGrid.appendChild(card);
            }

            updateGridVisuals();

            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
            PDFKingUtils.showToast('Ready to extract!', 'success');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Error reading PDF.', 'error');
            resetUI();
        }
    }

    // Function to visually sync the borders/checkboxes with the array state
    function updateGridVisuals() {
        const cards = previewGrid.querySelectorAll('.page-card');
        let selectedCount = 0;

        pagesState.forEach((state, index) => {
            const card = cards[index];
            const checkbox = card.querySelector('input[type="checkbox"]');
            
            checkbox.checked = state.selected;
            if (state.selected) {
                card.classList.add('border-orange-500');
                card.classList.remove('border-slate-200', 'dark:border-slate-700', 'opacity-50');
                selectedCount++;
            } else {
                card.classList.remove('border-orange-500');
                card.classList.add('border-slate-200', 'dark:border-slate-700', 'opacity-50');
            }
        });

        metaSelected.innerText = `${selectedCount} / ${pagesState.length}`;
        extractBtn.disabled = selectedCount === 0;
    }

    // Bulk selection controls
    selectAllBtn.addEventListener('click', () => {
        pagesState.forEach(p => p.selected = true);
        updateGridVisuals();
    });

    deselectAllBtn.addEventListener('click', () => {
        pagesState.forEach(p => p.selected = false);
        updateGridVisuals();
    });

    // Execution
    extractBtn.addEventListener('click', async () => {
        if (!currentPdf) return;

        const selectedPages = pagesState.filter(p => p.selected);
        if (selectedPages.length === 0) return; // Should be caught by disabled button anyway

        const format = document.querySelector('input[name="format"]:checked').value;
        const mimeType = `image/${format}`; // "image/jpeg", "image/png", or "image/webp"
        const extension = format === 'jpeg' ? 'jpg' : format; // .jpg, .png, or .webp
        const scaleMultiplier = parseFloat(document.getElementById('scaleSelect').value);
        
        try {
            const originalBtnHtml = extractBtn.innerHTML;
            extractBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            extractBtn.disabled = true;

            workspace.classList.add('opacity-50', 'pointer-events-none');
            loadingOverlay.classList.remove('hidden');
            loadingOverlay.classList.add('flex', 'fixed', 'inset-0', 'bg-white/80', 'dark:bg-slate-900/80', 'z-50', 'backdrop-blur-sm');
            
            let finalFilename = "";

            // 🧠 Smart UX: If they only selected ONE page, don't force a ZIP file!
            if (selectedPages.length === 1) {
                const pNum = selectedPages[0].pageNum;
                loadingText.innerText = `Extracting high-res image...`;
                
                const page = await currentPdf.getPage(pNum);
                const viewport = page.getViewport({ scale: scaleMultiplier }); 
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width; canvas.height = viewport.height;

                // WEBP and JPEG don't handle transparency well when saving from canvas by default. Fill white!
                if (format === 'jpeg' || format === 'webp') {
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }

                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.9));
                
                // Format: document_page-4.webp
                finalFilename = `${fileNameBase}_page-${pNum}.${extension}`;
                PDFKingUtils.downloadBlob(blob, finalFilename, mimeType);

            } else {
                // Standard JSZip logic for multiple files
                const zip = new JSZip();

                for (let i = 0; i < selectedPages.length; i++) {
                    const pNum = selectedPages[i].pageNum;
                    loadingText.innerText = `Extracting image ${i + 1} of ${selectedPages.length}...`;
                    loadingProgress.style.width = `${((i + 1) / selectedPages.length) * 100}%`;

                    const page = await currentPdf.getPage(pNum);
                    const viewport = page.getViewport({ scale: scaleMultiplier }); 
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = viewport.width; canvas.height = viewport.height;

                    if (format === 'jpeg' || format === 'webp') {
                        ctx.fillStyle = "white";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }

                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                    const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.9));
                    
                    const pageStr = String(pNum).padStart(currentPdf.numPages > 9 ? 2 : 1, '0');
                    zip.file(`${fileNameBase}_page-${pageStr}.${extension}`, blob);
                }

                loadingText.innerText = `Compressing ZIP file...`;
                loadingProgress.style.width = `100%`;

                const zipBlob = await zip.generateAsync({ type: "blob" });
                finalFilename = `${fileNameBase}_images.zip`;
                PDFKingUtils.downloadBlob(zipBlob, finalFilename, 'application/zip');
            }

            PDFKingUtils.showToast('Extraction successful!', 'success');

            // --- TRIGGER SUCCESS STATE ---
            workspace.classList.remove('opacity-50', 'pointer-events-none');
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex', 'fixed', 'inset-0', 'bg-white/80', 'dark:bg-slate-900/80', 'z-50', 'backdrop-blur-sm');
            
            workspace.classList.add('hidden'); 
            workspace.classList.remove('flex');
            
            successFileName.innerText = finalFilename; 
            successState.classList.remove('hidden');
            successState.classList.add('flex'); 

            extractBtn.innerHTML = originalBtnHtml;
            extractBtn.disabled = false;

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Failed to extract images.', 'error');
            
            extractBtn.innerHTML = '<i class="fa-solid fa-download"></i> Extract Images';
            extractBtn.disabled = false;
            workspace.classList.remove('opacity-50', 'pointer-events-none');
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex', 'fixed', 'inset-0', 'bg-white/80', 'dark:bg-slate-900/80', 'z-50', 'backdrop-blur-sm');
        }
    });

    function resetUI() {
        currentPdf = null;
        document.getElementById('fileInput').value = '';
        pagesState = [];
        
        successState.classList.add('hidden');
        successState.classList.remove('flex');
        
        workspace.classList.add('hidden');
        workspace.classList.remove('flex');
        uploadZone.classList.remove('hidden');
    }

    resetBtn.addEventListener('click', resetUI);
    resetConvertBtn.addEventListener('click', resetUI);
});