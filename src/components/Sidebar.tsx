import { Images, Clock, Users, FolderPlus } from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SidebarProps {
    view: "grid" | "timeline" | "people";
    onViewChange: (view: "grid" | "timeline" | "people") => void;
    onScanComplete?: () => void;
}

export function Sidebar({ view, onViewChange, onScanComplete }: SidebarProps) {
    const [path, setPath] = useState("");
    const [scanning, setScanning] = useState(false);
    const [showScanDialog, setShowScanDialog] = useState(false);

    const handleScan = async () => {
        if (!path) return;
        setScanning(true);
        try {
            const count = await invoke("scan_directory", { path });
            alert(`Scanned ${count} new images!`);
            onScanComplete?.();
            setShowScanDialog(false);
            setPath("");
        } catch (e) {
            alert(`Error: ${e}`);
        } finally {
            setScanning(false);
        }
    };

    return (
        <>
            <aside className="w-64 h-full border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col transition-colors">
                <div className="p-4">
                    <button
                        onClick={() => setShowScanDialog(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors shadow-sm"
                    >
                        <FolderPlus size={20} />
                        <span>Scan Folder</span>
                    </button>
                </div>

                <nav className="flex-1 px-2">
                    <button
                        onClick={() => onViewChange("timeline")}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-all ${view === "timeline"
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                    >
                        <Clock size={20} />
                        <span className="font-medium">Timeline</span>
                    </button>

                    <button
                        onClick={() => onViewChange("grid")}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-all ${view === "grid"
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                    >
                        <Images size={20} />
                        <span className="font-medium">All Photos</span>
                    </button>

                    <button
                        onClick={() => onViewChange("people")}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${view === "people"
                                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                    >
                        <Users size={20} />
                        <span className="font-medium">People</span>
                    </button>
                </nav>
            </aside>

            {showScanDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowScanDialog(false)}>
                    <div
                        className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl border border-gray-200 dark:border-gray-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Scan Folder</h2>
                        <input
                            type="text"
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                            placeholder="Enter folder path (e.g., C:\Pictures)"
                            className="w-full p-3 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 mb-4 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowScanDialog(false)}
                                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleScan}
                                disabled={scanning || !path}
                                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {scanning ? "Scanning..." : "Scan"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
