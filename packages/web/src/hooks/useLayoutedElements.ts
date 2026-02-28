import { useEffect, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import type {
  SingleDiagram,
  ShapePaletteEntry,
  SizePaletteEntry,
} from "@objectify/schema";
import { layoutDiagram } from "../lib/elk-layout.js";
import { spatialLayoutDiagram } from "../lib/spatial-layout.js";
import { guideLayoutDiagram } from "../lib/guide-layout.js";

export function useLayoutedElements(
  diagram: SingleDiagram,
  shapePalette?: ShapePaletteEntry[],
  sizePalette?: SizePaletteEntry[]
) {
  const [initialNodes, setInitialNodes] = useState<Node[]>([]);
  const [initialEdges, setInitialEdges] = useState<Edge[]>([]);
  const [isLayouting, setIsLayouting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLayouting(true);

    const hasSpatialData =
      diagram.layoutMode === "spatial" &&
      diagram.nodes.some((n) => n.spatial);

    const hasGuideData =
      (diagram.guides?.length ?? 0) > 0 &&
      diagram.nodes.some((n) => n.guideRow || n.guideColumn);

    if (hasSpatialData) {
      const result = spatialLayoutDiagram(diagram, undefined, shapePalette);
      if (!cancelled) {
        setInitialNodes(result.nodes);
        setInitialEdges(result.edges);
        setIsLayouting(false);
      }
    } else if (hasGuideData) {
      const result = guideLayoutDiagram(diagram, shapePalette, sizePalette);
      if (!cancelled) {
        setInitialNodes(result.nodes);
        setInitialEdges(result.edges);
        setIsLayouting(false);
      }
    } else {
      layoutDiagram(diagram, shapePalette, sizePalette).then((result) => {
        if (!cancelled) {
          setInitialNodes(result.nodes);
          setInitialEdges(result.edges);
          setIsLayouting(false);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [diagram, shapePalette, sizePalette]);

  return { initialNodes, initialEdges, isLayouting };
}
