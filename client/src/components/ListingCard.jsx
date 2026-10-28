// Food safety deadlines stay visible before a user chooses to claim.
import { Link } from 'react-router-dom';
export default function ListingCard({ listing }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      {listing.photos?.[0] && (
        <img
          src={listing.photos[0]}
          alt={listing.title}
          loading="lazy"
          className="h-44 w-full object-cover"
        />
      )}
      <div className="p-5">
        <p className="eyebrow">
          {listing.category} · {listing.status}
        </p>
        <h2 className="mt-3 text-xl font-semibold">
          <Link to={`/listings/${listing._id}`}>{listing.title}</Link>
        </h2>
        <p className="mt-2">
          {listing.servings} servings · {listing.quantity} {listing.unit}
        </p>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          Pickup before {new Date(listing.pickupWindow.end).toLocaleString()}
        </p>
        <p className="mt-1 text-sm font-semibold">
          Food deadline: {new Date(listing.bestBefore).toLocaleString()}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {listing.dietary?.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-green-50 px-2 py-1 text-xs text-green-900"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
