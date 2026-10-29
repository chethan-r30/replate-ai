// @vitest-environment jsdom
// MSW keeps browser-facing tests on real fetch and React Query behavior.
import React from 'react';
import { beforeAll, afterAll, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import Explore from './Explore.jsx';
import Impact from './Impact.jsx';
import Organization from './Organization.jsx';
import ListingDetail from './ListingDetail.jsx';
import ListingForm from './ListingForm.jsx';
import Dashboard from './Dashboard.jsx';
import Recommendations from '../components/Recommendations.jsx';
import Guard from '../components/Guard.jsx';
import Auth from './Auth.jsx';
import { useAuth } from '../stores/auth.js';
vi.mock('socket.io-client', () => ({
  io: () => ({ on: () => {}, disconnect: () => {} }),
}));
vi.mock('../components/FoodMap.jsx', () => ({
  default: () => <p>Map ready</p>,
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));
const base = 'http://localhost:5000/api/v1';
const food = {
  _id: '507f1f77bcf86cd799439011',
  title: 'Bread boxes',
  description: 'Fresh bread',
  category: 'bakery',
  status: 'available',
  quantity: 10,
  unit: 'boxes',
  servings: 20,
  dietary: ['veg'],
  photos: ['https://example.com/bread.png'],
  preparedAt: new Date().toISOString(),
  bestBefore: new Date(Date.now() + 7200000).toISOString(),
  pickupWindow: {
    start: new Date().toISOString(),
    end: new Date(Date.now() + 3600000).toISOString(),
  },
  location: { coordinates: [77.59, 12.97] },
};
const org = {
  _id: 'o',
  name: 'Kitchen',
  registrationNo: 'REG123',
  address: '123 Road',
  timezone: 'Asia/Kolkata',
  verificationStatus: 'approved',
  location: { coordinates: [77.59, 12.97] },
  capacity: 100,
  verificationDocs: ['https://example.com/proof'],
  operatingHours: { start: 0, end: 24 },
  preferences: { categories: ['bakery'], dietary: ['veg'] },
};
const user = {
  id: 'u',
  name: 'Demo User',
  role: 'ngo',
  isEmailVerified: true,
  verificationStatus: 'approved',
};
let dataOverrides = {};
const server = setupServer(
  http.all(base + '/*', async ({ request }) => {
    const url = new URL(request.url),
      path = url.pathname.replace('/api/v1', '');
    if (dataOverrides[path] instanceof Error)
      return HttpResponse.json(
        { message: dataOverrides[path].message },
        { status: 403 },
      );
    const data =
      dataOverrides[path] ??
      (path === '/organizations/mine'
        ? org
        : path.startsWith('/organizations')
          ? []
          : path === '/notifications'
            ? { items: [] }
            : path === '/claims/mine'
              ? { items: [] }
              : path === '/analytics/public'
                ? {
                    mealsSaved: 20,
                    kgSaved: 3,
                    co2eAvoidedEstimateKg: 7.5,
                    methodology: 'Measured pickups only',
                  }
                : path.startsWith('/analytics/')
                  ? {
                      impact: { mealsSaved: 20, kgSaved: 3 },
                      pendingClaims: 0,
                      totalListings: 1,
                    }
                  : path === '/ai/forecast'
                    ? {
                        coldStart: true,
                        days: [{ date: '2026-01-01', quantity: 2 }],
                        demand: { days: [] },
                      }
                    : path.startsWith('/ai/recommendations/')
                      ? []
                      : path === '/ai/parse-listing'
                        ? {
                            mode: 'manual',
                            reason: 'No key',
                            disclaimer: 'Review food safety',
                          }
                        : path === '/listings/mine'
                          ? { items: [food] }
                          : path.startsWith('/listings/')
                            ? food
                            : path === '/listings'
                              ? { items: [food] }
                              : path.startsWith('/admin/')
                                ? { items: [] }
                                : {});
    return HttpResponse.json({ data });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  dataOverrides = {};
});
function view(component, path = '/', route = '*') {
  useAuth.setState({ user, loading: false });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={component} />
          <Route path="/dashboard" element={<p>Dashboard destination</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('explores filters, map, empty/error and pagination states', async () => {
  view(<Explore />);
  expect(await screen.findByText('Bread boxes')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('category'), {
    target: { value: 'bakery' },
  });
  fireEvent.change(screen.getByLabelText('Radius (km)'), {
    target: { value: 20 },
  });
  fireEvent.change(screen.getByLabelText('Pickup by (local time)'), {
    target: { value: '2026-10-29T09:00' },
  });
  fireEvent.click(screen.getByText('Show map'));
  expect(await screen.findByText('Map ready')).toBeTruthy();
  fireEvent.click(screen.getByText('Hide map'));
  cleanup();
  dataOverrides['/listings'] = { items: [] };
  view(<Explore />);
  expect(await screen.findByText(/No available food/)).toBeTruthy();
  cleanup();
  dataOverrides['/listings'] = new Error('Search denied');
  view(<Explore />);
  expect(await screen.findByText('Search denied')).toBeTruthy();
});
it('shows measured public impact', async () => {
  view(<Impact />);
  expect(await screen.findByText('Measured pickups only')).toBeTruthy();
});
it('shows editable organization and submits reapproval', async () => {
  view(<Organization />);
  fireEvent.click(await screen.findByText('Load current details for editing'));
  expect(screen.getByLabelText('Organization name').value).toBe('Kitchen');
  fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
  expect(await screen.findByText(/Submitted for admin review/)).toBeTruthy();
});
it('shows recommendations with score breakdown then hides them', async () => {
  dataOverrides['/ai/recommendations/id'] = [
    {
      id: 'n',
      name: 'NGO',
      score: 80,
      explanation: 'Nearby',
      breakdown: { distance: 0.8 },
    },
  ];
  view(<Recommendations listingId="id" />);
  fireEvent.click(screen.getByText('View NGO matches'));
  expect(await screen.findByText('Nearby')).toBeTruthy();
  fireEvent.click(screen.getByText('Hide NGO matches'));
  expect(screen.queryByText('Nearby')).toBeNull();
});
it('claims food through the detail page and reports denied claim', async () => {
  view(<ListingDetail />, '/listings/id', '/listings/:id');
  await screen.findByText('Fresh bread');
  fireEvent.click(screen.getByText('Request this food'));
  expect(await screen.findByText('Dashboard destination')).toBeTruthy();
  cleanup();
  dataOverrides['/claims'] = new Error('Not approved');
  view(<ListingDetail />, '/listings/id', '/listings/:id');
  fireEvent.click(await screen.findByText('Request this food'));
  expect(await screen.findByText('Not approved')).toBeTruthy();
});
it('guards loading, wrong role and allowed users', () => {
  view(<Guard roles={['restaurant']}>Private</Guard>);
  expect(screen.getByRole('alert')).toBeTruthy();
  cleanup();
  view(<Guard roles={['ngo']}>Private</Guard>);
  expect(screen.getByText('Private')).toBeTruthy();
});
it('uses manual AI fallback and requires food confirmation', async () => {
  view(<ListingForm />);
  fireEvent.change(screen.getByLabelText('Rough food note'), {
    target: { value: 'Bread' },
  });
  fireEvent.click(screen.getByText('Suggest listing details'));
  expect(await screen.findByText('No key')).toBeTruthy();
  fireEvent.click(screen.getByText('Use organization location'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Review confirmed. Save listing' }),
  );
  expect(
    await screen.findByText(
      'Review and confirm the food details before posting',
    ),
  ).toBeTruthy();
});
it('edits an existing listing and saves reviewed fields', async () => {
  view(<ListingForm />, '/listings/id/edit', '/listings/:id/edit');
  await screen.findByDisplayValue('Bread boxes');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Review confirmed. Save listing' }),
  );
  expect(await screen.findByText('Dashboard destination')).toBeTruthy();
});
it.each(['restaurant', 'ngo', 'admin', 'volunteer'])(
  'renders the %s dashboard with private query state',
  async (role) => {
    useAuth.setState({ user: { ...user, role } });
    view(<Dashboard />);
    useAuth.setState({ user: { ...user, role } });
    expect(await screen.findByText('Hello, Demo.')).toBeTruthy();
    if (role === 'restaurant')
      expect(await screen.findByText('Bread boxes')).toBeTruthy();
    if (role === 'admin')
      expect(await screen.findByText('Organization review')).toBeTruthy();
  },
);
it.each(['register', 'forgot', 'reset', 'verify'])(
  'submits the %s form',
  async (mode) => {
    view(<Auth mode={mode} />, '/?token=' + 'a'.repeat(64));
    if (mode === 'register')
      fireEvent.change(screen.getByLabelText('Your name'), {
        target: { value: 'Demo User' },
      });
    if (['register', 'forgot'].includes(mode))
      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'demo@example.com' },
      });
    if (['register', 'reset'].includes(mode))
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'StrongPass123!' },
      });
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toBeTruthy();
  },
);
it('handles claim handover actions, cancellation, rating and notification read', async () => {
  dataOverrides['/claims/mine'] = {
    items: [
      { _id: 'requested', status: 'requested', listing: food },
      { _id: 'approved', status: 'approved', listing: food },
      { _id: 'picked', status: 'picked_up', listing: food },
    ],
  };
  dataOverrides['/notifications'] = {
    items: [{ _id: 'notice', message: 'New request', readAt: null }],
  };
  view(<Dashboard />);
  useAuth.setState({ user: { ...user, role: 'restaurant' } });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Approve', exact: true }),
  );
  await screen.findByText('Updated.');
  fireEvent.click(screen.getByRole('button', { name: 'Reject', exact: true }));
  fireEvent.change(screen.getByLabelText('NGO pickup code'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByText('Confirm handover'));
  fireEvent.change(screen.getByLabelText('Rating'), { target: { value: '4' } });
  fireEvent.click(screen.getByText('Send rating'));
  fireEvent.click(screen.getByText('Mark read'));
  fireEvent.click(screen.getByText('Cancel listing'));
  fireEvent.click(screen.getByText('Next page'));
  fireEvent.click(screen.getByText('Previous page'));
});
it('shows NGO-ranked food and allows restaurant forecast category selection', async () => {
  dataOverrides['/ai/recommended-listings'] = {
    items: [
      {
        ...food,
        match: { score: 85, explanation: 'Fits capacity and hours.' },
      },
    ],
  };
  view(<Dashboard />);
  expect(await screen.findByText(/Match 85/)).toBeTruthy();
  cleanup();
  view(<Dashboard />);
  useAuth.setState({ user: { ...user, role: 'restaurant' } });
  fireEvent.change(await screen.findByLabelText('Forecast category'), {
    target: { value: 'produce' },
  });
  expect(screen.getByLabelText('Forecast category').value).toBe('produce');
});
it('handles NGO cancellation and error from an action', async () => {
  dataOverrides['/claims/mine'] = {
    items: [
      { _id: 'c', status: 'approved', pickupCode: '123456', listing: food },
    ],
  };
  dataOverrides['/claims/c/cancel'] = new Error('Cannot cancel');
  view(<Dashboard />);
  fireEvent.click(await screen.findByText('Cancel claim'));
  expect(await screen.findByText('Cannot cancel')).toBeTruthy();
});
it('handles organization approval/rejection, user disable and audit records', async () => {
  dataOverrides['/organizations'] = [{ ...org, type: 'ngo' }];
  dataOverrides['/admin/users'] = {
    items: [{ _id: 'x', name: 'Other', role: 'ngo' }],
  };
  dataOverrides['/admin/audit'] = {
    items: [
      {
        _id: 'a',
        createdAt: new Date().toISOString(),
        action: 'user.disable',
        reason: 'Review',
      },
    ],
  };
  view(<Dashboard />);
  useAuth.setState({ user: { ...user, role: 'admin' } });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Approve', exact: true }),
  );
  await screen.findByText('Updated.');
  fireEvent.click(screen.getByRole('button', { name: 'Reject', exact: true }));
  fireEvent.click(await screen.findByText('Disable'));
});
it('reports moderation, AI field filling and failed form requests', async () => {
  view(<ListingDetail />, '/listings/id', '/listings/:id');
  useAuth.setState({ user: { ...user, role: 'admin' } });
  fireEvent.change(await screen.findByLabelText('Moderation reason'), {
    target: { value: 'Unsafe food' },
  });
  fireEvent.click(screen.getByText('Cancel unsafe listing'));
  cleanup();
  dataOverrides['/ai/parse-listing'] = {
    fields: {
      title: 'AI bread',
      category: 'bakery',
      servings: 4,
      dietary: ['veg'],
      safetyWarnings: ['Review storage'],
    },
    disclaimer: 'Review',
  };
  view(<ListingForm />);
  fireEvent.change(screen.getByLabelText('Rough food note'), {
    target: { value: 'Bread' },
  });
  fireEvent.click(screen.getByText('Suggest listing details'));
  expect(await screen.findByDisplayValue('AI bread')).toBeTruthy();
});

it('uploads organization proof directly and rejects unsafe file types', async () => {
  dataOverrides['/uploads/proof'] = {
    url: '/uploads/proof/507f1f77bcf86cd799439011',
  };
  view(<Organization />);
  fireEvent.change(screen.getByLabelText('Upload verification proof image'), {
    target: {
      files: [new File(['unsafe'], 'proof.svg', { type: 'image/svg+xml' })],
    },
  });
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Choose a JPEG',
  );
  fireEvent.change(screen.getByLabelText('Upload verification proof image'), {
    target: {
      files: [
        Object.assign(
          new File(['synthetic'], 'proof.png', { type: 'image/png' }),
          {
            arrayBuffer: async () =>
              new TextEncoder().encode('synthetic').buffer,
          },
        ),
      ],
    },
  });
  expect(await screen.findByText('View private proof')).toBeTruthy();
});
