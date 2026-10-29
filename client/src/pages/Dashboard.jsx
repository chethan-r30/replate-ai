import ProofLink from '../components/ProofLink.jsx';
import Recommendations from '../components/Recommendations.jsx';
// Role dashboards expose real server state and explicit approval/empty states.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { io } from 'socket.io-client';
import { api, getAccessToken } from '../lib/api.js';
import { useAuth } from '../stores/auth.js';
import { Heading, Status, Empty } from '../components/States.jsx';
import ListingCard from '../components/ListingCard.jsx';
export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [codes, setCodes] = useState({});
  const [feedback, setFeedback] = useState({});
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [forecastCategory, setForecastCategory] = useState('bakery');
  const org = useQuery({
    queryKey: ['organization', user.id],
    enabled: user.role !== 'admin' && user.role !== 'volunteer',
    queryFn: () => api('/organizations/mine'),
  });
  const stats = useQuery({
    queryKey: ['stats', user.role],
    enabled: user.role !== 'volunteer',
    queryFn: () => api(`/analytics/${user.role}`),
  });
  const claims = useQuery({
    queryKey: ['claims', user.id, page],
    enabled: user.role !== 'admin',
    queryFn: () => api(`/claims/mine?page=${page}`),
  });
  const listings = useQuery({
    queryKey: ['my-listings', user.id, page],
    enabled: user.role === 'restaurant',
    queryFn: () => api(`/listings/mine?page=${page}`),
  });
  const suggestedFood = useQuery({
    queryKey: ['suggested-food', user.id, page],
    enabled: user.role === 'ngo' && Boolean(org.data),
    queryFn: () => api(`/ai/recommended-listings?page=${page}`),
  });
  const forecast = useQuery({
    queryKey: ['forecast', user.id, forecastCategory],
    enabled: user.role === 'restaurant' && Boolean(org.data),
    queryFn: () => api(`/ai/forecast?category=${forecastCategory}`),
  });
  const notifications = useQuery({
    queryKey: ['notifications', user.id],
    queryFn: () => api('/notifications'),
  });
  const organizations = useQuery({
    queryKey: ['admin-organizations', page],
    enabled: user.role === 'admin',
    queryFn: () => api(`/organizations?page=${page}`),
  });
  const users = useQuery({
    queryKey: ['admin-users', page],
    enabled: user.role === 'admin',
    queryFn: () => api(`/admin/users?page=${page}`),
  });
  const audit = useQuery({
    queryKey: ['audit', page],
    enabled: user.role === 'admin',
    queryFn: () => api(`/admin/audit?page=${page}`),
  });
  useEffect(() => {
    const socket = io(
      import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000',
      { auth: { token: getAccessToken() } },
    );
    // Every connect includes reconnect: persisted state may have changed offline.
    socket.on('connect', () => {
      qc.invalidateQueries({ queryKey: ['notifications', user.id] });
      qc.invalidateQueries({ queryKey: ['claims'] });
      qc.invalidateQueries({ queryKey: ['my-listings'] });
      qc.invalidateQueries({ queryKey: ['suggested-food'] });
    });
    socket.on('notification', () => {
      qc.invalidateQueries({ queryKey: ['notifications', user.id] });
      qc.invalidateQueries({ queryKey: ['claims'] });
    });
    return () => socket.disconnect();
  }, [qc, user.id]);
  async function act(path, body = {}, method = 'POST') {
    setError('');
    try {
      await api(path, { method, body });
      await qc.invalidateQueries();
      setMessage('Updated.');
    } catch (e) {
      setError(e.message);
    }
  }
  const approved =
    user.isEmailVerified && user.verificationStatus === 'approved';
  return (
    <section className="py-12">
      <Heading
        eyebrow={user.role.toUpperCase()}
        title={`Hello, ${user.name.split(' ')[0]}.`}
      >
        A little surplus. A lot of possibility.
      </Heading>
      {error && (
        <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-900">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mb-5">
          {message}
        </p>
      )}
      <div className="mb-8 flex flex-wrap gap-3">
        {['restaurant', 'ngo'].includes(user.role) && (
          <Link className="button secondary" to="/organization">
            Organization & preferences
          </Link>
        )}
        {user.role === 'restaurant' && (
          <Link className="button" to="/listings/new">
            Post surplus
          </Link>
        )}
        <Link className="button secondary" to="/listings">
          Explore food
        </Link>
      </div>
      {user.role === 'ngo' && org.data && (
        <section className="mb-10" aria-labelledby="suggested-food-title">
          <h2 id="suggested-food-title" className="mb-4 text-2xl font-semibold">
            Recommended for your NGO
          </h2>
          <p className="mb-4 text-sm">
            Within10km, ranked by distance, pickup hours, preferences and
            remaining capacity. Review safety yourself.
          </p>
          <Status query={suggestedFood}>
            {suggestedFood.data?.items?.length ? (
              <div className="grid gap-5 md:grid-cols-3">
                {suggestedFood.data.items.map((listing) => (
                  <div key={listing._id}>
                    <ListingCard listing={listing} />
                    <p className="mt-2 text-sm">
                      Match {listing.match.score}/100 ·{' '}
                      {listing.match.explanation}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>
                No available listings fit your preferences, hours and capacity
                nearby.
              </Empty>
            )}
          </Status>
        </section>
      )}
      {['restaurant', 'ngo'].includes(user.role) && !approved && (
        <div className="mb-8 rounded-2xl bg-amber-50 p-5 text-amber-950">
          <h2 className="font-semibold">
            Your account is read-only until approved.
          </h2>
          <p className="mt-2">
            Email: {user.isEmailVerified ? 'verified' : 'verification needed'} ·
            Organization: {org.data?.verificationStatus || 'details needed'}. If
            approval changed, sign out and back in to refresh this display. The
            server checks current approval on every action.
          </p>
        </div>
      )}
      {user.role !== 'volunteer' && (
        <Status query={stats}>
          {stats.data && (
            <div className="mb-10 grid gap-4 sm:grid-cols-3">
              {[
                ['Meals saved', stats.data.impact.mealsSaved],
                ['Measured kg saved', stats.data.impact.kgSaved],
                [
                  user.role === 'admin' ? 'Total listings' : 'Pending claims',
                  stats.data.pendingClaims ?? stats.data.totalListings ?? 0,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-700 dark:bg-stone-900"
                >
                  <p className="text-sm text-stone-600 dark:text-stone-400">
                    {label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          )}
        </Status>
      )}
      {user.role === 'restaurant' && (
        <>
          <h2 className="mb-4 text-2xl font-semibold">Your active table</h2>
          <Status query={listings}>
            {listings.data?.items.some((l) =>
              ['available', 'reserved'].includes(l.status),
            ) ? (
              <div className="mb-10 grid gap-4 md:grid-cols-3">
                {listings.data.items
                  .filter((l) => ['available', 'reserved'].includes(l.status))
                  .map((l) => (
                    <div key={l._id}>
                      <ListingCard listing={l} />
                      {l.status === 'available' && (
                        <Recommendations listingId={l._id} />
                      )}
                      {l.status === 'available' && (
                        <div className="mt-2 flex gap-4 text-sm">
                          <Link
                            className="underline"
                            to={`/listings/${l._id}/edit`}
                          >
                            Edit
                          </Link>
                          <button
                            className="underline"
                            onClick={() =>
                              act(`/listings/${l._id}`, {}, 'DELETE')
                            }
                          >
                            Cancel listing
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <Empty>
                No listings yet. Post surplus when safe food is ready to share.
              </Empty>
            )}
          </Status>
          <h2 className="mb-4 mt-10 text-2xl font-semibold">Listing history</h2>
          <Status query={listings}>
            {listings.data?.items.some(
              (l) => !['available', 'reserved'].includes(l.status),
            ) ? (
              <div className="grid gap-4 md:grid-cols-3">
                {listings.data.items
                  .filter((l) => !['available', 'reserved'].includes(l.status))
                  .map((l) => (
                    <ListingCard key={l._id} listing={l} />
                  ))}
              </div>
            ) : (
              <Empty>
                No completed, cancelled or expired listings on this page.
              </Empty>
            )}
          </Status>
          {org.data && (
            <>
              <h2 className="mb-4 mt-10 text-2xl font-semibold">
                Seven-day surplus forecast
              </h2>
              <label className="mb-4 block text-sm">
                Forecast category
                <select
                  className="field mt-1"
                  value={forecastCategory}
                  onChange={(e) => setForecastCategory(e.target.value)}
                >
                  {['cooked', 'bakery', 'produce', 'packaged', 'dairy'].map(
                    (category) => (
                      <option key={category}>{category}</option>
                    ),
                  )}
                </select>
              </label>
              <Status query={forecast}>
                {forecast.data && (
                  <div className="mb-10 rounded-2xl bg-white p-5 dark:bg-stone-900">
                    <p className="text-sm">
                      {forecast.data.coldStart
                        ? 'Cold-start estimate from nearby category averages.'
                        : 'Based on your posted surplus history.'}
                    </p>
                    <div className="mt-4 h-56">
                      <ResponsiveContainer>
                        <LineChart data={forecast.data.days}>
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="quantity"
                            stroke="#58833c"
                            strokeWidth={3}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {forecast.data.insight && <p>{forecast.data.insight}</p>}
                    <h3 className="mt-5 font-semibold">Area demand estimate</h3>
                    <ul className="mt-2 flex flex-wrap gap-3 text-sm">
                      {forecast.data.demand.days.map((d) => (
                        <li key={d.date}>
                          {d.date}: {d.quantity}
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      Planning estimate only. Never use a forecast to determine
                      food safety.
                    </p>
                  </div>
                )}
              </Status>
            </>
          )}
        </>
      )}
      {user.role !== 'admin' && (
        <>
          <h2 className="mb-4 mt-10 text-2xl font-semibold">Claim handovers</h2>
          <Status query={claims}>
            {!claims.data?.items.length ? (
              <Empty>
                No handovers yet. Your requests and pickup updates appear here.
              </Empty>
            ) : (
              <div className="space-y-4">
                {claims.data.items.map((c) => (
                  <article
                    key={c._id}
                    className="rounded-2xl border border-stone-200 p-5 dark:border-stone-700"
                  >
                    <h3 className="text-lg font-semibold">
                      {c.listing?.title || 'Listing unavailable'}
                    </h3>
                    <p className="mt-2">Status: {c.status}</p>
                    {user.role === 'ngo' &&
                      c.pickupCode &&
                      ['requested', 'approved'].includes(c.status) && (
                        <p className="mt-2">
                          Show the restaurant this handover code:{' '}
                          <strong className="tracking-widest">
                            {c.pickupCode}
                          </strong>
                        </p>
                      )}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {user.role === 'restaurant' &&
                        c.status === 'requested' && (
                          <>
                            <button
                              className="button"
                              onClick={() => act(`/claims/${c._id}/approve`)}
                            >
                              Approve
                            </button>
                            <button
                              className="button secondary"
                              onClick={() => act(`/claims/${c._id}/reject`)}
                            >
                              Reject
                            </button>
                          </>
                        )}
                      {user.role === 'restaurant' &&
                        c.status === 'approved' && (
                          <>
                            <label className="text-sm">
                              NGO pickup code
                              <input
                                className="field mt-1"
                                inputMode="numeric"
                                maxLength={6}
                                value={codes[c._id] || ''}
                                onChange={(e) =>
                                  setCodes({
                                    ...codes,
                                    [c._id]: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <button
                              className="button"
                              onClick={() =>
                                act(`/claims/${c._id}/confirm-pickup`, {
                                  code: codes[c._id] || '',
                                })
                              }
                            >
                              Confirm handover
                            </button>
                          </>
                        )}
                      {['requested', 'approved'].includes(c.status) && (
                        <button
                          className="underline"
                          onClick={() => act(`/claims/${c._id}/cancel`)}
                        >
                          Cancel claim
                        </button>
                      )}
                      {c.status === 'picked_up' && (
                        <>
                          <label className="text-sm">
                            Rating
                            <select
                              className="field"
                              value={feedback[c._id] || '5'}
                              onChange={(e) =>
                                setFeedback({
                                  ...feedback,
                                  [c._id]: e.target.value,
                                })
                              }
                            >
                              {[5, 4, 3, 2, 1].map((n) => (
                                <option key={n}>{n}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="button secondary"
                            onClick={() =>
                              act(`/claims/${c._id}/feedback`, {
                                rating: Number(feedback[c._id] || 5),
                                comment: '',
                              })
                            }
                          >
                            Send rating
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Status>
        </>
      )}
      {user.role === 'admin' && (
        <>
          <h2 className="mb-4 text-2xl font-semibold">Organization review</h2>
          <Status query={organizations}>
            {!organizations.data?.length ? (
              <Empty>No organizations to review.</Empty>
            ) : (
              <div className="space-y-4">
                {organizations.data.map((o) => (
                  <article
                    className="rounded-xl border border-stone-200 p-5 dark:border-stone-700"
                    key={o._id}
                  >
                    <h3 className="font-semibold">
                      {o.name} · {o.type} · {o.verificationStatus}
                    </h3>
                    <p className="mt-2">
                      {o.registrationNo} · {o.address} · {o.timezone}
                    </p>
                    {o.verificationDocs.map((url) => (
                      <ProofLink key={url} url={url} />
                    ))}
                    <div className="mt-4 flex gap-3">
                      <button
                        className="button"
                        onClick={() =>
                          act(`/organizations/${o._id}/verify`, {
                            status: 'approved',
                            reason: 'Admin reviewed registration and proof',
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          act(`/organizations/${o._id}/verify`, {
                            status: 'rejected',
                            reason:
                              'Verification details did not meet review requirements',
                          })
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Status>
          <h2 className="mb-4 mt-10 text-2xl font-semibold">Users</h2>
          <Status query={users}>
            {users.data?.items.map((u) => (
              <div
                className="flex flex-wrap justify-between gap-3 border-b border-stone-200 py-3"
                key={u._id}
              >
                <span>
                  {u.name} · {u.role}
                </span>
                <button
                  className="underline"
                  disabled={u.role === 'admin'}
                  onClick={() =>
                    act(
                      `/admin/users/${u._id}`,
                      { disabled: !u.deletedAt },
                      'PATCH',
                    )
                  }
                >
                  {u.role === 'admin'
                    ? 'Protected admin'
                    : u.deletedAt
                      ? 'Enable'
                      : 'Disable'}
                </button>
              </div>
            ))}
          </Status>
          <h2 className="mb-4 mt-10 text-2xl font-semibold">Audit log</h2>
          <Status query={audit}>
            {audit.data?.items.length ? (
              audit.data.items.map((a) => (
                <p className="py-2 text-sm" key={a._id}>
                  {new Date(a.createdAt).toLocaleString()} · {a.action} ·{' '}
                  {a.reason}
                </p>
              ))
            ) : (
              <Empty>No admin decisions recorded.</Empty>
            )}
          </Status>
        </>
      )}
      <div className="my-8 flex gap-4">
        <button
          className="underline disabled:opacity-40"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous page
        </button>
        <span>{page}</span>
        <button className="underline" onClick={() => setPage(page + 1)}>
          Next page
        </button>
      </div>
      <h2 className="mb-4 mt-10 text-2xl font-semibold">Notifications</h2>
      <Status query={notifications}>
        {notifications.data?.items.length ? (
          <ul>
            {notifications.data.items.map((n) => (
              <li
                className="flex flex-wrap justify-between gap-3 border-b border-stone-200 py-4"
                key={n._id}
              >
                <span>{n.message}</span>
                {!n.readAt && (
                  <button
                    className="underline"
                    onClick={() =>
                      act(`/notifications/${n._id}/read`, {}, 'PATCH')
                    }
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>You're all caught up.</Empty>
        )}
      </Status>
    </section>
  );
}
