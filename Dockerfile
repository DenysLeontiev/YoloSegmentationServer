# Use NVIDIA CUDA base image for GPU support (updated to 12.1 for better compatibility)
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# Install Python 3.9 and dependencies in one layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.9 \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# Copy only necessary files (exclude all .pt model files from copy)
COPY requirements.txt .
COPY main.py .
COPY static/ ./static/

# Copy only the specific model file you're using
COPY 70-epochs-320-imagesize-simple-augmentation-grayscale-nano-yolov8.pt .

# Install PyTorch 2.6+ with CUDA 12.8 support (includes sm_120 for RTX 5070)
RUN pip install --no-cache-dir \
    torch torchvision --index-url https://download.pytorch.org/whl/cu128 \
    && pip install --no-cache-dir \
    fastapi==0.122.0 \
    uvicorn==0.38.0 \
    python-multipart==0.0.20 \
    ultralytics==8.3.231 \
    opencv-python-headless==4.12.0.88 \
    numpy==2.2.6 \
    pillow==12.0.0 \
    && rm -rf /root/.cache/pip/* /tmp/*

EXPOSE 8888

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8888"]
