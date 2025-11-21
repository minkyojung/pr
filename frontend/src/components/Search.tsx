/**
 * Search Component
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../services/api';
import type { SearchResult } from '../services/api';
import './Search.css';

export function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setSearched(true);

      const response = await api.search(query);
      setResults(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-container">
      <div className="search-header">
        <h1>Search</h1>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search issues, PRs, comments..."
            className="search-input"
            autoFocus
          />
          <button type="submit" className="search-button" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {error && <div className="error">{error}</div>}

      {searched && !loading && (
        <div className="search-results">
          <div className="results-header">
            <h2>
              {results.length} result{results.length !== 1 ? 's' : ''} for "
              {query}"
            </h2>
          </div>

          {results.length === 0 ? (
            <div className="empty-state">
              <p>No results found</p>
              <p className="empty-state-hint">
                Try different keywords or check your spelling
              </p>
            </div>
          ) : (
            <div className="results-list">
              {results.map((result) => (
                <div key={result.objectId} className="search-result">
                  <div className="result-header">
                    <Link
                      to={`/object/${encodeURIComponent(result.objectId)}`}
                      className="result-title"
                    >
                      {result.title}
                    </Link>
                    <span className="result-type">{result.objectType}</span>
                  </div>
                  <p className="result-body">
                    {result.body.substring(0, 200)}
                    {result.body.length > 200 && '...'}
                  </p>
                  <div className="result-meta">
                    <span className="result-repository">
                      {result.repository}
                    </span>
                    <span className="result-actor">
                      by {result.actors.created_by}
                    </span>
                    <span className="result-time">
                      {formatDistanceToNow(
                        new Date(result.timestamps.updated_at),
                        { addSuffix: true }
                      )}
                    </span>
                    <span className="result-rank">
                      relevance: {(result.rank * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
