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

MODEL_PATH = "70-epochs-320-imagesize-simple-augmentation-grayscale-nano-yolov8.pt"
model = YOLO(MODEL_PATH)
model.to(device)
print(f"Model loaded on {device}")

# Color for bounding boxes and masks (BGR format)
MASK_COLOR = (0, 255, 0)  # Green by default

@app.get("/", response_class=HTMLResponse)
async def home():
    with open("static/index.html", "r") as f:
        return f.read()

from fastapi import Request

@app.post("/set-mask-color")
async def set_mask_color(request: Request):
    global MASK_COLOR
    rgb = (await request.json()).get("rgb")
    if rgb and len(rgb) == 3:
        MASK_COLOR = tuple(reversed(rgb))  # RGB to BGR
        return {"status": "ok", "mask_color": MASK_COLOR}
    return {"status": "error"}

@app.post("/process-frame")
async def process_frame(frame: UploadFile = File(...)):
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
        annotated_img = img.copy()
        boxes = results[0].boxes
        masks = results[0].masks
        if masks is not None:
            for mask in masks.data:
                mask_np = mask.cpu().numpy()
                mask_resized = cv2.resize(mask_np, (img.shape[1], img.shape[0]))
                colored_mask = np.zeros_like(img, dtype=np.uint8)
                colored_mask[mask_resized > 0.5] = MASK_COLOR
                annotated_img = cv2.addWeighted(annotated_img, 1, colored_mask, 0.4, 0)
        if boxes is not None:
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
                conf = float(box.conf[0].cpu().numpy())
                cls = int(box.cls[0].cpu().numpy())
                cv2.rectangle(annotated_img, (x1, y1), (x2, y2), MASK_COLOR, 2)
                label = f"{model.names[cls]} {conf:.2f}"
                (lw, lh), base = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(annotated_img, (x1, y1 - lh - base - 5), (x1 + lw, y1), MASK_COLOR, -1)
                cv2.putText(annotated_img, label, (x1, y1 - base - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
        success, buffer = cv2.imencode('.webp', annotated_img, [cv2.IMWRITE_WEBP_QUALITY, 85])
        if not success:
            success, buffer = cv2.imencode('.jpg', annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        num_detections = len(boxes) if boxes is not None else 0
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