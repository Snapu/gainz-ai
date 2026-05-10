const localeDateOptions: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "numeric",
  day: "numeric",
};

export const localeDateString = (date: Date): string =>
  date.toLocaleDateString(undefined, localeDateOptions);
