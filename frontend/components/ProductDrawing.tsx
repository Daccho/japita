import { createElement, type CSSProperties, type ReactNode } from "react";

export type DrawingNode = { tag: string; attrs: Record<string, string>; children: DrawingNode[] };
export type LibraryDrawing = {
  key: string; name: string; ingredient: string; form: string; state: string;
  aliases: string[]; group: string; source: "library"; reference: boolean; revised?: boolean; tree: DrawingNode;
};
export type DrawingLibrary = { version: number; drawings: LibraryDrawing[] };

const COLORS: Record<string, string> = {
  "#F4BC2B": "var(--aj-yolk)", "#3A332B": "var(--aj-container)",
  "#E0482B": "var(--aj-chili)", "#1E1B18": "var(--aj-ink)", none: "none",
};
const TAGS = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const ATTRS = new Set(["stroke", "fill", "stroke-width", "stroke-linecap", "stroke-linejoin", "d", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "x2", "y1", "y2", "points"]);
const CAMEL: Record<string, string> = { "stroke-width": "strokeWidth", "stroke-linecap": "strokeLinecap", "stroke-linejoin": "strokeLinejoin" };

function node(el: DrawingNode, index: number): ReactNode {
  if (!TAGS.has(el.tag)) return null;
  const attrs: Record<string, string | number> = { key: index };
  for (const [name, value] of Object.entries(el.attrs)) {
    if (!ATTRS.has(name)) continue;
    if (name === "fill" || name === "stroke") {
      if (!(value in COLORS)) return null;
      attrs[name] = COLORS[value];
    } else attrs[CAMEL[name] ?? name] = value;
  }
  return createElement(el.tag, attrs, el.children.map(node));
}

export default function ProductDrawing({ drawing, size = 48, alt, style }: { drawing: LibraryDrawing; size?: number; alt?: string; style?: CSSProperties }) {
  return <svg className="jp-product-drawing" viewBox="0 0 64 64" width={size} height={size} style={style} role={alt ? "img" : undefined} aria-label={alt} aria-hidden={alt ? undefined : true}>
    {drawing.tree.children.map(node)}
  </svg>;
}
