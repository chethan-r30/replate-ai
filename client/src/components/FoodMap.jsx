// OpenStreetMap tiles are optional; the accompanying list works without map service.
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
export default function FoodMap({ items }) {
  const point = items[0]?.location?.coordinates;
  return (
    <div
      className="mb-6 h-80 overflow-hidden rounded-2xl border border-stone-200"
      aria-label="Food listing map"
    >
      <MapContainer
        center={point ? [point[1], point[0]] : [20.59, 78.96]}
        zoom={point ? 12 : 4}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {items.map((item) => (
          <CircleMarker
            key={item._id}
            center={[
              item.location.coordinates[1],
              item.location.coordinates[0],
            ]}
            radius={10}
          >
            <Popup>
              <Link to={`/listings/${item._id}`}>{item.title}</Link>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
