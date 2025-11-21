/**
 * Timeline Component
 *
 * Displays a chronological list of events
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../services/api';
import type { TimelineEntry } from '../services/api';
import './Timeline.css';

export function Timeline() {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState({
    repository: '',
    objectType: '',
    actor: '',
  });

  useEffect(() => {
    loadTimeline();
  }, [filter]);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = { limit: 50, stats: false };
      if (filter.repository) params.repository = filter.repository;
      if (filter.objectType) params.objectType = filter.objectType;
      if (filter.actor) params.actor = filter.actor;

      const response = await api.getTimeline(params);
      setEntries(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'issues':
        return '🐛';
      case 'pull_request':
        return '🔀';
      case 'issue_comment':
      case 'pull_request_review_comment':
        return '💬';
      default:
        return '📌';
    }
  };

  const getEventDescription = (entry: TimelineEntry) => {
    const { eventType, action, objectType } = entry;

    if (eventType === 'issues') {
      switch (action) {
        case 'opened':
          return 'opened issue';
        case 'closed':
          return 'closed issue';
        case 'reopened':
          return 'reopened issue';
        default:
          return `${action} issue`;
      }
    }

    if (eventType === 'pull_request') {
      switch (action) {
        case 'opened':
          return 'opened pull request';
        case 'closed':
          return 'closed pull request';
        case 'merged':
          return 'merged pull request';
        default:
          return `${action} pull request`;
      }
    }

    if (eventType.includes('comment')) {
      switch (action) {
        case 'created':
          return `commented on ${objectType === 'comment' ? entry.properties.number : ''}`;
        case 'edited':
          return `edited comment`;
        case 'deleted':
          return `deleted comment`;
        default:
          return `${action} comment`;
      }
    }

    return `${action} ${objectType}`;
  };

  if (loading) {
    return (
      <div className="timeline-container">
        <div className="loading">Loading timeline...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="timeline-container">
        <div className="error">
          Error: {error}
          <button onClick={loadTimeline} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-container">
      <div className="timeline-header">
        <h1>Timeline</h1>
        <div className="timeline-filters">
          <input
            type="text"
            placeholder="Filter by repository (e.g., owner/repo)"
            value={filter.repository}
            onChange={(e) =>
              setFilter({ ...filter, repository: e.target.value })
            }
            className="filter-input"
          />
          <select
            value={filter.objectType}
            onChange={(e) =>
              setFilter({ ...filter, objectType: e.target.value })
            }
            className="filter-select"
          >
            <option value="">All Types</option>
            <option value="issue">Issues</option>
            <option value="pull_request">Pull Requests</option>
            <option value="comment">Comments</option>
          </select>
          <input
            type="text"
            placeholder="Filter by actor"
            value={filter.actor}
            onChange={(e) => setFilter({ ...filter, actor: e.target.value })}
            className="filter-input"
          />
        </div>
      </div>

      <div className="timeline-list">
        {entries.length === 0 ? (
          <div className="empty-state">
            <p>No events found</p>
            <p className="empty-state-hint">
              Try adjusting your filters or wait for new events from GitHub
              webhooks
            </p>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.eventId} className="timeline-entry">
              <div className="entry-icon">{getEventIcon(entry.eventType)}</div>
              <div className="entry-content">
                <div className="entry-header">
                  <span className="entry-actor">{entry.actor}</span>
                  <span className="entry-action">
                    {getEventDescription(entry)}
                  </span>
                  <span className="entry-repository">{entry.repository}</span>
                </div>
                <Link
                  to={`/object/${encodeURIComponent(entry.objectId)}`}
                  className="entry-title"
                >
                  {entry.title}
                </Link>
                <div className="entry-meta">
                  <span className="entry-time">
                    {formatDistanceToNow(new Date(entry.timestamp), {
                      addSuffix: true,
                    })}
                  </span>
                  <span className="entry-type">{entry.objectType}</span>
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="entry-link"
                  >
                    View on GitHub →
                  </a>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
