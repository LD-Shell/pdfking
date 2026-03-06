/**
 * js/tool-img-to-pdf.js
 * Logic for compiling JPG/PNG into a PDF, featuring advanced drag/drop snapping.
 */

document.addEventListener('DOMContentLoaded', () => {
    let imageQueue = [];
    let draggedItemIndex = null;

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFiles);
    PDFKingUtils.bindFileUpload('addMoreBtn', 'fileInput', handleFiles); // Bind the + button too

    const uploadZone = document.getElementById('uploadZone');
    const workspace = document.getElementById('workspace');
    const imageGrid = document.getElementById('imageGrid');
    const queueCount = document.getElementById('queueCount');
    const exportFilename = document.getElementById('exportFilename');
    
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const loadingProgress = document.getElementById('loadingProgress');
    
    const convertBtn = document.getElementById('convertBtn');
    const clearBtn = document.getElementById('clearBtn');
    const pageSizeSelect = document.getElementById('pageSizeSelect');

    // Success State DOM
    const successState = document.getElementById('successState');
    const successFileName = document.getElementById('successFileName');
    const resetConvertBtn = document.getElementById('resetConvertBtn');

    function handleFiles(files) {
        const validFiles = Array.from(files).filter(file => file.type === 'image/jpeg' || file.type === 'image/png');
        
        if (validFiles.length === 0) {
            return PDFKingUtils.showToast('Only JPG and PNG files are supported.', 'error');
        }

        // Hide success state if they drag new files in
        successState.classList.add('hidden');
        successState.classList.remove('flex');

        validFiles.forEach(file => {
            imageQueue.push({
                id: Math.random().toString(36).substring(2, 9),
                file: file,
                // Object URLs are memory-safe for massive photos (unlike base64)
                previewUrl: URL.createObjectURL(file) 
            });
        });

        uploadZone.classList.add('hidden');
        workspace.classList.remove('hidden');
        workspace.classList.add('flex');
        
        // Change the upload zone text for subsequent drops
        document.getElementById('upload-heading').innerText = "Add More Images";
        
        renderGrid();
    }

    function renderGrid() {
        imageGrid.innerHTML = '';
        queueCount.innerText = imageQueue.length;

        if (imageQueue.length === 0) {
            clearWorkspace();
            return;
        }

        imageQueue.forEach((item, index) => {
            const card = document.createElement('div');
            // Base classes + transition class for smooth borders
            card.className = "image-card relative bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm cursor-grab group transition-all duration-150";
            card.draggable = true;
            card.dataset.index = index;

            card.innerHTML = `
                <div class="absolute top-2 left-2 z-10 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                    ${index + 1}
                </div>
                <button class="remove-btn absolute top-2 right-2 z-10 bg-red-500/90 hover:bg-red-600 text-white w-6 h-6 rounded-md flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <i class="fa-solid fa-xmark text-sm"></i>
                </button>
                <div class="w-full aspect-[1/1] overflow-hidden rounded bg-slate-100 dark:bg-slate-900 flex items-center justify-center pointer-events-none">
                    <img src="${item.previewUrl}" class="max-w-full max-h-full object-cover">
                </div>
                <div class="mt-2 px-1 truncate text-xs font-medium text-slate-600 dark:text-slate-400 pointer-events-none" title="${item.file.name}">
                    ${item.file.name}
                </div>
            `;

            // Garbage collect the URL to prevent memory leaks!
            card.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                URL.revokeObjectURL(imageQueue[index].previewUrl); 
                imageQueue.splice(index, 1);
                renderGrid();
            });

            // 🚀 ADVANCED DRAG & DROP WITH BORDER SNAPPING 🚀
            
            card.addEventListener('dragstart', () => {
                draggedItemIndex = index;
                setTimeout(() => card.classList.add('opacity-50', 'scale-95'), 0);
            });
            
            card.addEventListener('dragend', () => {
                card.classList.remove('opacity-50', 'scale-95');
                document.querySelectorAll('.image-card').forEach(c => {
                    c.classList.remove('border-l-pink-500', 'border-r-pink-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
                });
            });
            
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (draggedItemIndex === index) return;

                // Math: Is the mouse on the left or right half of this specific card?
                const bounding = card.getBoundingClientRect();
                const offset = bounding.x + (bounding.width / 2);
                
                card.classList.remove('border-l-pink-500', 'border-r-pink-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');

                if (e.clientX - offset > 0) {
                    card.classList.add('border-r-4', 'border-r-pink-500', 'mr-2'); // Snap Right
                } else {
                    card.classList.add('border-l-4', 'border-l-pink-500', 'ml-2'); // Snap Left
                }
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('border-l-pink-500', 'border-r-pink-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('border-l-pink-500', 'border-r-pink-500', 'border-l-4', 'border-r-4', 'ml-2', 'mr-2');
                
                if (draggedItemIndex === null || draggedItemIndex === index) return;
                
                const bounding = card.getBoundingClientRect();
                const offset = bounding.x + (bounding.width / 2);
                let targetIndex = index;
                
                // Adjust target index based on the side dropped
                if (e.clientX - offset > 0) {
                    targetIndex = draggedItemIndex < index ? index : index + 1;
                } else {
                    targetIndex = draggedItemIndex < index ? index - 1 : index;
                }

                const itemToMove = imageQueue.splice(draggedItemIndex, 1)[0];
                imageQueue.splice(targetIndex, 0, itemToMove);
                renderGrid();
            });

            imageGrid.appendChild(card);
        });
    }

    convertBtn.addEventListener('click', async () => {
        if (imageQueue.length === 0) return;

        try {
            const originalText = convertBtn.innerHTML;
            convertBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Compiling...';
            convertBtn.disabled = true;

            workspace.classList.add('opacity-50', 'pointer-events-none');
            loadingOverlay.classList.remove('hidden');
            loadingOverlay.classList.add('flex', 'fixed', 'inset-0', 'bg-white/80', 'dark:bg-slate-900/80', 'z-50', 'backdrop-blur-sm');

            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.create();
            const mode = pageSizeSelect.value; 

            for (let i = 0; i < imageQueue.length; i++) {
                const item = imageQueue[i];
                loadingText.innerText = `Adding image ${i + 1} of ${imageQueue.length}...`;
                loadingProgress.style.width = `${((i + 1) / imageQueue.length) * 100}%`;

                // 1. Read fresh bytes directly from the user's File object
                const imageBytes = await item.file.arrayBuffer();
                
                let embeddedImage;
                if (item.file.type === 'image/jpeg') {
                    embeddedImage = await pdfDoc.embedJpg(imageBytes);
                } else {
                    embeddedImage = await pdfDoc.embedPng(imageBytes);
                }

                const imgDims = embeddedImage.scale(1);
                let page, drawWidth, drawHeight, drawX, drawY;

                if (mode === 'fit') {
                    page = pdfDoc.addPage([imgDims.width, imgDims.height]);
                    drawWidth = imgDims.width; drawHeight = imgDims.height;
                    drawX = 0; drawY = 0;
                } else if (mode === 'a4') {
                    const a4Width = 595.28;
                    const a4Height = 841.89;
                    page = pdfDoc.addPage([a4Width, a4Height]);

                    // Scale logic to prevent stretching
                    const scale = Math.min(a4Width / imgDims.width, a4Height / imgDims.height);
                    const finalScale = scale > 1 ? 1 : scale; 

                    drawWidth = imgDims.width * finalScale;
                    drawHeight = imgDims.height * finalScale;
                    drawX = (a4Width - drawWidth) / 2;
                    drawY = (a4Height - drawHeight) / 2;
                }

                page.drawImage(embeddedImage, { x: drawX, y: drawY, width: drawWidth, height: drawHeight });
            }

            loadingText.innerText = 'Finalizing document...';
            
            const pdfBytes = await pdfDoc.save();
            let filename = document.getElementById('exportFilename').value.trim() || 'compiled_images.pdf';
            if (!filename.endsWith('.pdf')) filename += '.pdf';
            
            // Download using util
            PDFKingUtils.downloadBlob(pdfBytes, filename);
            PDFKingUtils.showToast('PDF successfully created!', 'success');

            // --- TRIGGER SUCCESS STATE ---
            workspace.classList.remove('opacity-50', 'pointer-events-none');
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex', 'fixed', 'inset-0', 'bg-white/80', 'dark:bg-slate-900/80', 'z-50', 'backdrop-blur-sm');
            
            workspace.classList.add('hidden');
            workspace.classList.remove('flex');
            
            successFileName.innerText = filename;
            successState.classList.remove('hidden');
            successState.classList.add('flex');

            convertBtn.innerHTML = originalText;
            convertBtn.disabled = false;

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Failed to create PDF.', 'error');
            
            // Reset UI on fail
            convertBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Create PDF';
            convertBtn.disabled = false;
            workspace.classList.remove('opacity-50', 'pointer-events-none');
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex', 'fixed', 'inset-0', 'bg-white/80', 'dark:bg-slate-900/80', 'z-50', 'backdrop-blur-sm');
        }
    });

    function clearWorkspace() {
        imageQueue.forEach(item => URL.revokeObjectURL(item.previewUrl));
        imageQueue = [];
        document.getElementById('fileInput').value = '';
        workspace.classList.add('hidden');
        workspace.classList.remove('flex');
        uploadZone.classList.remove('hidden');
        document.getElementById('upload-heading').innerText = "JPG & PNG to PDF";
    }

    clearBtn.addEventListener('click', clearWorkspace);
    resetConvertBtn.addEventListener('click', clearWorkspace);
});