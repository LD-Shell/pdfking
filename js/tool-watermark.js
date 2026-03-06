/**
 * js/tool-watermark.js
 * Logic for adding dynamic text watermarks with pdf-lib.
 * FIXED: ArrayBuffer detachment via .slice(0)
 */

document.addEventListener('DOMContentLoaded', () => {
    
    let originalPdfBytes = null;
    let originalFilename = "document";

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    const uploadZone = document.getElementById('uploadZone');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const workspace = document.getElementById('workspace');
    const pdfPreview = document.getElementById('pdfPreview');
    const wmOverlay = document.getElementById('wmOverlay');
    
    const iText = document.getElementById('wmText');
    const iSize = document.getElementById('wmSize');
    const iRot = document.getElementById('wmRot');
    const iOpac = document.getElementById('wmOpac');
    const iColor = document.getElementById('wmColor');
    const radiosPos = document.querySelectorAll('input[name="wmPos"]');

    const valSize = document.getElementById('valSize');
    const valRot = document.getElementById('valRot');
    const valOpac = document.getElementById('valOpac');
    const colorLabel = document.getElementById('colorLabel');

    function updatePreview() {
        wmOverlay.innerText = iText.value || ' ';
        wmOverlay.style.color = iColor.value;
        colorLabel.innerText = iColor.value.toUpperCase();

        const sizePx = parseInt(iSize.value);
        const rotDeg = parseInt(iRot.value);
        const opacPct = parseInt(iOpac.value);

        valSize.innerText = `${sizePx}px`;
        valRot.innerText = `${rotDeg}°`;
        valOpac.innerText = `${opacPct}%`;

        wmOverlay.style.fontSize = `${sizePx * 0.5}px`; 
        wmOverlay.style.opacity = opacPct / 100;
        wmOverlay.style.transform = `rotate(${-rotDeg}deg)`;

        const pos = document.querySelector('input[name="wmPos"]:checked').value;
        wmOverlay.className = "absolute font-bold whitespace-nowrap pointer-events-none transition-all duration-100 ease-linear flex items-center justify-center";
        
        if (pos.includes('top')) wmOverlay.classList.add('top-12');
        if (pos.includes('middle')) wmOverlay.classList.add('top-1/2', '-translate-y-1/2');
        if (pos.includes('bottom')) wmOverlay.classList.add('bottom-12');

        if (pos.includes('left')) wmOverlay.classList.add('left-12');
        if (pos.includes('center')) wmOverlay.classList.add('left-1/2', '-translate-x-1/2');
        if (pos.includes('right')) wmOverlay.classList.add('right-12');
    }

    iText.addEventListener('input', updatePreview);
    iSize.addEventListener('input', updatePreview);
    iRot.addEventListener('input', updatePreview);
    iOpac.addEventListener('input', updatePreview);
    iColor.addEventListener('input', updatePreview);
    radiosPos.forEach(r => r.addEventListener('change', updatePreview));

    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        originalFilename = file.name.replace('.pdf', '');
        document.getElementById('exportFilename').value = `${originalFilename}_watermarked.pdf`;
        
        uploadZone.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');

        try {
            const arrayBuffer = await file.arrayBuffer();
            originalPdfBytes = new Uint8Array(arrayBuffer);
            
            // 🔥 BUG FIX: Pass cloned buffer to pdf.js
            const pdf = await pdfjsLib.getDocument({ data: originalPdfBytes.slice(0) }).promise;
            document.getElementById('previewTitle').innerText = `${originalFilename}.pdf (${pdf.numPages} pages)`;
            
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.6 }); 
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
            
            pdfPreview.src = canvas.toDataURL();

            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
            
            updatePreview(); 

        } catch (error) {
            PDFKingUtils.showToast('Error reading PDF.', 'error');
            resetUI();
        }
    }

    function hexToPdfRgb(hex) {
        hex = hex.replace(/^#/, '');
        return PDFLib.rgb(parseInt(hex.substring(0,2),16)/255, parseInt(hex.substring(2,4),16)/255, parseInt(hex.substring(4,6),16)/255);
    }

    document.getElementById('processBtn').addEventListener('click', async () => {
        if (!originalPdfBytes) return;
        const btn = document.getElementById('processBtn');
        const originalText = btn.innerHTML;
        
        try {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Stamping...';
            btn.disabled = true;

            const { PDFDocument, StandardFonts, degrees } = PDFLib;
            // 🔥 BUG FIX: Pass cloned buffer to pdf-lib
            const pdfDoc = await PDFDocument.load(originalPdfBytes.slice(0));
            const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            const text = iText.value || ' ';
            const size = parseInt(iSize.value);
            const rotationAngle = parseInt(iRot.value); 
            const opacity = parseInt(iOpac.value) / 100;
            const color = hexToPdfRgb(iColor.value);
            const position = document.querySelector('input[name="wmPos"]:checked').value;

            const textWidth = font.widthOfTextAtSize(text, size);
            const textHeight = font.heightAtSize(size);

            const pages = pdfDoc.getPages();
            
            for (const page of pages) {
                const { width, height } = page.getSize();
                
                const margin = 50;
                let x = 0, y = 0;

                if (position.includes('left')) x = margin;
                if (position.includes('center')) x = (width / 2) - (textWidth / 2);
                if (position.includes('right')) x = width - margin - textWidth;

                if (position.includes('top')) y = height - margin - textHeight;
                if (position.includes('middle')) y = (height / 2) - (textHeight / 2);
                if (position.includes('bottom')) y = margin;

                const rad = rotationAngle * (Math.PI / 180);
                const cx = textWidth / 2;
                const cy = textHeight / 2;
                const rotatedCx = cx * Math.cos(rad) - cy * Math.sin(rad);
                const rotatedCy = cx * Math.sin(rad) + cy * Math.cos(rad);
                const finalX = x + (cx - rotatedCx);
                const finalY = y + (cy - rotatedCy);

                page.drawText(text, {
                    x: finalX, y: finalY, size: size, font: font, color: color,
                    opacity: opacity, rotate: degrees(rotationAngle)
                });
            }

            const pdfBytes = await pdfDoc.save();
            const filename = document.getElementById('exportFilename').value;
            PDFKingUtils.downloadBlob(pdfBytes, filename);
            PDFKingUtils.showToast('Watermark applied!', 'success');

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('An error occurred during stamping.', 'error');
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