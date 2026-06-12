/**
 * Search client configuration
 */

export const SEARCH_CONFIG = {
  // Search engine options
  searchOptions: {
    fuzzy: 0.2,
    prefix: true,
    boost: {
      title: 2,
      tags: 1.5
    },
    combineWith: 'AND'
  },

  // Indexing options
  indexingOptions: {
    fields: ['title', 'content', 'author', 'tags'],
    storeFields: ['title', 'content', 'author', 'url', 'published', 'tags'],
    idField: 'id'
  },

  // Results options
  resultsOptions: {
    maxResults: 20,
    minScore: 0.1
  },

  // Performance options
  performance: {
    // Maximum time to spend on search (milliseconds)
    maxSearchTime: 1000,
    // Maximum documents to index
    maxDocuments: 10000
  },

  // Cache options
  cache: {
    enabled: true,
    maxSize: 100,
    ttl: 3600000 // 1 hour in milliseconds
  }
};

/**
 * Default search service options
 */
export const DEFAULT_SEARCH_OPTIONS = {
  fuzzy: 0.2,
  prefix: true,
  boost: {
    title: 2,
    tags: 1.5
  },
  combineWith: 'AND'
};

/**
 * Default indexing options
 */
export const DEFAULT_INDEXING_OPTIONS = {
  fields: ['title', 'content', 'author', 'tags'],
  storeFields: ['title', 'content', 'author', 'url', 'published', 'tags'],
  idField: 'id'
};