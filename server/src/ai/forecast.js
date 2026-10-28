// Exponential smoothing plus weekday seasonality; no network or model is needed.
import { z } from 'zod';
const rowSchema = z.object({
  date: z.coerce.date(),
  quantityPosted: z.number().nonnegative(),
  quantityClaimed: z.number().nonnegative().default(0),
});
export function forecast(
  history,
  { start = new Date(), days = 7, alpha = 0.3, categoryAverage = 0 } = {},
) {
  const rows = z
    .array(rowSchema)
    .parse(history)
    .sort((a, b) => a.date - b.date);
  z.number().int().min(1).max(30).parse(days);
  z.number().min(0.01).max(1).parse(alpha);
  z.number().nonnegative().parse(categoryAverage);
  const uniqueDays = new Set(
    rows.map((r) => r.date.toISOString().slice(0, 10)),
  );
  const coldStart = uniqueDays.size < 14;
  let level = rows[0]?.quantityPosted || categoryAverage;
  const weekdays = Array.from({ length: 7 }, () => []);
  for (const row of rows) {
    level = alpha * row.quantityPosted + (1 - alpha) * level;
    weekdays[row.date.getUTCDay()].push(row.quantityPosted);
  }
  const mean = rows.length
    ? rows.reduce((sum, r) => sum + r.quantityPosted, 0) / rows.length
    : categoryAverage;
  const values = Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    const bucket = weekdays[date.getUTCDay()];
    const ratio =
      mean > 0 && bucket.length
        ? bucket.reduce((s, n) => s + n, 0) / bucket.length / mean
        : 1;
    const predicted = coldStart ? categoryAverage : level * ratio;
    return {
      date: date.toISOString().slice(0, 10),
      quantity: Math.round(Math.max(0, predicted) * 100) / 100,
    };
  });
  return {
    coldStart,
    method: coldStart
      ? 'similar-category-average'
      : 'exponential-smoothing-weekday',
    days: values,
  };
}
export function demandForecast(history, options = {}) {
  return forecast(
    history.map((row) => ({
      ...row,
      quantityPosted: row.quantityClaimed || 0,
    })),
    options,
  );
}
