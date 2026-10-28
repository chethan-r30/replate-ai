// Print fresh secrets locally. Never redirect this output into tracked files.
import { randomBytes } from 'node:crypto';
console.log(`JWT_ACCESS_SECRET=${randomBytes(48).toString('base64url')}`);
console.log(`JWT_REFRESH_SECRET=${randomBytes(48).toString('base64url')}`);
