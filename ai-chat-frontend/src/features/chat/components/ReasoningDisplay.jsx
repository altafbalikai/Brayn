/**
 * @typedef {Object} ReasoningDisplayProps
 * @property {string} reasoning - The accumulated reasoning text so far.
 * @property {boolean} isReasoning - True while the reasoning stream is active, false when done.
 * @property {number | null} reasoningDoneAt - Date.now() timestamp when reasoning was marked as done.
 * @property {number | null} startedAt - Date.now() timestamp when the request started.
 * @property {number | null} [reasoningDurationSeconds] - Persisted duration from the database.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa6';

/**
 * ReasoningDisplay - Component for displaying LLM's chain-of-thought reasoning trace.
 * Separates the thought process from the final assistant response with explicit
 * styling and interactive collapse/expand functionality.
 * 
 * @param {ReasoningDisplayProps} props
 */
const ReasoningDisplay = ({ reasoning, isReasoning, reasoningDoneAt, startedAt, reasoningDurationSeconds }) => {
    const [collapsed, setCollapsed] = useState(true);
    const scrollContainerRef = useRef(null);
    const collapseTimerRef = useRef(null);

    // Calculate elapsed time when reasoning is done
    const durationSeconds = useMemo(() => {
        // Prefer persisted value (survives page refresh)
        if (reasoningDurationSeconds != null) return reasoningDurationSeconds;
        // Fall back to live calculation during active stream
        if (!reasoningDoneAt || !startedAt) return null;
        return Math.max(1, Math.round((reasoningDoneAt - startedAt) / 1000));
    }, [reasoningDurationSeconds, reasoningDoneAt, startedAt]);

    // Handle auto-scroll while streaming
    useEffect(() => {
        if (isReasoning && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            container.scrollTop = container.scrollHeight;
        }
    }, [reasoning, isReasoning]);

    // Handle auto-collapse after reasoning is done
    useEffect(() => {
        if (!isReasoning && reasoningDoneAt) {
            // Cancel any existing timer
            if (collapseTimerRef.current) {
                clearTimeout(collapseTimerRef.current);
            }

            // Start 3-second timer to auto-collapse
            collapseTimerRef.current = setTimeout(() => {
                setCollapsed(true);
            }, 3000);
        }

        return () => {
            if (collapseTimerRef.current) {
                clearTimeout(collapseTimerRef.current);
            }
        };
    }, [isReasoning, reasoningDoneAt]);

    // Manual toggle logic
    const toggleCollapse = () => {
        // Clear timer if user manually interacts
        if (collapseTimerRef.current) {
            clearTimeout(collapseTimerRef.current);
            collapseTimerRef.current = null;
        }
        setCollapsed(!collapsed);
    };

    // Render nothing if empty and not streaming
    if (!reasoning && !isReasoning) return null;

    return (
        <div className="bg-theme-light/30 dark:bg-theme-light/10 rounded-md py-1 my-1 transition-all">
            {/* Header section */}
            <div 
                className="flex items-center gap-2 cursor-pointer group"
                onClick={toggleCollapse}
            >
                <div className="flex items-center gap-2 mx-1">
                    {isReasoning ? (
                        <div className="flex items-center gap-2 text-theme-textaccent font-medium text-xs">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-theme-textaccent opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-theme-textaccent"></span>
                            </span>
                            <span className="animate-pulse">Thinking...</span>
                        </div>
                    ) : (
                        <div className="text-theme-muted font-medium text-xs">
                            {durationSeconds !== null ? `Thought for ${durationSeconds}s` : 'Thought'}
                        </div>
                    )}
                </div>
                
                <div className="text-theme-muted group-hover:text-theme-text p-1 rounded-md transition-colors">
                    {collapsed ? <FaChevronDown size={10} /> : <FaChevronUp size={10} />}
                </div>
            </div>

            {/* Reasoning content */}
            {!collapsed && (
                <div 
                    ref={scrollContainerRef}
                    className="mt-2 max-h-64 overflow-y-auto pr-2 no-scrollbar"
                >
                    <div className="prose prose-sm max-w-none dark:prose-invert text-theme-muted font-mono leading-relaxed text-xs">
                        <ReactMarkdown
                            components={{
                                p: ({ children }) => <p className="text-xs mb-2">{children}</p>,
                                ul: ({ children }) => <ul className="text-xs mb-2 list-disc pl-4">{children}</ul>,
                                ol: ({ children }) => <ol className="text-xs mb-2 list-decimal pl-4">{children}</ol>,
                                li: ({ children }) => <li className="text-xs mb-1">{children}</li>,
                            }}
                        >
                            {reasoning}
                        </ReactMarkdown>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReasoningDisplay;
