// Click a point or pan using keyboard arrows, then select the map center.
import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
function Selection({ value, onChange, onCenter }) {
  const map = useMap();
  useMapEvents({
    click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }),
    moveend: () => {
      const p = map.getCenter();
      onCenter({ lat: p.lat, lng: p.lng });
    },
  });
  const lat = value?.lat,
    lng = value?.lng;
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng))
      map.setView([lat, lng], Math.max(map.getZoom(), 15));
  }, [map, lat, lng]);
  return value ? (
    <CircleMarker
      center={[value.lat, value.lng]}
      radius={10}
      pathOptions={{ color: '#166534', fillOpacity: 0.8 }}
    />
  ) : null;
}
export default function LocationMap({ value, onChange }) {
  const [center, setCenter] = useState(value || { lat: 20.59, lng: 78.96 });
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm">
        Zoom and tap the pickup spot. Keyboard: focus the map, use arrow keys to
        pan and + or - to zoom, then choose the map center below. The starting
        map is not your detected location.
      </p>
      <div
        className="h-72 overflow-hidden rounded-xl border border-stone-300"
        aria-label="Choose location map"
      >
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={value ? 15 : 4}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Selection value={value} onChange={onChange} onCenter={setCenter} />
        </MapContainer>
      </div>
      <button
        type="button"
        className="mt-3 button secondary"
        onClick={() => onChange(center)}
      >
        Use map center
      </button>
    </div>
  );
}
