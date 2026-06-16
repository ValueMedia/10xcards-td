import type { LearningStats } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  stats: LearningStats;
}

function formatRelativeDate(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

export function StatsBlock({ stats }: Props) {
  const { dailyMinutes, recentSets } = stats;
  const maxMinutes = Math.max(...dailyMinutes.map((d) => d.minutes), 1);
  const allZero = dailyMinutes.every((d) => d.minutes === 0);

  return (
    <div className="mb-8 space-y-6">
      {/* Bar chart */}
      <div>
        <h2 className="mb-3 text-sm font-medium tracking-wide text-blue-100/60 uppercase">Activity in last 14 days</h2>
        {dailyMinutes.length === 0 || allZero ? (
          <p className="text-sm text-blue-100/40">No review sessions in the last 14 days.</p>
        ) : (
          <div className="flex h-24 gap-1">
            {dailyMinutes.map((d) => {
              const heightPct = (d.minutes / maxMinutes) * 100;
              const label = new Date(d.day + "T12:00:00Z").toLocaleDateString("en", { weekday: "short" });
              return (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.minutes} min`}>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={cn(
                        "w-full rounded-t-sm transition-all",
                        d.minutes > 0 ? "bg-purple-500" : "bg-white/10",
                      )}
                      style={{ height: `${heightPct}%`, minHeight: "2px" }}
                    />
                  </div>
                  <span className="text-[9px] text-blue-100/40">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent sets */}
      {recentSets.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-blue-100/60 uppercase">Recently opened</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {recentSets.map((s) => (
              <a
                key={s.id}
                href={`/sets/${s.id}`}
                className="rounded-lg border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
              >
                <p className="mb-2 truncate font-medium">{s.name}</p>
                <p className="text-sm text-blue-100/60">
                  {s.learned_count} / {s.total_flashcards} cards learned
                </p>
                <p className="mt-1 text-xs text-blue-100/40">{formatRelativeDate(s.last_opened_at)}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {recentSets.length === 0 && dailyMinutes.length > 0 && (
        <p className="text-sm text-blue-100/40">Start a review session to see your recent activity.</p>
      )}
    </div>
  );
}
