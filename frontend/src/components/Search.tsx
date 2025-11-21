/**
 * Search Component
 * Supports both Keyword Search and AI Semantic Search
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Search as SearchIcon, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import type { SearchResult, SemanticSearchResult } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type SearchMode = 'keyword' | 'semantic';

export function Search() {
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword');
  const [keywordResults, setKeywordResults] = useState<SearchResult[]>([]);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
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

      if (searchMode === 'keyword') {
        const response = await api.search(query);
        setKeywordResults(response.data);
        setSemanticResults([]);
      } else {
        const response = await api.semanticSearch(query);
        setSemanticResults(response.data);
        setKeywordResults([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const results = searchMode === 'keyword' ? keywordResults : semanticResults;
  const resultsCount = results.length;

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Search</CardTitle>

          {/* Search Mode Toggle */}
          <div className="flex items-center gap-4 mt-4">
            <Tabs value={searchMode} onValueChange={(value) => setSearchMode(value as SearchMode)}>
              <TabsList>
                <TabsTrigger value="keyword" className="flex items-center gap-2">
                  <SearchIcon className="h-4 w-4" />
                  Keyword
                </TabsTrigger>
                <TabsTrigger value="semantic" className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Semantic
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="text-sm text-muted-foreground">
              {searchMode === 'keyword'
                ? 'Search by exact keywords'
                : 'Search by meaning and context using AI'}
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex gap-4 mt-4">
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchMode === 'keyword'
                  ? "Search issues, PRs, comments..."
                  : "Ask in natural language (e.g., 'UI improvements', 'authentication bugs')"
              }
              autoFocus
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>
              {searchMode === 'semantic' && <Sparkles className="mr-2 h-4 w-4" />}
              {searchMode === 'keyword' && <SearchIcon className="mr-2 h-4 w-4" />}
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </form>
        </CardHeader>

        {error && (
          <CardContent>
            <div className="text-destructive">
              {error}
              {error.includes('OPENAI_API_KEY') && (
                <p className="text-sm mt-2">
                  Please configure your OpenAI API key in the backend .env file to use semantic search.
                </p>
              )}
            </div>
          </CardContent>
        )}

        {searched && !loading && (
          <CardContent>
            <div className="border-b pb-4 mb-6">
              <h2 className="text-xl font-semibold">
                {resultsCount} result{resultsCount !== 1 ? 's' : ''} for "{query}"
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {searchMode === 'keyword' && 'Showing exact keyword matches'}
                {searchMode === 'semantic' && 'Showing semantically similar results ranked by AI'}
              </p>
            </div>

            {resultsCount === 0 ? (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground">No results found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchMode === 'keyword'
                    ? 'Try different keywords or switch to Semantic Search'
                    : 'Try rephrasing your query or lowering the similarity threshold'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {searchMode === 'keyword' && keywordResults.map((result) => (
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

                {searchMode === 'semantic' && semanticResults.map((result) => (
                  <Card
                    key={result.id}
                    className="hover:border-primary transition-colors"
                  >
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <Link
                          to={`/object/${encodeURIComponent(result.payload.object_id)}`}
                          className="text-xl font-semibold text-primary hover:underline"
                        >
                          {result.payload.title}
                        </Link>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{result.payload.object_type}</Badge>
                          <Badge variant="outline" className="bg-gradient-to-r from-purple-500/10 to-pink-500/10">
                            <Sparkles className="h-3 w-3 mr-1" />
                            AI: {(result.score * 100).toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                        <span className="font-semibold text-primary">
                          {result.payload.repository}
                        </span>
                        <span>by {result.payload.created_by}</span>
                        {result.payload.state && (
                          <Badge variant="outline">{result.payload.state}</Badge>
                        )}
                        <span className="text-muted-foreground/70">
                          {formatDistanceToNow(
                            new Date(result.payload.updated_at),
                            { addSuffix: true }
                          )}
                        </span>
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
