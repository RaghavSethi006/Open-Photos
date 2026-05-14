# AI Models Setup

This directory contains the AI/ML models for face detection and recognition.

## Required Models

### 1. Face Detection: UltraFace (ONNX)
Download the UltraFace 320 model:
```bash
# Download from GitHub
curl -L -o version-RFB-320.onnx https://github.com/onnx/models/raw/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx
```
Place in: `src-tauri/src/ai/models/ultraface-320.onnx`

### 2. Face Recognition: MobileFaceNet (ONNX)
Download MobileFaceNet for face embeddings:
```bash
# Alternative: use a simple embedding model or skip for now
# We'll implement a basic version first
```

## Model Details

- **UltraFace-320**: Lightweight face detection (320x240 input)
  - Input: RGB image, 320x240
  - Output: Bounding boxes + confidence scores

## Directory Structure
```
ai/
├── models/
│   ├── ultraface-320.onnx  (you download this)
│   └── README.md           (this file)
└── mod.rs                  (Rust inference code)
```

## Usage
The app will automatically load models on startup. If models are missing, face detection will be disabled.
