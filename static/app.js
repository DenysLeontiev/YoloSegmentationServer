const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureCanvas = document.getElementById('captureCanvas');
const cameraSelect = document.getElementById('cameraSelect');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let stream = null;
let intervalId = null;
let animationId = null;
const ctx = canvas.getContext('2d');
const captureCtx = captureCanvas.getContext('2d');
let isProcessing = false;
let lastProcessedImage = null;
let isRunning = false;

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
    const facingMode = cameraSelect.value;
    stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: false
    });
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