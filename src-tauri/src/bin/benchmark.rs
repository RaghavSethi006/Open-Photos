use sqlx::sqlite::SqlitePoolOptions;
use std::fs;
use std::path::Path;
use std::time::Instant;
use tauri_applocal_photos_lib::db;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Starting Search Speed Benchmark...");

    // Setup temporary DB
    let db_path = "benchmark.db";
    if Path::new(db_path).exists() {
        fs::remove_file(db_path)?;
    }
    fs::File::create(db_path)?;

    let db_url = format!("sqlite://{}", db_path);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Initialize schema
    sqlx::query(
        "
        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            date_taken DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ",
    )
    .execute(&pool)
    .await?;

    println!("Database initialized.");

    // 1. Benchmark Insertion (Simulating Scan)
    println!("\n--- Benchmarking Insertion (10,000 records) ---");
    let start = Instant::now();

    // Use a transaction for speed
    let mut tx = pool.begin().await?;
    for i in 0..10000 {
        let path = format!("/path/to/photo_{}.jpg", i);
        let filename = format!("photo_{}.jpg", i);
        // Randomish date
        let year = 2020 + (i % 5);
        let month = 1 + (i % 12);
        let day = 1 + (i % 28);
        let date_taken = format!("{:04}-{:02}-{:02} 12:00:00", year, month, day);

        sqlx::query("INSERT INTO images (path, filename, date_taken) VALUES (?, ?, ?)")
            .bind(path)
            .bind(filename)
            .bind(date_taken)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    let duration = start.elapsed();
    println!("Inserted 10,000 records in {:?}", duration);
    println!("Speed: {:.2} records/sec", 10000.0 / duration.as_secs_f64());

    // 2. Benchmark Search/Retrieval (All Photos)
    println!("\n--- Benchmarking Retrieval (Limit 100, Offset 5000) ---");
    let start = Instant::now();

    let photos = sqlx::query_as::<_, db::Image>(
        "SELECT id, path, filename FROM images ORDER BY id DESC LIMIT ? OFFSET ?",
    )
    .bind(100)
    .bind(5000)
    .fetch_all(&pool)
    .await?;

    let duration = start.elapsed();
    println!("Retrieved {} photos in {:?}", photos.len(), duration);

    // 3. Benchmark Timeline Grouping (Complex Query)
    println!("\n--- Benchmarking Timeline Grouping (Full Dataset) ---");
    let start = Instant::now();

    // Logic from db::get_timeline
    let images = sqlx::query_as::<_, db::Image>(
        "SELECT id, path, filename FROM images WHERE date_taken IS NOT NULL ORDER BY date_taken DESC"
    )
    .fetch_all(&pool)
    .await?;

    // Grouping logic (simplified for benchmark)
    let mut groups: std::collections::HashMap<(i32, i32), Vec<db::Image>> =
        std::collections::HashMap::new();
    for img in images {
        // In real app we query date again, but here let's just simulate the grouping overhead
        // Actually the real app does N+1 queries which is bad!
        // "SELECT CAST(strftime('%Y', date_taken) AS INTEGER)... FROM images WHERE id = ?"
        // Let's benchmark exactly what the app does to show if it's slow.

        let year_month: (i32, i32) = sqlx::query_as(
            "SELECT CAST(strftime('%Y', date_taken) AS INTEGER), CAST(strftime('%m', date_taken) AS INTEGER) FROM images WHERE id = ?"
        )
        .bind(img.id)
        .fetch_one(&pool)
        .await
        .unwrap_or((0, 0));

        groups.entry(year_month).or_insert_with(Vec::new).push(img);
    }

    let duration = start.elapsed();
    println!(
        "Timeline grouping (with N+1 query pattern) took {:?}",
        duration
    );

    // 4. Benchmark Optimized Timeline Grouping
    println!("\n--- Benchmarking Optimized Timeline Grouping (Single Query) ---");
    let start = Instant::now();

    // Fetch everything in one go
    let _rows = sqlx::query(
        "SELECT id, path, filename, CAST(strftime('%Y', date_taken) AS INTEGER) as year, CAST(strftime('%m', date_taken) AS INTEGER) as month FROM images WHERE date_taken IS NOT NULL ORDER BY date_taken DESC"
    )
    .fetch_all(&pool)
    .await?;

    let duration = start.elapsed();
    println!("Optimized timeline query took {:?}", duration);

    // Cleanup
    fs::remove_file(db_path)?;
    println!("\nBenchmark complete.");

    Ok(())
}
