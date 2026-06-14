use face_id::analyzer::FaceAnalyzer;
use face_id::model_manager::HfModel;
use ort::ep::CPUExecutionProvider;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

const SMALL_DETECTOR: HfModel = HfModel {
    id: "public-data/insightface",
    file: "models/buffalo_s/det_500m.onnx",
};
const SMALL_EMBEDDER: HfModel = HfModel {
    id: "public-data/insightface",
    file: "models/buffalo_s/w600k_mbf.onnx",
};
const SMALL_ATTRIBUTES: HfModel = HfModel {
    id: "public-data/insightface",
    file: "models/buffalo_s/genderage.onnx",
};

const LARGE_DETECTOR: HfModel = HfModel {
    id: "public-data/insightface",
    file: "models/buffalo_l/det_10g.onnx",
};
const LARGE_EMBEDDER: HfModel = HfModel {
    id: "public-data/insightface",
    file: "models/buffalo_l/w600k_r50.onnx",
};
const LARGE_ATTRIBUTES: HfModel = HfModel {
    id: "public-data/insightface",
    file: "models/buffalo_l/genderage.onnx",
};

pub enum ModelSize {
    Small,
    Large,
}

pub struct FaceAnalyzerManager {
    analyzer: Mutex<Option<FaceAnalyzer>>,
    model_size: Mutex<ModelSize>,
}

impl FaceAnalyzerManager {
    pub fn new() -> Self {
        Self {
            analyzer: Mutex::new(None),
            model_size: Mutex::new(ModelSize::Small),
        }
    }

    pub async fn ensure_initialized(
        &self,
        app_handle: Option<&AppHandle>,
        model_size: ModelSize,
    ) -> Result<(), String> {
        let mut current_size = self.model_size.lock().map_err(|e| e.to_string())?;
        let mut analyzer = self.analyzer.lock().map_err(|e| e.to_string())?;

        let size_changed = match (&*current_size, &model_size) {
            (ModelSize::Small, ModelSize::Large) => true,
            (ModelSize::Large, ModelSize::Small) => true,
            _ => false,
        };

        if analyzer.is_some() && !size_changed {
            return Ok(());
        }

        let (det, emb, attr) = match &model_size {
            ModelSize::Small => (&SMALL_DETECTOR, &SMALL_EMBEDDER, &SMALL_ATTRIBUTES),
            ModelSize::Large => (&LARGE_DETECTOR, &LARGE_EMBEDDER, &LARGE_ATTRIBUTES),
        };

        if let Some(handle) = app_handle {
            let _ = handle.emit("face:model-download-start", ());
        }

        let result = FaceAnalyzer::from_hf()
            .detector_model(det.clone())
            .embedder_model(emb.clone())
            .gender_age_model(attr.clone())
            .detector_score_threshold(0.5)
            .detector_iou_threshold(0.4)
            .with_execution_providers(&[CPUExecutionProvider::default().build()])
            .build()
            .await
            .map_err(|e| format!("Failed to initialize face analyzer: {}", e))?;

        *analyzer = Some(result);
        *current_size = model_size;

        if let Some(handle) = app_handle {
            let _ = handle.emit("face:model-download-complete", ());
        }

        Ok(())
    }

    pub fn get_analyzer(&self) -> Result<std::sync::MutexGuard<'_, Option<FaceAnalyzer>>, String> {
        self.analyzer.lock().map_err(|e| e.to_string())
    }

    pub fn is_ready(&self) -> bool {
        self.analyzer.lock().ok().map(|a| a.is_some()).unwrap_or(false)
    }
}
