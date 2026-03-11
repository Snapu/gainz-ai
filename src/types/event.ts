import { z } from "zod";

export const EventSchema = z.object({
  id: z.string(),
  type: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

export type Event = z.infer<typeof EventSchema>;

export const EVENT_PRESETS = ["Sickness", "Injury", "Fasting", "Rest Day"];
