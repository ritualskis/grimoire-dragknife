import { Component, createSignal, Show } from "solid-js";

interface GCodeInspectorProps {
  originalGCode: string;
  processedGCode: string;
  filename?: string;
}

export const GCodeInspector: Component<GCodeInspectorProps> = (props) => {
  const [activeTab, setActiveTab] = createSignal<"processed" | "original">("processed");
  const [copied, setCopied] = createSignal(false);

  const handleCopy = async () => {
    const textToCopy = activeTab() === "processed" ? props.processedGCode : props.originalGCode;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    const textToSave = props.processedGCode || props.originalGCode;
    if (!textToSave) return;
    const baseName = props.filename
      ? props.filename.replace(/\.[^/.]+$/, "")
      : "dragknife_output";
    const outFilename = `${baseName}_dragknife.nc`;

    const blob = new Blob([textToSave], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = outFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const lineCount = (text: string) => {
    if (!text) return 0;
    return text.split(/\r?\n/).length;
  };

  return (
    <div class="surface-card inspector-container">
      <div class="inspector-header flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="hud-badge-icon">📝</span>
          <span class="inspector-title">G-CODE INSPECTOR & EXPORT</span>
        </div>

        {/* Tab Controls */}
        <div class="inspector-tabs flex items-center gap-1">
          <button
            class={`tab-btn ${activeTab() === "processed" ? "active" : ""}`}
            onClick={() => setActiveTab("processed")}
            type="button"
          >
            Processed Drag Knife ({lineCount(props.processedGCode)} lines)
          </button>
          <button
            class={`tab-btn ${activeTab() === "original" ? "active" : ""}`}
            onClick={() => setActiveTab("original")}
            type="button"
          >
            Original Input ({lineCount(props.originalGCode)} lines)
          </button>
        </div>

        {/* Export Actions */}
        <div class="flex items-center gap-2">
          <button class="action-btn" onClick={handleCopy} type="button">
            {copied() ? "✓ Copied!" : "📋 Copy"}
          </button>
          <button
            class="action-btn btn-accent-mini"
            disabled={!props.processedGCode}
            onClick={handleDownload}
            type="button"
          >
            💾 Export .NC
          </button>
        </div>
      </div>

      <div class="gcode-editor-wrapper surface-well">
        <Show
          when={activeTab() === "processed" ? props.processedGCode : props.originalGCode}
          fallback={
            <div class="gcode-empty-state">
              <span class="text-secondary">No G-Code loaded. Load a file or select a sample above.</span>
            </div>
          }
        >
          {(code) => (
            <pre class="gcode-pre">
              <code>{code()}</code>
            </pre>
          )}
        </Show>
      </div>
    </div>
  );
};
