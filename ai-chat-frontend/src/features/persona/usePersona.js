import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    fetchPersonas,
    selectPersonas,
    selectCurrentPersona,
} from './personaSlice';

/**
 * Custom hook to manage persona state and actions
 * Mirrors the pattern of other hooks like useChatMessages
 */
export const usePersona = () => {
    const dispatch = useDispatch();
    const personas = useSelector(selectPersonas);
    const currentPersona = useSelector(selectCurrentPersona);

    // Fetch personas on first load
    useEffect(() => {
        if (personas.length === 0) {
            dispatch(fetchPersonas());
        }
    }, [dispatch, personas.length]);

    return {
        personas,
        currentPersona,
    };
};
