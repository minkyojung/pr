/**
 * Timeline Service
 *
 * Provides timeline views combining events and canonical objects
 */

import db from '../db/client';

export interface TimelineEntry {
  // Event info
  eventId: string;
  eventType: string;
  action: string;
  timestamp: string;
  actor: string;

  // Object info
  objectId: string;
  objectType: string;
  platform: string;
  title: string;
  repository: string;
  url: string;

  // Additional metadata
  properties: any;
}

export interface TimelineFilters {
  repository?: string;
  objectType?: 'issue' | 'pull_request' | 'comment';
  actor?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get timeline entries
 *
 * Joins event_log with canonical_objects to provide rich timeline view
 */
export async function getTimeline(
  filters: TimelineFilters = {}
): Promise<TimelineEntry[]> {
  const {
    repository,
    objectType,
    actor,
    limit = 50,
    offset = 0,
  } = filters;

  // Build WHERE conditions
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (repository) {
    conditions.push(`c.properties->>'repository' = $${paramIndex}`);
    params.push(repository);
    paramIndex++;
  }

  if (objectType) {
    conditions.push(`e.object_type = $${paramIndex}`);
    params.push(objectType);
    paramIndex++;
  }

  if (actor) {
    conditions.push(`e.actor = $${paramIndex}`);
    params.push(actor);
    paramIndex++;
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const query = `
    SELECT
      e.event_id,
      e.event_type,
      e.diff->>'action' as action,
      e.timestamp,
      e.actor,
      e.object_id,
      e.object_type,
      e.platform,
      c.title,
      c.properties->>'repository' as repository,
      c.properties->>'url' as url,
      c.properties as properties
    FROM event_log e
    LEFT JOIN canonical_objects c ON e.object_id = c.id
    ${whereClause}
    ORDER BY e.timestamp DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(limit, offset);

  const result = await db.query(query, params);

  return result.rows.map((row) => ({
    eventId: row.event_id,
    eventType: row.event_type,
    action: row.action || 'unknown',
    timestamp: row.timestamp,
    actor: row.actor,
    objectId: row.object_id,
    objectType: row.object_type,
    platform: row.platform,
    title: row.title || '',
    repository: row.repository || '',
    url: row.url || '',
    properties: row.properties || {},
  }));
}

/**
 * Get timeline statistics
 */
export async function getTimelineStats(): Promise<{
  totalEvents: number;
  totalObjects: number;
  eventsByType: Record<string, number>;
  objectsByType: Record<string, number>;
}> {
  // Total events
  const eventsResult = await db.query(
    'SELECT COUNT(*) as count FROM event_log'
  );
  const totalEvents = parseInt(eventsResult.rows[0].count);

  // Total objects
  const objectsResult = await db.query(
    'SELECT COUNT(*) as count FROM canonical_objects'
  );
  const totalObjects = parseInt(objectsResult.rows[0].count);

  // Events by type
  const eventTypesResult = await db.query(`
    SELECT event_type, COUNT(*) as count
    FROM event_log
    GROUP BY event_type
  `);
  const eventsByType: Record<string, number> = {};
  eventTypesResult.rows.forEach((row) => {
    eventsByType[row.event_type] = parseInt(row.count);
  });

  // Objects by type
  const objectTypesResult = await db.query(`
    SELECT object_type, COUNT(*) as count
    FROM canonical_objects
    GROUP BY object_type
  `);
  const objectsByType: Record<string, number> = {};
  objectTypesResult.rows.forEach((row) => {
    objectsByType[row.object_type] = parseInt(row.count);
  });

  return {
    totalEvents,
    totalObjects,
    eventsByType,
    objectsByType,
  };
}
