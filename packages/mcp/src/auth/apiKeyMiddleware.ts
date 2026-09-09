/**
 * MCP API key authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header and delegates
 * verification to ApiKeyService.verifyKey — the same service used by the
 * REST API's requireApiKey middleware. No auth logic is duplicated here.
 */
import type { IncomingMessage } from 'node:http';
import { AppError } from '@quill/shared';
import type { ApiKeyService } from '@quill/services';

export type AuthResult = {
  userId: number;
};

/**
 * Validates the Authorization: Bearer <key> header on the incoming request.
 *
 * @throws AppError('INVALID_API_KEY', 401) if the header is missing, malformed,
 *   or if ApiKeyService.verifyKey rejects the key (invalid / revoked).
 */
export function verifyRequestApiKey(
  req: IncomingMessage,
  apiKeyService: ApiKeyService,
): AuthResult {
  const authorization = req.headers['authorization'];
  const rawKey =
    typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';

  if (!rawKey) {
    throw new AppError('INVALID_API_KEY', 'Missing or malformed Authorization header', 401);
  }

  // Delegates to existing ApiKeyService — handles hash comparison, revocation
  // check, and last_used_at update. Throws AppError('INVALID_API_KEY', 401) on failure.
  return apiKeyService.verifyKey(rawKey);
}
