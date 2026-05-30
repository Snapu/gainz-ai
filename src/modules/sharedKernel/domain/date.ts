const localeDateOptions: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "numeric",
  day: "numeric",
};

export const localeDateString = (date: Date): string =>
  date.toLocaleDateString(undefined, localeDateOptions);

export const isoDateString = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 10);
  return localISOTime;
};
