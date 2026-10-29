// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AppUpdate from './AppUpdate.jsx';
afterEach(() => {
  cleanup();
  delete navigator.serviceWorker;
});
it('offers an explicit update for a waiting offline shell without discarding a form automatically', async () => {
  const worker = { postMessage: vi.fn(), addEventListener: vi.fn() };
  const serviceWorker = {
    getRegistrations: vi.fn().mockResolvedValue([
      {
        waiting: worker,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    ]),
    addEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });
  render(<AppUpdate />);
  const button = await screen.findByText('Update app');
  expect(worker.postMessage).not.toHaveBeenCalled();
  fireEvent.click(button);
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  expect(serviceWorker.addEventListener).toHaveBeenCalledWith(
    'controllerchange',
    expect.any(Function),
    { once: true },
  );
});
it('does not show an update when no worker is waiting', async () => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: vi.fn().mockResolvedValue([]) },
  });
  render(<AppUpdate />);
  await Promise.resolve();
  expect(screen.queryByText('Update app')).toBeNull();
});
