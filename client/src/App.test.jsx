// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { useAuth } from './stores/auth.js';
afterEach(cleanup);
function view(path = '/') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('renders public home, toggles themes and renders unknown route', () => {
  useAuth.setState({ user: null, loading: false, restore: vi.fn() });
  view();
  expect(
    screen.getByRole('heading', { name: 'Good food. Better shared.' }),
  ).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Use dark theme'));
  fireEvent.click(screen.getByLabelText('Use light theme'));
  cleanup();
  view('/unknown');
  expect(screen.getByText('This page is being built.')).toBeTruthy();
});
it('signs out and clears private cache', async () => {
  const logout = vi.fn().mockResolvedValue(undefined);
  useAuth.setState({
    user: { id: 'u' },
    loading: false,
    restore: vi.fn(),
    logout,
  });
  view();
  fireEvent.click(screen.getByText('Sign out'));
  expect(logout).toHaveBeenCalled();
});
