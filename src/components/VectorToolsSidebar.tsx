import { Component } from "solid-js";

export type VectorToolId =
  | "select"
  | "transform"
  | "node_edit"
  | "line"
  | "arc"
  | "rectangle"
  | "circle"
  | "polygon"
  | "text"
  | "trace"
  | "trim"
  | "offset"
  | "join"
  | "fillet"
  | "align";

interface VectorToolsSidebarProps {
  activeTool: VectorToolId;
  onSelectTool: (tool: VectorToolId) => void;
}

export const VectorToolsSidebar: Component<VectorToolsSidebarProps> = (props) => {
  return (
    <nav class="spark-vector-sidebar" aria-label="CAD Vector Tools">
      {/* 1. Selection Box Tool */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "select" ? "active" : ""}`}
        onClick={() => props.onSelectTool("select")}
        title="Select Vectors (S)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3l7 18 3-7 7-3L3 3z" fill={props.activeTool === "select" ? "#38bdf8" : "none"} />
        </svg>
      </button>

      {/* 2. Transform / Resize Box */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "transform" ? "active" : ""}`}
        onClick={() => props.onSelectTool("transform")}
        title="Transform / Move Vectors (T)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3" />
          <rect x="2" y="2" width="4" height="4" fill="currentColor" />
          <rect x="18" y="2" width="4" height="4" fill="currentColor" />
          <rect x="2" y="18" width="4" height="4" fill="currentColor" />
          <rect x="18" y="18" width="4" height="4" fill="currentColor" />
        </svg>
      </button>

      {/* 3. Node Edit Tool */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "node_edit" ? "active" : ""}`}
        onClick={() => props.onSelectTool("node_edit")}
        title="Node Edit Mode (N)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 20 Q 12 4, 20 20" />
          <circle cx="4" cy="20" r="2.5" fill="currentColor" />
          <circle cx="12" cy="12" r="2.5" fill="#38bdf8" />
          <circle cx="20" cy="20" r="2.5" fill="currentColor" />
        </svg>
      </button>

      <div class="spark-sidebar-divider" />

      {/* 4. Draw Line / Polyline */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "line" ? "active" : ""}`}
        onClick={() => props.onSelectTool("line")}
        title="Draw Polyline / Line (L)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 20 L 10 10 L 20 4" />
          <circle cx="4" cy="20" r="2" fill="currentColor" />
          <circle cx="10" cy="10" r="2" fill="currentColor" />
          <circle cx="20" cy="4" r="2" fill="currentColor" />
        </svg>
      </button>

      {/* 5. Draw Arc */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "arc" ? "active" : ""}`}
        onClick={() => props.onSelectTool("arc")}
        title="Draw Arc (A)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 18 A 14 14 0 0 1 18 4" />
          <circle cx="4" cy="18" r="2" fill="currentColor" />
          <circle cx="18" cy="4" r="2" fill="currentColor" />
        </svg>
      </button>

      {/* 6. Draw Rectangle */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "rectangle" ? "active" : ""}`}
        onClick={() => props.onSelectTool("rectangle")}
        title="Draw Rectangle (R)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="4" y="5" width="16" height="14" rx="1.5" />
        </svg>
      </button>

      {/* 7. Draw Circle / Oval */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "circle" ? "active" : ""}`}
        onClick={() => props.onSelectTool("circle")}
        title="Draw Circle / Oval (C)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="8" />
        </svg>
      </button>

      {/* 8. Text Tool */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "text" ? "active" : ""}`}
        onClick={() => props.onSelectTool("text")}
        title="Create Text Vector"
      >
        <span class="font-bold text-base font-sans" style={{ "line-height": 1 }}>A</span>
      </button>

      {/* 9. Trace Image */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "trace" ? "active" : ""}`}
        onClick={() => props.onSelectTool("trace")}
        title="Trace Bitmap Image"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>

      <div class="spark-sidebar-divider" />

      {/* 10. Trim / Scissors */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "trim" ? "active" : ""}`}
        onClick={() => props.onSelectTool("trim")}
        title="Trim Interactive Scissors (X)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      </button>

      {/* 11. Offset / Nesting */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "offset" ? "active" : ""}`}
        onClick={() => props.onSelectTool("offset")}
        title="Offset Vectors / Nesting"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="14" height="14" rx="1" />
          <rect x="8" y="8" width="14" height="14" rx="1" stroke-dasharray="2 2" />
        </svg>
      </button>

      {/* 12. Join Vectors */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "join" ? "active" : ""}`}
        onClick={() => props.onSelectTool("join")}
        title="Join Open Vectors (J)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 12 h6 m4 0 h6" />
          <circle cx="10" cy="12" r="2" fill="#38bdf8" />
          <circle cx="14" cy="12" r="2" fill="#38bdf8" />
        </svg>
      </button>

      {/* 13. Fillet */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "fillet" ? "active" : ""}`}
        onClick={() => props.onSelectTool("fillet")}
        title="Fillet / Chamfer Corners (F)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 20 L 4 12 Q 4 4, 12 4 L 20 4" />
        </svg>
      </button>

      {/* 14. Align / Transform */}
      <button
        type="button"
        class={`spark-tool-btn ${props.activeTool === "align" ? "active" : ""}`}
        onClick={() => props.onSelectTool("align")}
        title="Align and Distribute Vectors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="21" x2="4" y2="3" />
          <rect x="8" y="6" width="12" height="4" rx="1" />
          <rect x="8" y="14" width="8" height="4" rx="1" />
        </svg>
      </button>
    </nav>
  );
};
