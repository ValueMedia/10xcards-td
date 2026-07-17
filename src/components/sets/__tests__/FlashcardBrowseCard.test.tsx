// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/lib/i18n";
import { FlashcardBrowseCard } from "../FlashcardBrowseCard";
import type { VoiceId } from "@/lib/tts/voices";

// jsdom implements neither HTMLMediaElement playback nor object URLs — stub them.
class MockAudio {
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  addEventListener = vi.fn();
  src = "";
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  void i18n.changeLanguage("en");
  fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(["mp3"])) });
  vi.stubGlobal("Audio", MockAudio);
  vi.stubGlobal("fetch", fetchMock);
  // jsdom's URL implements neither of these; assign directly (not via
  // stubGlobal) so they survive React's unmount cleanup during teardown.
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderCard(props: Parameters<typeof FlashcardBrowseCard>[0]) {
  return render(
    <I18nextProvider i18n={i18n}>
      <FlashcardBrowseCard {...props} />
    </I18nextProvider>,
  );
}

const voices = { voiceFront: "de-DE-female" as VoiceId, voiceBack: "en-US-female" as VoiceId };

describe("FlashcardBrowseCard speaker button", () => {
  it("plays the front side's text with the front voice and does not flip", async () => {
    const onFlip = vi.fn();
    renderCard({ front: "Hund", back: "dog", flipped: false, onFlip, ...voices });

    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/tts", expect.objectContaining({ method: "POST" }));
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as unknown;
    expect(body).toEqual({ text: "Hund", voice: "de-DE-female" });
    expect(onFlip).not.toHaveBeenCalled();
  });

  it("plays the back side's text with the back voice when flipped", async () => {
    const onFlip = vi.fn();
    renderCard({ front: "Hund", back: "dog", flipped: true, onFlip, ...voices });

    fireEvent.click(screen.getByRole("button", { name: "Play audio" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as unknown;
    expect(body).toEqual({ text: "dog", voice: "en-US-female" });
    expect(onFlip).not.toHaveBeenCalled();
  });

  it("renders no speaker button when voices are not provided", () => {
    renderCard({ front: "Hund", back: "dog", flipped: false, onFlip: vi.fn() });
    expect(screen.queryByRole("button", { name: "Play audio" })).toBeNull();
  });
});
