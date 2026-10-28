import { it, expect, vi, afterEach } from 'vitest';
import { coalesceEvents } from './coalesce-events.js';
afterEach(() => vi.useRealTimers());
it('debounces each private room without losing durable-row identity in the latest hint', () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const push = coalesceEvents(send);
  push('one', { id: 'n1' });
  push('one', { id: 'n2' });
  push('two', { id: 'n3' });
  expect(send).not.toHaveBeenCalled();
  vi.advanceTimersByTime(50);
  expect(send.mock.calls).toEqual([
    ['one', { id: 'n2' }],
    ['two', { id: 'n3' }],
  ]);
  push('one', { id: 'n4' });
  vi.advanceTimersByTime(50);
  expect(send).toHaveBeenLastCalledWith('one', { id: 'n4' });
});
it('bounds unique rooms and flushes instead of dropping hints', () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const push = coalesceEvents(send, { maxKeys: 1 });
  push('one', 1);
  push('two', 2);
  expect(send).toHaveBeenCalledWith('one', 1);
  vi.runAllTimers();
  expect(send).toHaveBeenCalledWith('two', 2);
  expect(send).toHaveBeenCalledTimes(2);
});
