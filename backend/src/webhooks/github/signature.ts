/**
 * GitHub Webhook Signature Verification
 *
 * Validates that incoming webhooks are genuinely from GitHub
 * by verifying the HMAC signature in the X-Hub-Signature-256 header.
 */

import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Verify GitHub webhook signature
 *
 * GitHub signs webhook payloads with HMAC-SHA256 using the webhook secret.
 * The signature is sent in the X-Hub-Signature-256 header.
 *
 * @param payload - Raw request body as string
 * @param signature - Signature from X-Hub-Signature-256 header
 * @param secret - Webhook secret from environment
 * @returns true if signature is valid
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  // Extract the hash from "sha256=<hash>"
  const hash = signature.substring(7);

  // Compute HMAC-SHA256 of the payload
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  const computed = hmac.digest('hex');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(computed, 'hex')
  );
}

/**
 * Express middleware to verify GitHub webhook signatures
 *
 * This middleware must be used with express.json({ verify: ... })
 * to preserve the raw body for signature verification.
 */
export function verifyGitHubSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const signature = req.headers['x-hub-signature-256'] as string;
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  // Check if secret is configured
  if (!secret) {
    console.error('GITHUB_WEBHOOK_SECRET is not configured');
    res.status(500).json({
      error: 'Webhook secret not configured',
    });
    return;
  }

  // Get raw body (stored by express.json with verify option)
  const rawBody = (req as any).rawBody;

  if (!rawBody) {
    console.error('Raw body not available for signature verification');
    res.status(500).json({
      error: 'Cannot verify signature: raw body not preserved',
    });
    return;
  }

  // Verify signature
  const isValid = verifySignature(rawBody, signature, secret);

  if (!isValid) {
    console.warn('Invalid GitHub webhook signature', {
      path: req.path,
      signature: signature ? 'present' : 'missing',
      ip: req.ip,
    });

    res.status(401).json({
      error: 'Invalid signature',
    });
    return;
  }

  // Signature is valid, proceed
  next();
}

/**
 * Create a middleware that preserves raw body for signature verification
 *
 * This must be used instead of express.json() for webhook endpoints
 */
export function preserveRawBody(
  req: Request,
  res: Response,
  buf: Buffer,
  encoding: BufferEncoding
): void {
  if (buf && buf.length) {
    (req as any).rawBody = buf.toString(encoding || 'utf8');
  }
}
