import type { Node, Edge } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";

// ─── Force Parameters (user-tunable via dials) ─────────────────────────

export interface ForceParams {
  /** Repulsion strength between all node pairs (Coulomb-like). Higher = more spread. */
  repulsion: number;
  /** Attraction strength along edges (spring/Hooke-like). Higher = tighter clusters. */
  attraction: number;
  /** How strongly guide lines attract their assigned nodes. 0 = guides ignored. */
  guideAffinity: number;
  /** Global gravity pulling nodes toward the canvas center (prevents drift). */
  gravity: number;
  /** Damping factor (0-1). Lower = more friction, faster convergence. */
  damping: number;
  /** Ideal edge length in pixels. Springs rest at this distance. */
  idealEdgeLength: number;
  /** Whether to prevent node overlaps with additional repulsion. */
  preventOverlap: boolean;
}

export const DEFAULT_FORCE_PARAMS: ForceParams = {
  repulsion: 800,
  attraction: 0.02,
  guideAffinity: 0.15,
  gravity: 0.01,
  damping: 0.85,
  idealEdgeLength: 180,
  preventOverlap: true,
};

// ─── Internal types ─────────────────────────────────────────────────────

interface Body {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  mass: number;
  /** If node is inside a group, skip global forces — handled by group membership */
  parentId?: string;
  /** Whether this node is a group container */
  isGroup: boolean;
  /** Whether this node is pinned (groups are pinned during child simulation) */
  pinned: boolean;
  /** Guide row this node belongs to */
  guideRow?: string;
  /** Guide column this node belongs to */
  guideColumn?: string;
}

// ─── Core simulation ────────────────────────────────────────────────────

/**
 * ForceAtlas2-inspired physics simulation for diagram layout.
 *
 * Key design decisions:
 * - Repulsion: All node pairs repel (scaled by node area/mass). Larger nodes
 *   push harder, inspired by ForceAtlas2's "degree-dependent repulsion".
 * - Attraction: Edges act as springs with a rest length (idealEdgeLength).
 *   The force is linear (Hooke's law), not log-distance like FR.
 * - Guide affinity: Guide lines act as soft constraints — gentle springs pulling
 *   nodes toward their guide row/column positions.
 * - Gravity: Weak force pulling everything toward the centroid of the graph.
 * - Overlap prevention: Extra repulsion when bounding boxes overlap, pushing
 *   nodes apart by the overlap amount.
 * - Cooling: Adaptive temperature like ForceAtlas2 — if the system oscillates,
 *   temperature drops; if it converges, temperature rises gently.
 *
 * Returns the final positions after `maxIterations` or once energy drops below threshold.
 */
export function runForceSimulation(
  nodes: Node[],
  edges: Edge[],
  guides: GuideLine[],
  params: ForceParams,
  canvasWidth: number,
  canvasHeight: number,
  maxIterations: number = 300,
  onProgress?: (iteration: number, energy: number) => void,
): Node[] {
  if (nodes.length === 0) return nodes;

  // Build guide lookup
  const guideMap = new Map<string, GuideLine>();
  for (const g of guides) guideMap.set(g.id, g);

  // Build adjacency from edges
  const adjacency = new Map<string, Set<string>>();
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!nodeIdSet.has(e.source) || !nodeIdSet.has(e.target)) continue;
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  }

  // Build a parent position lookup for converting relative → absolute coords
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  function getAbsolutePosition(n: Node): { x: number; y: number } {
    let x = n.position.x;
    let y = n.position.y;
    if (n.parentId) {
      const parent = nodeById.get(n.parentId);
      if (parent) {
        const parentAbs = getAbsolutePosition(parent);
        x += parentAbs.x;
        y += parentAbs.y;
      }
    }
    return { x, y };
  }

  // Initialize bodies from nodes (all in absolute coordinates)
  const bodies: Body[] = nodes.map((n) => {
    const w = n.width ?? n.measured?.width ?? 160;
    const h = n.height ?? n.measured?.height ?? 50;
    const data = n.data as Record<string, unknown>;
    const degree = adjacency.get(n.id)?.size ?? 0;
    const abs = getAbsolutePosition(n);

    return {
      id: n.id,
      x: abs.x + w / 2,  // simulate at center (absolute)
      y: abs.y + h / 2,
      vx: 0,
      vy: 0,
      w,
      h,
      // Mass proportional to area + degree (ForceAtlas2 style)
      mass: 1 + Math.sqrt(w * h) / 50 + degree * 0.5,
      parentId: n.parentId ?? undefined,
      isGroup: n.type === "groupNode",
      pinned: false,
      guideRow: data?.guideRow as string | undefined,
      guideColumn: data?.guideColumn as string | undefined,
    };
  });

  const bodyMap = new Map(bodies.map((b) => [b.id, b]));

  // Pin group nodes — they'll be repositioned after children settle
  for (const b of bodies) {
    if (b.isGroup) b.pinned = true;
  }

  // Centroid for gravity
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  // Adaptive temperature (ForceAtlas2 style)
  let temperature = 1.0;
  let prevEnergy = Infinity;
  const MIN_ENERGY = 0.5;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Reset forces
    const fx = new Map<string, number>();
    const fy = new Map<string, number>();
    for (const b of bodies) {
      fx.set(b.id, 0);
      fy.set(b.id, 0);
    }

    // ── 1. Repulsion: all pairs (O(n²) — fine for diagram-scale graphs) ──
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.pinned) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.pinned && a.pinned) continue;

        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 1) {
          // Jitter to separate coincident nodes
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          dist = Math.sqrt(dx * dx + dy * dy);
        }

        // ForceAtlas2-style overlap handling: use border-to-border distance
        // and apply a strong repulsion factor (100x) when nodes overlap.
        let force: number;
        if (params.preventOverlap) {
          // Compute border-to-border distance (approximate nodes as ellipses)
          const sizeA = (a.w + a.h) / 4; // average "radius"
          const sizeB = (b.w + b.h) / 4;
          const borderDist = dist - sizeA - sizeB - 20; // 20px min gap

          if (borderDist < 0) {
            // Overlapping: very strong repulsion (ForceAtlas2 uses 100x factor)
            force = params.repulsion * a.mass * b.mass * 100 / Math.max(dist, 1);
          } else {
            // Not overlapping: normal Coulomb with border distance
            force = (params.repulsion * a.mass * b.mass) / (borderDist * borderDist + 1);
          }
        } else {
          // Classic Coulomb repulsion: F = repulsion * mass_a * mass_b / dist²
          force = (params.repulsion * a.mass * b.mass) / (dist * dist);
        }
        const forceX = (dx / dist) * force;
        const forceY = (dy / dist) * force;

        if (!a.pinned) {
          fx.set(a.id, (fx.get(a.id) ?? 0) + forceX / a.mass);
          fy.set(a.id, (fy.get(a.id) ?? 0) + forceY / a.mass);
        }
        if (!b.pinned) {
          fx.set(b.id, (fx.get(b.id) ?? 0) - forceX / b.mass);
          fy.set(b.id, (fy.get(b.id) ?? 0) - forceY / b.mass);
        }
      }
    }

    // ── 2. Attraction: edge springs (Hooke's law) ──
    for (const e of edges) {
      const a = bodyMap.get(e.source);
      const b = bodyMap.get(e.target);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;

      // Spring force: F = attraction * (dist - idealLength)
      const displacement = dist - params.idealEdgeLength;
      const force = params.attraction * displacement;
      const forceX = (dx / dist) * force;
      const forceY = (dy / dist) * force;

      if (!a.pinned) {
        fx.set(a.id, (fx.get(a.id) ?? 0) + forceX / a.mass);
        fy.set(a.id, (fy.get(a.id) ?? 0) + forceY / a.mass);
      }
      if (!b.pinned) {
        fx.set(b.id, (fx.get(b.id) ?? 0) - forceX / b.mass);
        fy.set(b.id, (fy.get(b.id) ?? 0) - forceY / b.mass);
      }
    }

    // ── 3. Guide affinity: soft constraints toward guide positions ──
    if (params.guideAffinity > 0 && guides.length > 0) {
      for (const b of bodies) {
        if (b.pinned) continue;

        // Horizontal guide → pull Y toward guide position
        if (b.guideRow) {
          const guide = guideMap.get(b.guideRow);
          if (guide) {
            const targetY = guide.position * canvasHeight;
            const dy = targetY - b.y;
            fy.set(b.id, (fy.get(b.id) ?? 0) + dy * params.guideAffinity);
          }
        }

        // Vertical guide → pull X toward guide position
        if (b.guideColumn) {
          const guide = guideMap.get(b.guideColumn);
          if (guide) {
            const targetX = guide.position * canvasWidth;
            const dx = targetX - b.x;
            fx.set(b.id, (fx.get(b.id) ?? 0) + dx * params.guideAffinity);
          }
        }
      }
    }

    // ── 4. Sibling alignment: nodes on the same guide gently align ──
    // This creates the orderly, grid-like quality of well-designed diagrams.
    if (params.guideAffinity > 0 && guides.length > 0) {
      const rowGroups = new Map<string, Body[]>();
      const colGroups = new Map<string, Body[]>();
      for (const b of bodies) {
        if (b.pinned) continue;
        if (b.guideRow) {
          if (!rowGroups.has(b.guideRow)) rowGroups.set(b.guideRow, []);
          rowGroups.get(b.guideRow)!.push(b);
        }
        if (b.guideColumn) {
          if (!colGroups.has(b.guideColumn)) colGroups.set(b.guideColumn, []);
          colGroups.get(b.guideColumn)!.push(b);
        }
      }

      // Nodes sharing a row: nudge Y toward their average Y
      const alignStrength = params.guideAffinity * 0.3;
      for (const [, group] of rowGroups) {
        if (group.length < 2) continue;
        const avgY = group.reduce((s, b) => s + b.y, 0) / group.length;
        for (const b of group) {
          fy.set(b.id, (fy.get(b.id) ?? 0) + (avgY - b.y) * alignStrength);
        }
      }

      // Nodes sharing a column: nudge X toward their average X
      for (const [, group] of colGroups) {
        if (group.length < 2) continue;
        const avgX = group.reduce((s, b) => s + b.x, 0) / group.length;
        for (const b of group) {
          fx.set(b.id, (fx.get(b.id) ?? 0) + (avgX - b.x) * alignStrength);
        }
      }
    }

    // ── 5. Gravity: pull toward centroid ──
    if (params.gravity > 0) {
      for (const b of bodies) {
        if (b.pinned) continue;
        const dx = cx - b.x;
        const dy = cy - b.y;
        fx.set(b.id, (fx.get(b.id) ?? 0) + dx * params.gravity);
        fy.set(b.id, (fy.get(b.id) ?? 0) + dy * params.gravity);
      }
    }

    // ── 6. Integration with velocity damping and adaptive temperature ──
    let totalEnergy = 0;
    for (const b of bodies) {
      if (b.pinned) continue;

      b.vx = (b.vx + (fx.get(b.id) ?? 0)) * params.damping;
      b.vy = (b.vy + (fy.get(b.id) ?? 0)) * params.damping;

      // Cap maximum displacement per step (ForceAtlas2 uses per-node speed limit)
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const maxSpeed = 10 * temperature;
      if (speed > maxSpeed) {
        b.vx = (b.vx / speed) * maxSpeed;
        b.vy = (b.vy / speed) * maxSpeed;
      }

      b.x += b.vx * temperature;
      b.y += b.vy * temperature;

      totalEnergy += speed * speed;
    }

    // Adaptive temperature
    if (totalEnergy < prevEnergy) {
      temperature = Math.min(temperature * 1.02, 1.5);
    } else {
      temperature = Math.max(temperature * 0.8, 0.1);
    }
    prevEnergy = totalEnergy;

    if (onProgress) {
      onProgress(iter, totalEnergy);
    }

    // Convergence check
    if (totalEnergy < MIN_ENERGY) break;
  }

  // ── Post-processing: reposition groups around their children ──
  const groupIds = new Set(bodies.filter((b) => b.isGroup).map((b) => b.id));
  for (const groupId of groupIds) {
    const children = bodies.filter((b) => b.parentId === groupId);
    if (children.length === 0) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of children) {
      minX = Math.min(minX, c.x - c.w / 2);
      minY = Math.min(minY, c.y - c.h / 2);
      maxX = Math.max(maxX, c.x + c.w / 2);
      maxY = Math.max(maxY, c.y + c.h / 2);
    }

    const gBody = bodyMap.get(groupId);
    if (gBody) {
      gBody.x = (minX + maxX) / 2;
      gBody.y = (minY + maxY) / 2;
      gBody.w = (maxX - minX) + 40;  // side padding
      gBody.h = (maxY - minY) + 60;  // top (title) + bottom padding
    }
  }

  // Convert bodies back to node positions (top-left corner)
  const posMap = new Map<string, { x: number; y: number; w?: number; h?: number }>();
  for (const b of bodies) {
    posMap.set(b.id, {
      x: b.x - b.w / 2,
      y: b.y - b.h / 2,
      ...(b.isGroup ? { w: b.w, h: b.h } : {}),
    });
  }

  // Apply positions, converting children to parent-relative coords
  return nodes.map((n) => {
    const pos = posMap.get(n.id);
    if (!pos) return n;

    let x = pos.x;
    let y = pos.y;

    // Convert to parent-relative if node has a parent
    if (n.parentId) {
      const parentPos = posMap.get(n.parentId);
      if (parentPos) {
        x = x - parentPos.x;
        y = y - parentPos.y;
      }
    }

    return {
      ...n,
      position: { x, y },
      ...(pos.w && pos.h
        ? { style: { ...((n.style ?? {}) as Record<string, unknown>), width: pos.w, height: pos.h } }
        : {}),
    };
  });
}

/**
 * Optionally update guide positions to match the settled node positions.
 * Each guide's new position is the average of its assigned nodes' centers.
 */
export function updateGuidesFromPositions(
  nodes: Node[],
  guides: GuideLine[],
  canvasWidth: number,
  canvasHeight: number,
): GuideLine[] {
  if (guides.length === 0) return guides;

  const rowAccum = new Map<string, number[]>();
  const colAccum = new Map<string, number[]>();

  for (const n of nodes) {
    const data = n.data as Record<string, unknown>;
    const w = n.width ?? n.measured?.width ?? 160;
    const h = n.height ?? n.measured?.height ?? 50;
    const centerX = n.position.x + w / 2;
    const centerY = n.position.y + h / 2;

    const rowId = data?.guideRow as string | undefined;
    const colId = data?.guideColumn as string | undefined;

    if (rowId) {
      if (!rowAccum.has(rowId)) rowAccum.set(rowId, []);
      rowAccum.get(rowId)!.push(centerY);
    }
    if (colId) {
      if (!colAccum.has(colId)) colAccum.set(colId, []);
      colAccum.get(colId)!.push(centerX);
    }
  }

  return guides.map((g) => {
    if (g.direction === "horizontal") {
      const ys = rowAccum.get(g.id);
      if (ys && ys.length > 0) {
        const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
        return { ...g, position: clamp01(avg / canvasHeight) };
      }
    } else {
      const xs = colAccum.get(g.id);
      if (xs && xs.length > 0) {
        const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
        return { ...g, position: clamp01(avg / canvasWidth) };
      }
    }
    return g;
  });
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
