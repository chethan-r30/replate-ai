import { it, expect } from 'vitest';
import { imageUrl } from './images.js';
it('limits transformed images to the expected provider path', () => {
  expect(
    imageUrl('https://res.cloudinary.com/demo/image/upload/v1/food.png', 320),
  ).toContain('/f_auto,q_auto,w_320,c_limit/');
  expect(imageUrl('https://example.com/image/upload/a')).toBe(
    'https://example.com/image/upload/a',
  );
  expect(imageUrl('bad')).toBe('bad');
});
