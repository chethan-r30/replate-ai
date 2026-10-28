// The NGO requests; the restaurant confirms the actual handover in its dashboard.
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { useAuth } from '../stores/auth.js';
import { Status, Heading } from '../components/States.jsx';
export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['listing', id],
    queryFn: () => api(`/listings/${id}`),
  });
  async function claim() {
    setBusy(true);
    setError('');
    try {
      await api('/claims', { method: 'POST', body: { listingId: id } });
      qc.invalidateQueries({ queryKey: ['claims'] });
      navigate('/dashboard');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="py-12">
      <Status query={query}>
        {query.data && (
          <>
            <Heading
              eyebrow={`${query.data.category} · ${query.data.status}`}
              title={query.data.title}
            />
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                {query.data.photos?.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt={query.data.title}
                    loading="lazy"
                    className="mb-4 w-full rounded-2xl"
                  />
                ))}
                <p className="whitespace-pre-line leading-relaxed">
                  {query.data.description}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 p-6 dark:border-stone-700">
                <p className="text-2xl font-semibold">
                  {query.data.servings} servings
                </p>
                <p className="mt-2">
                  {query.data.quantity} {query.data.unit} ·{' '}
                  {query.data.dietary.join(', ') || 'No dietary claims'}
                </p>
                <p className="mt-4">
                  Pickup:{' '}
                  {new Date(query.data.pickupWindow.start).toLocaleString()} to{' '}
                  {new Date(query.data.pickupWindow.end).toLocaleString()}
                </p>
                <p className="mt-4 font-semibold">
                  Food deadline:{' '}
                  {new Date(query.data.bestBefore).toLocaleString()}
                </p>
                <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">
                  Confirm ingredients, allergens, storage and safety directly
                  with the restaurant. Do not collect food past its safe
                  deadline.
                </p>
                <a
                  className="mt-5 inline-block underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${query.data.location.coordinates[1]}&mlon=${query.data.location.coordinates[0]}#map=16/${query.data.location.coordinates[1]}/${query.data.location.coordinates[0]}`}
                >
                  Open location in OpenStreetMap
                </a>
                {user?.role === 'admin' && (
                  <div className="mt-5">
                    <label>
                      Moderation reason
                      <input
                        className="field"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button
                      className="button mt-3"
                      onClick={async () => {
                        try {
                          await api(`/admin/listings/${id}/moderate`, {
                            method: 'POST',
                            body: { reason },
                          });
                          query.refetch();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      Cancel unsafe listing
                    </button>
                  </div>
                )}
                {!user ? (
                  <Link className="button mt-5 flex" to="/login">
                    Sign in to request food
                  </Link>
                ) : (
                  user.role === 'ngo' && (
                    <button
                      disabled={busy || query.data.status !== 'available'}
                      className="button mt-5 w-full disabled:opacity-40"
                      onClick={claim}
                    >
                      {busy ? 'Requesting...' : 'Request this food'}
                    </button>
                  )
                )}
                {error && (
                  <p role="alert" className="mt-4 text-red-700">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </Status>
    </section>
  );
}
