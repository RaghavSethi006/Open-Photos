use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaceEmbedding {
    pub photo_path: String,
    pub face_index: usize,
    pub embedding: Vec<f32>,
    pub bbox: [f32; 4],
    pub landmarks: [[f32; 2]; 5],
    pub confidence: f32,
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

pub fn cluster_embeddings(
    embeddings: &[FaceEmbedding],
    threshold: f32,
) -> Vec<Vec<usize>> {
    let n = embeddings.len();
    if n == 0 {
        return vec![];
    }

    let mut adjacency: Vec<Vec<usize>> = vec![vec![]; n];
    for i in 0..n {
        for j in (i + 1)..n {
            let sim = cosine_similarity(&embeddings[i].embedding, &embeddings[j].embedding);
            if sim >= threshold {
                adjacency[i].push(j);
                adjacency[j].push(i);
            }
        }
    }

    let mut visited = vec![false; n];
    let mut clusters: Vec<Vec<usize>> = vec![];

    for i in 0..n {
        if visited[i] {
            continue;
        }
        let mut cluster = vec![];
        let mut stack = vec![i];
        while let Some(node) = stack.pop() {
            if visited[node] {
                continue;
            }
            visited[node] = true;
            cluster.push(node);
            for &neighbor in &adjacency[node] {
                if !visited[neighbor] {
                    stack.push(neighbor);
                }
            }
        }
        clusters.push(cluster);
    }

    clusters.sort_by(|a, b| b.len().cmp(&a.len()));
    clusters
}

pub fn average_embedding(embeddings: &[&FaceEmbedding]) -> Vec<f32> {
    if embeddings.is_empty() {
        return vec![];
    }
    let dim = embeddings[0].embedding.len();
    let mut avg = vec![0.0_f32; dim];
    let count = embeddings.len() as f32;
    for emb in embeddings {
        for (i, &v) in emb.embedding.iter().enumerate() {
            avg[i] += v / count;
        }
    }
    avg
}

pub fn find_best_thumbnail(embeddings: &[&FaceEmbedding]) -> Option<&FaceEmbedding> {
    if embeddings.is_empty() {
        return None;
    }
    embeddings.iter().max_by(|a, b| {
        a.confidence.partial_cmp(&b.confidence).unwrap_or(std::cmp::Ordering::Equal)
    }).copied()
}
