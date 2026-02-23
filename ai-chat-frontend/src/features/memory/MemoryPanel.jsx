import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  fetchMemories,
  toggleMemory,
  editMemory,
  deleteMemory,
  clearCardError,
  selectMemories,
  selectMemoryLoading,
  selectMemoryError,
  selectCardErrors
} from './memorySlice';

/**
 * MemoryPanel component for managing user facts.
 * Rendered inline inside the Settings modal.
 */
function MemoryPanel() {
  const dispatch = useDispatch();
  const memories = useSelector(selectMemories);
  const loading = useSelector(selectMemoryLoading);
  const error = useSelector(selectMemoryError);
  const cardErrors = useSelector(selectCardErrors);

  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [deletingKey, setDeletingKey] = useState(null);

  // Fetch memories on mount
  useEffect(() => {
    dispatch(fetchMemories());
  }, [dispatch]);

  /* ===========================
     Handlers
     =========================== */

  const handleToggle = (key, enabled) => {
    dispatch(clearCardError({ key }));
    dispatch(toggleMemory({ key, enabled }));
  };

  const handleEdit = (key, newValue) => {
    dispatch(clearCardError({ key }));
    dispatch(editMemory({ key, newValue }))
      .then(() => {
        setEditingKey(null);
        setEditValue('');
      });
  };

  const handleDelete = (key) => {
    dispatch(clearCardError({ key }));
    dispatch(deleteMemory(key));
    setDeletingKey(null);
  };

  /**
   * Relative time formatting helper.
   */
  const formatRelativeTime = (dateString) => {
    const diff = Date.now() - new Date(dateString).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  /* ===========================
     Render Helpers
     =========================== */

  if (loading) {
    return (
      <div className="flex justify-center my-8">
        <div className="w-6 h-6 rounded-full border-2 border-theme-muted border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center my-4">
        <p className="text-sm text-red-400 mb-2">{error}</p>
        <button
          onClick={() => dispatch(fetchMemories())}
          className="text-xs text-theme-muted underline hover:text-theme-text"
        >
          Retry
        </button>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <p className="text-sm text-theme-muted text-center my-6">
        No memories stored yet.
      </p>
    );
  }

  // Categorization and sorting
  const categories = ['preference', 'trait', 'goal'];
  const groupedMemories = categories.map(cat => ({
    category: cat,
    items: memories
      .filter(m => m.category === cat)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  })).filter(group => group.items.length > 0);

  return (
    <div className="space-y-4">
      {groupedMemories.map(group => (
        <div key={group.category}>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-theme-muted mb-2 mt-4 first:mt-0">
            {group.category}
          </p>
          
          <div className="space-y-1">
            {group.items.map(memory => (
              <div key={memory.key} className="flex flex-col gap-1 py-2 border-b border-theme-secondary last:border-0">
                {/* Row A: Badge + Key + Paused Pill */}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    memory.category === 'preference'
                      ? 'bg-blue-500/20 text-blue-400'
                      : memory.category === 'trait'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {memory.category}
                  </span>
                  <span className="text-sm text-theme-text font-medium flex-1 truncate">
                    {memory.key}
                  </span>
                  {!memory.enabled && (
                    <span className="text-[10px] bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                      PAUSED
                    </span>
                  )}
                </div>

                {/* Row B: Value or Edit Input + Toggle + Edit Button */}
                <div className="flex items-center gap-2">
                  {editingKey === memory.key ? (
                    <>
                      <input
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        maxLength={50}
                        autoFocus
                        className="flex-1 bg-theme-dark border border-theme-secondary rounded px-2 py-0.5 text-sm text-theme-text outline-none focus:border-blue-500 min-w-0"
                      />
                      <span className={`text-[10px] shrink-0 ${editValue.length > 45 ? 'text-red-400' : 'text-theme-muted'}`}>
                        {editValue.length}/50
                      </span>
                      <button
                        onClick={() => handleEdit(memory.key, editValue.trim())}
                        disabled={
                          editValue.trim() === memory.value ||
                          editValue.trim().length < 2 ||
                          editValue.trim().length > 50
                        }
                        className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingKey(null);
                          setEditValue('');
                        }}
                        className="text-xs text-theme-muted shrink-0"
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-theme-muted flex-1 truncate">
                        {memory.value}
                      </span>
                      <button
                        onClick={() => {
                          setEditingKey(memory.key);
                          setEditValue(memory.value);
                        }}
                        className="text-xs text-theme-muted hover:text-theme-text shrink-0"
                      >
                        Edit
                      </button>
                      
                      {/* Toggle Switch */}
                      <button
                        role="switch"
                        aria-checked={memory.enabled}
                        onClick={() => handleToggle(memory.key, !memory.enabled)}
                        style={{
                          position: 'relative',
                          width: '32px',
                          height: '18px',
                          borderRadius: '999px',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          flexShrink: 0,
                          background: memory.enabled ? '#3B82F6' : '#4B5563',
                          transition: 'background 0.2s'
                        }}
                      >
                        <span style={{
                          position: 'absolute',
                          top: '2px',
                          left: memory.enabled ? 'calc(100% - 16px)' : '2px',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: 'white',
                          transition: 'left 0.2s'
                        }} />
                      </button>
                    </>
                  )}
                </div>

                {/* Row C: Timestamps + Delete */}
                <div className="flex items-center justify-between text-[11px] text-theme-muted mt-0.5">
                  <span className="truncate mr-2">
                    <span title={memory.createdAt}>
                      Created {formatRelativeTime(memory.createdAt)}
                    </span>
                    {memory.updatedAt !== memory.createdAt && (
                      <span title={memory.updatedAt}>
                        {' '}· Updated {formatRelativeTime(memory.updatedAt)}
                      </span>
                    )}
                  </span>
                  
                  <div className="shrink-0">
                    {deletingKey === memory.key ? (
                      <span className="flex items-center gap-1">
                        <span>Sure?</span>
                        <button
                          onClick={() => handleDelete(memory.key)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeletingKey(null)}
                          className="text-theme-muted ml-0.5"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setDeletingKey(memory.key)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Row D: Per-memory error */}
                {cardErrors[memory.key] && (
                  <p className="text-[11px] text-red-400 mt-0.5">
                    {cardErrors[memory.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default MemoryPanel;
