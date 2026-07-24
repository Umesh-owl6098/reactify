import { jsx as _jsx } from "react/jsx-runtime";
export function Button({ children, variant = "primary", className = "", ...props }) {
    const base = "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
    const variants = {
        primary: "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600",
        secondary: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 focus-visible:outline-slate-400",
    };
    return (_jsx("button", { type: "button", className: `${base} ${variants[variant]} ${className}`, ...props, children: children }));
}
//# sourceMappingURL=Button.js.map