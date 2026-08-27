import { Component, For } from "solid-js";
import { SAMPLE_GCODE_FILES, type SampleFile } from "../assets/sample-data";

interface FileUploaderProps {
  onFileLoaded: (content: string, filename: string) => void;
  currentFilename?: string;
}

export const FileUploader: Component<FileUploaderProps> = (props) => {
  let fileInputRef: HTMLInputElement | undefined;

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        props.onFileLoaded(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
    const file = e.dataTransfer.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        props.onFileLoaded(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const loadSample = (sample: SampleFile) => {
    props.onFileLoaded(sample.gcode, sample.filename);
  };

  return (
    <div class="surface-card uploader-container">
      <div
        class="dropzone surface-well"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".gcode,.nc,.tap,.txt"
          style={{ display: "none" }}
        />
        <div class="dropzone-content">
          <div class="dropzone-icon">📁</div>
          <div class="dropzone-text">
            <span class="dropzone-primary">
              {props.currentFilename
                ? `Loaded: ${props.currentFilename}`
                : "Drop CNC G-Code / NC Toolpath here"}
            </span>
            <span class="dropzone-sub">Click to browse files (.gcode, .nc, .tap)</span>
          </div>
        </div>
      </div>

      {/* Quick Sample Selector */}
      <div class="samples-bar flex items-center gap-2">
        <span class="text-xs text-secondary">OR LOAD SAMPLE:</span>
        <div class="sample-chips-grid flex gap-2">
          <For each={SAMPLE_GCODE_FILES}>
            {(sample) => (
              <button
                class="chip-btn"
                onClick={() => loadSample(sample)}
                title={sample.description}
                type="button"
              >
                {sample.name}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
