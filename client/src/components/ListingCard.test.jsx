// Verify safe text rendering and food-deadline visibility in browse cards.
// @vitest-environment jsdom
import React from 'react';
import { it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ListingCard from './ListingCard.jsx';
afterEach(cleanup);
it('renders food quantities and deadline without executing markup', () => {
  const listing = {
    _id: '123',
    title: '<script>alert(1)</script>',
    category: 'bakery',
    status: 'available',
    servings: 10,
    quantity: 2,
    unit: 'kg',
    dietary: ['veg'],
    photos: [],
    pickupWindow: { end: '2026-10-30T12:00:00Z' },
    bestBefore: '2026-10-30T13:00:00Z',
  };
  render(
    <MemoryRouter>
      <ListingCard listing={listing} />
    </MemoryRouter>,
  );
  expect(screen.getByText('10 servings · 2 kg')).toBeTruthy();
  expect(screen.getByText(/Food deadline:/)).toBeTruthy();
  expect(screen.getByRole('link').textContent).toContain('<script>');
  expect(document.querySelector('script')).toBeNull();
});
