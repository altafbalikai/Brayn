import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchPromptSettings,
  updatePromptSettings,
  resetPromptSettings,
  clearPromptSettingsError,
} from "../features/LLM-Models/promptSettingsSlice";

export default function PromptSettings() {
  const dispatch = useDispatch();

  const { systemPrompt, loading, error, lastUpdated } = useSelector(
    (state) => state.promptSettings
  );

  // Local editable copy (DO NOT edit Redux state directly)
  const [localPrompt, setLocalPrompt] = useState("");

  /* =========================
     Load prompt on mount
     ========================= */
  useEffect(() => {
    dispatch(fetchPromptSettings());
  }, [dispatch]);

  /* =========================
     Sync Redux → local state
     ========================= */
  useEffect(() => {
    setLocalPrompt(systemPrompt || "");
  }, [systemPrompt]);

  /* =========================
     Handlers
     ========================= */
  const handleSave = () => {
    dispatch(updatePromptSettings({ systemPrompt: localPrompt }));
  };

  const handleReset = () => {
    dispatch(resetPromptSettings());
  };

  const hasChanges = localPrompt !== systemPrompt;

  /* =========================
     UI
     ========================= */
  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold my-6">Prompt Settings</h1>
      <p className="text-theme-muted mb-6">
        Global instructions applied to all LLM requests.
      </p>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded border border-red-500 text-red-400">
          {error}
          <button
            onClick={() => dispatch(clearPromptSettingsError())}
            className="ml-3 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* System Prompt */}
      <div className="mb-6">
        <label className="block text-sm mb-2 font-medium">
          System / Developer Prompt
        </label>

        <textarea
          value={localPrompt}
          onChange={(e) => setLocalPrompt(e.target.value)}
          rows={14}
          className="
            w-full p-3 rounded-lg
            bg-theme-dark text-theme-text
            border border-theme-secondary
            font-mono text-sm
          "
          disabled={loading}
        />
      </div>

      {/* Meta */}
      {lastUpdated && (
        <p className="text-xs text-theme-muted mb-4">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={loading || !hasChanges}
          className="
            px-5 py-2 rounded-md
            bg-theme-secondary hover:bg-theme-light
            disabled:opacity-50
          "
        >
          {loading ? "Saving..." : "Save"}
        </button>

        <button
          onClick={handleReset}
          disabled={loading}
          className="
            px-5 py-2 rounded-md
            border border-theme-secondary
            hover:bg-theme-dark
            disabled:opacity-50
          "
        >
          Reset
        </button>
      </div>
    </div>
  );
}
