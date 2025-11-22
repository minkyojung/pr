/**
 * Object Detail Component
 * Migrated to shadcn/ui
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, ExternalLink, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function ObjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [object, setObject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similarObjects, setSimilarObjects] = useState<any[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  useEffect(() => {
    if (id) {
      loadObject(id);
    }
  }, [id]);

  useEffect(() => {
    if (object && id) {
      loadSimilarObjects(id);
    }
  }, [object, id]);

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

  const loadSimilarObjects = async (objectId: string) => {
    try {
      setLoadingSimilar(true);

      const response = await api.findSimilarObjects(objectId, {
        limit: 5,
        threshold: 0.4,
      });

      setSimilarObjects(response.data);
    } catch (err) {
      console.error('Failed to load similar objects:', err);
      // Don't show error for similar objects - it's optional
    } finally {
      setLoadingSimilar(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Error: {error}
          </AlertDescription>
        </Alert>
        <Link to="/" className="inline-block mt-4">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Timeline
          </Button>
        </Link>
      </div>
    );
  }

  if (!object) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertDescription>Object not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { title, body, actors, timestamps, properties, platform, object_type } =
    object;

  const getStateVariant = (state: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (state) {
      case 'open':
        return 'default';
      case 'closed':
        return 'destructive';
      case 'merged':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Link to="/" className="inline-block">
        <Button variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Timeline
        </Button>
      </Link>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Badge variant="secondary">{platform}</Badge>
            <Badge variant="outline">{object_type}</Badge>
            {properties.state && (
              <Badge variant={getStateVariant(properties.state)}>
                {properties.state}
              </Badge>
            )}
          </div>
          <CardTitle className="text-3xl">{title}</CardTitle>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          {/* Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div className="text-sm">
              <span className="font-semibold">Repository:</span>{' '}
              <span className="text-muted-foreground">{properties.repository}</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold">Created by:</span>{' '}
              <span className="text-muted-foreground">{actors.created_by}</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold">Created:</span>{' '}
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(timestamps.created_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
            <div className="text-sm">
              <span className="font-semibold">Updated:</span>{' '}
              <span className="text-muted-foreground">
                {formatDistanceToNow(new Date(timestamps.updated_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
            {properties.number && (
              <div className="text-sm">
                <span className="font-semibold">Number:</span>{' '}
                <span className="text-muted-foreground">#{properties.number}</span>
              </div>
            )}
          </div>

          {/* Body */}
          {body && (
            <div>
              <h2 className="text-xl font-semibold mb-3 pb-2 border-b">
                Description
              </h2>
              <div className="text-sm leading-relaxed whitespace-pre-wrap p-4 bg-muted rounded-lg">
                {body}
              </div>
            </div>
          )}

          {/* Actions */}
          {properties.url && (
            <div className="pt-4 border-t">
              <a
                href={properties.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button>
                  View on GitHub
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Similar Objects Section */}
      {(loadingSimilar || similarObjects.length > 0) && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Similar Objects
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loadingSimilar ? (
              <div className="text-center text-muted-foreground py-4">
                Finding similar objects...
              </div>
            ) : similarObjects.length > 0 ? (
              <div className="space-y-3">
                {similarObjects.map((similar) => (
                  <Link
                    key={similar.objectId}
                    to={`/object/${encodeURIComponent(similar.objectId)}`}
                    className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            {similar.objectType}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {Math.round(similar.similarityScore * 100)}% similar
                          </Badge>
                        </div>
                        <h3 className="font-medium text-sm mb-1 line-clamp-2">
                          {similar.title}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {similar.repository}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                No similar objects found
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
