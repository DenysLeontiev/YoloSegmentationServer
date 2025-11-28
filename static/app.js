const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureCanvas = document.getElementById('captureCanvas');
const cameraSelect = document.getElementById('cameraSelect');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

const videoSourceSelector = document.getElementById('videosource');
const segmentationMaskColorPicker = document.getElementById('segmentationMaskColorPicker');
const colorHexInput = document.getElementById('colorHexInput');
const colorCircles = document.querySelectorAll('.color-circle');

let stream = null;
let intervalId = null;
let animationId = null;
const ctx = canvas.getContext('2d');
const captureCtx = captureCanvas.getContext('2d');
let isProcessing = false;
let lastProcessedImage = null;
let isRunning = false;

// Function to convert hex to RGB and send to backend
function setMaskColor(hex) {
    const rgb = [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16)
    ];
    console.log('RGB value:', rgb);
    // Send RGB value to backend to update MASK_COLOR
    fetch('/set-mask-color', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rgb })
    });
}

// Handle color circle clicks
colorCircles.forEach(circle => {
    circle.addEventListener('click', () => {
        // Remove active class from all circles
        colorCircles.forEach(c => c.classList.remove('active'));
        // Add active class to clicked circle
        circle.classList.add('active');
        
        const color = circle.getAttribute('data-color');
        segmentationMaskColorPicker.value = color;
        colorHexInput.value = color;
        setMaskColor(color);
    });
});

// Set first color as default
if (colorCircles.length > 0) {
    colorCircles[0].classList.add('active');
    const defaultColor = colorCircles[0].getAttribute('data-color');
    segmentationMaskColorPicker.value = defaultColor;
    colorHexInput.value = defaultColor;
    setMaskColor(defaultColor);
}

// Handle color picker change
segmentationMaskColorPicker.addEventListener('input', (event) => {
    const hex = event.target.value.toUpperCase();
    colorHexInput.value = hex;
    colorCircles.forEach(c => c.classList.remove('active'));
    setMaskColor(hex);
});

// Handle hex input change
colorHexInput.addEventListener('input', (event) => {
    let hex = event.target.value.trim();
    
    // Auto-add # if missing
    if (hex && !hex.startsWith('#')) {
        hex = '#' + hex;
        event.target.value = hex;
    }
    
    // Validate hex color (3 or 6 digits after #)
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex)) {
        // Convert 3-digit hex to 6-digit
        if (hex.length === 4) {
            hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        
        segmentationMaskColorPicker.value = hex;
        colorCircles.forEach(c => c.classList.remove('active'));
        setMaskColor(hex);
    }
});

async function initializeCameras() {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(track => track.stop());

    await enumerateCameraDevices();
}

async function enumerateCameraDevices() {
    let cameras = await navigator.mediaDevices.enumerateDevices();

    videoSourceSelector.innerHTML = '';

    for (let i = 0; i < cameras.length; i++) {
        let camera = cameras[i];
        if (camera.kind === 'videoinput') {
            let option = document.createElement('option');
            option.value = camera.deviceId;
            option.text = camera.label || `Camera ${i + 1}`;
            videoSourceSelector.appendChild(option);
        }
    }
}

initializeCameras();

function renderLoop() {
    if (!isRunning) return;

    if (lastProcessedImage) {
        ctx.drawImage(lastProcessedImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    animationId = requestAnimationFrame(renderLoop);
}
async function startCamera() {
    const selectedDeviceId = videoSourceSelector.value;
    const constraints = selectedDeviceId
        ? { video: { deviceId: { exact: selectedDeviceId } }, audio: false }
        : { video: { facingMode: cameraSelect.value }, audio: false };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        isRunning = true;
        renderLoop();
        intervalId = setInterval(processFrame, 100);
    };
}

function stopCamera() {
    isRunning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    lastProcessedImage = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
}

async function processFrame() {
    if (isProcessing) return;
    isProcessing = true;

    captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

    captureCanvas.toBlob(async (blob) => {
        try {
            const formData = new FormData();
            formData.append('frame', blob);

            const response = await fetch('/process-frame', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const imageBlob = await response.blob();
                if (!lastProcessedImage) {
                    lastProcessedImage = new Image();
                }
                const img = lastProcessedImage;
                if (img.src && img.src.startsWith('blob:')) {
                    URL.revokeObjectURL(img.src);
                }
                img.src = URL.createObjectURL(imageBlob);
            }
        } catch (err) {
            console.error(err);
        } finally {
            isProcessing = false;
        }
    }, 'image/jpeg', 0.8);
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);