import { Search, Sun, Moon, Menu } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";

interface HeaderProps {
    onToggleSidebar?: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="sticky top-0 z-50 flex items-center gap-4 px-4 h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm transition-colors">
            <button
                onClick={onToggleSidebar}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors lg:hidden"
                aria-label="Toggle sidebar"
            >
                <Menu size={24} className="text-gray-700 dark:text-gray-300" />
            </button>

            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Photos</h1>

            <div className="flex-1 max-w-2xl mx-auto">
                <div className="relative">
                    <Search
                        size={20}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                    <input
                        type="text"
                        placeholder="Search your photos"
                        className="w-full pl-10 pr-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-blue-500 dark:focus:border-blue-400 focus:bg-white dark:focus:bg-gray-900 transition-all outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    />
                </div>
            </div>

            <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Toggle theme"
            >
                {theme === "dark" ? (
                    <Sun size={20} className="text-gray-300" />
                ) : (
                    <Moon size={20} className="text-gray-700" />
                )}
            </button>

            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold cursor-pointer hover:opacity-90 transition-opacity">
                U
            </div>
        </header>
    );
}
