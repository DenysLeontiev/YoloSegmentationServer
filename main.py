from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
import os
import cv2
import numpy as np
from ultralytics import YOLO
from io import BytesIO
import torch

app = FastAPI()

os.makedirs("static", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

device = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Using device: {device}")
if device == 'cuda':
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"CUDA Version: {torch.version.cuda}")
else:
    print("WARNING: GPU not available, using CPU")

MODEL_PATH = "70-epochs-320-imagesize-simple-augmentation-grayscale-nano-yolov8.pt"
model = YOLO(MODEL_PATH)
model.to(device)
print(f"Model loaded on {device}")


@app.get("/", response_class=HTMLResponse)
async def home():
    with open("static/index.html", "r") as f:
        return f.read()

@app.post("/process-frame")
async def process_frame(frame: UploadFile = File(...)):
    """Process frame with YOLO segmentation and return annotated image"""
    try:
        contents = await frame.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return Response(content=b"", status_code=400)
        
        results = model(
            img,
            verbose=False,
            imgsz=320,
            device=device,
            conf=0.25,          
            iou=0.5,
            agnostic_nms=True, 
            retina_masks=False, 
            max_det=20          
        )
        
        annotated_img = results[0].plot(line_width=2, font_size=10)
        
        success, buffer = cv2.imencode('.webp', annotated_img, [cv2.IMWRITE_WEBP_QUALITY, 85])
        
        if not success:
            success, buffer = cv2.imencode('.jpg', annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        
        num_detections = len(results[0].boxes) if results[0].boxes is not None else 0
        
        return Response(
            content=buffer.tobytes(),
            media_type="image/webp",
            headers={
                "X-Detections": str(num_detections),
                "Cache-Control": "no-cache"
            }
        )
        
    except Exception as e:
        print(f"Error processing frame: {e}")
        return Response(content=b"", status_code=500)