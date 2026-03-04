import React from "react";

const SpiningLoader = () => {
    return (
        <div className="flex justify-center items-center">
            <span className="w-6 h-6 inline-block border-[3px] border-dotted border-theme-muted rounded-full animate-[spin_2s_linear_infinite]" />
        </div>
    )
}

export default SpiningLoader;   