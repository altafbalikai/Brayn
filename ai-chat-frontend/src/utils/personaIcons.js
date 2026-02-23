import {
    FaRobot,
    FaScaleBalanced,
    FaFeather,
    FaHeart,
    FaCode,
    FaBriefcase,
    FaMicroscope,
    FaTerminal, // REPLACEMENT for missing FaSnake
} from 'react-icons/fa6';

/**
 * Mapping of persona slugs to React Icons
 * All icons verified to exist in react-icons/fa6
 */
export const PERSONA_ICONS = {
    'general-assistant': FaRobot,
    'legal-expert': FaScaleBalanced,
    'creative-writer': FaFeather,
    'empathetic-counselor': FaHeart,
    'technical-architect': FaCode,
    'business-consultant': FaBriefcase,
    'science-educator': FaMicroscope,
    'python-specialist': FaTerminal, // Verified alternative for FaSnake
};

/**
 * Helper to get the correct icon component for a persona slug
 * @param {string} slug - The persona slug
 * @returns {React.ComponentType} The icon component
 */
export const getPersonaIcon = (slug) => {
    return PERSONA_ICONS[slug] || FaRobot;
};
