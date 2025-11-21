/**
 * Search Component
 * Migrated to shadcn/ui
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Search as SearchIcon } from 'lucide-react';
import { api } from '../services/api';
import type { SearchResult } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Search</CardTitle>
          <form onSubmit={handleSearch} className="flex gap-4 mt-4">
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search issues, PRs, comments..."
              autoFocus
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              <SearchIcon className="mr-2 h-4 w-4" />
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </form>
        </CardHeader>

        {error && (
          <CardContent>
            <div className="text-destructive">{error}</div>
          </CardContent>
        )}

        {searched && !loading && (
          <CardContent>
            <div className="border-b pb-4 mb-6">
              <h2 className="text-xl font-semibold">
                {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
              </h2>
            </div>

            {results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground">No results found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Try different keywords or check your spelling
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((result) => (
                  <Card
                    key={result.objectId}
                    className="hover:border-primary transition-colors"
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <Link
                          to={`/object/${encodeURIComponent(result.objectId)}`}
                          className="text-xl font-semibold text-primary hover:underline"
                        >
                          {result.title}
                        </Link>
                        <Badge variant="secondary">{result.objectType}</Badge>
                      </div>
                      <p className="text-muted-foreground leading-relaxed mb-4">
                        {result.body.substring(0, 200)}
                        {result.body.length > 200 && '...'}
                      </p>
                      <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                        <span className="font-semibold text-primary">
                          {result.repository}
                        </span>
                        <span>by {result.actors.created_by}</span>
                        <span className="text-muted-foreground/70">
                          {formatDistanceToNow(
                            new Date(result.timestamps.updated_at),
                            { addSuffix: true }
                          )}
                        </span>
                        <Badge variant="outline" className="ml-auto">
                          relevance: {(result.rank * 100).toFixed(1)}%
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
