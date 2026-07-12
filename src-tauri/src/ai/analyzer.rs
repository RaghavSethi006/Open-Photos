use face_id::analyzer::FaceAnalyzer;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

const SMALL_MODELS: &[(&str, &str)] = &[
    (
        "det_500m.onnx",
        "https://huggingface.co/deepghs/insightface/resolve/main/buffalo_s/det_500m.onnx",
    ),
    (
        "w600k_mbf.onnx",
        "https://huggingface.co/deepghs/insightface/resolve/main/buffalo_s/w600k_mbf.onnx",
    ),
    (
        "genderage.onnx",
        "https://huggingface.co/deepghs/insightface/resolve/main/buffalo_s/genderage.onnx",
    ),
];

const LARGE_MODELS: &[(&str, &str)] = &[
    (
        "det_10g.onnx",
        "https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/det_10g.onnx",
    ),
    (
        "w600k_r50.onnx",
        "https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/w600k_r50.onnx",
    ),
    (
        "genderage.onnx",
        "https://huggingface.co/deepghs/insightface/resolve/main/buffalo_l/genderage.onnx",
    ),
];

#[derive(Clone, PartialEq)]
pub enum ModelSize {
    Small,
    Large,
}

fn model_file_names(size: &ModelSize) -> (&'static str, &'static str, &'static str) {
    match size {
        ModelSize::Small => ("det_500m.onnx", "w600k_mbf.onnx", "genderage.onnx"),
        ModelSize::Large => ("det_10g.onnx", "w600k_r50.onnx", "genderage.onnx"),
    }
}

fn models_dir() -> Result<PathBuf, String> {
    let mut path =
        dirs_next::data_dir().ok_or_else(|| "Could not find app data directory.".to_string())?;
    path.push("com.localphotos.app");
    path.push("models");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

async fn download_model(url: &str, dest: &PathBuf) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "Download failed with HTTP {} for {}",
            response.status(),
            url
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    fs::write(dest, &bytes).map_err(|e| format!("Failed to save model: {}", e))?;
    Ok(())
}

pub async fn ensure_models_downloaded(model_size: &ModelSize) -> Result<PathBuf, String> {
    let base = models_dir()?;
    let subdir_name = match model_size {
        ModelSize::Small => "buffalo_s",
        ModelSize::Large => "buffalo_l",
    };
    let subdir = base.join(subdir_name);
    fs::create_dir_all(&subdir).map_err(|e| e.to_string())?;

    let models = match model_size {
        ModelSize::Small => SMALL_MODELS,
        ModelSize::Large => LARGE_MODELS,
    };

    for (filename, url) in models {
        let dest = subdir.join(filename);
        if !dest.exists() {
            download_model(url, &dest).await?;
        }
    }

    Ok(subdir)
}

pub struct FaceAnalyzerManager {
    analyzer: Mutex<Option<FaceAnalyzer>>,
    model_size: Mutex<ModelSize>,
}

static ANALYZER_INSTANCE: OnceLock<FaceAnalyzerManager> = OnceLock::new();

pub fn get_analyzer_manager() -> &'static FaceAnalyzerManager {
    ANALYZER_INSTANCE.get_or_init(|| FaceAnalyzerManager {
        analyzer: Mutex::new(None),
        model_size: Mutex::new(ModelSize::Small),
    })
}

impl FaceAnalyzerManager {
    pub async fn ensure_initialized(
        &self,
        app_handle: Option<&AppHandle>,
        model_size: ModelSize,
    ) -> Result<(), String> {
        {
            let current_size = self.model_size.lock().map_err(|e| e.to_string())?;
            let analyzer = self.analyzer.lock().map_err(|e| e.to_string())?;
            let size_changed = *current_size != model_size;
            if analyzer.is_some() && !size_changed {
                return Ok(());
            }
        }

        if let Some(handle) = app_handle {
            let _ = handle.emit("face:model-download-start", ());
        }

        let dir = ensure_models_downloaded(&model_size).await?;

        let (det_fn, rec_fn, attr_fn) = model_file_names(&model_size);
        let det_path = dir.join(det_fn);
        let rec_path = dir.join(rec_fn);
        let attr_path = dir.join(attr_fn);

        let det_str = det_path.to_string_lossy().to_string();
        let rec_str = rec_path.to_string_lossy().to_string();
        let attr_str = attr_path.to_string_lossy().to_string();

        let result = FaceAnalyzer::builder(&det_str, &rec_str, &attr_str)
            .detector_score_threshold(0.5)
            .detector_iou_threshold(0.4)
            .build()
            .map_err(|e| format!("Failed to initialize face analyzer: {}", e))?;

        {
            let mut current_size = self.model_size.lock().map_err(|e| e.to_string())?;
            let mut analyzer = self.analyzer.lock().map_err(|e| e.to_string())?;
            *analyzer = Some(result);
            *current_size = model_size;
        }

        if let Some(handle) = app_handle {
            let _ = handle.emit("face:model-download-complete", ());
        }

        Ok(())
    }

    pub fn get_analyzer(&self) -> Result<std::sync::MutexGuard<'_, Option<FaceAnalyzer>>, String> {
        self.analyzer.lock().map_err(|e| e.to_string())
    }

    pub fn get_model_size(&self) -> Result<ModelSize, String> {
        self.model_size.lock().map_err(|e| e.to_string()).map(|s| s.clone())
    }

    pub fn is_ready(&self) -> bool {
        self.analyzer
            .lock()
            .ok()
            .map(|a| a.is_some())
            .unwrap_or(false)
    }
}
