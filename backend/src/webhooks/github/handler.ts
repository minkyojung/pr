/**
 * GitHub Webhook Handler
 *
 * Main handler for GitHub webhook events.
 * Receives webhook, validates signature, parses event, and stores in database.
 */

import { Request, Response } from 'express';
import { GitHubEventType, GitHubWebhookPayload } from './types';
import { parseGitHubEvent } from './parser';
import { storeEvent } from '../../services/event-store';

/**
 * Supported GitHub event types for Phase 0 MVP
 */
const SUPPORTED_EVENTS: GitHubEventType[] = [
  'issues',
  'pull_request',
  'issue_comment',
  'pull_request_review_comment',
];

/**
 * Main webhook handler
 *
 * This is called after signature verification middleware.
 */
export async function handleGitHubWebhook(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // Get event type from header
    const eventType = req.headers['x-github-event'] as string;

    if (!eventType) {
      res.status(400).json({
        error: 'Missing X-GitHub-Event header',
      });
      return;
    }

    // Log received event
    console.log('Received GitHub webhook', {
      eventType,
      action: req.body.action,
      repository: req.body.repository?.full_name,
    });

    // Check if we support this event type
    if (!SUPPORTED_EVENTS.includes(eventType as GitHubEventType)) {
      console.log('Ignoring unsupported event type', { eventType });
      res.status(200).json({
        message: 'Event type not supported (Phase 0 MVP)',
        eventType,
      });
      return;
    }

    // Parse the event
    const payload = req.body as GitHubWebhookPayload;
    const parsedEvent = parseGitHubEvent(
      eventType as GitHubEventType,
      payload
    );

    // Store the event
    const eventId = await storeEvent(parsedEvent);

    // Send success response
    res.status(200).json({
      message: 'Webhook processed successfully',
      eventId,
      objectId: parsedEvent.objectId,
      eventType: parsedEvent.eventType,
      action: parsedEvent.action,
    });
  } catch (error) {
    console.error('Error processing GitHub webhook', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
    });

    res.status(500).json({
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Health check for webhook endpoint
 */
export function webhookHealthCheck(req: Request, res: Response): void {
  res.status(200).json({
    message: 'GitHub webhook endpoint is ready',
    supportedEvents: SUPPORTED_EVENTS,
  });
}
