import React from 'react';
import { BiCheck } from 'react-icons/bi';
import { getPersonaIcon } from '../../utils/personaIcons';

export const PersonaCard = ({
    persona,
    isActive,
    onSelect,
    isLoading,
}) => {
    return (
        <button
            onClick={() => !isLoading && onSelect(persona.id)}
            disabled={isLoading}
            className={`
                relative flex flex-col gap-3 p-4 rounded-lg border transition-all
                ${isActive
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-gray-700 bg-gray-900/50 hover:bg-gray-900/70 hover:border-gray-600'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
            `}
        >
            {/* Icon */}
            <div className={`w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center overflow-hidden ${isActive ? 'text-indigo-400' : 'text-gray-400'}`}>
                {(() => {
                    const Icon = getPersonaIcon(persona.slug);
                    return <Icon className="w-8 h-8" />;
                })()}
            </div>

            {/* Content */}
            <div className="text-left">
                <h4 className="text-sm font-semibold text-white">
                    {persona.name}
                </h4>
                <p className="text-xs text-gray-400 line-clamp-2 mt-1">
                    {persona.description}
                </p>
                <span className="inline-block text-xs text-gray-500 capitalize mt-2">
                    {persona.category}
                </span>
            </div>

            {/* Active Badge */}
            {isActive && (
                <div className="absolute top-2 right-2 bg-green-600 text-white rounded-full p-1">
                    <BiCheck className="w-4 h-4" />
                </div>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
                    <div className="animate-spin">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
                    </div>
                </div>
            )}
        </button>
    );
};
