import type { DonatedSetTile } from "@/types";

interface Props {
  tiles: DonatedSetTile[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return `${diffDays} days ago`;
}

export function DonatedSetsSection({ tiles }: Props) {
  return (
    <div className="mt-8 mb-8">
      <div className="mb-8 flex items-center border-b border-white/10 pb-4">
        <h2 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold text-transparent">
          Donated Sets
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.share_id} className="rounded-lg border border-white/10 bg-white/5 p-4">
            <p className="truncate font-medium text-white">{tile.original_set_name}</p>
            <p className="mt-1 truncate text-sm text-blue-100/60">{tile.recipient_email}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-blue-100/50">
              <span>Claimed</span>
              <span className="text-right">{formatDate(tile.claimed_at)}</span>
              <span>Cards</span>
              <span className="text-right">
                {tile.learned_count}/{tile.total_flashcards} learned
              </span>
              <span>Last activity</span>
              <span className="text-right">{formatDate(tile.last_activity)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
