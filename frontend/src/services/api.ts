/**
 * API Client Service
 *
 * Handles all API requests to the backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface TimelineEntry {
  eventId: string;
  eventType: string;
  action: string;
  timestamp: string;
  actor: string;
  objectId: string;
  objectType: string;
  platform: string;
  title: string;
  repository: string;
  url: string;
  properties: any;
}

export interface SearchResult {
  objectId: string;
  platform: string;
  objectType: string;
  title: string;
  body: string;
  repository: string;
  url: string;
  actors: any;
  timestamps: any;
  properties: any;
  rank: number;
}

export interface TimelineStats {
  totalEvents: number;
  totalObjects: number;
  eventsByType: Record<string, number>;
  objectsByType: Record<string, number>;
}

export interface TimelineResponse {
  success: boolean;
  data: TimelineEntry[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
  stats?: TimelineStats;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  data: SearchResult[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

export interface SemanticSearchResult {
  id: string;
  score: number;
  payload: {
    object_id: string;
    object_type: string;
    platform: string;
    repository: string;
    created_by: string;
    state: string;
    title: string;
    created_at: string;
    updated_at: string;
  };
}

export interface SemanticSearchResponse {
  success: boolean;
  query: string;
  data: SemanticSearchResult[];
  count: number;
}

export interface HybridSearchResult {
  objectId: string;
  platform: string;
  objectType: string;
  title: string;
  body: string;
  repository: string;
  url: string;
  actors: any;
  timestamps: any;
  properties: any;

  // Hybrid search metadata
  rrfScore: number;
  normalizedScore: number;
  matchType: 'keyword' | 'semantic' | 'hybrid';
  keywordRank?: number;
  semanticRank?: number;
  keywordScore?: number;
  semanticScore?: number;
}

export interface HybridSearchResponse {
  success: boolean;
  query: string;
  data: HybridSearchResult[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
  stats?: any;
}

export interface ObjectResponse {
  success: boolean;
  data: any;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get timeline entries
   */
  async getTimeline(params?: {
    repository?: string;
    objectType?: string;
    actor?: string;
    limit?: number;
    offset?: number;
    stats?: boolean;
  }): Promise<TimelineResponse> {
    const searchParams = new URLSearchParams();

    if (params?.repository) searchParams.set('repository', params.repository);
    if (params?.objectType) searchParams.set('objectType', params.objectType);
    if (params?.actor) searchParams.set('actor', params.actor);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    if (params?.stats) searchParams.set('stats', 'true');

    const query = searchParams.toString();
    const endpoint = `/api/timeline${query ? `?${query}` : ''}`;

    return this.request<TimelineResponse>(endpoint);
  }

  /**
   * Search objects (keyword search)
   */
  async search(
    query: string,
    params?: {
      objectType?: string;
      repository?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<SearchResponse> {
    const searchParams = new URLSearchParams({ q: query });

    if (params?.objectType) searchParams.set('objectType', params.objectType);
    if (params?.repository) searchParams.set('repository', params.repository);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    return this.request<SearchResponse>(`/api/search?${searchParams}`);
  }

  /**
   * Semantic search using AI embeddings
   */
  async semanticSearch(
    query: string,
    params?: {
      objectType?: string;
      repository?: string;
      limit?: number;
      threshold?: number;
    }
  ): Promise<SemanticSearchResponse> {
    const searchParams = new URLSearchParams({ q: query });

    if (params?.objectType) searchParams.set('objectType', params.objectType);
    if (params?.repository) searchParams.set('repository', params.repository);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.threshold) searchParams.set('threshold', params.threshold.toString());

    return this.request<SemanticSearchResponse>(`/api/search/semantic?${searchParams}`);
  }

  /**
   * Hybrid search combining keyword and semantic search using RRF
   */
  async hybridSearch(
    query: string,
    params?: {
      objectType?: string;
      repository?: string;
      limit?: number;
      offset?: number;
      minSources?: number;
      threshold?: number;
      rrfK?: number;
      stats?: boolean;
    }
  ): Promise<HybridSearchResponse> {
    const searchParams = new URLSearchParams({ q: query });

    if (params?.objectType) searchParams.set('objectType', params.objectType);
    if (params?.repository) searchParams.set('repository', params.repository);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    if (params?.minSources) searchParams.set('minSources', params.minSources.toString());
    if (params?.threshold) searchParams.set('threshold', params.threshold.toString());
    if (params?.rrfK) searchParams.set('rrfK', params.rrfK.toString());
    if (params?.stats) searchParams.set('stats', 'true');

    return this.request<HybridSearchResponse>(`/api/search/hybrid?${searchParams}`);
  }

  /**
   * Get object details
   */
  async getObject(objectId: string): Promise<ObjectResponse> {
    const encodedId = encodeURIComponent(objectId);
    return this.request<ObjectResponse>(`/api/objects/${encodedId}`);
  }

  /**
   * Get autocomplete suggestions
   */
  async getAutocompleteSuggestions(
    query: string,
    limit?: number
  ): Promise<{ success: boolean; query: string; suggestions: string[] }> {
    const searchParams = new URLSearchParams({ q: query });
    if (limit) searchParams.set('limit', limit.toString());

    return this.request(`/api/search/autocomplete?${searchParams}`);
  }

  /**
   * Find similar objects
   */
  async findSimilarObjects(
    objectId: string,
    params?: {
      limit?: number;
      threshold?: number;
      objectType?: string;
      repository?: string;
    }
  ): Promise<{
    success: boolean;
    objectId: string;
    data: any[];
    count: number;
  }> {
    const encodedId = encodeURIComponent(objectId);
    const searchParams = new URLSearchParams();

    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.threshold) searchParams.set('threshold', params.threshold.toString());
    if (params?.objectType) searchParams.set('objectType', params.objectType);
    if (params?.repository) searchParams.set('repository', params.repository);

    const query = searchParams.toString();
    return this.request(`/api/clustering/similar/${encodedId}${query ? `?${query}` : ''}`);
  }

  /**
   * Detect duplicate objects
   */
  async detectDuplicates(
    objectId: string,
    threshold?: number
  ): Promise<{
    success: boolean;
    objectId: string;
    data: any[];
    count: number;
  }> {
    const encodedId = encodeURIComponent(objectId);
    const searchParams = new URLSearchParams();

    if (threshold) searchParams.set('threshold', threshold.toString());

    const query = searchParams.toString();
    return this.request(`/api/clustering/duplicates/${encodedId}${query ? `?${query}` : ''}`);
  }
}

// Export singleton instance
export const api = new ApiClient(API_BASE_URL);
