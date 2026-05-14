-- Optimized schema
CREATE TABLE IF NOT EXISTS images (
    id          INTEGER PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,
    path_hash   INTEGER NOT NULL,          -- xxHash64 of path for fast lookup
    filename    TEXT NOT NULL,
    ext         TEXT NOT NULL,
    size_bytes  INTEGER,
    date_taken  INTEGER,                   -- Unix timestamp (faster sorts)
    year        INTEGER GENERATED ALWAYS AS (strftime('%Y', date_taken, 'unixepoch')) STORED,
    month       INTEGER GENERATED ALWAYS AS (strftime('%m', date_taken, 'unixepoch')) STORED,
    width       INTEGER,
    height      INTEGER,
    thumb_256   TEXT,                      -- path to 256px thumbnail
    thumb_480   TEXT,                      -- path to 480px thumbnail
    created_at  INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_date_taken ON images(date_taken DESC);
CREATE INDEX IF NOT EXISTS idx_year_month ON images(year, month);
CREATE INDEX IF NOT EXISTS idx_path_hash  ON images(path_hash);

-- FTS5 table for fast search
CREATE VIRTUAL TABLE IF NOT EXISTS images_fts USING fts5(
    filename,
    path,
    content='images',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS images_ai AFTER INSERT ON images BEGIN
  INSERT INTO images_fts(rowid, filename, path) VALUES (new.id, new.filename, new.path);
END;
CREATE TRIGGER IF NOT EXISTS images_ad AFTER DELETE ON images BEGIN
  INSERT INTO images_fts(images_fts, rowid, filename, path) VALUES('delete', old.id, old.filename, old.path);
END;
CREATE TRIGGER IF NOT EXISTS images_au AFTER UPDATE ON images BEGIN
  INSERT INTO images_fts(images_fts, rowid, filename, path) VALUES('delete', old.id, old.filename, old.path);
  INSERT INTO images_fts(rowid, filename, path) VALUES (new.id, new.filename, new.path);
END;
