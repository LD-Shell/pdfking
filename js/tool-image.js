document.addEventListener('DOMContentLoaded', () => {
    
    // Style definitions matrix
    const STYLES = [
        { id: '01_Pure_White_Studio', type: 'radial', c1: [255, 255, 255], c2: [240, 240, 240] },
        { id: '02_Off_White_Vignette', type: 'radial', c1: [252, 252, 252], c2: [220, 220, 220] },
        { id: '03_Light_Gray_Linear', type: 'linear', c1: [250, 250, 250], c2: [200, 200, 200] },
        { id: '04_Clean_Silver_Radial', type: 'radial', c1: [245, 245, 245], c2: [192, 192, 192] },
        { id: '05_Soft_Cloud', type: 'radial', c1: [255, 255, 255], c2: [200, 205, 210] },
        { id: '06_Executive_Platinum', type: 'radial', c1: [220, 220, 220], c2: [160, 160, 160] },
        { id: '07_Corporate_Cool_Gray', type: 'linear', c1: [230, 233, 236], c2: [180, 185, 190] },
        { id: '08_Slate_Light', type: 'radial', c1: [180, 185, 190], c2: [140, 145, 150] },
        { id: '09_Neutral_Gray_Medium', type: 'radial', c1: [169, 169, 169], c2: [105, 105, 105] },
        { id: '10_Tech_Slate_Linear', type: 'linear', c1: [200, 205, 210], c2: [120, 125, 130] },
        { id: '11_Warm_Paper', type: 'radial', c1: [255, 253, 245], c2: [230, 225, 215] },
        { id: '12_Cream_Studio', type: 'radial', c1: [255, 250, 240], c2: [220, 210, 190] },
        { id: '13_Warm_Beige_Linear', type: 'linear', c1: [250, 245, 235], c2: [210, 200, 180] },
        { id: '14_Latte_Vignette', type: 'radial', c1: [245, 235, 225], c2: [190, 175, 160] },
        { id: '15_UH_Red_Tint_Subtle', type: 'radial', c1: [255, 250, 250], c2: [240, 220, 220] },
        { id: '16_UH_Slate_Tint_Light', type: 'radial', c1: [230, 235, 240], c2: [160, 170, 180] },
        { id: '17_Cool_Blue_Tint', type: 'linear', c1: [240, 245, 255], c2: [200, 210, 230] },
        { id: '18_Modern_Dark_Gray', type: 'radial', c1: [120, 120, 120], c2: [60, 60, 60] },
        { id: '19_Deep_Slate_Vignette', type: 'radial', c1: [100, 110, 115], c2: [40, 45, 50] },
        { id: '20_Charcoal_Linear', type: 'linear', c1: [100, 100, 100], c2: [50, 50, 50] },
        { id: '21_Midnight_Blue_Pro', type: 'radial', c1: [80, 90, 110], c2: [30, 40, 60] }
    ];

    let currentSubjectImage = null; 
    let currentStyleIndex = 0;
    let originalFilename = "image";
    let isAiModelCached = false; 
    let cropperInstance = null;

    // Interface element bindings
    const canvas = document.getElementById('previewCanvas');
    const ctx = canvas.getContext('2d');
    
    const targetWInput = document.getElementById('targetW');
    const targetHInput = document.getElementById('targetH');
    const alignSelect = document.getElementById('alignPos');
    const offsetXInput = document.getElementById('offsetX');
    const offsetYInput = document.getElementById('offsetY');
    const rotateInput = document.getElementById('rotateSubject');
    const flipXInput = document.getElementById('flipX');
    const flipYInput = document.getElementById('flipY');
    
    const styleGrid = document.getElementById('styleGrid');
    const currentStyleName = document.getElementById('currentStyleName');
    const presetSelect = document.getElementById('canvasPreset');

    const overlayTextInput = document.getElementById('overlayText');
    const textFontSelect = document.getElementById('textFont');
    const textSizeInput = document.getElementById('textSize');
    const textColorInput = document.getElementById('textColor');
    const textAlignSelect = document.getElementById('textAlign');
    const textPosXSlider = document.getElementById('textPosX');
    const textPosYSlider = document.getElementById('textPosY');
    const textPosXVal = document.getElementById('textPosXVal');
    const textPosVal = document.getElementById('textPosVal');

    const cropModal = document.getElementById('cropModal');
    const cropTarget = document.getElementById('cropTarget');
    const brightnessSlider = document.getElementById('brightnessControl');
    const contrastSlider = document.getElementById('contrastControl');
    const brightnessVal = document.getElementById('brightnessVal');
    const contrastVal = document.getElementById('contrastVal');

    PDFKingUtils.initThemeToggle('themeToggle');
    PDFKingUtils.bindFileUpload('uploadZone', 'fileInput', handleFileSelection);

    // Modal injection sequence
    const modalHTML = `
    <div id="aiConsentModal" class="fixed inset-0 bg-slate-900/80 z-[100] hidden flex items-center justify-center backdrop-blur-sm transition-opacity">
        <div class="bg-white dark:bg-slate-900 p-8 rounded-3xl max-w-md w-full mx-4 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div id="aiConsentStep">
                <div class="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 rounded-full flex items-center justify-center mb-6 text-2xl">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                </div>
                <h3 class="text-2xl font-bold mb-3">Download AI model?</h3>
                <p class="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                    To keep your photos 100% private, we process them entirely on your device. This requires a one-time download of an <b>80 MB AI model</b>.
                    <br><br>
                    It will be securely cached in your browser so you never have to download it again.
                </p>
                <div class="flex gap-3 justify-end">
                    <button id="aiCancelBtn" class="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors">Cancel</button>
                    <button id="aiAcceptBtn" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors">Download</button>
                </div>
            </div>
            <div id="aiProgressStep" class="hidden">
                <div class="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 rounded-full flex items-center justify-center mb-6 text-2xl">
                    <i class="fa-solid fa-microchip fa-pulse"></i>
                </div>
                <h3 class="text-xl font-bold mb-2">Initializing AI studio...</h3>
                <p class="text-sm text-slate-500 mb-6">Downloading and caching model locally.</p>
                <div class="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-4 mb-2 overflow-hidden border border-slate-200 dark:border-slate-700">
                    <div id="aiProgressBar" class="bg-gradient-to-r from-indigo-500 to-purple-500 h-4 rounded-full transition-all duration-200" style="width: 0%"></div>
                </div>
                <div class="flex justify-between items-center text-xs font-bold text-slate-500">
                    <span id="aiProgressDetail">Starting...</span>
                    <span id="aiProgressPercent" class="text-indigo-600">0%</span>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const aiModal = document.getElementById('aiConsentModal');
    const consentStep = document.getElementById('aiConsentStep');
    const progressStep = document.getElementById('aiProgressStep');

    // Render style grid
    STYLES.forEach((style, index) => {
        const btn = document.createElement('button');
        btn.className = `w-full aspect-square rounded-lg border-2 transition-all ${index === 0 ? 'border-indigo-500 scale-110 shadow-md z-10' : 'border-transparent hover:scale-105'}`;
        const c1 = `rgb(${style.c1.join(',')})`;
        const c2 = `rgb(${style.c2.join(',')})`;
        btn.style.background = style.type === 'radial' ? `radial-gradient(circle, ${c1}, ${c2})` : `linear-gradient(to bottom, ${c1}, ${c2})`;
        
        btn.onclick = () => {
            Array.from(styleGrid.children).forEach(c => { c.className = 'w-full aspect-square rounded-lg border-2 border-transparent hover:scale-105 transition-all'; });
            btn.className = 'w-full aspect-square rounded-lg border-2 border-indigo-500 scale-110 shadow-md z-10 transition-all';
            currentStyleIndex = index;
            currentStyleName.innerText = style.id.replace(/_/g, ' ').substring(3);
            renderCanvas();
        };
        styleGrid.appendChild(btn);
    });

    // Initializing spatial bounding region
    function handleFileSelection(files) {
        const file = files[0];
        if (!file.type.startsWith('image/')) return PDFKingUtils.showToast('Please upload an image.', 'error');

        originalFilename = file.name.replace(/\.[^/.]+$/, ""); 

        const reader = new FileReader();
        reader.onload = (e) => {
            cropTarget.src = e.target.result;
            document.getElementById('uploadZone').classList.add('hidden');
            cropModal.classList.remove('hidden');
            cropModal.classList.add('flex');

            if (cropperInstance) cropperInstance.destroy();
            
            cropperInstance = new Cropper(cropTarget, {
                viewMode: 1,
                autoCropArea: 0.9,
                background: false
            });
        };
        reader.readAsDataURL(file);
    }

    document.getElementById('cancelCropBtn').addEventListener('click', () => {
        cropModal.classList.add('hidden');
        cropModal.classList.remove('flex');
        document.getElementById('uploadZone').classList.remove('hidden');
        if (cropperInstance) cropperInstance.destroy();
    });

    document.getElementById('confirmCropBtn').addEventListener('click', () => {
        const canvasCropped = cropperInstance.getCroppedCanvas();
        const img = new Image();
        img.onload = () => {
            currentSubjectImage = img;
            cropModal.classList.add('hidden');
            cropModal.classList.remove('flex');
            
            document.getElementById('workspace').classList.remove('hidden');
            document.getElementById('workspace').classList.add('flex');
            
            presetSelect.value = '1080x1920';
            targetWInput.value = 1080;
            targetHInput.value = 1920;
            
            renderCanvas();
            PDFKingUtils.showToast('Image loaded successfully!', 'success');
        };
        img.src = canvasCropped.toDataURL('image/png');
    });

    // Core rendering and coordinate mapping
    function renderCanvas() {
        if (!currentSubjectImage) return;

        const targetW = parseInt(targetWInput.value) || 1080;
        const targetH = parseInt(targetHInput.value) || 1920;
        const align = alignSelect.value;
        const style = STYLES[currentStyleIndex];

        canvas.width = targetW;
        canvas.height = targetH;
        ctx.filter = 'none';

        const c1 = `rgb(${style.c1.join(',')})`;
        const c2 = `rgb(${style.c2.join(',')})`;
        
        if (style.type === 'radial') {
            const cx = targetW / 2;
            const cy = targetH / 2.5;
            const maxRadius = Math.hypot(targetW, targetH) * 0.85;
            const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
            grd.addColorStop(0, c1);
            grd.addColorStop(1, c2);
            ctx.fillStyle = grd;
        } else {
            const grd = ctx.createLinearGradient(0, 0, 0, targetH);
            grd.addColorStop(0, c1);
            grd.addColorStop(1, c2);
            ctx.fillStyle = grd;
        }
        ctx.fillRect(0, 0, targetW, targetH);

        const w = currentSubjectImage.width;
        const h = currentSubjectImage.height;
        const scale = Math.min(targetW / w, targetH / h);
        const newW = w * scale;
        const newH = h * scale;

        // Base coordinate mapping
        let x = (targetW - newW) / 2;
        let y = 0;
        if (align === 'center') {
            y = (targetH - newH) / 2;
        } else if (align === 'bottom-center') {
            y = targetH - newH;
        } else if (align === 'top-center') {
            y = 0;
        }

        // Applying user-defined scalar offsets
        const manualOffsetX = parseInt(offsetXInput.value) || 0;
        const manualOffsetY = parseInt(offsetYInput.value) || 0;
        x += manualOffsetX;
        y += manualOffsetY;

        const brightness = brightnessSlider.value;
        const contrast = contrastSlider.value;
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;

        // Canvas context transformations for orientation control
        const rotateAngle = parseInt(rotateInput.value) || 0;
        const flipX = flipXInput.checked;
        const flipY = flipYInput.checked;

        ctx.save();
        const centerX = x + newW / 2;
        const centerY = y + newH / 2;
        
        ctx.translate(centerX, centerY);
        ctx.rotate(rotateAngle * Math.PI / 180);
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        
        ctx.drawImage(currentSubjectImage, -newW / 2, -newH / 2, newW, newH);
        ctx.restore();
        
        ctx.filter = 'none';

        // Typographic overlay rendering phase
        const overlayStr = overlayTextInput.value;
        if (overlayStr) {
            const fontFam = textFontSelect.value;
            const size = parseInt(textSizeInput.value) || 48;
            const col = textColorInput.value;
            const alignMode = textAlignSelect.value;
            const posXPercent = parseInt(textPosXSlider.value) || 50;
            const posYPercent = parseInt(textPosYSlider.value) || 15;
            
            ctx.font = `900 ${size}px ${fontFam}, sans-serif`;
            ctx.fillStyle = col;
            ctx.textAlign = alignMode;
            ctx.textBaseline = 'middle';
            
            const textX = (targetW * posXPercent) / 100;
            const textY = (targetH * posYPercent) / 100;
            
            ctx.fillText(overlayStr, textX, textY);
        }
    }

    // Event listeners for dimension parameters
    targetWInput.addEventListener('input', () => { presetSelect.value = 'custom'; renderCanvas(); });
    targetHInput.addEventListener('input', () => { presetSelect.value = 'custom'; renderCanvas(); });
    alignSelect.addEventListener('change', renderCanvas);
    offsetXInput.addEventListener('input', renderCanvas);
    offsetYInput.addEventListener('input', renderCanvas);
    rotateInput.addEventListener('input', renderCanvas);
    flipXInput.addEventListener('change', renderCanvas);
    flipYInput.addEventListener('change', renderCanvas);

    presetSelect.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
            const [w, h] = e.target.value.split('x');
            targetWInput.value = w;
            targetHInput.value = h;
            renderCanvas();
        }
    });

    overlayTextInput.addEventListener('input', renderCanvas);
    textFontSelect.addEventListener('change', renderCanvas);
    textSizeInput.addEventListener('input', renderCanvas);
    textColorInput.addEventListener('input', renderCanvas);
    textAlignSelect.addEventListener('change', renderCanvas);
    
    textPosXSlider.addEventListener('input', (e) => {
        textPosXVal.innerText = `${e.target.value}%`;
        renderCanvas();
    });
    
    textPosYSlider.addEventListener('input', (e) => {
        textPosVal.innerText = `${e.target.value}%`;
        renderCanvas();
    });

    brightnessSlider.addEventListener('input', (e) => {
        brightnessVal.innerText = `${e.target.value}%`;
        renderCanvas();
    });
    
    contrastSlider.addEventListener('input', (e) => {
        contrastVal.innerText = `${e.target.value}%`;
        renderCanvas();
    });

    // Background subtraction execution
    const removeBtn = document.getElementById('removeBgBtn');

    document.getElementById('aiCancelBtn').addEventListener('click', () => {
        aiModal.classList.add('hidden');
    });

    removeBtn.addEventListener('click', async () => {
        if (!currentSubjectImage) return;
        if (isAiModelCached && window.imglyRemoveBackground) {
            executeRemoval();
            return;
        }
        consentStep.classList.remove('hidden');
        progressStep.classList.add('hidden');
        aiModal.classList.remove('hidden');
    });

    document.getElementById('aiAcceptBtn').addEventListener('click', () => {
        consentStep.classList.add('hidden');
        progressStep.classList.remove('hidden');
        document.getElementById('aiProgressDetail').innerText = 'Fetching library...';

        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.3/dist/imgly-remove-background.js";
        script.crossOrigin = "anonymous";

        script.onload = () => {
            isAiModelCached = true;
            executeRemoval(); 
        };

        script.onerror = (err) => {
            console.error("Failed to load script:", err);
            aiModal.classList.add('hidden');
            PDFKingUtils.showToast('Failed to reach AI provider. Check your connection.', 'error');
        };

        document.body.appendChild(script);
    });

    async function executeRemoval() {
        const originalText = removeBtn.innerHTML;
        removeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing AI...';
        removeBtn.disabled = true;

        try {
            const config = {
                publicPath: "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.3/dist/",
                progress: (key, current, total) => {
                    if (total > 0 && progressStep.classList.contains('hidden') === false) {
                        const percent = Math.round((current / total) * 100);
                        document.getElementById('aiProgressBar').style.width = `${percent}%`;
                        document.getElementById('aiProgressPercent').innerText = `${percent}%`;
                        document.getElementById('aiProgressDetail').innerText = `Downloading ${key}...`;
                    }
                }
            };

            const blob = await window.imglyRemoveBackground(currentSubjectImage.src, config);
            
            const url = URL.createObjectURL(blob);
            const newImg = new Image();
            newImg.onload = () => {
                currentSubjectImage = newImg;
                renderCanvas();
                aiModal.classList.add('hidden'); 
                PDFKingUtils.showToast('Background removed perfectly!', 'success');
                removeBtn.innerHTML = originalText;
                removeBtn.disabled = false;
            };
            newImg.src = url;

        } catch (error) {
            console.error("AI processing error:", error);
            aiModal.classList.add('hidden');
            PDFKingUtils.showToast('AI process failed. Try a smaller resolution image.', 'error');
            removeBtn.innerHTML = originalText;
            removeBtn.disabled = false;
        }
    }

    // Export and output buffering
    async function getCompressedBlob(targetCanvas, format, maxKb) {
        let quality = 0.90;
        let scale = 1.0;
        const minQuality = 0.50;
        const scaleStep = 0.9;
        const mimeType = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;

        return new Promise((resolve) => {
            const attempt = () => {
                let renderCanvas = targetCanvas;
                if (scale < 1.0) {
                    renderCanvas = document.createElement('canvas');
                    renderCanvas.width = targetCanvas.width * scale;
                    renderCanvas.height = targetCanvas.height * scale;
                    const compCtx = renderCanvas.getContext('2d');
                    compCtx.drawImage(targetCanvas, 0, 0, renderCanvas.width, renderCanvas.height);
                }

                renderCanvas.toBlob((blob) => {
                    const sizeKb = blob.size / 1024;
                    if (sizeKb <= maxKb) return resolve(blob); 

                    if (quality > minQuality) {
                        quality -= 0.05;
                        attempt();
                    } else {
                        scale *= scaleStep;
                        quality = 0.90; 
                        if (targetCanvas.width * scale < 200 || targetCanvas.height * scale < 200) return resolve(blob);
                        attempt();
                    }
                }, mimeType, quality);
            };
            attempt();
        });
    }

    document.getElementById('exportSingleBtn').addEventListener('click', async () => {
        const btn = document.getElementById('exportSingleBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Compressing...';
        
        const format = document.getElementById('outFormat').value;
        const maxKb = parseInt(document.getElementById('maxKb').value) || 200;
        const styleName = STYLES[currentStyleIndex].id;

        const blob = await getCompressedBlob(canvas, format, maxKb);
        PDFKingUtils.downloadBlob(blob, `${originalFilename}_${styleName}.${format}`);
        
        btn.innerHTML = '<i class="fa-solid fa-download mr-2"></i> Export current';
        PDFKingUtils.showToast('Exported successfully!', 'success');
    });

    document.getElementById('exportAllBtn').addEventListener('click', async () => {
        const btn = document.getElementById('exportAllBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating styles...';
        btn.disabled = true;

        const format = document.getElementById('outFormat').value;
        const maxKb = parseInt(document.getElementById('maxKb').value) || 200;
        
        const zip = new JSZip();

        for (let i = 0; i < STYLES.length; i++) {
            currentStyleIndex = i;
            renderCanvas(); 
            const blob = await getCompressedBlob(canvas, format, maxKb);
            const ext = format === 'jpeg' ? 'jpg' : format;
            zip.file(`${STYLES[i].id}/${originalFilename}.${ext}`, blob);
        }

        btn.innerHTML = '<i class="fa-solid fa-file-zipper fa-spin"></i> Zipping...';
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        PDFKingUtils.downloadBlob(zipBlob, `${originalFilename}_21_Styles.zip`);
        
        btn.innerHTML = '<i class="fa-solid fa-layer-group mr-2"></i> Generate all styles';
        btn.disabled = false;
        PDFKingUtils.showToast('ZIP generated successfully!', 'success');
    });
});