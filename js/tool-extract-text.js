/**
 * js/tool-extract-text.js
 * Logic for extracting the hidden text layer using pdf.js.
 */

document.addEventListener('DOMContentLoaded', () => {
    let currentFileName = "document";
    let fullExtractedText = "";

    // 1. Initialize core utilities
    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    // DOM Elements
    const uploadZone = document.getElementById('uploadZone');
    const workspace = document.getElementById('workspace');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const loadingProgress = document.getElementById('loadingProgress');
    
    const textPreview = document.getElementById('textPreview');
    const metaData = document.getElementById('metaData');
    const charCount = document.getElementById('charCount');
    
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');

    // 2. The Extraction Engine
    async function handleFileSelection(files) {
        const file = files[0];
        if (file.type !== 'application/pdf') {
            return PDFKingUtils.showToast('Please upload a valid PDF file.', 'error');
        }

        currentFileName = file.name.replace('.pdf', '');
        fullExtractedText = "";
        textPreview.value = ""; 

        uploadZone.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');

        try {
            const arrayBuffer = await file.arrayBuffer();
            
            // 🛡️ Clone buffer (Protects memory from Worker detachment)
            const typedarray = new Uint8Array(arrayBuffer).slice(0);
            
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            const numPages = pdf.numPages;
            
            metaData.innerText = `${file.name} • ${numPages} pages`;

            // Loop through all pages to grab text content
            for (let i = 1; i <= numPages; i++) {
                loadingText.innerText = `Extracting page ${i} of ${numPages}...`;
                loadingProgress.style.width = `${(i / numPages) * 100}%`;
                
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                
                // Inject a clean visual divider for the user
                fullExtractedText += `\n\n--- Page ${i} ---\n\n`;

                let lastY = -1;
                let pageText = "";

                // 🧠 The Y-Axis Heuristic
                // pdf.js returns text in fragments. We track the Y-coordinate. 
                // If the coordinate drops by more than 5 points, we inject a newline.
                for (const item of textContent.items) {
                    const currentY = item.transform[5]; 
                    
                    if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
                        pageText += "\n";
                    }
                    
                    pageText += item.str;
                    lastY = currentY;
                }

                fullExtractedText += pageText;
            }

            // Cleanup padding and push to textarea
            fullExtractedText = fullExtractedText.trim();
            textPreview.value = fullExtractedText;
            updateCharCount();

            // Switch UI states
            loadingOverlay.classList.add('hidden');
            loadingOverlay.classList.remove('flex');
            workspace.classList.remove('hidden');
            workspace.classList.add('flex');
            
            PDFKingUtils.showToast('Text extracted successfully!', 'success');

            // Edge Case: Scanned documents have NO text layer.
            if (fullExtractedText.replace(/-+ Page \d+ -+/g, '').trim() === "") {
                PDFKingUtils.showToast('No text found! This PDF might be a scanned image.', 'error');
            }

        } catch (error) {
            console.error(error);
            PDFKingUtils.showToast('Error reading PDF. It might be encrypted.', 'error');
            resetUI();
        }
    }

    // 3. UI Updates
    textPreview.addEventListener('input', updateCharCount);
    
    function updateCharCount() {
        // Formats number nicely: 1,234 instead of 1234
        charCount.innerText = textPreview.value.length.toLocaleString();
    }

    // 4. Export Controls
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(textPreview.value);
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-solid fa-check text-emerald-500"></i> Copied!';
            setTimeout(() => copyBtn.innerHTML = originalHtml, 2000);
        } catch (err) {
            PDFKingUtils.showToast('Failed to copy to clipboard.', 'error');
        }
    });

    downloadBtn.addEventListener('click', () => {
        // Use our utility function to download raw text instead of a PDF!
        const filename = `${currentFileName}_extracted.txt`;
        PDFKingUtils.downloadBlob(textPreview.value, filename, 'text/plain');
        PDFKingUtils.showToast('Text file downloaded!', 'success');
    });

    // 5. Reset UI
    resetBtn.addEventListener('click', resetUI);

    function resetUI() {
        document.getElementById('fileInput').value = '';
        workspace.classList.add('hidden');
        workspace.classList.remove('flex');
        uploadZone.classList.remove('hidden');
    }
});