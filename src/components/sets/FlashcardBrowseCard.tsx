import { cn } from "@/lib/utils";

interface Props {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
}

export function FlashcardBrowseCard({ front, back, flipped, onFlip }: Props) {
  return (
    <div className="card-flip-container w-full" style={{ height: "320px" }} onClick={onFlip}>
      <div className={cn("card-flip-inner cursor-pointer", flipped && "card-flip-inner-flipped")}>
        <div className="card-flip-face flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <p className="text-center text-2xl font-medium text-white">{front}</p>
          <span className="absolute bottom-4 text-xs text-blue-100/30">Click to flip</span>
        </div>
        <div className="card-flip-face card-flip-back flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          <p className="text-center text-2xl font-medium text-white">{back}</p>
        </div>
      </div>
    </div>
  );
}
