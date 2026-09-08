import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@quill/shared';
import type { ApiKeyService } from '@quill/services';

export type AuthContext = {
  userId: number;
  authMethod: 'session' | 'api_key';
};

export type SessionData = {
  userId: number;
  email: string;
  username: string;
  createdAt: number;
};

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }

  interface Session {
    data?: SessionData;
  }
}

export async function requireSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const sessionData = request.session.data;
  if (!sessionData?.userId || !Number.isInteger(sessionData.userId) || Date.now() - sessionData.createdAt > SESSION_TTL_MS) {
    await request.session.destroy();
    throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  }
  request.auth = { userId: sessionData.userId, authMethod: 'session' };
}

export function requireApiKey(apiKeys: ApiKeyService) {
  return function apiKeyPreHandler(request: FastifyRequest, _reply: FastifyReply): void {
    const authorization = request.headers.authorization;
    const rawKey = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!rawKey) {
      throw new AppError('INVALID_API_KEY', 'Invalid API key', 401);
    }
    const { userId } = apiKeys.verifyKey(rawKey);
    request.auth = { userId, authMethod: 'api_key' };
  };
}