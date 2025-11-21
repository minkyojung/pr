/**
 * Timeline Component
 * Migrated to shadcn/ui
 *
 * Displays a chronological list of events
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Bug,
  GitPullRequest,
  MessageSquare,
  Pin,
  ExternalLink,
} from 'lucide-react';
import { api } from '../services/api';
import type { TimelineEntry } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
        return <Bug className="h-6 w-6" />;
      case 'pull_request':
        return <GitPullRequest className="h-6 w-6" />;
      case 'issue_comment':
      case 'pull_request_review_comment':
        return <MessageSquare className="h-6 w-6" />;
      default:
        return <Pin className="h-6 w-6" />;
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
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              Loading timeline...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-destructive">
              Error: {error}
              <Button onClick={loadTimeline} variant="default" className="ml-4">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-3xl mb-4">Timeline</CardTitle>
          <div className="flex gap-4 flex-wrap">
            <Input
              type="text"
              placeholder="Filter by repository (e.g., owner/repo)"
              value={filter.repository}
              onChange={(e) =>
                setFilter({ ...filter, repository: e.target.value })
              }
              className="flex-1 min-w-[200px]"
            />
            <Select
              value={filter.objectType}
              onValueChange={(value) =>
                setFilter({ ...filter, objectType: value })
              }
            >
              <SelectTrigger className="flex-1 min-w-[200px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">All Types</SelectItem>
                <SelectItem value="issue">Issues</SelectItem>
                <SelectItem value="pull_request">Pull Requests</SelectItem>
                <SelectItem value="comment">Comments</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Filter by actor"
              value={filter.actor}
              onChange={(e) => setFilter({ ...filter, actor: e.target.value })}
              className="flex-1 min-w-[200px]"
            />
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-lg text-muted-foreground">No events found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Try adjusting your filters or wait for new events from GitHub
                webhooks
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <div
                  key={entry.eventId}
                  className="flex gap-4 p-5 border rounded-lg hover:border-primary transition-colors"
                >
                  <div className="flex-shrink-0 text-muted-foreground">
                    {getEventIcon(entry.eventType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-sm mb-2">
                      <span className="font-semibold">{entry.actor}</span>
                      <span className="text-muted-foreground">
                        {getEventDescription(entry)}
                      </span>
                      <span className="text-primary font-medium">
                        {entry.repository}
                      </span>
                    </div>
                    <Link
                      to={`/object/${encodeURIComponent(entry.objectId)}`}
                      className="block text-lg font-semibold text-primary hover:underline my-2"
                    >
                      {entry.title}
                    </Link>
                    <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground mt-3">
                      <span className="text-muted-foreground/70">
                        {formatDistanceToNow(new Date(entry.timestamp), {
                          addSuffix: true,
                        })}
                      </span>
                      <Badge variant="secondary">{entry.objectType}</Badge>
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        View on GitHub
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
