use anyhow::Result;
use image::DynamicImage;
use ort::{inputs, session::Session, value::Value};
use tauri::{AppHandle, Manager};

pub struct FaceDetector {
    session: Option<Session>,
}

#[derive(Debug, Clone)]
pub struct BoundingBox {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub confidence: f32,
}

impl FaceDetector {
    pub fn new(app: &AppHandle) -> Self {
        // Try to load model, but don't fail if it doesn't exist
        let model_path = app.path().app_data_dir().ok().and_then(|dir| {
            let p = dir
                .parent()?
                .join("src-tauri/src/ai/models/ultraface-320.onnx");
            if p.exists() {
                Some(p)
            } else {
                None
            }
        });

        let session =
            model_path.and_then(|path| Session::builder().ok()?.commit_from_file(path).ok());

        if session.is_none() {
            eprintln!("Warning: Face detection model not found. Face detection will be disabled.");
            eprintln!("See src-tauri/src/ai/models/README.md for instructions.");
        }

        FaceDetector { session }
    }

    pub fn is_available(&self) -> bool {
        self.session.is_some()
    }

    pub fn detect_faces(&mut self, image: &DynamicImage) -> Result<Vec<BoundingBox>> {
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("Model not loaded"))?;

        // UltraFace expects 320x240 RGB input
        let resized = image.resize_exact(320, 240, image::imageops::FilterType::Triangle);
        let rgb = resized.to_rgb8();

        // Convert to f32 and normalize [0, 1]
        let input_data: Vec<f32> = rgb
            .pixels()
            .flat_map(|p| p.0.iter().map(|&v| v as f32 / 255.0))
            .collect();

        // Reshape to [1, 3, 240, 320] (NCHW format)
        let mut nchw = vec![0.0f32; 1 * 3 * 240 * 320];
        for c in 0..3 {
            for h in 0..240 {
                for w in 0..320 {
                    let idx = c * 240 * 320 + h * 320 + w;
                    let src_idx = h * 320 * 3 + w * 3 + c;
                    nchw[idx] = input_data[src_idx];
                }
            }
        }

        let input_tensor = Value::from_array(([1, 3, 240, 320], nchw))?;
        let outputs = session.run(inputs!["input" => input_tensor])?;

        // Parse outputs (this is model-specific, adjust based on actual output format)
        // For now, return empty as we need to verify the actual model output format
        let boxes = Self::parse_detections_static(&outputs)?;

        Ok(boxes)
    }

    fn parse_detections_static(
        _outputs: &ort::session::SessionOutputs,
    ) -> Result<Vec<BoundingBox>> {
        // TODO: Parse actual model outputs
        // UltraFace typically outputs: boxes (N, 4), scores (N,)
        // For now, return empty until we test with actual model
        Ok(Vec::new())
    }
}
