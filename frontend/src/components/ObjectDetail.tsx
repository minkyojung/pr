/**
 * Object Detail Component
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../services/api';
import './ObjectDetail.css';

export function ObjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [object, setObject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadObject(id);
    }
  }, [id]);

  const loadObject = async (objectId: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.getObject(objectId);
      setObject(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load object');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="object-detail-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="object-detail-container">
        <div className="error">
          Error: {error}
          <Link to="/" className="back-link">
            ← Back to Timeline
          </Link>
        </div>
      </div>
    );
  }

  if (!object) {
    return (
      <div className="object-detail-container">
        <div className="error">Object not found</div>
      </div>
    );
  }

  const { title, body, actors, timestamps, properties, platform, object_type } =
    object;

  return (
    <div className="object-detail-container">
      <Link to="/" className="back-link">
        ← Back to Timeline
      </Link>

      <div className="object-header">
        <div className="object-meta">
          <span className="object-platform">{platform}</span>
          <span className="object-type">{object_type}</span>
          {properties.state && (
            <span className={`object-state state-${properties.state}`}>
              {properties.state}
            </span>
          )}
        </div>
        <h1>{title}</h1>
      </div>

      <div className="object-info">
        <div className="info-item">
          <strong>Repository:</strong> {properties.repository}
        </div>
        <div className="info-item">
          <strong>Created by:</strong> {actors.created_by}
        </div>
        <div className="info-item">
          <strong>Created:</strong>{' '}
          {formatDistanceToNow(new Date(timestamps.created_at), {
            addSuffix: true,
          })}
        </div>
        <div className="info-item">
          <strong>Updated:</strong>{' '}
          {formatDistanceToNow(new Date(timestamps.updated_at), {
            addSuffix: true,
          })}
        </div>
        {properties.number && (
          <div className="info-item">
            <strong>Number:</strong> #{properties.number}
          </div>
        )}
      </div>

      {body && (
        <div className="object-body">
          <h2>Description</h2>
          <div className="body-content">{body}</div>
        </div>
      )}

      {properties.url && (
        <div className="object-actions">
          <a
            href={properties.url}
            target="_blank"
            rel="noopener noreferrer"
            className="view-on-github-button"
          >
            View on GitHub →
          </a>
        </div>
      )}
    </div>
  );
}
