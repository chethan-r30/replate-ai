// Validate form labels, accessible errors and unauthenticated route redirects.
// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuthPage from './Auth.jsx';
import Guard from '../components/Guard.jsx';
import { useAuth } from '../stores/auth.js';
afterEach(() => cleanup());
describe('auth UI', () => {
  it('shows linked validation errors without sending invalid login', async () => {
    const login = vi.fn();
    useAuth.setState({ login, user: null, loading: false });
    render(
      <MemoryRouter>
        <AuthPage mode="login" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(login).not.toHaveBeenCalled();
  });
  it('offers supported public roles, never admin signup', () => {
    render(
      <MemoryRouter>
        <AuthPage mode="register" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('option', { name: 'NGO' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Admin' })).toBeNull();
  });
  it('redirects protected pages to login', () => {
    useAuth.setState({ user: null, loading: false });
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route
            path="/private"
            element={
              <Guard>
                <p>Private data</p>
              </Guard>
            }
          />
          <Route path="/login" element={<p>Login route</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Login route')).toBeTruthy();
    expect(screen.queryByText('Private data')).toBeNull();
  });
});
