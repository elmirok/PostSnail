// Main PostSnailIndexer implementation

import PostSnailCrawler from './crawler/index.js';
import PostSnailDB from './db/index.js';
import PostSnailIndexerUtils from './indexer-utils/index.js';
import PostSnailDiffing from './diffing/index.js';
import PostSnailStorage from './storage/index.js';

export class PostSnailIndexer {
  constructor() {
    this.crawler = new PostSnailCrawler();
    this.db = new PostSnailDB();
    this.utils = new PostSnailIndexerUtils();
    this.diffing = new PostSnailDiffing();
    this.storage = new PostSnailStorage();
    
    this.isInitialized = false;
  }

  async init() {
    try {
      await this.db.init();
      this.isInitialized = true;
      console.log('PostSnailIndexer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize PostSnailIndexer:', error);
      throw error;
    }
  }

  async indexSite(siteUrl) {
    if (!this.isInitialized) {
      throw new Error('Indexer not initialized. Call init() first.');
    }

    try {
      // Crawl the site to get feed data
      console.log(`Crawling site: ${siteUrl}`);
      const crawlResult = await this.crawler.crawl(siteUrl);
      
      // Process the crawled data
      console.log(`Processing crawled data for ${siteUrl}`);
      const processedData = await this.processFeedData(crawlResult);
      
      // Determine what changes occurred
      const changes = await this.diffing.compareFeedData(siteUrl, processedData);
      
      // Store in database
      console.log(`Storing indexed data for ${siteUrl}`);
      await this.db.updateIndex(siteUrl, processedData, changes);
      
      // Store in storage (for caching/short-term access)
      await this.storage.saveSiteData(siteUrl, processedData);
      
      return {
        success: true,
        siteUrl: siteUrl,
        changes: changes,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to index site ${siteUrl}:`, error);
      return {
        success: false,
        siteUrl: siteUrl,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async processFeedData(crawlResult) {
    // Convert crawled data to a standardized format
    const processed = {
      siteUrl: crawlResult.siteUrl,
      metadata: {
        crawledAt: crawlResult.timestamp,
        feeds: crawlResult.feeds.map(feed => ({
          url: feed.url,
          type: feed.type,
          fetchedAt: feed.fetchedAt
        }))
      },
      content: [],
      items: []
    };
    
    // Process each feed
    for (const feed of crawlResult.feeds) {
      if (feed.data && feed.data.items) {
        for (const item of feed.data.items) {
          processed.items.push(item);
          processed.content.push({
            ...item,
            sourceUrl: feed.url,
            sourceType: feed.type,
            indexedAt: new Date().toISOString()
          });
        }
      }
    }
    
    return processed;
  }

  async indexAllSites(sites) {
    const results = [];
    
    for (const site of sites) {
      const result = await this.indexSite(site);
      results.push(result);
    }
    
    return results;
  }

  async search(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Indexer not initialized. Call init() first.');
    }
    
    return await this.db.search(query, options);
  }

  async getSiteIndex(siteUrl) {
    if (!this.isInitialized) {
      throw new Error('Indexer not initialized. Call init() first.');
    }
    
    return await this.db.getSiteIndex(siteUrl);
  }

  async getAllIndexedSites() {
    if (!this.isInitialized) {
      throw new Error('Indexer not initialized. Call init() first.');
    }
    
    return await this.db.getAllSites();
  }
}