import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getPhotosPage, getTimelineGroups, PhotoFilters } from '../lib/tauri';

export function usePhotos(filters?: PhotoFilters) {
  return useInfiniteQuery({
    queryKey: ['photos', filters],
    queryFn: ({ pageParam }) => getPhotosPage(pageParam, 100, filters),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  });
}

export function useTimelineGroups() {
  return useQuery({
    queryKey: ['timeline-groups'],
    queryFn: getTimelineGroups,
    staleTime: 60_000,
  });
}
