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

## 📖 Overview

**Local Google Photos** is a modern, desktop-native photo management application that brings the convenience of cloud photo services to your local machine—without compromising your privacy. Built with cutting-edge technologies, it offers lightning-fast photo scanning, intelligent organization, and a beautiful interface for browsing your memories.

### Why Local Google Photos?

- 🔒 **Privacy First**: Your photos never leave your device
- ⚡ **Lightning Fast**: Powered by Rust for maximum performance
- 🖥️ **Cross-Platform**: Works on Windows, macOS, and Linux
- 🎯 **Smart Organization**: Automatic timeline grouping by date
- 🖼️ **Beautiful UI**: Modern, responsive interface built with React
- 💾 **Local Database**: Efficient SQLite-based indexing
- 🔍 **Recursive Scanning**: Automatically finds photos in nested folders
- 📸 **Format Support**: JPG, JPEG, PNG, WebP, HEIC, GIF

---

## ✨ Features

### Current Features

#### 📂 **Intelligent Photo Scanning**
- Recursive directory scanning with automatic photo detection
- Supports multiple image formats (JPG, JPEG, PNG, WebP, HEIC, GIF)
- Database-backed indexing with SQLite for instant access
- Duplicate detection via path-based deduplication

#### 🖼️ **High-Performance Thumbnails**
- Automatic thumbnail generation for fast loading
- Custom URI scheme (`thumb://`) for efficient thumbnail serving
- Optimized JPEG compression for storage efficiency
- On-demand thumbnail creation during scanning

#### 📅 **Timeline View**
- Chronological organization by year and month
- Automatic grouping based on EXIF metadata
- Smart date extraction from photo metadata
- Beautiful month-based grid layout

#### 🎨 **Modern UI**
- Dual view modes: Timeline and Grid
- Responsive design with Tailwind CSS
- Virtualized scrolling for thousands of photos
- Dark mode interface
- Real-time scan progress feedback

#### 🔧 **Metadata Extraction**
- EXIF data parsing for date/time information
- Automatic timezone handling
- Preserves original capture dates

---

## 🏗️ Architecture

Local Google Photos uses a modern hybrid architecture combining the performance of native code with the flexibility of web technologies:

```
┌─────────────────────────────────────────────────────┐
│                  Frontend (React)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   Timeline   │  │  Photo Grid  │  │  Scanner  │ │
│  │     View     │  │     View     │  │  Control  │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│           │                │                │        │
│           └────────────────┴────────────────┘        │
│                      Tauri IPC                       │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────┐
│                  Backend (Rust)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   Scanner    │  │  Thumbnail   │  │  Metadata │ │
│  │    Engine    │  │  Generator   │  │ Extractor │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│           │                │                │        │
│           └────────────────┴────────────────┘        │
│                      SQLite DB                       │
│              (photos.db - App Data Dir)              │
└─────────────────────────────────────────────────────┘
```

### Core Components

#### **Frontend Layer**
- **React 19**: Modern UI with hooks and concurrent features
- **TanStack Query**: Efficient data fetching and caching
- **React Virtuoso**: Performant virtual scrolling for large photo collections
- **Tailwind CSS**: Utility-first styling for rapid development

#### **Backend Layer**
- **Scanner Module**: Recursive directory traversal with `walkdir`
- **Database Module**: SQLx-based async SQLite operations
- **Thumbnail Module**: Image processing with the `image` crate
- **Metadata Module**: EXIF parsing with `kamadak-exif`

#### **Data Storage**
- **SQLite Database**: Schema-based photo indexing
- **Thumbnail Cache**: Separate directory for generated thumbnails
- **App Data Directory**: Platform-specific storage locations

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Rust** (latest stable version)
- **npm** or **pnpm**

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

## 💻 Usage

### Scanning Photos

1. **Launch the application**
2. **Enter a folder path** in the input field at the top
3. **Click "Scan"** to recursively scan for photos
4. **Wait for completion** - the app will show how many images were found
5. **View your photos** in Timeline or Grid view

### Viewing Photos

- **Timeline View**: Browse photos organized by month and year
- **Grid View**: See all photos in a continuous grid
- **Switch views**: Use the toggle buttons in the top toolbar

### Supported Paths

Enter any valid directory path on your system:
- Windows: `C:\Users\YourName\Pictures`
- macOS: `/Users/YourName/Pictures`
- Linux: `/home/yourname/Pictures`

---

## 🛠️ Development

### Project Structure

```
local-google-photos/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── PhotoGrid.tsx   # Grid view component
│   │   └── Timeline.tsx    # Timeline view component
│   ├── hooks/              # Custom React hooks
│   ├── App.tsx             # Main app component
│   └── main.tsx            # Entry point
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── db/             # Database operations
│   │   │   ├── mod.rs      # DB commands
│   │   │   └── schema.sql  # Database schema
│   │   ├── scanner/        # Photo scanning logic
│   │   ├── thumbs/         # Thumbnail generation
│   │   ├── metadata/       # EXIF extraction
│   │   └── lib.rs          # Main Tauri setup
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── package.json            # Node dependencies
└── README.md               # This file
```

### Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------
| **Frontend** | React 19 | UI framework |
| | TypeScript | Type safety |
| | Tailwind CSS | Styling |
| | TanStack Query | Data fetching |
| | React Virtuoso | Virtual scrolling |
| **Backend** | Rust | High-performance core |
| | Tauri 2 | Desktop framework |
| | SQLx | Database access |
| | walkdir | Directory traversal |
| | image | Image processing |
| | kamadak-exif | EXIF parsing |
| **Database** | SQLite | Local storage |

### Development Commands

```bash
# Start development server
npm run dev

# Run Tauri in development mode
npm run tauri dev

# Build for production
npm run tauri build

# Type checking
npm run build

# Preview production build
npm run preview
```

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    date_taken TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### Adding New Features

1. **Backend (Rust)**:
   - Add Tauri commands in `src-tauri/src/lib.rs`
   - Create new modules in `src-tauri/src/`
   - Export commands in `invoke_handler`

2. **Frontend (React)**:
   - Create components in `src/components/`
   - Use `invoke` from `@tauri-apps/api/core` to call Rust
   - Integrate with TanStack Query for data management

---

## 🗺️ Roadmap

### Phase 1: Foundation ✅
- [x] Basic photo scanning
- [x] SQLite database setup
- [x] Thumbnail generation
- [x] Timeline view
- [x] Metadata extraction

### Phase 2: Enhancement 🚧
- [ ] Face detection with local AI models
- [ ] Advanced search and filtering
- [ ] Photo editing capabilities
- [ ] Albums and collections
- [ ] Tags and labels

### Phase 3: Advanced Features 🔮
- [ ] Duplicate photo detection
- [ ] Import from external devices
- [ ] Export and sharing options
- [ ] Backup and sync to local NAS
- [ ] Map view with geolocation
- [ ] Video support

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines

1. Follow Rust best practices and clippy suggestions
2. Use TypeScript strict mode
3. Write meaningful commit messages
4. Test your changes thoroughly
5. Update documentation as needed

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Tauri](https://tauri.app) - For the amazing framework
- [React](https://reactjs.org) - For the UI library
- [SQLx](https://github.com/launchbadge/sqlx) - For async SQLite support
- The open-source community for inspiration and tools

---

<div align="center">

**Built with ❤️ and a commitment to privacy**

[Report Bug](https://github.com/yourusername/local-google-photos/issues) · [Request Feature](https://github.com/yourusername/local-google-photos/issues)

</div>
