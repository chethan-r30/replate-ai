// Browser location is requested only on click. Manual map selection needs no geocoder.
import { lazy, Suspense, useState } from 'react';
const LocationMap = lazy(() => import('./LocationMap.jsx'));
export default function LocationPicker({
  value,
  onChange,
  error,
  label = 'Location',
  saved,
  savedLabel = 'Use organization location',
  optional = false,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const selected = Number.isFinite(value?.lat) && Number.isFinite(value?.lng);
  function locate() {
    if (!navigator.geolocation) {
      setMessage(
        'Location is unavailable in this browser. Choose a spot on the map instead.',
      );
      setOpen(true);
      return;
    }
    setBusy(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onChange({ lat: coords.latitude, lng: coords.longitude });
        setBusy(false);
        setOpen(true);
        setMessage(
          'Current location selected. Check the pin and adjust it if needed.',
        );
      },
      () => {
        setBusy(false);
        setOpen(true);
        setMessage(
          'We could not access your location. You can still choose a spot on the map.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }
  return (
    <fieldset className="min-w-0 rounded-xl border border-stone-300 p-4 sm:col-span-full">
      <legend className="px-1 font-semibold">{label}</legend>
      <p className="mb-3 text-sm">
        {selected
          ? 'Location selected. Check or adjust the map pin.'
          : optional
            ? 'Showing all areas. Choose a location to find food nearby.'
            : 'Select the actual pickup or organization location. No coordinates needed.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={locate}
        >
          {busy ? 'Finding location...' : 'Use my location'}
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide location map' : 'Choose on map'}
        </button>
        {saved && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              onChange(saved);
              setOpen(true);
            }}
          >
            {savedLabel}
          </button>
        )}
        {optional && selected && (
          <button
            type="button"
            className="underline"
            onClick={() => {
              onChange(null);
              setMessage('');
            }}
          >
            Show all areas
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-red-700">
          Choose a location before submitting.
        </p>
      )}
      {open && (
        <Suspense fallback={<p role="status">Loading location map...</p>}>
          <LocationMap value={selected ? value : null} onChange={onChange} />
        </Suspense>
      )}
      <p className="mt-3 text-xs text-stone-600 dark:text-stone-400">
        Location permission is optional. Map tiles come from OpenStreetMap; your
        browser shares the viewed map area with its tile service. We do not send
        your typed address to a search provider.
      </p>
    </fieldset>
  );
}
