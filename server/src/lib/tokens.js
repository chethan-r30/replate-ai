// JWTs carry a purpose claim and unique ID; persistent storage keeps only digests.
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { AppError } from '../middleware/errors.js';
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('hex');
export const tokenId = () => randomUUID();
export function signAccess(user, config) {
  return jwt.sign({ type: 'access' }, config.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
    subject: String(user._id),
    issuer: 'replate-ai',
    audience: 'replate-client',
    jwtid: tokenId(),
  });
}
export function signRefresh(user, family, config) {
  return jwt.sign({ type: 'refresh', family }, config.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
    subject: String(user._id),
    issuer: 'replate-ai',
    audience: 'replate-client',
    jwtid: tokenId(),
  });
}
export function verifyToken(token, type, config) {
  try {
    const data = jwt.verify(
      token,
      type === 'access' ? config.JWT_ACCESS_SECRET : config.JWT_REFRESH_SECRET,
      {
        algorithms: ['HS256'],
        issuer: 'replate-ai',
        audience: 'replate-client',
      },
    );
    if (data.type !== type) throw new Error('Wrong token purpose');
    return data;
  } catch {
    throw new AppError(401, 'Invalid or expired token');
  }
}
