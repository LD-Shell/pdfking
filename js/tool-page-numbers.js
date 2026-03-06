/**
 * js/tool-page-numbers.js
 * Logic for adding customizable page numbers via pdf-lib.
 * FIXED: ArrayBuffer detachment via .slice(0)
 */

document.addEventListener('DOMContentLoaded', () => {
    
    let originalPdfBytes = null;
    let totalPagesCount = 0;
    let originalFilename = "document";

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    const uploadZone = document.getElementById('uploadZone');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const workspace = document.getElementById('workspace');
    const pdfPreview = document.getElementById('pdfPreview');
    const positionIndicator = document.getElementById('positionIndicator');
    
    const radioButtons = document.querySelectorAll('input[name="position"]');
    const textColorInput = document.getElementById('textColor');
    const textColorLabel = document.getElementById('textColorLabel');
    const useBgBoxCheckbox = document.getElementById('useBgBox');
    const boxColorInput = document.getElementById('boxColor');
    const formatSelect = document.getElementById('formatSelect');

    // --- UI SYNC ---
    function updatePreviewIndicator() {
        positionIndicator.style.color = textColorInput.value;
        textColorLabel.innerText = textColorInput.value.toUpperCase();

        if (useBgBoxCheckbox.checked) {
            positionIndicator.style.backgroundColor = boxColorInput.value;
            positionIndicator.style.border = `1px solid ${boxColorInput.value}`;
            boxColorInput.disabled = false;
            boxColorInput.classList.remove('opacity-50');
        } else {
            positionIndicator.style.backgroundColor = 'transparent';
            positionIndicator.style.border = '1px dashed #94a3b8'; 
            boxColorInput.disabled = true;
            boxColorInput.classList.add('opacity-50');
        }

        const format = formatSelect.value;
        if (format === '1') positionIndicator.innerText = "1";
        if (format === 'Page 1') positionIndicator.innerText = "Page 1";
        if (format === '1 of n') positionIndicator.innerText = "1 of 10";

        const pos = document.querySelector('input[name="position"]:checked').value;
        positionIndicator.className = "absolute px-2 py-1 rounded text-[11px] font-bold shadow-md transition-all duration-300 flex items-center justify-center";
        
        if (pos === 'top-left') positionIndicator.classList.add('top-6', 'left-6');
        if (pos === 'top-center') positionIndicator.classList.add('top-6', 'left-1/2', '-translate-x-1/2');
        if (pos === 'top-right') positionIndicator.classList.add('top-6', 'right-6');
        if (pos === 'bottom-left') positionIndicator.classList.add('bottom-6', 'left-6');
        if (pos === 'bottom-center') positionIndicator.classList.add('bottom-6', 'left-1/2', '-translate-x-1/2');
        if (pos === 'bottom-right') positionIndicator.classList.add('bottom-6', 'right-6');
    }

    radioButtons.forEach(radio => radio.addEventListener('change', updatePreviewIndicator));
    textColorInput.addEventListener('input', updatePreviewIndicator);
    useBgBoxCheckbox.addEventListener('change', updatePreviewIndicator);
    boxColorInput.addEventListener('input', updatePreviewIndicator);
    formatSelect.addEventListener('change', updatePreviewIndicator);

    // --- FILE LOAD ---
    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        originalFilename = file.name.replace('.pdf', '');
        document.getElementById('exportFilename').value = `${originalFilename}_numbered.pdf`;
        
        uploadZone.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes = new Uint8Array(arrayBuffer);
            
            // 🔥 BUG FIX: Pass a .slice(0) clone to pdf.js so it doesn't steal the memory
            const pdf = await pdfjsLib.getDocument({ data: originalPdfBytes.slice(0) }).promise;
            totalPagesCount = pdf.numPages;
            document.getElementById('previewTitle').innerText = `${originalFilename}.pdf (${totalPagesCount} pages)`;
            
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.5 }); 
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            
            pdfPreview.src = canvas.toDataURL();
            document.getElementById('startPage').max = totalPagesCount;

            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
            
            updatePreviewIndicator(); 

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Error reading PDF. It may be encrypted.', 'error');
            resetUI();
        }
    }

    // --- EXECUTION ---
    function hexToPdfRgb(hex) {
        hex = hex.replace(/^#/, '');
        return PDFLib.rgb(parseInt(hex.substring(0,2),16)/255, parseInt(hex.substring(2,4),16)/255, parseInt(hex.substring(4,6),16)/255);
    }

    document.getElementById('processBtn').addEventListener('click', async () => {
        if (!originalPdfBytes) return;

        const btn = document.getElementById('processBtn');
        const originalText = btn.innerHTML;
        
        try {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            btn.disabled = true;

            const { PDFDocument, StandardFonts } = PDFLib;
            
            // 🔥 BUG FIX: Pass a .slice(0) clone to pdf-lib so it can run multiple times without crashing
            const pdfDoc = await PDFDocument.load(originalPdfBytes.slice(0));
            const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold); 
            const pages = pdfDoc.getPages();
            
            const position = document.querySelector('input[name="position"]:checked').value;
            const format = formatSelect.value;
            const rawStart = parseInt(document.getElementById('startPage').value);
            const startPageIdx = isNaN(rawStart) ? 0 : Math.max(0, rawStart - 1); 

            const textColor = hexToPdfRgb(textColorInput.value);
            const useBgBox = useBgBoxCheckbox.checked;
            const boxColor = useBgBox ? hexToPdfRgb(boxColorInput.value) : null;

            const textSize = 11;
            const fontHeight = helveticaFont.heightAtSize(textSize);
            const boxPadding = 5; 

            for (let i = startPageIdx; i < pages.length; i++) {
                const page = pages[i];
                const { width, height } = page.getSize();
                
                const displayNum = (i - startPageIdx) + 1;
                const totalDisplayPages = pages.length - startPageIdx;
                
                let textToDraw = `${displayNum}`;
                if (format === 'Page 1') textToDraw = `Page ${displayNum}`;
                if (format === '1 of n') textToDraw = `${displayNum} of ${totalDisplayPages}`;

                const textWidth = helveticaFont.widthOfTextAtSize(textToDraw, textSize);
                
                const margin = 35; 
                let x = 0, y = 0;

                if (position.includes('left')) x = margin;
                if (position.includes('center')) x = (width / 2) - (textWidth / 2);
                if (position.includes('right')) x = width - margin - textWidth;

                if (position.includes('top')) y = height - margin - textSize;
                if (position.includes('bottom')) y = margin;

                if (useBgBox) {
                    page.drawRectangle({
                        x: x - boxPadding,
                        y: y - (boxPadding * 0.8),
                        width: textWidth + (boxPadding * 2),
                        height: fontHeight + (boxPadding * 2),
                        color: boxColor,
                    });
                }

                page.drawText(textToDraw, {
                    x: x, y: y, size: textSize, font: helveticaFont, color: textColor,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const filename = document.getElementById('exportFilename').value;
            PDFKingUtils.downloadBlob(pdfBytes, filename);
            PDFKingUtils.showToast('Page numbers added successfully!', 'success');

        } catch (error) {
            console.error("PDF-LIB ERROR:", error);
            PDFKingUtils.showToast('An error occurred. Check console for details.', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('resetBtn').addEventListener('click', resetUI);
    
    function resetUI() {
        originalPdfBytes = null;
        document.getElementById('fileInput').value = '';
        workspace.classList.add('hidden');
        workspace.classList.remove('flex');
        uploadZone.classList.remove('hidden');
    }
});