import { cva } from "class-variance-authority";

// ─── Press / Interaction ────────────────────────────────────────────────────
export const uiPressClass = "active:scale-95";

// ─── Icon Button (close / action / toolbar) ─────────────────────────────────
export const uiIconButtonClass =
  "rounded-full cursor-pointer p-2.5 bg-white/5 hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95";

// ─── Chevron Circle (card action indicator) ──────────────────────────────────
export const uiChevronCircleClass =
  "flex items-center justify-center shrink-0 w-8 h-8 rounded-full bg-muted/50 text-muted-foreground transition-colors duration-200";
export const uiChevronCircleHoverClass = "group-hover:bg-primary/10 group-hover:text-primary";

// ─── Field (Input / Textarea / NumberField / Autocomplete) ──────────────────
export const uiFieldClass =
  "flex w-full rounded-xl border border-input/50 bg-white/5 px-4 py-3 text-base font-medium shadow-sm backdrop-blur-md ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200";

export const uiFieldErrorClass = "border-destructive focus-visible:ring-destructive";

// ─── Selectable list row ─────────────────────────────────────────────────────
export const uiSelectableItemClass =
  "flex w-full cursor-pointer flex-col rounded-xl px-4 py-3 text-left transition-all duration-200 hover:bg-white/[0.05] active:bg-white/[0.08] active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-primary";

// ─── Badge ───────────────────────────────────────────────────────────────────
export const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
        outline: "border border-border text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:text-secondary-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// ─── Dropdown menu item ───────────────────────────────────────────────────────
export const dropdownMenuItemVariants = cva(
  "relative flex cursor-pointer select-none items-center rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  {
    variants: {
      inset: {
        true: "pl-8",
        false: "",
      },
      focus: {
        true: "focus:bg-white/10 focus:text-accent-foreground",
        false: "",
      },
    },
    defaultVariants: {
      inset: false,
      focus: true,
    },
  },
);
