# Local Google Photos

<div align="center">

**A privacy-focused, self-hosted photo management application**

[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri-FFC131?logo=tauri)](https://tauri.app)
[![Built with React](https://img.shields.io/badge/Built%20with-React-61DAFB?logo=react)](https://reactjs.org)
[![Built with Rust](https://img.shields.io/badge/Built%20with-Rust-orange?logo=rust)](https://www.rust-lang.org)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

*Take back control of your photos with a local-first alternative to Google Photos*

</div>

---

## Overview

**Local Google Photos** is a modern, desktop-native photo management application that brings the convenience of cloud photo services to your local machine — without compromising your privacy. Built with Tauri (Rust backend + React frontend), it offers photo scanning, duplicate detection, face recognition, albums, favorites, trash management, and a map view — all running locally with no external servers.

### Why Local Google Photos?

- **Privacy First**: Your photos never leave your device
- **Fast**: Powered by Rust for efficient file I/O and image processing
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Smart Organization**: Auto-detected faces, EXIF metadata, timeline grouping
- **Beautiful UI**: Modern, responsive interface built with React 19 + Tailwind CSS

---

## Features

### Current Features

#### Photo Scanning & Organization
- Recursive directory scanning with automatic photo/video detection
- Supports JPG, JPEG, PNG, WebP, HEIC, GIF, TIFF, BMP, AVIF (images) and MP4, MOV, MKV, AVI, WMV, FLV, M4V, WEBM (videos)
- Media organizer tool: copies/moves files into `YYYY/MM-Month/DD` folder structure based on EXIF or file dates
- Dedicated trash system with manifest tracking and automatic cleanup

#### Duplicate Detection
- SHA-256 hash-based exact duplicate scanning
- Two-phase process: size grouping first, then hashing
- Batch resolution: delete or move duplicates to a folder

#### Face Recognition (Local AI)
- ONNX-based face detection using InsightFace models (buffalo_s or buffalo_l)
- Face embedding extraction and clustering via cosine similarity
- Automatic person grouping with merge/rename/reject workflows
- Face thumbnails cropped from source photos

#### Albums & Favorites
- Create, rename, delete albums; add/remove photos
- Favorites toggle on any photo, persisted across sessions

#### Timeline & Grid Views
- Google Photos-style justified layout with date-grouped rows
- Sort by newest, oldest, name (A-Z/Z-A), or largest
- Lightbox with zoom/pan, slideshow, EXIF info panel, face overlays

#### Map View
- Leaflet map with marker clustering
- EXIF GPS extraction for geotagged photos
- Thumbnail popups on markers

#### Metadata Extraction
- EXIF parsing: date taken, camera make/model, aperture, shutter speed, ISO, focal length, GPS coordinates, orientation

#### Dark Mode & Theming
- 7 accent colors, dark/light theme
- Glassmorphism design with Tailwind CSS

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React 19)                    │
│  ┌──────────┐  ┌───────────┐  ┌─────────┐  ┌────────┐ │
│  │ Photos   │  │ People    │  │ Albums  │  │ Map    │ │
│  │ Timeline │  │ (Face AI) │  │ Manager │  │ View   │ │
│  └──────────┘  └───────────┘  └─────────┘  └────────┘ │
│        │              │              │             │      │
│        └──────────────┴──────────────┴─────────────┘      │
│                      Tauri IPC (invoke)                    │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────┴────────────────────────────────┐
│                   Backend (Rust)                           │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Commands │  │ Scanner   │  │ AI/Face  │  │Metadata │ │
│  │ (49 IPC) │  │ Organizer │  │ Detection│  │ EXIF    │ │
│  └──────────┘  └───────────┘  └──────────┘  └─────────┘ │
│                      │                                     │
│         ┌────────────┼────────────┐                        │
│         ▼            ▼            ▼                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                   │
│  │ albums   │ │favorites │ │face_index│                   │
│  │ .json    │ │ .json    │ │ .json    │                   │
│  └──────────┘ └──────────┘ └──────────┘                   │
│         (JSON-file persistence per domain)                 │
└───────────────────────────────────────────────────────────┘
```

### Persistence Model

Currently uses JSON-file-per-domain persistence under `{app_data}/com.localphotos.app/`:

| File | Purpose |
|------|---------|
| `albums.json` | Album definitions (name, description, photos) |
| `favorites.json` | Set of favorited photo paths |
| `face_index.json` | Face records, embeddings, people |

Settings and saved paths are stored in `localStorage` on the frontend.

---

## Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Rust** (latest stable)
- **npm**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/local-google-photos.git
   cd local-google-photos
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run tauri dev
   ```

4. **Build for production**
   ```bash
   npm run tauri build
   ```

---

## Usage

### Scanning Photos

1. **Launch the application**
2. **Enter a folder path** or use the folder picker
3. **Click "Choose Folder"** to browse photos
4. **View your photos** in Timeline or Grid view

### Organizing Media

Go to **Scan** view → choose source/destination → configure options → run the media organizer to sort photos into `YYYY/MM-Month/DD` folders.

### Finding Duplicates

Go to **Delete Duplicates** → choose folder → scan → review results → resolve (delete or move).

### Face Detection

Go to **People** → initialize AI models (auto-downloaded) → scan a folder → name detected people.

### Map View

Open a folder with geotagged photos → markers appear on the map with thumbnail popups.

---

## Project Structure

```
local-google-photos/
├── src/                    # React frontend
│   ├── components/         # UI components (27 files)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Tauri IPC bridge + TypeScript types
│   ├── store/              # Zustand stores (settings, albums, favorites, etc.)
│   ├── App.tsx             # Root component with view routing
│   ├── index.css           # Global styles
│   └── main.tsx            # Entry point
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── ai/             # Face analyzer, clustering, index
│   │   ├── commands/       # 10 module files, 49 Tauri commands
│   │   ├── metadata/       # EXIF extraction
│   │   ├── scanner/        # Albums, duplicates, favorites, organizer, trash
│   │   └── lib.rs          # Tauri app setup
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── package.json            # Node.js dependencies (React 19, Zustand, Framer Motion, Leaflet)
└── README.md               # This file
```

### Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 | UI framework |
| | TypeScript | Type safety |
| | Tailwind CSS 4 | Styling |
| | Zustand | State management |
| | Framer Motion | Animations |
| | Leaflet + MarkerCluster | Map view |
| | Lucide React | Icons |
| **Backend** | Rust | High-performance core |
| | Tauri 2 | Desktop framework |
| | face_id (ONNX) | Face detection & recognition |
| | image | Image processing |
| | walkdir | Directory traversal |
| | kamadak-exif | EXIF parsing |
| **Storage** | JSON files (per-domain) | Albums, favorites, face index |
| | localStorage | Settings, saved paths |

---

## Development

### Commands

```bash
# Start development server
npm run dev

# Run Tauri in development mode
npm run tauri dev

# Build for production
npm run tauri build

# Type checking
npm run build
```

### Adding New Features

1. **Backend (Rust)**:
   - Create command functions in `src-tauri/src/commands/`
   - Register in `invoke_handler` in `lib.rs`
   - Add TypeScript interface + invoke wrapper in `src/lib/tauri.ts`

2. **Frontend (React)**:
   - Create components in `src/components/`
   - Use `invoke` from `@tauri-apps/api/core` to call Rust
   - Manage state with Zustand stores

---

## Roadmap

### Phase 1: Foundation ✅
- [x] Photo scanning and browsing
- [x] Timeline and grid views
- [x] EXIF metadata extraction
- [x] Media organizer (date-based folder sorting)
- [x] Face detection and clustering
- [x] Albums and favorites
- [x] Duplicate detection (SHA-256)
- [x] Trash system with manifest
- [x] Map view with GPS data
- [x] Dark mode and theming

### Phase 2: Performance & Infrastructure 🚧
- [ ] Thumbnail generation pipeline
- [ ] SQLite photo index (replace filesystem walk)
- [ ] File system watcher for live updates
- [ ] Parallel face detection with downscaling
- [ ] Incremental clustering (skip O(n²) on incremental scan)
- [ ] System tray + background indexing

### Phase 3: Discovery & AI 🔮
- [ ] Metadata search (camera, date range, location, faces)
- [ ] Perceptual hash near-duplicate detection
- [ ] Reverse geocoding on map
- [ ] "On This Day" memories
- [ ] Object/scene tagging
- [ ] OCR for screenshots/documents

### Phase 4: Media Management 🔮
- [ ] Video thumbnails and scrubbing
- [ ] Multiple watched root folders + unified library
- [ ] Non-destructive editing (rotate, crop)
- [ ] Export/share flows (zip, copy)
- [ ] Encrypted backup to NAS/external drive

---

## License

This project is licensed under the MIT License.
