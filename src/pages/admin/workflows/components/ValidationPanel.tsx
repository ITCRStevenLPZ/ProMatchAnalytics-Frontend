import type { ValidationIssue } from "../../../../lib/workflow/graphValidators";

interface ValidationPanelProps {
  issues: ValidationIssue[];
}

export default function ValidationPanel({ issues }: ValidationPanelProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">Validation</h3>
      {!issues.length && (
        <p className="text-xs text-emerald-600">No issues detected.</p>
      )}
      <ul className="space-y-1">
        {issues.map((issue) => (
          <li key={issue.id} className="text-xs text-slate-600">
            {issue.severity.toUpperCase()}: {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
