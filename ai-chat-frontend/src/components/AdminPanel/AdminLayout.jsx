import { useState } from "react";
import { Outlet } from "react-router-dom";
import { TbLayoutSidebarLeftExpand } from "react-icons/tb";
import AdminSidebar from "./AdminSidebar";

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleSidebarItem = () => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      {!sidebarOpen && (
        <button
          className="
            fixed top-3 left-3 z-[60]
            p-2 rounded-md
            bg-transparent
            text-theme-text
            hover:bg-theme-light
          "
          onClick={() => setSidebarOpen(true)}
          aria-label="Open admin sidebar"
        >
          <TbLayoutSidebarLeftExpand size={22} />
        </button>
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-64
          bg-theme-dark border-r border-theme-secondary
          transform transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <AdminSidebar
          onClose={() => setSidebarOpen(false)}
          onSelect={handleSidebarItem}
        />
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main
        className={`
          min-h-screen bg-theme-appbg text-theme-text
          transition-all duration-300
          ${sidebarOpen ? "md:ml-64" : ""}
        `}
      >
        <Outlet />
      </main>
    </>
  );
}
