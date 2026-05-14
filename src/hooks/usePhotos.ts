import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface Image {
    id: number;
    path: string;
    filename: string;
}

export const usePhotos = (limit: number = 10000, offset: number = 0) => {
    return useQuery({
        queryKey: ["photos", limit, offset],
        queryFn: async () => {
            return await invoke<Image[]>("get_photos", { limit, offset });
        },
    });
};
