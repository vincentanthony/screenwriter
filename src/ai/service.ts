export interface AISuggestionContext {
  fountain: string;
  cursorOffset: number;
  selection?: { from: number; to: number };
}

export interface AISuggestion {
  text: string;
  confidence?: number;
}

export interface SceneAnalysis {
  summary: string;
  beats: string[];
  characters: string[];
}

export interface AIService {
  suggestNextLine(ctx: AISuggestionContext): Promise<AISuggestion>;
  analyzeScene(fountain: string): Promise<SceneAnalysis>;
  rewrite(selection: string, instruction: string): Promise<string>;
}

const disabled = () => Promise.reject(new Error('AI disabled in v1'));

export const aiService: AIService = {
  suggestNextLine: disabled,
  analyzeScene: disabled,
  rewrite: disabled,
};
