import { useEffect, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import type {
  SingleDiagram,
  GuideLine,
  ShapePaletteEntry,
  SizePaletteEntry,
} from "@objectify/schema";
import { layoutDiagram } from "../lib/elk-layout.js";
import { guideLayoutDiagram } from "../lib/guide-layout.js";

export function useLayoutedElements(
  diagram: SingleDiagram,
  shapePalette?: ShapePaletteEntry[],
  sizePalette?: SizePaletteEntry[]
) {
  const [initialNodes, setInitialNodes] = useState<Node[]>([]);
  const [initialEdges, setInitialEdges] = useState<Edge[]>([]);
  const [resolvedGuides, setResolvedGuides] = useState<GuideLine[] | null>(null);
  const [isLayouting, setIsLayouting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLayouting(true);

    const hasGuideData =
      (diagram.guides?.length ?? 0) > 0 &&
      diagram.nodes.some((n) => n.guideRow || n.guideColumn);

    if (hasGuideData) {
      const result = guideLayoutDiagram(diagram, shapePalette, sizePalette);
      if (!cancelled) {
        setInitialNodes(result.nodes);
        setInitialEdges(result.edges);
        setResolvedGuides(result.resolvedGuides);
        setIsLayouting(false);
      }
    } else {
      layoutDiagram(diagram, shapePalette, sizePalette).then((result) => {
        if (!cancelled) {
          setInitialNodes(result.nodes);
          setInitialEdges(result.edges);
          setResolvedGuides(null);
          setIsLayouting(false);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [diagram, shapePalette, sizePalette]);

  return { initialNodes, initialEdges, resolvedGuides, isLayouting };
}
