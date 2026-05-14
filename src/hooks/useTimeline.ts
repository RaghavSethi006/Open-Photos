import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Image } from "./usePhotos";

export interface TimelineGroup {
    year: number;
    month: number;
    count: number;
    photos: Image[];
}

export const useTimeline = () => {
    return useQuery({
        queryKey: ["timeline"],
        queryFn: async () => {
            return await invoke<TimelineGroup[]>("get_timeline");
        },
    });
};
