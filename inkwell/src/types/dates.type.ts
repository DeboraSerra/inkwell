import type { DatePrecision } from "@/generated/prisma/enums";

export type PartialDate = { date: Date; precision: DatePrecision };

export type ReadDates = { started?: PartialDate; ended?: PartialDate };

export type DatePart = "day" | "month" | "year";

export type DateParts = Partial<Record<DatePart, string>>;
