import { usePeople } from "../hooks/usePeople";
import { Users } from "lucide-react";

export const People = () => {
    const { data: people, isLoading, error } = usePeople();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-gray-500 dark:text-gray-400">Loading people...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-red-500">Error: {error.message}</div>
            </div>
        );
    }

    if (!people || people.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 p-8 text-center">
                <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
                    <Users size={40} className="text-gray-400 dark:text-gray-500" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">No people found</h2>
                <p className="max-w-md">
                    Photos with faces will appear here. Make sure you've downloaded the AI model and scanned a folder with people.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6">
            <h2 className="text-2xl font-medium mb-6 text-gray-900 dark:text-white">People & Pets</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {people.map((person) => (
                    <div
                        key={person.id}
                        className="group flex flex-col items-center cursor-pointer"
                    >
                        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden mb-3 photo-hover border-2 border-transparent hover:border-blue-500 transition-all">
                            {/* Placeholder for person thumbnail - ideally we'd crop a face here */}
                            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                                <Users size={48} className="text-gray-300 dark:text-gray-600" />
                            </div>
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                            {person.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {person.faceCount} photos
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};
