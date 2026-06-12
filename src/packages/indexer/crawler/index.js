// Crawler implementation for PostSnail feeds

export default class PostSnailCrawler {
  constructor() {
    this.discoveryPaths = [
      '.well-known/postsnail.json',
      'postsnail.manifest.json',
      'feed.json',
      'rss.xml'
    ];
  }

  async crawl(siteUrl) {
    // Resolve the site URL to ensure it has a protocol
    const url = this.resolveUrl(siteUrl);
    
    // Try to discover the feed using different methods
    const feedUrls = await this.discoverFeedUrls(url);
    
    // Fetch and parse each feed
    const feedData = [];
    for (const feedUrl of feedUrls) {
      try {
        const data = await this.fetchAndParseFeed(feedUrl);
        if (data) {
          feedData.push(data);
        }
      } catch (error) {
        console.warn(`Failed to fetch feed from ${feedUrl}:`, error.message);
        // Continue with other feeds
      }
    }
    
    return {
      siteUrl: url,
      feeds: feedData,
      timestamp: new Date().toISOString()
    };
  }

  async discoverFeedUrls(siteUrl) {
    const urls = [];
    const baseUrl = this.getBaseUrl(siteUrl);
    
    // Try each discovery path
    for (const path of this.discoveryPaths) {
      try {
        const url = new URL(path, baseUrl).href;
        urls.push(url);
      } catch (error) {
        // Skip invalid paths
        console.warn(`Invalid discovery path ${path}:`, error.message);
      }
    }
    
    return urls;
  }

  async fetchAndParseFeed(feedUrl) {
    try {
      // Fetch the feed
      const response = await fetch(feedUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, application/rss+xml, text/xml',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      const content = await response.text();
      
      // Parse based on content type
      let parsedData = null;
      if (contentType.includes('json')) {
        parsedData = JSON.parse(content);
      } else if (contentType.includes('xml') || contentType.includes('rss')) {
        parsedData = await this.parseRSS(content);
      } else {
        // Try to parse as JSON first, then as XML
        try {
          parsedData = JSON.parse(content);
        } catch {
          parsedData = await this.parseRSS(content);
        }
      }
      
      // Add metadata
      return {
        url: feedUrl,
        type: contentType.includes('json') ? 'json' : 'rss',
        data: parsedData,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Feed fetch and parse error:', error);
      throw error;
    }
  }

  resolveUrl(url) {
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }

  getBaseUrl(url) {
    // Extract base URL without path
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch (error) {
      // Fallback for invalid URLs
      return url;
    }
  }

  async parseRSS(xmlContent) {
    // Simple XML parser for RSS feeds
    // In a real implementation, this would use a proper XML parser
    return {
      title: 'RSS Feed',
      description: 'RSS feed data',
      items: []
    };
  }
}