# Reviewed Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed review bugs without reducing performance, and commit the work as a professional, reviewable series.

**Architecture:** Keep the current JSON-file persistence model, but make writes atomic and reduce repeated full-file work during face scans. Avoid broad migrations such as SQLite in this pass because they would be high-risk and not necessary to close the confirmed bugs. Add unit tests around pure file/path logic and use targeted build checks for Tauri command wiring.

**Tech Stack:** Rust 2021, Tauri 2, React/TypeScript, Zustand, Cargo unit tests, Vite/TypeScript build.

---

### Task 1: Baseline And Plan Commit

**Files:**
- Create: `docs/superpowers/plans/2026-07-01-reviewed-bug-fixes.md`

- [ ] **Step 1: Create the feature branch**

Run: `git switch -c codex-fix-reviewed-bugs`

- [ ] **Step 2: Save this plan**

Write this document with the exact task breakdown.

- [ ] **Step 3: Commit the current WIP baseline plus plan**

Run: `git status --short`

Run: `git add docs/superpowers/plans/2026-07-01-reviewed-bug-fixes.md src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/ai/analyzer.rs src-tauri/src/commands/faces.rs src/components/PeoplePage.tsx src/components/SettingsPage.tsx src/lib/tauri.ts`

Run: `git commit -m "chore: capture face scan baseline"`

Expected: one baseline commit preserving the existing face-model/download/UI WIP before new bug fixes.

### Task 2: Trash Timestamp Parsing And Atomic Manifest Writes

**Files:**
- Modify: `src-tauri/src/scanner/trash.rs`

- [ ] **Step 1: Write failing tests**

Add Rust unit tests in `trash.rs` for:
- `parse_timestamp_from_name("2026-07-01_153045_photo.jpg")` returns a timestamp.
- `strip_trash_prefix("2026-07-01_153045_photo.jpg")` returns `photo.jpg`.
- `strip_trash_prefix("2026-07-01_153045_1_photo.jpg")` returns `photo.jpg`.
- Manifest writes leave no temp file after success.

- [ ] **Step 2: Verify red**

Run: `cargo test scanner::trash::tests --lib`

Expected: timestamp/strip tests fail because the current parser strips only the date.

- [ ] **Step 3: Implement minimal fix**

Parse the first 17 characters matching `%Y-%m-%d_%H%M%S`. Add `strip_trash_prefix` that removes the timestamp plus optional collision counter. Replace fallback restore string splitting with that helper. Add an `atomic_write_string` helper and use it for manifest writes.

- [ ] **Step 4: Verify green**

Run: `cargo test scanner::trash::tests --lib`

- [ ] **Step 5: Commit**

Run: `git add src-tauri/src/scanner/trash.rs`

Run: `git commit -m "fix: repair trash retention metadata"`

### Task 3: Shared Atomic JSON Writes

**Files:**
- Modify: `src-tauri/src/ai/index.rs`
- Modify: `src-tauri/src/scanner/albums.rs`

- [ ] **Step 1: Write failing tests**

Add focused tests proving `write_index_to_path` and album writes complete by temp-file rename and leave parseable JSON.

- [ ] **Step 2: Verify red**

Run: `cargo test ai::index::tests scanner::albums::tests --lib`

- [ ] **Step 3: Implement minimal fix**

Use temp-file-then-rename writes for `face_index.json` and `albums.json`. Preserve the existing public read/write APIs.

- [ ] **Step 4: Verify green**

Run: `cargo test ai::index::tests scanner::albums::tests --lib`

- [ ] **Step 5: Commit**

Run: `git add src-tauri/src/ai/index.rs src-tauri/src/scanner/albums.rs`

Run: `git commit -m "fix: write app indexes atomically"`

### Task 4: Faster Duplicate Scans And Safe Duplicate Resolution

**Files:**
- Modify: `src-tauri/src/scanner/duplicates.rs`

- [ ] **Step 1: Write failing tests**

Add tests for:
- Default media extensions include `.gif`, `.avif`, and `.webm`.
- Duplicate scanning hashes only size groups with more than one candidate.
- Delete resolution moves files into a configured trash-like folder when supplied instead of permanently deleting.

- [ ] **Step 2: Verify red**

Run: `cargo test scanner::duplicates::tests --lib`

- [ ] **Step 3: Implement minimal fix**

Collect candidate files grouped by byte size first, then hash only groups with at least two files. Add the missing extensions. When `delete_duplicates` is true and `move_duplicates_to` is set, move files there using the existing collision-safe move path rather than hard deletion; keep hard delete as a fallback only when no destination is configured.

- [ ] **Step 4: Verify green**

Run: `cargo test scanner::duplicates::tests --lib`

- [ ] **Step 5: Commit**

Run: `git add src-tauri/src/scanner/duplicates.rs`

Run: `git commit -m "perf: prefilter duplicate hashing"`

### Task 5: Organizer Path Safety, Cross-Drive Move Fallback, And Extension Consistency

**Files:**
- Modify: `src-tauri/src/scanner/organizer.rs`
- Modify: `src/store/useSettingsStore.ts`

- [ ] **Step 1: Write failing tests**

Add Rust tests for:
- Default extensions include `.gif`, `.avif`, and `.webm`.
- Destination exclusion compares canonicalized entry paths.
- Move mode falls back to copy+delete when rename fails.

- [ ] **Step 2: Verify red**

Run: `cargo test scanner::organizer::tests --lib`

- [ ] **Step 3: Implement minimal fix**

Canonicalize each entry path before destination exclusion. Extract `move_or_copy_file` to use `rename`, then copy+delete fallback. Add missing default extensions to Rust and TypeScript settings.

- [ ] **Step 4: Verify green**

Run: `cargo test scanner::organizer::tests --lib`

- [ ] **Step 5: Commit**

Run: `git add src-tauri/src/scanner/organizer.rs src/store/useSettingsStore.ts`

Run: `git commit -m "fix: harden organizer file moves"`

### Task 6: Face Scan Progress And Batched Index Writes

**Files:**
- Modify: `src-tauri/src/ai/index.rs`
- Modify: `src-tauri/src/commands/faces.rs`

- [ ] **Step 1: Write failing tests**

Add tests for:
- Adding multiple photos through a batch API writes the index once at the end.
- `facesFound` can be computed from processed embeddings and is not hardcoded.

- [ ] **Step 2: Verify red**

Run: `cargo test ai::index::tests commands::faces::tests --lib`

- [ ] **Step 3: Implement minimal fix**

Add `add_faces_to_index` and `auto_cluster_index` helpers that mutate an in-memory `FaceIndex`. In `scan_faces`, read the index once, update it per photo, cluster periodically in memory, write once at the end, and emit the real cumulative `facesFound`.

- [ ] **Step 4: Verify green**

Run: `cargo test ai::index::tests commands::faces::tests --lib`

- [ ] **Step 5: Commit**

Run: `git add src-tauri/src/ai/index.rs src-tauri/src/commands/faces.rs`

Run: `git commit -m "perf: batch face index updates"`

### Task 7: Person Identity Assignment API

**Files:**
- Modify: `src-tauri/src/ai/index.rs`
- Modify: `src-tauri/src/commands/faces.rs`
- Modify: `src/lib/tauri.ts`
- Modify: `src/components/FaceTagDialog.tsx`

- [ ] **Step 1: Write failing tests**

Add Rust tests proving assignment can target an existing `person_id` even if another person has the same display name, and assigning by name creates a new person only when no ID is supplied.

- [ ] **Step 2: Verify red**

Run: `cargo test ai::index::tests --lib`

- [ ] **Step 3: Implement minimal fix**

Change the backend assignment helper to accept `Option<String>` person ID plus name. Keep the command backward-compatible by making `personId` optional from TypeScript. Update the dialog to pass selected person IDs when tagging an existing person.

- [ ] **Step 4: Verify green**

Run: `cargo test ai::index::tests --lib`

- [ ] **Step 5: Commit**

Run: `git add src-tauri/src/ai/index.rs src-tauri/src/commands/faces.rs src/lib/tauri.ts src/components/FaceTagDialog.tsx`

Run: `git commit -m "fix: assign faces by person identity"`

### Task 8: Final Verification

**Files:**
- No direct edits unless verification exposes a bug.

- [ ] **Step 1: Format Rust**

Run: `cargo fmt`

- [ ] **Step 2: Run backend tests**

Run: `cargo test --lib`

- [ ] **Step 3: Run frontend build**

Run: `npm run build`

- [ ] **Step 4: Inspect history and status**

Run: `git log --oneline --decorate -8`

Run: `git status --short`

- [ ] **Step 5: Commit any formatting-only changes**

Run only if needed: `git add <formatted files> && git commit -m "style: format bug fix series"`
