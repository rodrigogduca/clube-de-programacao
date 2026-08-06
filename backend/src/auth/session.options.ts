import type { SessionOptions } from 'iron-session';
import { ConfigService } from '@nestjs/config';

const DEFAULT_COOKIE_NAME = 'club_session';
const DEFAULT_TTL_HOURS = 12;

export function buildSessionOptions(config: ConfigService): SessionOptions {
  const password = config.get<string>('SESSION_SECRET');
  if (!password) {
    throw new Error('SESSION_SECRET is required');
  }

  const ttlHours = Number(
    config.get<string>('SESSION_TTL_HOURS') ?? DEFAULT_TTL_HOURS,
  );
  const cookieName =
    config.get<string>('SESSION_COOKIE_NAME') ?? DEFAULT_COOKIE_NAME;
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  return {
    cookieName,
    password,
    ttl: Math.max(ttlHours, 1) * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    },
  };
}
