// Shared accessible auth forms validate locally and display server failures.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../lib/api.js';
import { useAuth } from '../stores/auth.js';
const email = z.string().email('Enter a valid email');
const password = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(72)
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');
const schemas = {
  login: z.object({
    email,
    password: z.string().min(1, 'Enter your password'),
  }),
  register: z.object({
    name: z.string().min(2),
    email,
    password,
    role: z.enum(['restaurant', 'ngo', 'volunteer']),
  }),
  forgot: z.object({ email }),
  reset: z.object({ password }),
  verify: z.object({}),
};
export default function AuthPage({ mode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schemas[mode]),
    defaultValues: { role: 'restaurant' },
  });
  const titles = {
    login: 'Welcome back.',
    register: 'Make room for good.',
    forgot: 'Reset your password.',
    reset: 'Choose a new password.',
    verify: 'Verify your email.',
  };
  async function submit(values) {
    setError('');
    setNotice('');
    try {
      if (mode === 'login') {
        await login(values);
        navigate('/dashboard');
        return;
      }
      const paths = {
        register: '/auth/register',
        forgot: '/auth/forgot-password',
        reset: '/auth/reset-password',
        verify: '/auth/verify-email',
      };
      const result = await api(paths[mode], {
        method: 'POST',
        body: {
          ...values,
          ...(['verify', 'reset'].includes(mode)
            ? { token: params.get('token') }
            : {}),
        },
      });
      setNotice(
        mode === 'register'
          ? result.emailSent
            ? 'Check your email for the verification link.'
            : 'Account created. Email was not sent because SMTP is not configured. In local sandbox, use the development inbox.'
          : mode === 'forgot'
            ? 'If this account exists, a reset email has been requested.'
            : 'Done. You can now sign in.',
      );
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="mx-auto max-w-md py-14">
      <p className="eyebrow">REPLATEAI</p>
      <h1 className="my-4 text-4xl font-semibold tracking-tight">
        {titles[mode]}
      </h1>
      <p className="mb-8 text-stone-600 dark:text-stone-300">
        Share good food with your community.
      </p>
      <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
        {mode === 'register' && (
          <Field
            label="Your name"
            name="name"
            register={register}
            errors={errors}
            autoComplete="name"
          />
        )}
        {['login', 'register', 'forgot'].includes(mode) && (
          <Field
            label="Email"
            name="email"
            type="email"
            register={register}
            errors={errors}
            autoComplete="email"
          />
        )}
        {['login', 'register', 'reset'].includes(mode) && (
          <Field
            label="Password"
            name="password"
            type="password"
            register={register}
            errors={errors}
            autoComplete={
              mode === 'login' ? 'current-password' : 'new-password'
            }
          />
        )}
        {mode === 'register' && (
          <div>
            <label htmlFor="role" className="mb-2 block text-sm font-semibold">
              I am joining as
            </label>
            <select id="role" {...register('role')} className="field">
              <option value="restaurant">Restaurant</option>
              <option value="ngo">NGO</option>
              <option value="volunteer">Volunteer</option>
            </select>
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
              Restaurants and NGOs need email verification and admin approval
              before posting or claiming.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-green-50 p-3 text-green-900"
          >
            {notice}
          </p>
        )}
        <button disabled={isSubmitting} className="button w-full">
          {isSubmitting
            ? 'Please wait...'
            : mode === 'login'
              ? 'Sign in'
              : mode === 'register'
                ? 'Create account'
                : mode === 'verify'
                  ? 'Verify email'
                  : 'Continue'}
        </button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-3 text-sm underline">
        {mode !== 'login' && <Link to="/login">Sign in</Link>}
        {mode === 'login' && (
          <>
            <Link to="/register">Create account</Link>
            <Link to="/forgot-password">Forgot password?</Link>
          </>
        )}
      </div>
    </section>
  );
}
function Field({ label, name, register, errors, type = 'text', autoComplete }) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      <input
        className="field"
        id={name}
        type={type}
        autoComplete={autoComplete}
        {...register(name)}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
      />
      {errors[name] && (
        <p
          id={`${name}-error`}
          className="mt-2 text-sm text-red-700 dark:text-red-300"
        >
          {errors[name].message}
        </p>
      )}
    </div>
  );
}
