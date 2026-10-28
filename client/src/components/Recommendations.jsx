// Matching breakdowns help the restaurant inspect why an NGO is recommended.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { Status, Empty } from './States.jsx';
export default function Recommendations({ listingId }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['recommendations', listingId],
    enabled: open,
    queryFn: () => api(`/ai/recommendations/${listingId}`),
  });
  return (
    <div className="mt-3">
      <button className="text-sm underline" onClick={() => setOpen(!open)}>
        {open ? 'Hide NGO matches' : 'View NGO matches'}
      </button>
      {open && (
        <Status query={q}>
          {q.data?.length ? (
            <ul className="mt-3 space-y-3">
              {q.data.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl bg-green-50 p-3 text-sm text-green-950"
                >
                  <strong>
                    {n.name} · {n.score}/100
                  </strong>
                  <p>{n.explanation}</p>
                  <p>
                    {Object.entries(n.breakdown)
                      .map(([k, v]) => `${k}: ${Math.round(v * 100)}%`)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              No approved nearby NGOs meet this pickup, food and capacity fit.
            </Empty>
          )}
        </Status>
      )}
    </div>
  );
}
