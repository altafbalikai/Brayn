import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FaAngleDown } from "react-icons/fa";
import ModalPortal from "../ui/ModalPortal";
import {
  getLLMModel,
  setSelectedModelId,
} from "../../features/LLM-Models/llm-modelsSlice";
import { updateConversationModel } from "../../features/conversations/conversationSlice";

function Conversationllmmodelselector({
  llmmodels,
  selectedModelId,
  llmsloading,
}) {
  const dispatch = useDispatch();

  const currentConversation = useSelector(
    (state) => state.conversation.currentConversation
  );

  const isStreaming = useSelector(
    (state) =>
      currentConversation &&
      state.conversation.assistantTyping[currentConversation._id]
  );

  const activeModelId = currentConversation?.selectedModelId ?? selectedModelId;

  const selectedModel = llmmodels.find((m) => m._id === activeModelId);

  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const MENU_HEIGHT = 180;

  const handleOpen = (e) => {
    e.stopPropagation();
    if (isStreaming) return;

    if (open) {
      setOpen(false);
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
    if (!open) return;

    const handleClickOutside = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    const handleResize = () => {
      setOpen(false);
    };

    const handleScroll = () => {
      setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleResize);
    // window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleResize);
      // window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  // Show loading state
  if (llmsloading || !selectedModel) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 text-sm text-theme-text">
        <span className="truncate text-xs">Loading...</span>
      </div>
    );
  }

  const handleSelect = (modelId) => {
    if (isStreaming) return;

    // 🟡 Draft or no conversation → global model
    if (!currentConversation || currentConversation.isDraft) {
      dispatch(setSelectedModelId(modelId));
    }
    // 🔵 Existing conversation → update conversation model
    else {
      dispatch(
        updateConversationModel({
          conversationId: currentConversation._id,
          modelId,
        })
      );
    }

    setOpen(false);
  };

  return (
    <div className="relative">
      {/* Selected model button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="
          flex items-center gap-1
          px-2 py-1
          text-sm
          text-theme-text
          hover:bg-theme-secondary
          rounded-lg
          border border-theme-accent
        "
      >
        <span className="truncate max-w-[160px]">
          {selectedModel.displayName}
        </span>
        <span className="pt-1">
          <FaAngleDown size={14} />
        </span>
      </button>

      {/* Dropdown menu */}
      {open && menuPos && (
        <ModalPortal>
          <div
            ref={menuRef}
            className="
              fixed z-[1000]
              w-56 h-60
              rounded-lg
              bg-theme-dark
              border border-theme-secondary
              shadow-lg
              text-[14px]
              overflow-y-auto
              p-2
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
            {llmmodels.map((model) => {
              const isActive = model._id === selectedModel._id;

              return (
                <button
                  key={model._id}
                  type="button"
                  onClick={() => handleSelect(model._id)}
                  className={`
                    w-full text-[14px] 
                    text-left 
                    rounded-lg 
                    text-theme-textaccent 
                    px-2 py-2
                    ${isActive ? "bg-theme-secondary" : "hover:bg-theme-light"}
                  `}
                >
                  <span className="leading-snug"> {model.displayName} </span>
                  <div className="text-[12px] md:text-[12px] leading-tight text-left text-theme-muted">
                    {model.description}
                  </div>
                </button>
              );
            })}
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

export default Conversationllmmodelselector;
