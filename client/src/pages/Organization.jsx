// Organizations explicitly choose timezone and submit proof for admin review.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
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
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  capacity: z.coerce.number().int().positive(),
  proof: z.string().url(),
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
  const {
    register,
    handleSubmit,
    reset,
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
        {[
          ['name', 'Organization name'],
          ['registrationNo', 'Registration number'],
          ['address', 'Address'],
          ['timezone', 'IANA timezone'],
          ['lat', 'Latitude'],
          ['lng', 'Longitude'],
          ['capacity', 'Daily meals capacity'],
          ['proof', 'Proof document URL'],
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
        <p className="text-sm text-stone-600 dark:text-stone-400 sm:col-span-2">
          Categories: cooked, bakery, produce, packaged, dairy. Tags: veg,
          vegan, halal, contains-nuts. Upload image proof through the upload
          service when configured, or provide your hosted document URL. Proof is
          private to you and admins.
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
        <button disabled={isSubmitting} className="button sm:col-span-2">
          {isSubmitting ? 'Submitting...' : 'Submit for review'}
        </button>
      </form>
    </section>
  );
}
