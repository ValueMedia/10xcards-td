import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSpeech } from "@/components/hooks/useSpeech";
import type { VoiceId } from "@/lib/tts/voices";

interface Props {
  front: string;
  back: string;
  flipped: boolean;
  onFlip: () => void;
  voiceFront?: VoiceId;
  voiceBack?: VoiceId;
}

export function FlashcardBrowseCard({ front, back, flipped, onFlip, voiceFront, voiceBack }: Props) {
  const { t } = useTranslation("common");
  const { speak, status } = useSpeech();

  // Voice and text both resolve off the same `flipped` flag — one source of
  // truth, so the spoken voice never diverges from the spoken text.
  const currentVoice = flipped ? voiceBack : voiceFront;
  const currentText = flipped ? back : front;

  useEffect(() => {
    if (status === "error") {
      toast.error(t("speech.playbackFailed"));
    }
  }, [status, t]);

  return (
    <div
      className="card-flip-container relative w-full outline-none focus:outline-none focus-visible:outline-none"
      style={{ height: "320px" }}
      role="button"
      tabIndex={0}
      aria-label={flipped ? "Back side — click to flip" : "Front side — click to flip"}
      onClick={onFlip}
      onKeyDown={(e) => {
        if (e.key === "Enter") onFlip();
      }}
    >
      {currentVoice && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("speech.play")}
          disabled={status === "loading"}
          className="absolute top-3 right-3 z-10 h-8 w-8 text-blue-100/50 hover:bg-white/10 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            void speak(currentText, currentVoice);
          }}
        >
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      )}
      <div className={cn("card-flip-inner cursor-pointer", flipped && "card-flip-inner-flipped")}>
        <div
          className="card-flip-face flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl"
          aria-hidden={flipped}
        >
          <span className="absolute top-4 left-4 text-xs font-medium text-blue-100/40">Front</span>
          <p className="text-center text-2xl font-medium text-white">{front}</p>
          <span className="absolute bottom-4 text-xs text-blue-100/30">Click to flip</span>
        </div>
        <div
          className="card-flip-face card-flip-back flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl"
          aria-hidden={!flipped}
        >
          <span className="absolute top-4 left-4 text-xs font-medium text-blue-100/40">Back</span>
          <p className="text-center text-2xl font-medium text-white">{back}</p>
        </div>
      </div>
    </div>
  );
}
