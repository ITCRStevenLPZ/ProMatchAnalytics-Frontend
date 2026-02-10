import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createActionDefinition,
  listActionDefinitions,
} from "../../../api/actionDefinitions";
import type {
  ActionCategory,
  ActionDefinition,
} from "../../../types/workflows";

const DEFAULT_CATEGORY: ActionCategory = "OnBall";

export default function ActionDefinitionsPage() {
  const navigate = useNavigate();
  const [definitions, setDefinitions] = useState<ActionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ActionCategory>(DEFAULT_CATEGORY);
  const [saving, setSaving] = useState(false);

  const categories = useMemo<ActionCategory[]>(
    () => ["OnBall", "OffBall", "Referee", "Clock", "Banner", "System"],
    [],
  );

  const loadDefinitions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listActionDefinitions();
      setDefinitions(data);
    } catch (err) {
      console.error("Failed to load action definitions", err);
      setError("Unable to load action definitions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDefinitions();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Action name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createActionDefinition({
        action_id: actionId.trim() ? actionId.trim() : undefined,
        name: name.trim(),
        category,
        requires_source: true,
        requires_destination: false,
        fields: [],
        validation_rules: {},
        logging_shape: {},
        is_active: true,
      });
      setActionId("");
      setName("");
      setCategory(DEFAULT_CATEGORY);
      await loadDefinitions();
    } catch (err) {
      console.error("Failed to create action definition", err);
      setError("Unable to create action definition.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">
              Action Library
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Create and manage reusable action definitions.
            </p>
          </div>
          <button
            onClick={() => navigate("/admin")}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Back to Admin
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Create Action
          </h2>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs uppercase text-slate-500">
                Action ID
              </label>
              <input
                data-testid="action-def-id"
                value={actionId}
                onChange={(event) => setActionId(event.target.value)}
                placeholder="Pass"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-slate-500">Name</label>
              <input
                data-testid="action-def-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Pass"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-slate-500">
                Category
              </label>
              <select
                data-testid="action-def-category"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as ActionCategory)
                }
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                data-testid="action-def-submit"
                onClick={handleCreate}
                disabled={saving}
                className="w-full rounded bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Create Action"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Existing Actions
          </h2>
          {loading && <p className="text-sm text-slate-500">Loading...</p>}
          {!loading && !definitions.length && (
            <p className="text-sm text-slate-500">No action definitions yet.</p>
          )}
          <div className="grid grid-cols-1 gap-3">
            {definitions.map((action) => (
              <div
                key={action.action_id ?? action._id}
                className="border border-slate-200 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-800">{action.name}</p>
                  <p className="text-xs text-slate-500">
                    {action.action_id} · {action.category}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
                  {action.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
