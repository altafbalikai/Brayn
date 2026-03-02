import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  getAdminLLMModels,
  addLLMModel,
  editLLMModel,
  removeLLMModel,
} from "../features/LLM-Models/llm-modelsSlice";
import { CiEdit } from "react-icons/ci";
import { MdOutlineDelete } from "react-icons/md";

const PROVIDERS = [
  "meta",
  "openai",
  "google",
  "nvidia",
  "qwen",
  "mistral",
  "other",
];
const COST_TIERS = ["free", "paid"];
const LATENCY_CLASSES = ["fast", "medium", "slow"];
const QUALITY_CLASSES = ["low", "medium", "high"];
const STATUS = ["active", "deprecated", "experimental"];

const CAPABILITIES = [
  "text",
  "vision",
  "image_generation",
  "video",
  "audio",
  "function_calling",
  "json_mode",
];

export default function AdminPanel() {
  const dispatch = useDispatch();
  const { llmmodels, loading, error } = useSelector((state) => state.llmModels);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    displayName: "",
    provider: "mistral",
    openRouterModelId: "",
    family: "",
    version: "",
    sizeB: "",
    maxContext: "",
    capabilities: ["text"],
    costTier: "free",
    latencyClass: "medium",
    qualityClass: "high",
    status: "active",
  });
  const [openform, setOpenform] = useState(false);

  /* =====================
     Load models
     ===================== */
  useEffect(() => {
    dispatch(getAdminLLMModels());
  }, [dispatch]);

  /* =====================
     Handlers
     ===================== */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleCapability = (cap) => {
    setForm((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(cap)
        ? prev.capabilities.filter((c) => c !== cap)
        : [...prev.capabilities, cap],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      sizeB: form.sizeB ? Number(form.sizeB) : undefined,
      maxContext: form.maxContext ? Number(form.maxContext) : undefined,
    };

    if (editingId) {
      dispatch(editLLMModel({ id: editingId, payload }));
    } else {
      dispatch(addLLMModel(payload));
    }

    resetForm();
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      displayName: "",
      provider: "mistral",
      openRouterModelId: "",
      family: "",
      version: "",
      sizeB: "",
      maxContext: "",
      capabilities: ["text"],
      costTier: "free",
      latencyClass: "medium",
      qualityClass: "high",
      status: "active",
    });
  };

  const handleEdit = (model) => {
    setOpenform(true);
    setEditingId(model._id);
    setForm({
      ...model,
      sizeB: model.sizeB ?? "",
      maxContext: model.maxContext ?? "",
    });
  };

  const handleDelete = (id) => {
    if (confirm("Delete this LLM model?")) {
      dispatch(removeLLMModel(id));
    }
  };

  const startCreateNew = () => {
    setOpenform(true);
    resetForm();

    // Optional: smooth scroll to form
    document
      .getElementById("llm-model-form")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const hanldeformclose = () => {
    resetForm();
    setOpenform(false);
  };

  /* =====================
     UI
     ===================== */
  return (
    <div className="relative p-6 h-full w-full bg-transparent overflow-hidden">
      <h1 className="text-2xl font-bold my-6">LLM Models</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* =====================
            MODEL LIST
            ===================== */}
        <div className="p-4 rounded-xl border border-theme-secondary">
          <h2 className="font-semibold mb-4">Models</h2>

          {loading && <p className="text-sm">Loading...</p>}
          {error && <p className="text-red-500">{error}</p>}

          <ul className="space-y-2">
            {llmmodels.map((m) => (
              <li
                key={m._id}
                className="p-3 bg-theme-dark rounded-lg flex justify-between"
              >
                <div>
                  <p className="font-medium">{m.displayName}</p>
                  <p className="text-xs text-theme-muted">
                    {m.provider} • {m.family} {m.version}
                  </p>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => handleEdit(m)}
                    className="px-1 py-1 text-theme-text rounded hover:bg-theme-secondary rounded"
                  >
                    <CiEdit size={20} className="opacity-80" />
                  </button>
                  <button
                    onClick={() => handleDelete(m._id)}
                    className="px-1 py-1 text-red-400 hover:bg-red-500/10 rounded hover:bg-theme-secondary rounded"
                  >
                    <MdOutlineDelete size={20} className="opacity-80" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {!openform && (
            <button
              onClick={startCreateNew}
              className="mt-4 w-full py-2 rounded-lg border border-theme-secondary
               bg-theme-dark hover:bg-theme-light text-sm"
            >
              Add New Model
            </button>
          )}
          {openform && (
            <button
              onClick={hanldeformclose}
              className="mt-4 w-full py-2 rounded-lg border border-theme-secondary
               bg-theme-dark hover:bg-theme-light text-sm"
            >
              Cancel
            </button>
          )}
          {/* {editingId && (
            <button
              onClick={startCreateNew}
              className="mt-4 w-full py-2 rounded-lg border border-theme-secondary
               bg-theme-dark hover:bg-theme-light text-sm"
            >
              + Add New Model
            </button>
          )} */}
          {/* {editingId && (
            <button
              type="button"
              onClick={startCreateNew}
              className="w-full py-2 mt-2 rounded-lg border border-theme-secondary hover:bg-theme-secondary rounded"
            >
              Cancel Edit
            </button>
          )} */}
        </div>

        {/* =====================
            FORM
            ===================== */}
        {openform && (
          <div className="p-4 rounded-xl border border-theme-secondary">
            <div className="font-semibold mb-4 pb-4 flex items-center justify-between border-b border-theme-secondary">
              <h2 className="ont-semibold text-theme-text">
                {editingId ? "Edit Model" : "Add New Model"}
              </h2>
              <button
                onClick={hanldeformclose}
                className="text-theme-muted hover:text-theme-text transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Display Name */}
              <div>
                <label className="block text-sm mb-1">Display Name</label>
                <input
                  name="displayName"
                  value={form.displayName}
                  onChange={handleChange}
                  placeholder="Devstral 2512 (Free)"
                  required
                  className="w-full p-2 rounded bg-theme-dark"
                />
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm mb-1">Provider</label>
                <select
                  name="provider"
                  value={form.provider}
                  onChange={handleChange}
                  required
                  className="w-full p-2 rounded bg-theme-dark"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {/* OpenRouter Model ID */}
              <div>
                <label className="block text-sm mb-1">
                  OpenRouter Model ID
                </label>
                <input
                  name="openRouterModelId"
                  value={form.openRouterModelId}
                  onChange={handleChange}
                  placeholder="mistralai/devstral-2512:free"
                  required
                  disabled={!!editingId}
                  className="w-full p-2 rounded bg-theme-dark disabled:opacity-50"
                />
                {editingId && (
                  <p className="text-xs border border-theme-secondary hover:text-theme-muted mt-1">
                    Cannot be changed after creation
                  </p>
                )}
              </div>

              {/* Family */}
              <div>
                <label className="block text-sm mb-1">Model Family</label>
                <input
                  name="family"
                  value={form.family}
                  onChange={handleChange}
                  placeholder="devstral"
                  required
                  className="w-full p-2 rounded bg-theme-dark"
                />
              </div>

              {/* Version */}
              <div>
                <label className="block text-sm mb-1">Version</label>
                <input
                  name="version"
                  value={form.version}
                  onChange={handleChange}
                  placeholder="2512"
                  required
                  className="w-full p-2 rounded bg-theme-dark"
                />
              </div>

              {/* Size */}
              <div>
                <label className="block text-sm mb-1">Model Size (B)</label>
                <input
                  name="sizeB"
                  type="number"
                  value={form.sizeB}
                  onChange={handleChange}
                  placeholder="12"
                  className="w-full p-2 rounded bg-theme-dark"
                />
              </div>

              {/* Max Context */}
              <div>
                <label className="block text-sm mb-1">Max Context</label>
                <input
                  name="maxContext"
                  type="number"
                  value={form.maxContext}
                  onChange={handleChange}
                  placeholder="32768"
                  className="w-full p-2 rounded bg-theme-dark"
                />
              </div>

              {/* Capabilities */}
              <div>
                <label className="block text-sm mb-1">Capabilities</label>
                <div className="flex flex-wrap gap-2">
                  {CAPABILITIES.map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => toggleCapability(cap)}
                      className={`px-3 py-1 text-xs rounded ${
                        form.capabilities.includes(cap)
                          ? "bg-theme-secondary"
                          : "bg-theme-dark"
                      }`}
                    >
                      {cap}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cost Tier */}
              <div>
                <label className="block text-sm mb-1">Cost Tier</label>
                <select
                  name="costTier"
                  value={form.costTier}
                  onChange={handleChange}
                  className="w-full p-2 rounded bg-theme-dark"
                >
                  {COST_TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Latency */}
              <div>
                <label className="block text-sm mb-1">Latency Class</label>
                <select
                  name="latencyClass"
                  value={form.latencyClass}
                  onChange={handleChange}
                  className="w-full p-2 rounded bg-theme-dark"
                >
                  {LATENCY_CLASSES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quality */}
              <div>
                <label className="block text-sm mb-1">Quality Class</label>
                <select
                  name="qualityClass"
                  value={form.qualityClass}
                  onChange={handleChange}
                  className="w-full p-2 rounded bg-theme-dark"
                >
                  {QUALITY_CLASSES.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm mb-1">Status</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full p-2 rounded bg-theme-dark"
                >
                  {STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full py-2 mt-4 border border-theme-secondary hover:bg-theme-secondary rounded"
              >
                {editingId ? "Update Model" : "Create Model"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
