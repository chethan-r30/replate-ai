// Consistent async and empty states for every data-driven page.
export function Status({ query, children }) {
  if (query.isPending)
    return (
      <p role="status" className="py-10">
        Loading...
      </p>
    );
  if (query.isError)
    return (
      <div
        role="alert"
        className="my-6 rounded-xl border border-red-200 bg-red-50 p-5 text-red-900"
      >
        <p>{query.error.message}</p>
        <button className="mt-3 underline" onClick={() => query.refetch()}>
          Try again
        </button>
      </div>
    );
  return children;
}
export function Empty({ children }) {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-stone-600 dark:text-stone-300">
      {children}
    </p>
  );
}
export const Heading = ({ eyebrow, title, children }) => (
  <div className="mb-8">
    <p className="eyebrow">{eyebrow}</p>
    <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
    {children && (
      <p className="mt-3 text-stone-600 dark:text-stone-300">{children}</p>
    )}
  </div>
);
