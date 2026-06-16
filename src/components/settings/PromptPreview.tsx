import { renderFlashcardPrompt } from "@/lib/services/ai-prompt";

interface Props {
  prompt: string;
  count?: number;
}

export function PromptPreview({ prompt, count = 5 }: Props) {
  const rendered = renderFlashcardPrompt({
    text: "Sample source text for preview purposes. This demonstrates how your custom prompt will process flashcard generation input.",
    count,
    systemPromptOverride: prompt,
  });

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-blue-100/70">Preview</h4>
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs text-blue-100/40">System prompt:</p>
          <pre className="max-h-60 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-blue-100/70 whitespace-pre-wrap">
            {rendered.system}
          </pre>
        </div>
        <div>
          <p className="mb-1 text-xs text-blue-100/40">User message:</p>
          <pre className="max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-blue-100/70 whitespace-pre-wrap">
            {rendered.user}
          </pre>
        </div>
      </div>
    </div>
  );
}