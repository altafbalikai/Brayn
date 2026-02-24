import React, { useRef, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FaAngleDown } from 'react-icons/fa';
import { BiCheck } from 'react-icons/bi';
import { getPersonaIcon } from '../../utils/personaIcons';
import { usePersona } from './usePersona';
import {
    switchPersonaThunk,
    setCurrentPersona,
} from './personaSlice';
import ModalPortal from "../../components/ui/ModalPortal";

export const PersonaSwitcher = ({ conversationId }) => {
    const dispatch = useDispatch();
    const { personas, currentPersona } = usePersona();
    
    // UI State
    const [isOpen, setIsOpen] = useState(false);
    const [menuPos, setMenuPos] = useState(null);
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const activeItemRef = useRef(null);
    const MENU_HEIGHT = 200; // Expected max height of the dropdown

    const handleOpen = (e) => {
        e.stopPropagation();
        if (isOpen) {
            setIsOpen(false);
            return;
        }

        const rect = buttonRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const openUpwards = spaceBelow < MENU_HEIGHT;

        setMenuPos({
            left: rect.left,
            top: openUpwards ? rect.top - 8 : rect.bottom + 6,
            placement: openUpwards ? "top" : "bottom",
        });

        setOpen(true);
    };

    // Close menu on outside click, resize, or scroll
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target)
            ) {
                setIsOpen(false);
            }
        };

        const handleResize = () => {
            setIsOpen(false);
        };

        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("resize", handleResize);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("resize", handleResize);
        };
    }, [isOpen]);

    // Auto scroll to active persona when menu opened
    useEffect(() => {
        if (isOpen && activeItemRef.current) {
            activeItemRef.current.scrollIntoView({
                block: "center",
                behavior: "instant",
            });
        }
    }, [isOpen]);

    const handleSwitch = (personaId) => {
        console.log("Clicked persona switch", personaId)
        
        if (!conversationId || conversationId === 'draft') {
            // Local switch for draft chats
            dispatch(setCurrentPersona(personaId));
        } else {
            // Backend switch for existing conversations
            dispatch(
                switchPersonaThunk({
                    conversationId,
                    personaId,
                })
            );
        }
        setIsOpen(false);
    };

    // Helper to set open state for clarify (matches model selector handleOpen)
    const setOpen = (val) => setIsOpen(val);

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                ref={buttonRef}
                type="button"
                onClick={handleOpen}
                // className={`
                //     flex items-center gap-2 px-3 py-1.5 rounded-lg
                //     border border-theme-accent hover:bg-theme-secondary
                //     text-sm text-theme-text transition-colors
                //     ${!conversationId || conversationId === 'draft' ? 'moving-border' : ''}
                // `}

                // ${
                //         (!conversationId || conversationId === 'draft') && !isOpen
                //         ? "moving-border" 
                //         : "rounded-lg border border-theme-accent hover:bg-theme-secondary"
                //     }
                className={`
                    rounded-lg border border-theme-dark hover:bg-theme-secondary
                    flex items-center gap-1
                    px-2 py-1
                    text-sm
                    text-theme-text
                    `}
                title={currentPersona?.name}
            >
                {(() => {
                    const Icon = getPersonaIcon(currentPersona?.slug);
                    return <Icon className="w-5 h-5 text-theme-text" />;
                })()}
                <span className="hidden lg:inline truncate max-w-[120px]">
                    {currentPersona?.name || 'Assign Identity'}
                </span>
                <span className="pt-0.5">
                    <FaAngleDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </span>
            </button>

            {/* Dropdown Menu */}
            {isOpen && menuPos && (
                <ModalPortal>
                    <div
                        ref={dropdownRef}
                        className="
                            fixed z-[1000]
                            w-56 max-h-64
                            rounded-lg
                            bg-theme-contextMenu
                            border border-theme-secondary
                            shadow-lg
                            text-[14px]
                            overflow-y-auto
                            p-1 custom-scrollbar
                        "
                        style={{
                            top: menuPos.top,
                            left: menuPos.left,
                            transform:
                                menuPos.placement === "top"
                                    ? "translateY(-100%)"
                                    : "translateY(0)",
                        }}
                    >
                        {personas.length === 0 && (
                            <div className="px-3 py-4 text-center text-xs text-theme-muted italic">
                                No personas loaded
                            </div>
                        )}
                        {personas.map((persona) => {
                            const isActive = currentPersona?.id === persona.id;
                            const Icon = getPersonaIcon(persona.slug);
                            
                            return (
                                <button
                                    key={persona.id}
                                    ref={isActive ? activeItemRef : null}
                                    onClick={() => handleSwitch(persona.id)}
                                    className={`
                                        w-full text-left px-2 py-2 flex items-start gap-2.5
                                        transition-colors rounded-md mb-0.5 last:mb-0
                                        ${
                                            isActive
                                                ? 'bg-theme-secondary moving-border text-theme-text'
                                                : 'text-theme-textaccent hover:bg-theme-light'
                                        }
                                    `}
                                >
                                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-theme-muted' : 'text-theme-muted'}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[13px] font-semibold truncate leading-tight">
                                            {persona.name}
                                        </div>
                                        <div className="text-[11px] text-theme-muted line-clamp-1 mt-0.5">
                                            {persona.description}
                                        </div>
                                    </div>
                                    {isActive && (
                                        <BiCheck className="w-4 h-4 text-theme-accent flex-shrink-0 mt-0.5" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </ModalPortal>
            )}
        </div>
    );
};
