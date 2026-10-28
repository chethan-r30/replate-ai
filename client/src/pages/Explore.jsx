// Browse with explicit coordinates; no silent location permission request.
import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import ListingCard from '../components/ListingCard.jsx';
import { Status, Empty, Heading } from '../components/States.jsx';
const FoodMap = lazy(() => import('../components/FoodMap.jsx'));
export default function Explore() {
  const [filters, setFilters] = useState({
    category: '',
    dietary: '',
    lat: '',
    lng: '',
    radius: '10',
    page: 1,
  });
  const [map, setMap] = useState(false);
  const query = useQuery({
    queryKey: ['listings', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters))
        if (value !== '' && (key !== 'radius' || filters.lat))
          params.set(key, value);
      return api(`/listings?${params}`);
    },
  });
  return (
    <section className="py-12">
      <Heading eyebrow="THE NEIGHBORHOOD TABLE" title="Good food, close by.">
        Review the food details and pickup deadline before claiming.
      </Heading>
      <form
        className="mb-6 grid gap-3 rounded-2xl bg-white p-5 dark:bg-stone-900 sm:grid-cols-3"
        onSubmit={(e) => e.preventDefault()}
      >
        {[
          [
            'category',
            ['', 'cooked', 'bakery', 'produce', 'packaged', 'dairy'],
          ],
          ['dietary', ['', 'veg', 'vegan', 'halal', 'contains-nuts']],
        ].map(([name, values]) => (
          <label className="text-sm" key={name}>
            {name}
            <select
              className="field mt-1"
              value={filters[name]}
              onChange={(e) =>
                setFilters({ ...filters, [name]: e.target.value, page: 1 })
              }
            >
              {values.map((v) => (
                <option key={v} value={v}>
                  {v || 'All'}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="text-sm">
          Radius (km)
          <input
            className="field mt-1"
            type="number"
            min="1"
            max="100"
            value={filters.radius}
            onChange={(e) =>
              setFilters({ ...filters, radius: e.target.value, page: 1 })
            }
          />
        </label>
        {['lat', 'lng'].map((name) => (
          <label className="text-sm" key={name}>
            {name === 'lat' ? 'Latitude' : 'Longitude'}
            <input
              className="field mt-1"
              type="number"
              step="any"
              value={filters[name]}
              onChange={(e) =>
                setFilters({ ...filters, [name]: e.target.value, page: 1 })
              }
            />
          </label>
        ))}
        <button
          type="button"
          className="button self-end"
          onClick={() => setMap(!map)}
        >
          {map ? 'Hide map' : 'Show map'}
        </button>
      </form>
      <Status query={query}>
        {query.data && (
          <>
            {map && (
              <Suspense fallback={<p role="status">Loading map...</p>}>
                <FoodMap items={query.data.items} />
              </Suspense>
            )}
            {!query.data.items.length ? (
              <Empty>
                No available food matches these filters. Try a wider area or
                check back later.
              </Empty>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {query.data.items.map((listing) => (
                  <ListingCard key={listing._id} listing={listing} />
                ))}
              </div>
            )}
            <div className="mt-7 flex items-center justify-between">
              <button
                disabled={filters.page === 1}
                className="button secondary disabled:opacity-40"
                onClick={() =>
                  setFilters({ ...filters, page: filters.page - 1 })
                }
              >
                Previous
              </button>
              <span>Page {filters.page}</span>
              <button
                disabled={query.data.items.length < 20}
                className="button secondary disabled:opacity-40"
                onClick={() =>
                  setFilters({ ...filters, page: filters.page + 1 })
                }
              >
                Next
              </button>
            </div>
          </>
        )}
      </Status>
    </section>
  );
}
