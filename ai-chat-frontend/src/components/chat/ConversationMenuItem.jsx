import { CiEdit } from "react-icons/ci";
import { MdOutlineDelete } from "react-icons/md";

function ConversationMenuItem({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-2
        flex items-center gap-1
        hover:bg-theme-light
        transition
        ${danger ? "text-red-400 hover:bg-red-500/10" : "text-theme-text"}
      `}
    >
      {children === "Rename" ? (
        <CiEdit size={18} />
      ) : (
        <MdOutlineDelete size={18} />
      )}{" "}
      {children}
    </button>
  );
}

export default ConversationMenuItem;
