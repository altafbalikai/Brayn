import { useSelector, useDispatch } from "react-redux";
import {
  selectUseWebSearch,
  setUseWebSearch,
} from "../conversations/conversationSlice";
import { SlGlobe } from "react-icons/sl";
import { HiCheck } from "react-icons/hi";
/**
 * WebSearchToggle
 * Icon button that toggles web search on/off for the active session.
 * State lives in Redux — resets to false on page reload by design.
 */
export default function WebSearchToggle() {
  const dispatch = useDispatch();
  const useWebSearch = useSelector(selectUseWebSearch);
  const activeStyles = useWebSearch
    ? {
        backgroundColor:
          "color-mix(in srgb, var(--theme-focus-ring) 10%, transparent)",
        boxShadow:
          "inset 0 0 0 1px color-mix(in srgb, var(--theme-focus-ring) 40%, transparent)",
      }
    : undefined;

  return (
    <button
      type="button"
      aria-label="Toggle web search"
      aria-pressed={useWebSearch}
      title={
        useWebSearch
          ? "Web search enabled (model decides when to use it)"
          : "Web search disabled"
      }
      onClick={() => dispatch(setUseWebSearch(!useWebSearch))}
      style={activeStyles}
      className={[
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-theme-text transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]/40",
        useWebSearch
          ? "text-[var(--theme-focus-ring)]"
          : "text-theme-muted hover:bg-theme-light hover:text-theme-text",
      ].join(" ")}
    >
      <SlGlobe
        size={16}
        aria-hidden="true"
        className={[
          "transition-all duration-150",
          useWebSearch ? "scale-110" : "scale-100",
        ].join(" ")}
      />
      <span className="flex-1 leading-none">Web search</span>
      <span
        className={[
          useWebSearch ? "scale-100 opacity-100" : "scale-75 opacity-0",
        ].join(" ")}
      >
        <HiCheck
          size={14}
          aria-hidden="true"
          className="transition-colors duration-150 ml-auto"
        />
      </span>
    </button>
  );
}
