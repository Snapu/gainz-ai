# Design Tokens - Gainz AI

## Border Radius (use exactly these 3)
- `rounded-lg` — small interactive elements (calendar nav, input spinners, toaster buttons)
- `rounded-xl` — standard components (cards, buttons, toggles, modals, inputs)
- `rounded-full` — circles only (icon buttons, badges, radial progress)

❌ DO NOT: `rounded-md`, `rounded-2xl`, `rounded-3xl`

## Transition Duration (use exactly these 2)
- `duration-200` — fast feedback (hovers, quick interactions)
- `duration-300` — standard animations (overlays, layout shifts)

❌ DO NOT: `duration-100`, `duration-500`, `duration-700`, `duration-1000`

## Hover Tint Scale (3 tiers)
- `hover:bg-white/5` — subtle (list items, passive)
- `hover:bg-white/10` — medium (form elements, calendar, icons)
- `hover:bg-white/15` — bold (only if needed for emphasis)

❌ DO NOT: `/[0.04]`, `/7`, `/12`, `/20`

## Active Press Scale (canonical only)
- `active:scale-95` — all interactive elements
- `active:bg-white/15` — background intensification

❌ DO NOT: `active:scale-90`, `active:scale-[0.98]`, `active:scale-110`

## Focus States (standard pattern)
```
focus-visible:outline-none 
focus-visible:ring-2 
focus-visible:ring-primary 
focus-visible:ring-offset-2 
focus-visible:ring-offset-background
```

❌ DO NOT: `focus:outline`, `focus-visible:border`, non-standard ring sizes

## Icon Buttons (use this token)
```
uiIconButtonClass: "rounded-full p-2.5 bg-white/5 hover:bg-white/10 transition-colors 
focus:outline-none focus:ring-2 focus:ring-primary active:scale-95"
```

## Selection Components (use UiToggleGroup with default variant)
- Wizard (profile setup) → `UiToggleGroup` + `UiToggleGroupItem` (default variant)
- Runtime selections → same as above (matching visual hierarchy)

❌ DO NOT: Create custom selection components
❌ DO NOT: Mix `ClickableList` + `UiToggleGroup` for similar purposes

## Disabled State (apply all three together)
```
disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed
```

## Spacing Scale
Use Tailwind's standard scale only:
- Gaps: `gap-2`, `gap-3`, `gap-4`, `gap-5`, `gap-6` (in 0.5rem steps)
- Padding: `px-4 py-3` or `px-5 py-4` (standard sizes, avoid `px-6 py-2`)
- Margins: `mb-3`, `mb-4`, `mt-2` (consistent with gap scale)

❌ DO NOT: `gap-1.5`, `px-2 py-6`, `mb-5`, `mt-7`

## Shadow Scale
- `shadow-sm` — subtle (cards, overlays)
- `shadow-lg` — prominent (modals, dropdowns, highlights)

❌ DO NOT: `shadow-md`, `shadow-none` (inline), custom shadows

---

**When in doubt:** Copy the styling from the most similar existing component.

## Focus States (canonical pattern only)
All interactive elements must use this exact pattern:
```
focus-visible:outline-none 
focus-visible:ring-2 
focus-visible:ring-primary
```

❌ DO NOT: `focus:outline`, `focus:ring`, `focus-within:`, non-standard ring sizes, `focus-visible:border`

## Typography - Text Sizes (use exactly these 5)
- `text-xs` — small labels, captions, granular info (replaces text-[9px], text-[10px])
- `text-sm` — standard labels, buttons (replaces text-[11px], text-[12px])
- `text-base` — body text
- `text-lg` — section headers, prominent text
- `text-xl` — page titles

❌ DO NOT: `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`, custom pixel sizes

## Shadows - Use Only These 2
- `shadow-sm` — subtle depth (cards, light elevation)
- `shadow-lg` — prominent depth (modals, floating panels, emphasis)

❌ DO NOT: `shadow-md`, `shadow-primary`, `shadow-destructive`, custom/colored shadows, `shadow-inner`

## Font Weight Scale (canonical)
Use this exact hierarchy:
- `font-medium` — helper text, supporting labels, metadata
- `font-semibold` — controls, chips, form labels
- `font-bold` — section titles, key values, emphasis
- `font-black` — hero/brand moments only (very rare)

Rules:
- Do not use `font-normal` in app UI components
- Do not use `font-black` for standard labels or body copy
- Prefer `font-bold` over `font-black` for most headings
