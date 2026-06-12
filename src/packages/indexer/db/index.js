// Database implementation for PostSnail indexer using localStorage
// This simulates a database layer for storing indexed feed data

export default class PostSnailDB {
  constructor() {
    this.DB_NAME = 'PostSnailIndex';
    this.VERSION = 1;
    this.STORE_NAME = 'indexedFeeds';
  }

  async init() {
    // In a real implementation, this would initialize a proper database
    // For now, we'll use localStorage as a mock database
    this.storage = localStorage;
    this.ensureStorageStructure();
  }

  ensureStorageStructure() {
    // Ensure the database structure exists in localStorage
    const existing = this.storage.getItem(this.DB_NAME);
    if (!existing) {
      const structure = {
        feeds: {},
        metadata: {
          lastUpdate: null,
          version: this.VERSION
        }
      };
      this.storage.setItem(this.DB_NAME, JSON.stringify(structure));
    }
  }

  async updateIndex(siteUrl, feedData, changes) {
    try {
      const dbData = this.getDatabaseData();
      
      // Update the feed data
      dbData.feeds[siteUrl] = {
        ...feedData,
        indexedAt: new Date().toISOString(),
        changes: changes || []
      };
      
      // Update metadata
      dbData.metadata.lastUpdate = new Date().toISOString();
      
      // Save back to storage
      this.storage.setItem(this.DB_NAME, JSON.stringify(dbData));
      
      return true;
    } catch (error) {
      console.error('Failed to update index:', error);
      throw error;
    }
  }

  async getSiteIndex(siteUrl) {
    const dbData = this.getDatabaseData();
    return dbData.feeds[siteUrl] || null;
  }

  async getAllSites() {
    const dbData = this.getDatabaseData();
    return Object.keys(dbData.feeds);
  }

  async search(query, options = {}) {
    const dbData = this.getDatabaseData();
    const results = [];
    
    // Simple search implementation
    const searchTerm = query.toLowerCase();
    const limit = options.limit || 100;
    let count = 0;
    
    for (const [siteUrl, feed] of Object.entries(dbData.feeds)) {
      if (count >= limit) break;
      
      // Search in feed items
      if (feed.data && feed.data.items) {
        for (const item of feed.data.items) {
          if (count >= limit) break;
          
          // Check title, description, content
          const searchFields = [
            item.title,
            item.description,
            item.content
          ].filter(Boolean).join(' ');
          
          if (searchFields.toLowerCase().includes(searchTerm)) {
            results.push({
              siteUrl: siteUrl,
              feed: feed,
              item: item,
              score: this.calculateSearchScore(searchFields, searchTerm)
            });
            count++;
          }
        }
      }
    }
    
    // Sort results by score
    results.sort((a, b) => b.score - a.score);
    
    return results;
  }

  calculateSearchScore(text, term) {
    // Simple scoring - higher score for more matches
    const normalizedText = text.toLowerCase();
    const normalizedTerm = term.toLowerCase();
    
    if (normalizedText.includes(normalizedTerm)) {
      return normalizedText.split(normalizedTerm).length - 1; // Number of matches
    }
    return 0;
  }

  getDatabaseData() {
    const data = this.storage.getItem(this.DB_NAME);
    if (!data) {
      return {
        feeds: {},
        metadata: {
          lastUpdate: null,
          version: this.VERSION
        }
      };
    }
    return JSON.parse(data);
  }
}