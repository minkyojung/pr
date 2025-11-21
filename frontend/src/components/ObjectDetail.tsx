/**
 * Object Detail Component
 * Migrated to shadcn/ui
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, ExternalLink } from 'lucide-react';
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
    </div>
  );
}
