/**
 * Utilities for search client
 */

/**
 * Transform feed data into searchable documents
 * @param {Array} feedData - Raw feed data from indexer
 * @returns {Array} - Array of searchable documents
 */
export function transformFeedDataToDocuments(feedData) {
  if (!feedData || !Array.isArray(feedData)) {
    return [];
  }

  return feedData.map(item => ({
    id: item.url || item.guid || Math.random().toString(36).substring(2, 9),
    title: item.title || '',
    content: item.content || item.description || '',
    author: item.author || item.creator || '',
    url: item.url || '',
    published: item.published || item.date || '',
    tags: item.categories || item.tags || [],
    site: item.site || '',
    ...item
  }));
}

/**
 * Format search results for display
 * @param {Array} results - Search results from MiniSearch
 * @param {number} maxResults - Maximum number of results to return
 * @returns {Array} - Formatted results
 */
export function formatSearchResults(results, maxResults = 20) {
  if (!results || !Array.isArray(results)) {
    return [];
  }

  return results.slice(0, maxResults).map(result => ({
    id: result.id,
    title: result.title,
    content: result.content,
    author: result.author,
    url: result.url,
    published: result.published,
    tags: result.tags,
    score: result.score,
    match: result.match
  }));
}

/**
 * Get document by ID from search index
 * @param {Object} searchService - Initialized SearchService instance
 * @param {string} id - Document ID
 * @returns {Object|null} - Document or null if not found
 */
export function getDocumentById(searchService, id) {
  if (!searchService || !searchService.miniSearch) {
    return null;
  }

  const document = searchService.miniSearch.search(id, {
    combineWith: 'AND',
    prefix: true
  })[0];
  
  return document || null;
}