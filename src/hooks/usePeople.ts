import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

export interface Person {
    id: number;
    name: string;
    faceCount: number;
}

export const usePeople = () => {
    return useQuery({
        queryKey: ["people"],
        queryFn: async () => {
            const data = await invoke<[number, string, number][]>("get_people");
            return data.map(([id, name, faceCount]) => ({ id, name, faceCount }));
        },
    });
};
