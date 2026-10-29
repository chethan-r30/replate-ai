// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readProof } from '../lib/api.js';
import ProofLink from './ProofLink.jsx';
vi.mock('../lib/api.js', () => ({ readProof: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('shows authorized bytes inline and revokes the local preview when closed', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:synthetic');
  URL.revokeObjectURL = vi.fn();
  readProof.mockResolvedValue(new Blob(['synthetic'], { type: 'image/webp' }));
  render(<ProofLink url="/uploads/proof/507f1f77bcf86cd799439011" />);
  fireEvent.click(screen.getByText('View private proof'));
  expect(
    await screen.findByAltText('Uploaded organization verification proof'),
  ).toBeTruthy();
  expect(readProof).toHaveBeenCalledWith(
    '/uploads/proof/507f1f77bcf86cd799439011',
  );
  fireEvent.click(screen.getByText('Close proof'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
});
it('reports denied access and labels externally hosted links without privacy promises', async () => {
  readProof.mockRejectedValue(new Error('Permission denied'));
  render(<ProofLink url="/uploads/proof/507f1f77bcf86cd799439011" />);
  fireEvent.click(screen.getByText('View private proof'));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Permission denied',
  );
  cleanup();
  render(<ProofLink url="https://example.com/proof" />);
  expect(screen.getByRole('link').textContent).toBe(
    'Open externally hosted proof',
  );
});
