// Opt-in aggregate timings contain no user identifiers, URLs, bodies or tokens.
const timings = new Map();
export function profile(name, milliseconds) {
  if (!process.env.PROFILE_DB) return;
  const values = timings.get(name) || [];
  if (values.length < 100000) values.push(milliseconds);
  timings.set(name, values);
}
export function printProfile() {
  for (const [name, values] of timings) {
    values.sort((a, b) => a - b);
    console.error('Stage profile', name, {
      count: values.length,
      p50Ms: values[Math.ceil(values.length * 0.5) - 1],
      p95Ms: values[Math.ceil(values.length * 0.95) - 1],
    });
  }
}
