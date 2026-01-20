import { useState, useEffect } from 'react';

export const useChatSidebar = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setSidebarOpen(true);
            }
        };

        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const toggleSidebar = () => setSidebarOpen((v) => !v);

    return {
        sidebarOpen,
        setSidebarOpen,
        toggleSidebar
    };
};
