import ProofLink from '../components/ProofLink.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
// Organizations explicitly choose timezone and submit proof for admin review.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, uploadImage, removeUpload } from '../lib/api.js';
import { Heading, Status } from '../components/States.jsx';
const schema = z.object({
  name: z.string().min(2),
  registrationNo: z.string().min(3),
  address: z.string().min(5),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Use a valid IANA timezone'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  capacity: z.coerce.number().int().positive(),
  proof: z.union([
    z.string().url(),
    z.string().regex(/^\/uploads\/proof\/[a-f0-9]{24}$/),
  ]),
  start: z.coerce.number().min(0).max(24),
  end: z.coerce.number().min(0).max(24),
  categories: z.string(),
  dietary: z.string(),
});
export default function OrganizationPage() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['organization'],
    queryFn: () => api('/organizations/mine'),
  });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [newProof, setNewProof] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      capacity: 100,
      start: 0,
      end: 24,
      categories: '',
      dietary: '',
    },
  });
  async function submit(v) {
    setError('');
    try {
      const body = {
        name: v.name,
        registrationNo: v.registrationNo,
        address: v.address,
        timezone: v.timezone,
        location: { type: 'Point', coordinates: [v.lng, v.lat] },
        capacity: v.capacity,
        operatingHours: { start: v.start, end: v.end },
        preferences: {
          categories: v.categories
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          dietary: v.dietary
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
        },
        verificationDocs: [v.proof],
      };
      await api(
        query.data ? `/organizations/${query.data._id}` : '/organizations',
        { method: query.data ? 'PATCH' : 'POST', body },
      );
      setNotice('Submitted for admin review. Changes require reapproval.');
      qc.invalidateQueries({ queryKey: ['organization'] });
    } catch (e) {
      setError(e.message);
    }
  }
  async function uploadProof(file) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      if (
        file.size > 5 * 1024 * 1024 ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      )
        throw new Error('Choose a JPEG, PNG or WebP proof image under 5MB');
      const data = await uploadImage(file, '/uploads/proof');
      setValue('proof', data.url, { shouldValidate: true });
      setNewProof(data.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  function edit() {
    const o = query.data;
    reset({
      name: o.name,
      registrationNo: o.registrationNo,
      address: o.address,
      timezone: o.timezone,
      lat: o.location.coordinates[1],
      lng: o.location.coordinates[0],
      capacity: o.capacity,
      proof: o.verificationDocs[0],
      start: o.operatingHours.start,
      end: o.operatingHours.end,
      categories: o.preferences?.categories.join(', '),
      dietary: o.preferences?.dietary.join(', '),
    });
  }
  return (
    <section className="mx-auto max-w-2xl py-12">
      <Heading
        eyebrow="YOUR ORGANIZATION"
        title="Build trust before sharing."
      />
      <Status query={query}>
        {query.data && (
          <div className="mb-6 rounded-xl bg-green-50 p-5 text-green-950">
            <p>
              {query.data.name} · {query.data.verificationStatus}
            </p>
            <button className="mt-2 underline" onClick={edit}>
              Load current details for editing
            </button>
          </div>
        )}
      </Status>
      <form
        onSubmit={handleSubmit(submit)}
        className="grid gap-5 sm:grid-cols-2"
      >
        <LocationPicker
          label="Organization location"
          value={{ lat: watch('lat'), lng: watch('lng') }}
          onChange={(point) => {
            setValue('lat', point.lat, { shouldValidate: true });
            setValue('lng', point.lng, { shouldValidate: true });
          }}
          error={errors.lat || errors.lng}
        />
        {[
          ['name', 'Organization name'],
          ['registrationNo', 'Registration number'],
          ['address', 'Address'],
          ['timezone', 'IANA timezone'],
          ['capacity', 'Daily meals capacity'],

          ['start', 'Opening hour (0-24)'],
          ['end', 'Closing hour (0-24)'],
          ['categories', 'Accepted categories, comma separated'],
          ['dietary', 'Required dietary tags, comma separated'],
        ].map(([name, label]) => (
          <label key={name} className="text-sm font-semibold">
            {label}
            <input
              className="field mt-2"
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
        <div className="sm:col-span-2">
          <label className="text-sm font-semibold">
            Upload verification proof image
            <input
              className="field mt-2"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(e) => uploadProof(e.target.files?.[0])}
            />
          </label>
          <p className="mt-2 text-sm">
            JPEG, PNG or WebP under 5MB. Uploaded images are readable only by
            you and admins. Do not include unnecessary personal information.
          </p>
          {newProof && (
            <button
              type="button"
              className="mt-2 underline"
              onClick={async () => {
                try {
                  await removeUpload(newProof);
                  setValue('proof', '');
                  setNewProof('');
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Remove newly uploaded proof
            </button>
          )}
          {uploading && <p role="status">Uploading proof...</p>}
          {watch('proof')?.startsWith('/uploads/proof/') ? (
            <ProofLink url={watch('proof')} />
          ) : (
            <label className="mt-3 block text-sm">
              Or an externally hosted proof URL
              <input className="field mt-2" {...register('proof')} />
            </label>
          )}
          {errors.proof && (
            <p role="alert">
              Upload proof or provide a valid externally hosted URL.
            </p>
          )}
        </div>
        <p className="text-sm text-stone-600 dark:text-stone-400 sm:col-span-2">
          Categories: cooked, bakery, produce, packaged, dairy. Tags: veg,
          vegan, halal, contains-nuts. Externally hosted URLs keep the privacy
          settings of their host; the app cannot make them private.
        </p>
        {error && (
          <p role="alert" className="text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="sm:col-span-2">
            {notice}
          </p>
        )}
        <button
          disabled={isSubmitting || uploading}
          className="button sm:col-span-2"
        >
          {isSubmitting ? 'Submitting...' : 'Submit for review'}
        </button>
      </form>
    </section>
  );
}
