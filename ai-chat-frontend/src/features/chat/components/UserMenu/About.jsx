import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import ModalPortal from "../../../../components/ui/ModalPortal";
import { FaGithub, FaLinkedin } from "react-icons/fa";

function About({ onClose }) {
  return (
    <ModalPortal>
      <div
        className="
      fixed inset-0 z-50
      grid place-items-center
      p-4 sm:p-6
    "
      >
        {/* Overlay */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div
          className="
                relative
                z-10
                w-full max-w-md
                rounded-2xl
                bg-theme-light
                backdrop-blur-xl
                border border-theme-light
                shadow-[0_20px_60px_rgba(0,0,0,0.45)]
                overflow-hidden
            "
        >
          {/* Glow ring */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl" />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-theme-secondary">
            <h2 className="text-lg font-semibold text-theme-text">
              About Brayn AI
            </h2>
            <button
              onClick={onClose}
              className="text-theme-muted hover:text-theme-text transition"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          {/* <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-theme-text">
            This is about section
          </div> */}

          <div className="p-5 sm:p-6 space-y-8 max-h-[70vh] overflow-y-auto text-theme-text text-sm leading-relaxed">
            {/* Intro */}
            <section className="space-y-2">
              <p className="text-theme-muted">
                Brayn AI is a personal AI workspace for fast, focused, and
                meaningful conversations with language models.
              </p>
              <p className="text-theme-muted">
                Built for developers and learners who value clarity, control,
                and performance.
              </p>
            </section>

            {/* Principles */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold text-theme-textaccent uppercase tracking-wide">
                What Brayn AI focuses on
              </h3>

              <ul className="space-y-2 text-theme-muted">
                <li>
                  <span className="text-theme-text">Focus over noise</span> — a
                  clean, distraction-free interface.
                </li>
                <li>
                  <span className="text-theme-text">
                    Context-aware conversations
                  </span>{" "}
                  — sessions evolve, not reset.
                </li>
                <li>
                  <span className="text-theme-text">User control</span> —
                  flexibility in models and experience.
                </li>
              </ul>
            </section>

            {/* Builder */}
            <section className="space-y-4">
              <h3 className="text-xs font-semibold text-theme-textaccent uppercase tracking-wide">
                Designed & Developed by
              </h3>

              <div className="space-y-1">
                <p className="font-medium text-base">Altafhusen Balikai</p>
                <p className="text-theme-muted text-xs">
                  Software Engineer · Tech Mahindra
                </p>
              </div>

              <p className="text-theme-muted">
                This project reflects my interest in building scalable
                applications and exploring AI systems, frontend architecture,
                and performance-focused design.
              </p>

              {/* Social links */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href="https://github.com/altafbalikai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-theme-textaccent hover:text-white transition-colors"
                >
                  <FaGithub size={16} />
                  <span className="text-xs">GitHub</span>
                </a>

                <a
                  href="https://www.linkedin.com/in/altafhusen-balikai-b9517a327/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-theme-textaccent hover:text-[#0A66C2] transition-colors"
                >
                  <FaLinkedin size={16} />
                  <span className="text-xs">LinkedIn</span>
                </a>
              </div>
            </section>

            {/* Vision */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-theme-textaccent uppercase tracking-wide">
                Vision
              </h3>
              <p className="text-theme-muted">
                Brayn AI is an evolving project with a long-term goal of
                becoming a flexible AI companion that adapts to different
                workflows while respecting user control and privacy.
              </p>
            </section>

            {/* Footer */}
            <section className="pt-3 border-t border-theme-secondary text-[11px] text-theme-muted">
              <p>
                Independent project · Built for learning, experimentation, and
                productivity.
              </p>
            </section>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default React.memo(About);
