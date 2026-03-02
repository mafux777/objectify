import { useCallback, useRef, useState, useEffect } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { GuideLine } from "@objectify/schema";
import {
  runForceSimulation,
  updateGuidesFromPositions,
  DEFAULT_FORCE_PARAMS,
  type ForceParams,
} from "../lib/force-layout.js";

// ─── Dial Configuration ─────────────────────────────────────────────────

interface DialConfig {
  key: keyof ForceParams;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  /** Display as integer? */
  integer?: boolean;
}

const DIALS: DialConfig[] = [
  {
    key: "repulsion",
    label: "Repulsion",
    description: "How strongly objects push each other apart",
    min: 50,
    max: 5000,
    step: 50,
    integer: true,
  },
  {
    key: "attraction",
    label: "Attraction",
    description: "How tightly connectors pull objects together",
    min: 0.001,
    max: 0.2,
    step: 0.001,
  },
  {
    key: "guideAffinity",
    label: "Guide Pull",
    description: "How strongly guide lines hold their nodes in place",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "gravity",
    label: "Gravity",
    description: "Pull toward center — prevents nodes from drifting away",
    min: 0,
    max: 0.1,
    step: 0.001,
  },
  {
    key: "idealEdgeLength",
    label: "Edge Length",
    description: "Target distance between connected objects",
    min: 60,
    max: 500,
    step: 10,
    integer: true,
  },
  {
    key: "damping",
    label: "Damping",
    description: "Friction — lower values settle faster",
    min: 0.3,
    max: 0.98,
    step: 0.01,
  },
];

// ─── Circular Dial Component ────────────────────────────────────────────

function Dial({
  config,
  value,
  onChange,
}: {
  config: DialConfig;
  value: number;
  onChange: (v: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);

  const normalised = (value - config.min) / (config.max - config.min);
  const angle = -135 + normalised * 270; // -135° to +135° (270° sweep)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true;
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      let a = Math.atan2(dy, dx) * (180 / Math.PI) + 90; // 0° at top
      if (a < -180) a += 360;
      if (a > 180) a -= 360;

      // Map angle to normalised: -135° → 0, +135° → 1
      let norm = (a + 135) / 270;
      norm = Math.max(0, Math.min(1, norm));
      let newVal = config.min + norm * (config.max - config.min);

      // Snap to step
      newVal = Math.round(newVal / config.step) * config.step;
      newVal = Math.max(config.min, Math.min(config.max, newVal));

      onChange(newVal);
    },
    [config, onChange]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Tick marks
  const ticks = [];
  for (let i = 0; i <= 10; i++) {
    const tickAngle = -135 + (i / 10) * 270;
    const rad = (tickAngle * Math.PI) / 180;
    const r1 = 28;
    const r2 = i % 5 === 0 ? 23 : 25;
    ticks.push(
      <line
        key={i}
        x1={30 + r1 * Math.sin(rad)}
        y1={30 - r1 * Math.cos(rad)}
        x2={30 + r2 * Math.sin(rad)}
        y2={30 - r2 * Math.cos(rad)}
        stroke="#bbb"
        strokeWidth={i % 5 === 0 ? 1.5 : 0.8}
      />
    );
  }

  const displayValue = config.integer
    ? Math.round(value)
    : value < 0.01
      ? value.toFixed(3)
      : value < 1
        ? value.toFixed(2)
        : value.toFixed(1);

  return (
    <div className="force-dial">
      <svg
        ref={svgRef}
        width={60}
        height={60}
        viewBox="0 0 60 60"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: "grab", touchAction: "none" }}
      >
        {/* Background arc */}
        <circle
          cx={30}
          cy={30}
          r={26}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={3}
          strokeDasharray={`${(270 / 360) * 2 * Math.PI * 26} ${(90 / 360) * 2 * Math.PI * 26}`}
          strokeDashoffset={(135 / 360) * 2 * Math.PI * 26}
          strokeLinecap="round"
          transform="rotate(0, 30, 30)"
        />
        {/* Active arc */}
        <circle
          cx={30}
          cy={30}
          r={26}
          fill="none"
          stroke="#1976d2"
          strokeWidth={3}
          strokeDasharray={`${(normalised * 270 / 360) * 2 * Math.PI * 26} ${2 * Math.PI * 26}`}
          strokeDashoffset={(135 / 360) * 2 * Math.PI * 26}
          strokeLinecap="round"
        />
        {ticks}
        {/* Knob indicator */}
        {(() => {
          const rad = (angle * Math.PI) / 180;
          return (
            <circle
              cx={30 + 20 * Math.sin(rad)}
              cy={30 - 20 * Math.cos(rad)}
              r={4}
              fill="#1976d2"
              stroke="#fff"
              strokeWidth={1.5}
            />
          );
        })()}
        {/* Center value */}
        <text
          x={30}
          y={33}
          textAnchor="middle"
          fontSize={9}
          fontWeight={600}
          fill="#333"
          style={{ userSelect: "none" }}
        >
          {displayValue}
        </text>
      </svg>
      <div className="force-dial__label">{config.label}</div>
      <div className="force-dial__desc">{config.description}</div>
    </div>
  );
}

// ─── Presets ────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  description: string;
  params: Partial<ForceParams>;
}

const PRESETS: Preset[] = [
  {
    name: "Balanced",
    description: "Default — even spacing with guide alignment",
    params: { ...DEFAULT_FORCE_PARAMS },
  },
  {
    name: "Tight",
    description: "Compact layout — strong attraction, weak repulsion",
    params: { repulsion: 300, attraction: 0.08, idealEdgeLength: 100, gravity: 0.02 },
  },
  {
    name: "Airy",
    description: "Spacious layout — strong repulsion, generous spacing",
    params: { repulsion: 2500, attraction: 0.01, idealEdgeLength: 280, gravity: 0.005 },
  },
  {
    name: "Grid-Locked",
    description: "Strong guide pull — nodes snap firmly to guide lines",
    params: { guideAffinity: 0.8, repulsion: 600, attraction: 0.015 },
  },
  {
    name: "Organic",
    description: "Free-form — no guides, nodes find natural positions",
    params: { guideAffinity: 0, repulsion: 1200, attraction: 0.03, gravity: 0.015 },
  },
];

// ─── Main Panel ─────────────────────────────────────────────────────────

interface ForceLayoutPanelProps {
  nodes: Node[];
  edges: Edge[];
  guides: GuideLine[];
  canvasWidth: number;
  canvasHeight: number;
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
  setGuides: (updater: (guides: GuideLine[]) => GuideLine[]) => void;
  saveSnapshot: () => void;
  onClose: () => void;
}

export function ForceLayoutPanel({
  nodes,
  edges,
  guides,
  canvasWidth,
  canvasHeight,
  setNodes,
  setGuides,
  saveSnapshot,
  onClose,
}: ForceLayoutPanelProps) {
  const [params, setParams] = useState<ForceParams>({ ...DEFAULT_FORCE_PARAMS });
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ iter: number; energy: number } | null>(null);
  const [overlapFree, setOverlapFree] = useState(params.preventOverlap);
  const cancelRef = useRef(false);

  // Sync overlap toggle
  useEffect(() => {
    setParams((p) => ({ ...p, preventOverlap: overlapFree }));
  }, [overlapFree]);

  const handleDialChange = useCallback((key: keyof ForceParams, value: number) => {
    setParams((p) => ({ ...p, [key]: value }));
  }, []);

  const handleApply = useCallback(() => {
    saveSnapshot();
    setIsRunning(true);
    cancelRef.current = false;
    setProgress({ iter: 0, energy: 0 });

    // Run the full simulation synchronously in a requestAnimationFrame
    // to avoid blocking the main thread during the initial UI update.
    requestAnimationFrame(() => {
      const result = runForceSimulation(
        nodes,
        edges,
        guides,
        params,
        canvasWidth,
        canvasHeight,
        300,
        (iter, energy) => {
          // Progress updates are synchronous within the simulation,
          // so we capture the final values for display after completion.
          if (iter % 30 === 0 || iter === 299) {
            setProgress({ iter, energy });
          }
        },
      );

      if (cancelRef.current) {
        setIsRunning(false);
        setProgress(null);
        return;
      }

      // Apply final positions
      const posMap = new Map(result.map((n) => [n.id, n]));
      setNodes((current) =>
        current.map((n) => {
          const sim = posMap.get(n.id);
          if (!sim) return n;
          return {
            ...n,
            position: sim.position,
            ...(sim.style ? { style: sim.style } : {}),
          };
        })
      );

      // Update guides to reflect new positions
      setGuides((currentGuides) =>
        updateGuidesFromPositions(result, currentGuides, canvasWidth, canvasHeight)
      );

      setIsRunning(false);
      setProgress(null);
    });
  }, [nodes, edges, guides, params, canvasWidth, canvasHeight, setNodes, setGuides, saveSnapshot]);

  const handleCancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const handleReset = useCallback(() => {
    setParams({ ...DEFAULT_FORCE_PARAMS });
    setOverlapFree(DEFAULT_FORCE_PARAMS.preventOverlap);
  }, []);

  return (
    <div className="force-panel">
      <div className="force-panel__header">
        <h3>Magnetic Layout</h3>
        <button className="force-panel__close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      <p className="force-panel__intro">
        Objects repel each other while connectors pull them together.
        Pick a preset or fine-tune the dials, then apply.
      </p>

      <div className="force-panel__presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            className="force-panel__preset"
            onClick={() => {
              setParams((p) => ({ ...p, ...preset.params }));
              if (preset.params.preventOverlap !== undefined) {
                setOverlapFree(preset.params.preventOverlap);
              }
            }}
            title={preset.description}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="force-panel__dials">
        {DIALS.map((d) => (
          <Dial
            key={d.key}
            config={d}
            value={params[d.key] as number}
            onChange={(v) => handleDialChange(d.key, v)}
          />
        ))}
      </div>

      <label className="force-panel__toggle">
        <input
          type="checkbox"
          checked={overlapFree}
          onChange={(e) => setOverlapFree(e.target.checked)}
        />
        <span>Prevent overlaps</span>
      </label>

      {progress && (
        <div className="force-panel__progress">
          <div
            className="force-panel__progress-bar"
            style={{ width: `${(progress.iter / 300) * 100}%` }}
          />
          <span className="force-panel__progress-text">
            Step {progress.iter}/300 &middot; Energy: {progress.energy.toFixed(1)}
          </span>
        </div>
      )}

      <div className="force-panel__actions">
        {isRunning ? (
          <button className="force-panel__btn force-panel__btn--cancel" onClick={handleCancel}>
            Stop
          </button>
        ) : (
          <>
            <button className="force-panel__btn force-panel__btn--apply" onClick={handleApply}>
              Apply Forces
            </button>
            <button className="force-panel__btn force-panel__btn--reset" onClick={handleReset}>
              Reset Dials
            </button>
          </>
        )}
      </div>
    </div>
  );
}
