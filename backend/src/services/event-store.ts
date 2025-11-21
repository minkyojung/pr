/**
 * Event Storage Service
 *
 * Handles storage of events in the database.
 * Implements the Event Sourcing pattern:
 * - All events are stored in event_log (append-only)
 * - Current state is computed and stored in canonical_objects
 */

import db from '../db/client';
import { ParsedGitHubEvent } from '../webhooks/github/types';

/**
 * Store a parsed event in the database
 *
 * This function performs two operations in a transaction:
 * 1. Insert the event into event_log
 * 2. Update or insert the current state in canonical_objects
 *
 * @param event - Parsed event from GitHub webhook
 * @returns The event_id of the stored event
 */
export async function storeEvent(
  event: ParsedGitHubEvent
): Promise<string> {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Insert into event_log
    const eventInsertQuery = `
      INSERT INTO event_log (
        object_id,
        platform,
        object_type,
        event_type,
        diff,
        actor,
        timestamp,
        raw
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING event_id
    `;

    const eventResult = await client.query(eventInsertQuery, [
      event.objectId,
      event.platform,
      event.objectType,
      event.eventType,
      JSON.stringify(event.diff),
      event.actor.login,
      event.timestamp,
      JSON.stringify(event.raw),
    ]);

    const eventId = eventResult.rows[0].event_id;

    // 2. Update or insert canonical_objects
    // Use UPSERT (INSERT ... ON CONFLICT ... UPDATE)
    const canonicalUpsertQuery = `
      INSERT INTO canonical_objects (
        id,
        platform,
        object_type,
        title,
        body,
        actors,
        timestamps,
        properties,
        search_text,
        raw
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        actors = EXCLUDED.actors,
        timestamps = EXCLUDED.timestamps,
        properties = EXCLUDED.properties,
        search_text = EXCLUDED.search_text,
        raw = EXCLUDED.raw
    `;

    // Prepare actors JSONB
    const actors = {
      created_by: event.actor.login,
      updated_by: event.actor.login,
      participants: [event.actor.login],
    };

    // Prepare timestamps JSONB
    const timestamps = {
      created_at: event.timestamp.toISOString(),
      updated_at: event.timestamp.toISOString(),
    };

    // Prepare properties JSONB
    const properties = {
      repository: event.repository.fullName,
      repositoryId: event.repository.id,
      number: event.object.number,
      url: event.object.url,
      state: event.object.state,
      merged: event.object.merged,
      draft: event.object.draft,
      headRef: event.object.headRef,
      baseRef: event.object.baseRef,
      lastAction: event.action,
      lastEventType: event.eventType,
    };

    // Generate search text for full-text search
    const searchText = [
      event.object.title || '',
      event.object.body || '',
      event.actor.login,
      event.repository.fullName,
    ]
      .filter(Boolean)
      .join(' ');

    await client.query(canonicalUpsertQuery, [
      event.objectId,
      event.platform,
      event.objectType,
      event.object.title || '',
      event.object.body || '',
      JSON.stringify(actors),
      JSON.stringify(timestamps),
      JSON.stringify(properties),
      searchText,
      JSON.stringify(event.raw),
    ]);

    await client.query('COMMIT');

    console.log('Event stored successfully', {
      eventId,
      objectId: event.objectId,
      eventType: event.eventType,
      action: event.action,
    });

    return eventId;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to store event', {
      objectId: event.objectId,
      eventType: event.eventType,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get event history for a specific object
 *
 * @param objectId - The object ID to fetch history for
 * @param limit - Maximum number of events to return
 * @returns Array of events ordered by timestamp (newest first)
 */
export async function getEventHistory(
  objectId: string,
  limit: number = 100
): Promise<any[]> {
  const query = `
    SELECT
      event_id,
      object_id,
      platform,
      object_type,
      event_type,
      diff,
      actor,
      timestamp,
      created_at
    FROM event_log
    WHERE object_id = $1
    ORDER BY timestamp DESC
    LIMIT $2
  `;

  const result = await db.query(query, [objectId, limit]);
  return result.rows;
}

/**
 * Get current state of an object
 *
 * @param objectId - The object ID
 * @returns The canonical object or null if not found
 */
export async function getCanonicalObject(
  objectId: string
): Promise<any | null> {
  const query = `
    SELECT
      id,
      platform,
      object_type,
      title,
      body,
      actors,
      timestamps,
      properties,
      search_text,
      raw
    FROM canonical_objects
    WHERE id = $1
  `;

  const result = await db.query(query, [objectId]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}
