/**
 * js/tool-metadata.js
 * Logic for reading and updating PDF metadata dictionary tags.
 * FIXED: ArrayBuffer detachment via .slice(0)
 */

document.addEventListener('DOMContentLoaded', () => {
    let originalPdfBytes = null;
    let currentPdfDoc = null; 

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    const uploadZone = document.getElementById('uploadZone');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const workspace = document.getElementById('workspace');
    
    const iTitle = document.getElementById('metaTitle');
    const iAuthor = document.getElementById('metaAuthor');
    const iSubject = document.getElementById('metaSubject');
    const iKeywords = document.getElementById('metaKeywords');
    const iCreator = document.getElementById('metaCreator');
    const iProducer = document.getElementById('metaProducer');

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        document.getElementById('fileNameDisplay').innerText = file.name;
        document.getElementById('exportFilename').value = file.name.replace('.pdf', '_updated.pdf');
        
        uploadZone.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes = new Uint8Array(arrayBuffer);
            
            const { PDFDocument } = PDFLib;
            // 🔥 BUG FIX: Clone the buffer so we can reload it if necessary
            currentPdfDoc = await PDFDocument.load(originalPdfBytes.slice(0), { updateMetadata: false });
            
            iTitle.value = currentPdfDoc.getTitle() || '';
            iAuthor.value = currentPdfDoc.getAuthor() || '';
            iSubject.value = currentPdfDoc.getSubject() || '';
            iCreator.value = currentPdfDoc.getCreator() || '';
            iProducer.value = currentPdfDoc.getProducer() || '';
            
            const keywordsArray = currentPdfDoc.getKeywords();
            if (keywordsArray && keywordsArray.length > 0) {
                iKeywords.value = keywordsArray.join(', ');
            } else {
                iKeywords.value = '';
            }

            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
            
            PDFKingUtils.showToast('Metadata loaded!', 'success');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Error reading PDF. It may be encrypted.', 'error');
            resetUI();
        }
    }

    document.getElementById('updateBtn').addEventListener('click', async () => {
        if (!currentPdfDoc) return;

        const btn = document.getElementById('updateBtn');
        const originalText = btn.innerHTML;
        
        try {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
            btn.disabled = true;

            currentPdfDoc.setTitle(iTitle.value.trim());
            currentPdfDoc.setAuthor(iAuthor.value.trim());
            currentPdfDoc.setSubject(iSubject.value.trim());
            currentPdfDoc.setCreator(iCreator.value.trim());
            currentPdfDoc.setProducer(iProducer.value.trim() || 'PDFKing App');

            const keywordString = iKeywords.value.trim();
            if (keywordString !== '') {
                const keywordArray = keywordString.split(',').map(k => k.trim()).filter(k => k !== '');
                currentPdfDoc.setKeywords(keywordArray);
            } else {
                currentPdfDoc.setKeywords([]); 
            }

            const pdfBytes = await currentPdfDoc.save();
            const filename = document.getElementById('exportFilename').value || 'updated.pdf';
            
            PDFKingUtils.downloadBlob(pdfBytes, filename);
            PDFKingUtils.showToast('Metadata updated successfully!', 'success');

            // IMPORTANT: If they want to update again, we should re-clone from the master bytes 
            // because `currentPdfDoc.save()` finalized the current document object in memory.
            const { PDFDocument } = PDFLib;
            currentPdfDoc = await PDFDocument.load(originalPdfBytes.slice(0), { updateMetadata: false });

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('An error occurred while saving.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('resetBtn').addEventListener('click', resetUI);
    
    function resetUI() {
        originalPdfBytes = null;
        currentPdfDoc = null;
        document.getElementById('fileInput').value = '';
        
        [iTitle, iAuthor, iSubject, iKeywords, iCreator, iProducer].forEach(input => input.value = '');
        
        workspace.classList.add('hidden');
        workspace.classList.remove('flex');
        uploadZone.classList.remove('hidden');
    }
});