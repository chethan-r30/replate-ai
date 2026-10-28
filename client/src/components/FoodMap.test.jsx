// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center }) => (
    <div data-testid="map" data-center={center.join(',')}>
      {children}
    </div>
  ),
  TileLayer: () => null,
  CircleMarker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
}));
import FoodMap from './FoodMap.jsx';
it('uses listing coordinates and safe empty default', () => {
  render(
    <MemoryRouter>
      <FoodMap
        items={[
          { _id: 'x', title: 'Bread', location: { coordinates: [77, 12] } },
        ]}
      />
    </MemoryRouter>,
  );
  expect(screen.getByTestId('map').dataset.center).toBe('12,77');
  expect(screen.getByRole('link').getAttribute('href')).toBe('/listings/x');
  cleanup();
  render(
    <MemoryRouter>
      <FoodMap items={[]} />
    </MemoryRouter>,
  );
  expect(screen.getByTestId('map').dataset.center).toBe('20.59,78.96');
});
