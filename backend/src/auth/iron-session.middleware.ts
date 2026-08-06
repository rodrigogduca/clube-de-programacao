import { getIronSession, SessionOptions } from 'iron-session';
import type { Request, Response, NextFunction } from 'express';

export function ironSessionMiddleware(sessionOptions: SessionOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    getIronSession(req, res, sessionOptions)
      .then((session) => {
        (req as any).session = session;
        next();
      })
      .catch(next);
  };
}
