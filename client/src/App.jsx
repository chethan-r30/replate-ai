import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
const Explore = lazy(() => import('./pages/Explore.jsx'));
const ListingDetail = lazy(() => import('./pages/ListingDetail.jsx'));
const ListingForm = lazy(() => import('./pages/ListingForm.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const OrganizationPage = lazy(() => import('./pages/Organization.jsx'));
const Impact = lazy(() => import('./pages/Impact.jsx'));
import { useEffect } from 'react';
import AuthPage from './pages/Auth.jsx';
import Guard from './components/Guard.jsx';
import { useAuth } from './stores/auth.js';
// Public shell. Feature pages are introduced in their own tested phases.
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import {
  ArrowUpRight,
  Leaf,
  Moon,
  Sun,
  Utensils,
  HeartHandshake,
  Sprout,
} from 'lucide-react';
import { create } from 'zustand';
const useTheme = create((set) => ({
  dark: false,
  toggle: () => set((state) => ({ dark: !state.dark })),
}));
function Home() {
  return (
    <>
      <section className="grid gap-10 py-14 md:grid-cols-2 md:py-24">
        <div>
          <p className="eyebrow">LESS WASTE. MORE POSSIBILITY.</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.06] tracking-tight md:text-7xl">
            Good food.
            <br />
            Better shared.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-stone-600 dark:text-stone-300">
            Turn surplus into someone's next meal. A local connection between
            restaurants with extra and communities that need it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="button" to="/register">
              Start sharing <ArrowUpRight size={18} />
            </Link>
            <Link className="button secondary" to="/listings">
              Find food nearby
            </Link>
          </div>
          <p className="mt-5 text-sm text-stone-600 dark:text-stone-400 dark:text-stone-400">
            Made for restaurants, NGOs and the people between.
          </p>
        </div>
        <div className="relative flex min-h-80 flex-col justify-between overflow-hidden rounded-[2rem] bg-forest p-8 text-white">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-white/30 px-3 py-1 text-xs">
              SMALL ACTS. REAL IMPACT.
            </span>
            <Sprout size={27} />
          </div>
          <div
            className="my-9 flex items-center justify-center gap-4"
            aria-hidden="true"
          >
            <div className="grid h-24 w-24 place-items-center rounded-full bg-leaf text-forest">
              <Utensils size={44} />
            </div>
            <span className="text-4xl text-leaf">↗</span>
            <div className="grid h-24 w-24 place-items-center rounded-full border border-leaf/50">
              <HeartHandshake size={44} />
            </div>
          </div>
          <div>
            <p className="text-3xl font-medium">
              A second chance
              <br />
              for every serving.
            </p>
            <p className="mt-3 text-sm text-green-100">
              Fresh connections. Less food in landfill.
            </p>
          </div>
        </div>
      </section>
      <section className="border-t border-stone-200 py-10 dark:border-stone-700">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">A SIMPLE WAY TO GIVE BACK</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              From extra to essential.
            </h2>
          </div>
          <p className="max-w-sm text-stone-600 dark:text-stone-300">
            Human decisions first. Thoughtful tools to make sharing easier.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            [
              '01',
              'Post what is good',
              'Restaurants share food details, quantity and a safe pickup window.',
            ],
            [
              '02',
              'Find the right connection',
              'NGOs find nearby food that fits their needs and capacity.',
            ],
            [
              '03',
              'Make the handover',
              'Confirm pickup with a code. Good food reaches a new table.',
            ],
          ].map(([n, title, text]) => (
            <article
              key={n}
              className="rounded-2xl border border-stone-200 p-6 dark:border-stone-700"
            >
              <span className="text-sm text-stone-600 dark:text-stone-400">
                {n}
              </span>
              <h3 className="mt-6 text-xl font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-stone-600 dark:text-stone-300">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
function Pending() {
  return (
    <section className="py-20">
      <p className="eyebrow">UNDER DEVELOPMENT</p>
      <h1 className="mt-4 text-4xl font-semibold">This page is being built.</h1>
      <p className="mt-4">
        No listings, accounts or impact numbers are simulated here.
      </p>
      <Link to="/" className="button mt-6">
        Back to home
      </Link>
    </section>
  );
}
export default function App() {
  const { dark, toggle } = useTheme();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const restore = useAuth((s) => s.restore);
  useEffect(() => {
    restore();
  }, [restore]);
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-cream text-ink dark:bg-stone-950 dark:text-stone-100">
        <a href="#main" className="skip">
          Skip to content
        </a>
        <header className="border-b border-stone-200 dark:border-stone-700">
          <nav
            aria-label="Main navigation"
            className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5"
          >
            <Link
              to="/"
              className="flex items-center gap-2 text-xl font-bold tracking-tight"
            >
              <Leaf className="text-forest dark:text-leaf" />
              replate
              <span className="text-sm font-normal text-stone-600 dark:text-stone-400">
                AI
              </span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <NavLink to="/listings">Explore food</NavLink>
              <NavLink to="/impact">Our impact</NavLink>
              <button
                className="rounded-full p-2 hover:bg-stone-200 dark:hover:bg-stone-800"
                onClick={toggle}
                aria-label={dark ? 'Use light theme' : 'Use dark theme'}
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {user ? (
                <>
                  <Link className="font-semibold" to="/dashboard">
                    Dashboard
                  </Link>
                  <button
                    onClick={async () => {
                      await logout();
                      queryClient.clear();
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link className="font-semibold" to="/login">
                  Sign in <span aria-hidden="true">↗</span>
                </Link>
              )}
            </div>
          </nav>
        </header>
        {import.meta.env.VITE_DEMO_MODE === 'true' && (
          <aside
            aria-label="Demo limitations"
            className="border-b border-stone-300 bg-amber-50 px-5 py-3 text-sm text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
          >
            <div className="mx-auto max-w-6xl">
              Demo only. All seeded food and impact data is synthetic, not
              available for pickup. The free API may take about a minute to
              wake. Reminders pause while it sleeps; signup email and photo
              uploads need configured services. Use demo accounts, not real
              personal data.
            </div>
          </aside>
        )}
        <main id="main" className="mx-auto max-w-6xl px-5">
          <Suspense
            fallback={
              <p role="status" className="py-12">
                Loading page...
              </p>
            }
          >
            <Routes>
              <Route path="/" element={<Home />} />
              {['login', 'register'].map((mode) => (
                <Route
                  key={mode}
                  path={`/${mode}`}
                  element={<AuthPage mode={mode} />}
                />
              ))}
              <Route
                path="/forgot-password"
                element={<AuthPage mode="forgot" />}
              />
              <Route
                path="/reset-password"
                element={<AuthPage mode="reset" />}
              />
              <Route
                path="/verify-email"
                element={<AuthPage mode="verify" />}
              />
              <Route
                path="/dashboard"
                element={
                  <Guard>
                    <Dashboard />
                  </Guard>
                }
              />
              <Route path="/listings" element={<Explore />} />
              <Route
                path="/listings/new"
                element={
                  <Guard roles={['restaurant']}>
                    <ListingForm />
                  </Guard>
                }
              />
              <Route
                path="/listings/:id/edit"
                element={
                  <Guard roles={['restaurant']}>
                    <ListingForm />
                  </Guard>
                }
              />
              <Route path="/listings/:id" element={<ListingDetail />} />
              <Route
                path="/organization"
                element={
                  <Guard roles={['restaurant', 'ngo']}>
                    <OrganizationPage />
                  </Guard>
                }
              />
              <Route path="/impact" element={<Impact />} />
              <Route path="*" element={<Pending />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-stone-200 px-5 py-7 text-sm text-stone-600 dark:text-stone-400 dark:border-stone-700 dark:text-stone-400">
          <span>ReplateAI · Good food belongs on a table.</span>
          <span>Development preview · Not a live food service</span>
        </footer>
      </div>
    </div>
  );
}
