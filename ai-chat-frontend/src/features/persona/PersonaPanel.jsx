import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPersonas,
    selectPersonas,
    selectCurrentPersona,
    selectPersonaLoading,
    selectPersonaError,
    switchPersonaThunk,
    setCurrentPersona,
    clearError,
} from './personaSlice';
import { getPersonaIcon } from '../../utils/personaIcons';

export const PersonaPanel = ({ conversationId }) => {
    const dispatch = useDispatch();
    const personas = useSelector(selectPersonas);
    const currentPersona = useSelector(selectCurrentPersona);
    const loading = useSelector(selectPersonaLoading);
    const error = useSelector(selectPersonaError);

    // Fetch personas on mount
    useEffect(() => {
        if (personas.length === 0) {
            dispatch(fetchPersonas());
        }
    }, [dispatch, personas.length]);

    const handlePersonaSelect = (personaId) => {
        // console.log('🔵 handlePersonaSelect called:', { conversationId, personaId });
        
        if (!conversationId || conversationId === 'draft') {
            // console.log('✅ Local persona switch (Draft/New Chat)');
            dispatch(setCurrentPersona(personaId));
        } else {
            // console.log('✅ Dispatching switchPersonaThunk for:', conversationId);
            dispatch(
                switchPersonaThunk({
                    conversationId,
                    personaId,
                })
            );
        }
    };

    return (
        <div className="space-y-4 px-4 py-3">
            {/* Header */}
            <div>
                <h2 className="text-base font-semibold text-theme-text">
                    Personas
                </h2>
                <p className="text-xs text-theme-muted mt-1">
                    Choose how Brayn AI responds in the conversation
                </p>
            </div>

            {/* Error State */}
            {error && (
                <div className="bg-red-900/20 border border-red-700 rounded p-3">
                    <p className="text-xs text-red-400">{error}</p>
                    <button
                        onClick={() => dispatch(clearError())}
                        className="text-[11px] text-red-300 hover:text-red-200 mt-2 transition"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Current Active Persona */}
            {currentPersona && (
                <div className="bg-theme-secondary border border-theme-secondary rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                        {/* Icon */}
                        {(() => {
                            const IconComponent = getPersonaIcon(currentPersona.slug);
                            return IconComponent ? (
                                <IconComponent className="w-5 h-5 text-theme-muted" />
                            ) : null;
                        })()}
                        
                        {/* Label */}
                        <p className="text-[11px] font-semibold text-theme-muted uppercase tracking-widest">
                            Currently Active
                        </p>
                    </div>
                    
                    <h3 className="text-sm font-semibold text-theme-text">
                        {currentPersona.name}
                    </h3>
                    
                    <p className="text-xs text-theme-muted mt-2 line-clamp-2">
                        {currentPersona.detailedDescription}
                    </p>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin">
                        <div className="w-5 h-5 border-2 border-theme-accent border-t-transparent rounded-full" />
                    </div>
                    <span className="text-xs text-theme-muted ml-3">
                        Loading personas...
                    </span>
                </div>
            )}

            {/* Personas List */}
            {!loading && (
                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                    {personas.map((persona) => {
                        const isActive = persona.id === currentPersona?.id;
                        const IconComponent = getPersonaIcon(persona.slug);
                        
                        return (
                            <button
                                key={persona.id}
                                onClick={() => handlePersonaSelect(persona.id)}
                                className={`
                                    w-full text-left rounded-lg px-3 py-2.5 transition-all
                                    flex items-start gap-3 group
                                    text-theme-textaccent hover:bg-theme-light
                                `}
                            >
                                {/* Icon */}
                                {IconComponent && (
                                    <IconComponent className={`w-5 h-5 flex-shrink-0 mt-0.5 transition-colors text-theme-muted`} />
                                )}
                                
                                {/* Text Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-theme-text">
                                        {persona.name}
                                    </div>
                                    <div className="text-[12px] text-theme-muted line-clamp-2 mt-1">
                                        {persona.description}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Footer */}
            {!loading && (
                <div className="text-[11px] text-theme-muted pt-2 border-t border-theme-secondary">
                    {personas.length} personas available
                </div>
            )}
        </div>
    );
};
