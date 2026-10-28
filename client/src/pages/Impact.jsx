// Public counters come only from recorded completed pickups.
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { Heading, Status } from '../components/States.jsx';
export default function Impact() {
  const query = useQuery({
    queryKey: ['impact'],
    queryFn: () => api('/analytics/public'),
  });
  return (
    <section className="py-14">
      <Heading
        eyebrow="EVERY HANDOVER COUNTS"
        title="Small acts. Shared impact."
      >
        Real pickups, measured together.
      </Heading>
      <Status query={query}>
        {query.data && (
          <>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                ['Meals saved', query.data.mealsSaved],
                ['Measured kg saved', query.data.kgSaved],
                [
                  'Estimated CO2e avoided (kg)',
                  query.data.co2eAvoidedEstimateKg,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-forest p-7 text-white"
                >
                  <p className="text-4xl font-semibold">
                    {value.toLocaleString()}
                  </p>
                  <p className="mt-3 text-sm">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-7 max-w-3xl text-sm text-stone-600 dark:text-stone-300">
              {query.data.methodology}
            </p>
          </>
        )}
      </Status>
    </section>
  );
}
