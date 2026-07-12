export function SkeletonTile({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="shrink-0 rounded-sm bg-white/5 animate-pulse"
      style={{ width, height }}
    />
  );
}
