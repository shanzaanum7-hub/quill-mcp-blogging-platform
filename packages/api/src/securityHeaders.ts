import type { FastifyInstance } from 'fastify';

export function registerSecurityHeaders(app: FastifyInstance, production: boolean): void {
  app.addHook('onSend', (_request, reply, _payload, done) => {
    void reply.header('X-Content-Type-Options', 'nosniff');
    void reply.header('X-Frame-Options', 'DENY');
    void reply.header('X-XSS-Protection', '1; mode=block');
    void reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    void reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    void reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';",
    );
    if (production) {
      void reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    done();
  });
}