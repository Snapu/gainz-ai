import { cva } from "class-variance-authority";

// ─── Press / Interaction ────────────────────────────────────────────────────
export const uiPressClass = "active:scale-[0.96]";

// ─── Field (Input / Textarea / NumberField / Autocomplete) ──────────────────
export const uiFieldClass =
  "flex w-full rounded-2xl border border-input/50 bg-white/5 px-4 py-3 text-base font-medium shadow-inner backdrop-blur-md ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200";

export const uiFieldErrorClass = "border-destructive focus-visible:ring-destructive";

// ─── Selectable list row ─────────────────────────────────────────────────────
export const uiSelectableItemClass =
  "flex w-full cursor-pointer flex-col px-4 py-3 text-left transition-all duration-200 hover:bg-white/[0.05] active:bg-white/[0.08] active:scale-[0.96]";

// ─── Badge ───────────────────────────────────────────────────────────────────
export const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-border text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
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
  "relative flex cursor-default select-none items-center rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
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
