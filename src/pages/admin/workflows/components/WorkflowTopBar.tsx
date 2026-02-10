import type { WorkflowVersion } from "../../../../types/workflows";

interface WorkflowTopBarProps {
  name: string;
  statusLabel: string;
  versions: WorkflowVersion[];
  selectedVersion: string;
  onSelectVersion: (value: string) => void;
  onSave: () => void;
  onValidate: () => void;
  onPublish: () => void;
  onPreview: () => void;
  isDirty: boolean;
  lastSavedAt: string | null;
}

export default function WorkflowTopBar({
  name,
  statusLabel,
  versions,
  selectedVersion,
  onSelectVersion,
  onSave,
  onValidate,
  onPublish,
  onPreview,
  isDirty,
  lastSavedAt,
}: WorkflowTopBarProps) {
  return (
    <div className="flex flex-col gap-4 px-6 py-4 bg-white border-b border-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{name}</h1>
          <p className="text-xs text-slate-500 mt-1">
            Status: {statusLabel}
            {isDirty ? " · Unsaved changes" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            data-testid="workflow-version-select"
            value={selectedVersion}
            onChange={(event) => onSelectVersion(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="draft">Draft</option>
            {versions.map((version) => (
              <option key={version.version} value={version.version}>
                v{version.version}
              </option>
            ))}
          </select>
          <button
            data-testid="workflow-validate"
            onClick={onValidate}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
          >
            Validate
          </button>
          <button
            data-testid="workflow-save"
            onClick={onSave}
            className="rounded bg-slate-900 px-3 py-1 text-sm text-white hover:bg-slate-800"
          >
            Save
          </button>
          <button
            data-testid="workflow-publish"
            onClick={onPublish}
            className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-500"
          >
            Publish
          </button>
          <button
            data-testid="workflow-preview"
            onClick={onPreview}
            className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
          >
            Preview Runtime
          </button>
        </div>
      </div>
      {lastSavedAt && (
        <p className="text-xs text-slate-400">Last saved at {lastSavedAt}</p>
      )}
    </div>
  );
}
