// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LocationPicker from './LocationPicker.jsx';
vi.mock('./LocationMap.jsx', () => ({
  default: ({ onChange }) => (
    <button onClick={() => onChange({ lat: 12.97, lng: 77.59 })}>
      Select test map spot
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('requests fresh geolocation only after clicking and keeps coordinates out of inputs', async () => {
  const getCurrentPosition = vi.fn((ok) =>
    ok({ coords: { latitude: 12.97, longitude: 77.59 } }),
  );
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  const change = vi.fn();
  render(<LocationPicker onChange={change} />);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Latitude')).toBeNull();
  fireEvent.click(screen.getByText('Use my location'));
  expect(change).toHaveBeenCalledWith({ lat: 12.97, lng: 77.59 });
  expect(getCurrentPosition.mock.calls[0][2].maximumAge).toBe(0);
  expect(await screen.findByText('Select test map spot')).toBeTruthy();
});
it('permission denial leaves manual map selection available', async () => {
  vi.stubGlobal('navigator', {
    geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) },
  });
  const change = vi.fn();
  render(<LocationPicker onChange={change} />);
  fireEvent.click(screen.getByText('Use my location'));
  expect(
    await screen.findByText(/could not access your location/),
  ).toBeTruthy();
  fireEvent.click(await screen.findByText('Select test map spot'));
  expect(change).toHaveBeenCalledWith({ lat: 12.97, lng: 77.59 });
});
it('missing browser support permits map selection and optional location can clear', async () => {
  vi.stubGlobal('navigator', {});
  const change = vi.fn();
  render(
    <LocationPicker
      optional
      value={{ lat: 12.97, lng: 77.59 }}
      onChange={change}
      saved={{ lat: 12, lng: 77 }}
    />,
  );
  fireEvent.click(screen.getByText('Use my location'));
  expect(await screen.findByText(/unavailable in this browser/)).toBeTruthy();
  fireEvent.click(screen.getByText('Use organization location'));
  expect(change).toHaveBeenCalledWith({ lat: 12, lng: 77 });
  fireEvent.click(screen.getByText('Show all areas'));
  expect(change).toHaveBeenCalledWith(null);
});
