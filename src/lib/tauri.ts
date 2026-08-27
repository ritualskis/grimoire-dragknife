import { invoke } from "@tauri-apps/api/core";
import type { DragKnifeConfig, DragKnifeResult, HUDStats } from "../types/dragknife";
import { executeClientAnalyze, executeClientDragKnife } from "./dragknife-engine";

export const isTauri = (): boolean =>
  typeof window !== "undefined" &&
  Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

export async function analyzeGCode(
  gcode: string,
  config?: DragKnifeConfig,
): Promise<HUDStats> {
  if (isTauri()) {
    try {
      return await invoke<HUDStats>("analyze_gcode", { gcode, config });
    } catch (e) {
      console.warn("Tauri analyze_gcode failed, falling back to client engine:", e);
    }
  }
  return executeClientAnalyze(gcode, config);
}

export async function processDragKnifeGCode(
  gcode: string,
  config: DragKnifeConfig,
): Promise<DragKnifeResult> {
  if (isTauri()) {
    try {
      return await invoke<DragKnifeResult>("process_dragknife_gcode", { gcode, config });
    } catch (e) {
      console.warn("Tauri process_dragknife_gcode failed, falling back to client engine:", e);
    }
  }
  return executeClientDragKnife(gcode, config);
}
