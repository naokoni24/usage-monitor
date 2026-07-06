export function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = clamped >= 100 ? 'bg-red-500' : clamped >= 80 ? 'bg-yellow-500' : 'bg-blue-500';

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
