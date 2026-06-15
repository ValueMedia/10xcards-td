import { cn } from "@/lib/utils";

interface Props {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
}

export function FlashcardBrowseCard({ front, back, flipped, onFlip }: Props) {
  return (
    <div
      className="card-flip-container w-full"
      style={{ height: "320px" }}
      role="button"
      tabIndex={0}
      aria-label={flipped ? "Answer — click to flip back" : "Question — click to reveal answer"}
      onClick={onFlip}
      onKeyDown={(e) => {
        if (e.key === "Enter") onFlip();
      }}
    >
      <div className={cn("card-flip-inner cursor-pointer", flipped && "card-flip-inner-flipped")}>
        <div
          className="card-flip-face flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl"
          aria-hidden={flipped}
        >
          <span className="absolute top-4 left-4 text-xs font-medium text-blue-100/40">Question</span>
          <p className="text-center text-2xl font-medium text-white">{front}</p>
          <span className="absolute bottom-4 text-xs text-blue-100/30">Click to flip</span>
        </div>
        <div
          className="card-flip-face card-flip-back flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl"
          aria-hidden={!flipped}
        >
          <span className="absolute top-4 left-4 text-xs font-medium text-blue-100/40">Answer</span>
          <p className="text-center text-2xl font-medium text-white">{back}</p>
        </div>
      </div>
    </div>
  );
}
