export type DrawingNode = { tag: string; attrs: Record<string, string>; children: DrawingNode[] };
export type DrawingReference = {
  key: string; source: "library" | "generated" | "fallback"; state: string;
  needs_drawing?: boolean; tree: DrawingNode;
};
export type LibraryDrawing = DrawingReference & {
  name: string; ingredient: string; form: string; aliases: string[]; group: string;
  reference: boolean; revised?: boolean; status?: "library" | "auto";
  generation_status?: string; model?: string | null; created_at?: string | null;
};
export type DrawingLibrary = { version: number; drawings: LibraryDrawing[]; admin_enabled?: boolean };
