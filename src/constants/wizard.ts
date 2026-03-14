export const WIZARD_STEPS = [
  { id: "goal", title: "Fitness Goal" },
  { id: "level", title: "Fitness Level" },
  { id: "days", title: "Workout Days" },
  { id: "location", title: "Workout Location" },
  { id: "equipment", title: "Equipment" },
  { id: "stats", title: "Body Stats" },
  { id: "extra", title: "Additional Info" },
  { id: "apikey", title: "AI Coach Settings" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];
