import LocationPicker from '../components/LocationPicker.jsx';
// AI only fills a draft; a human must review every safety field before posting.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadImage } from '../lib/api.js';
import { Heading } from '../components/States.jsx';
const schema = z.object({
  title: z.string().min(3),
  description: z.string().max(2000),
  category: z.enum(['cooked', 'bakery', 'produce', 'packaged', 'dairy']),
  dietary: z.string(),
  quantity: z.coerce.number().positive(),
  unit: z.enum(['kg', 'boxes', 'items', 'litres', 'portions']),
  servings: z.coerce.number().int().positive(),
  preparedAt: z.string().min(1),
  bestBefore: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  photo: z.union([z.string().url(), z.literal('')]),
  confirmed: z.literal(true, {
    error: 'Review and confirm the food details before posting',
  }),
});
export default function ListingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [retryFile, setRetryFile] = useState(null);
  const [uploaded, setUploaded] = useState('');
  const [image, setImage] = useState(null);
  const org = useQuery({
    queryKey: ['organization'],
    queryFn: () => api('/organizations/mine'),
  });
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'bakery',
      unit: 'items',
      dietary: '',
      description: '',
      photo: '',
      confirmed: false,
    },
  });
  useQuery({
    queryKey: ['edit-listing', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const x = await api(`/listings/${id}`);
      const local = (d) => {
        const date = new Date(d);
        return new Date(date - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      };
      reset({
        ...x,
        dietary: x.dietary.join(', '),
        photo: x.photos[0] || '',
        lat: x.location.coordinates[1],
        lng: x.location.coordinates[0],
        preparedAt: local(x.preparedAt),
        bestBefore: local(x.bestBefore),
        start: local(x.pickupWindow.start),
        end: local(x.pickupWindow.end),
        confirmed: false,
      });
      return x;
    },
  });
  async function assist() {
    setBusy(true);
    setError('');
    try {
      const data = await api('/ai/parse-listing', {
        method: 'POST',
        body: { note, ...(image ? { image } : {}) },
      });
      setAi(data);
      if (data.fields) {
        for (const key of ['title', 'category', 'servings'])
          setValue(key, data.fields[key]);
        setValue('dietary', data.fields.dietary.join(', '));
        setValue('confirmed', false);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function choose(file) {
    if (!file) return;
    if (
      file.size > 5 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      setError('Choose a JPEG, PNG or WebP under 5MB');
      return;
    }
    const data = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.readAsDataURL(file);
    });
    setImage({ mediaType: file.type, data });
  }
  async function upload(file) {
    if (!file) return;
    setUploading(true);
    setRetryFile(file);
    setError('');
    try {
      const data = await uploadImage(file);
      setValue('photo', data.url);
      setRetryFile(null);
      setError('');
      setUploaded(data.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  async function submit(v) {
    setError('');
    try {
      const body = {
        title: v.title,
        description: v.description,
        category: v.category,
        dietary: v.dietary
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        quantity: v.quantity,
        unit: v.unit,
        servings: v.servings,
        photos: v.photo ? [v.photo] : [],
        preparedAt: new Date(v.preparedAt).toISOString(),
        bestBefore: new Date(v.bestBefore).toISOString(),
        pickupWindow: {
          start: new Date(v.start).toISOString(),
          end: new Date(v.end).toISOString(),
        },
        location: { type: 'Point', coordinates: [v.lng, v.lat] },
      };
      await api(id ? `/listings/${id}` : '/listings', {
        method: id ? 'PATCH' : 'POST',
        body,
      });
      await queryClient.invalidateQueries();
      navigate('/dashboard');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="mx-auto max-w-3xl py-12">
      <Heading
        eyebrow="RESTAURANT"
        title={id ? 'Edit your listing.' : 'Make surplus count.'}
      >
        Enter times in your device timezone:{' '}
        {Intl.DateTimeFormat().resolvedOptions().timeZone}.
      </Heading>
      <div className="mb-8 rounded-2xl bg-white p-5 dark:bg-stone-900">
        <h2 className="font-semibold">Optional AI draft assistant</h2>
        <label className="mt-3 block text-sm">
          Rough food note
          <textarea
            className="field mt-2"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={4000}
          />
        </label>
        <label className="mt-3 block text-sm">
          Food photo for AI (not uploaded to the listing)
          <input
            className="mt-2 block"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => choose(e.target.files[0])}
          />
        </label>
        <button
          disabled={busy || (!note && !image)}
          className="button mt-4 disabled:opacity-40"
          onClick={assist}
        >
          {busy ? 'Preparing draft...' : 'Suggest listing details'}
        </button>
        {ai && (
          <div role="status" className="mt-4 text-sm">
            <p>
              {ai.reason || 'Draft filled. Review all fields before posting.'}
            </p>
            {ai.fields?.safetyWarnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <p className="mt-2 font-semibold">{ai.disclaimer}</p>
          </div>
        )}
      </div>
      <form
        onSubmit={handleSubmit(submit)}
        className="grid gap-5 sm:grid-cols-2"
      >
        <LocationPicker
          label="Pickup location"
          value={{ lat: watch('lat'), lng: watch('lng') }}
          onChange={(point) => {
            setValue('lat', point.lat, { shouldValidate: true });
            setValue('lng', point.lng, { shouldValidate: true });
          }}
          error={errors.lat || errors.lng}
          saved={
            org.data
              ? {
                  lat: org.data.location.coordinates[1],
                  lng: org.data.location.coordinates[0],
                }
              : null
          }
        />
        {[
          ['title', 'Title'],
          ['description', 'Description'],
          ['dietary', 'Dietary tags, comma separated'],
          ['quantity', 'Quantity'],
          ['servings', 'Servings'],
          ['preparedAt', 'Prepared at'],
          ['bestBefore', 'Food deadline'],
          ['start', 'Pickup starts'],
          ['end', 'Pickup ends'],
          ['photo', 'Photo URL (optional)'],
        ].map(([name, label]) => (
          <label key={name} className="text-sm font-semibold">
            {label}
            <input
              className="field mt-2"
              type={
                ['preparedAt', 'bestBefore', 'start', 'end'].includes(name)
                  ? 'datetime-local'
                  : 'text'
              }
              {...register(name)}
              aria-invalid={Boolean(errors[name])}
            />
            {errors[name] && (
              <span className="mt-1 block text-red-700">
                {errors[name].message}
              </span>
            )}
          </label>
        ))}
        {[
          ['category', ['cooked', 'bakery', 'produce', 'packaged', 'dairy']],
          ['unit', ['kg', 'boxes', 'items', 'litres', 'portions']],
        ].map(([name, values]) => (
          <label key={name} className="text-sm font-semibold">
            {name}
            <select className="field mt-2" {...register(name)}>
              {values.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        <label className="text-sm">
          Upload listing photo (public)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(e) => upload(e.target.files[0])}
          />
        </label>
        {retryFile && !uploading && (
          <button
            type="button"
            className="underline"
            onClick={() => upload(retryFile)}
          >
            Retry photo upload
          </button>
        )}
        {uploading && <p role="status">Uploading photo...</p>}
        {uploaded && (
          <div className="sm:col-span-2">
            <img
              className="max-h-48 rounded"
              src={uploaded}
              alt="Uploaded listing photo preview"
            />
            <button
              type="button"
              className="mt-2 underline"
              onClick={async () => {
                try {
                  await api(
                    `/uploads/${new URL(uploaded).pathname.split('/').pop()}`,
                    { method: 'DELETE' },
                  );
                  setValue('photo', '');
                  setUploaded('');
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Remove newly uploaded photo
            </button>
          </div>
        )}
        <p className="text-sm sm:col-span-2">
          Demo storage: JPEG/PNG/WebP under5MB input, compressed to1MB. Up
          to20images/10MiB per account. Listing photos are public; do not upload
          private documents here.
        </p>
        <label className="flex gap-3 rounded-xl border border-stone-300 p-4 text-sm sm:col-span-2">
          <input type="checkbox" {...register('confirmed')} />I reviewed
          ingredients, allergens, storage, quantity and the safe deadline. AI
          suggestions do not certify food safety.
        </label>
        {errors.confirmed && (
          <p role="alert" className="text-red-700 sm:col-span-2">
            {errors.confirmed.message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <button
          disabled={isSubmitting || uploading}
          className="button sm:col-span-2"
        >
          {isSubmitting ? 'Saving...' : 'Review confirmed. Save listing'}
        </button>
      </form>
    </section>
  );
}
