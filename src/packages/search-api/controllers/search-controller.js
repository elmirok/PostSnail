// Search API controller implementation for PostSnail Reader

export class SearchAPIController {
  constructor(service) {
    this.service = service;
  }

  // Validate search query parameter
  validateSearchQuery(query) {
    if (!query || typeof query !== 'string') {
      return {
        isValid: false,
        error: 'Search query must be a non-empty string'
      };
    }
    
    if (query.length > 1000) {
      return {
        isValid: false,
        error: 'Search query exceeds maximum length of 1000 characters'
      };
    }
    
    return {
      isValid: true,
      error: null
    };
  }

  // Validate site URL parameter
  validateSiteUrl(siteUrl) {
    if (!siteUrl || typeof siteUrl !== 'string') {
      return {
        isValid: false,
        error: 'Site URL must be a non-empty string'
      };
    }
    
    try {
      const url = new URL(siteUrl);
      if (!url.protocol.startsWith('http')) {
        return {
          isValid: false,
          error: 'Site URL must use HTTP or HTTPS protocol'
        };
      }
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid site URL format'
      };
    }
    
    return {
      isValid: true,
      error: null
    };
  }

  // Validate search options parameter
  validateOptions(options) {
    if (!options || typeof options !== 'object') {
      return {
        isValid: true,
        error: null
      };
    }
    
    const allowedKeys = ['limit', 'offset', 'includeContent'];
    const invalidKeys = Object.keys(options).filter(key => !allowedKeys.includes(key));
    
    if (invalidKeys.length > 0) {
      return {
        isValid: false,
        error: `Invalid options keys: ${invalidKeys.join(', ')}`
      };
    }
    
    if (options.limit && (typeof options.limit !== 'number' || options.limit < 0)) {
      return {
        isValid: false,
        error: 'Limit must be a non-negative number'
      };
    }
    
    if (options.offset && (typeof options.offset !== 'number' || options.offset < 0)) {
      return {
        isValid: false,
        error: 'Offset must be a non-negative number'
      };
    }
    
    return {
      isValid: true,
      error: null
    };
  }

  // Search endpoint handler
  async searchHandler(request, reply) {
    try {
      // Extract query from request
      const query = request.query.q || request.query.query || '';
      const options = request.query;
      
      // Validate inputs
      const queryValidation = this.validateSearchQuery(query);
      if (!queryValidation.isValid) {
        return reply.status(400).send({
          error: queryValidation.error,
          code: 'INVALID_QUERY'
        });
      }
      
      const optionsValidation = this.validateOptions(options);
      if (!optionsValidation.isValid) {
        return reply.status(400).send({
          error: optionsValidation.error,
          code: 'INVALID_OPTIONS'
        });
      }
      
      // Call service to perform search
      const results = await this.service.search(query, options);
      
      // Return successful response
      return reply.status(200).send(results);
    } catch (error) {
      console.error('Search API error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Get site index endpoint handler
  async getSiteIndexHandler(request, reply) {
    try {
      // Extract site URL from request
      const siteUrl = request.params.site;
      
      // Validate inputs
      const urlValidation = this.validateSiteUrl(siteUrl);
      if (!urlValidation.isValid) {
        return reply.status(400).send({
          error: urlValidation.error,
          code: 'INVALID_SITE_URL'
        });
      }
      
      // Call service to get site index
      const siteIndex = await this.service.getSiteIndex(siteUrl);
      
      // Return successful response
      return reply.status(200).send(siteIndex);
    } catch (error) {
      console.error('Get site index API error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Index specific site endpoint handler
  async indexSiteHandler(request, reply) {
    try {
      // Extract site URL from request
      const siteUrl = request.params.site;
      
      // Validate inputs
      const urlValidation = this.validateSiteUrl(siteUrl);
      if (!urlValidation.isValid) {
        return reply.status(400).send({
          error: urlValidation.error,
          code: 'INVALID_SITE_URL'
        });
      }
      
      // Call service to index site
      const result = await this.service.indexSite(siteUrl);
      
      // Return successful response
      return reply.status(200).send(result);
    } catch (error) {
      console.error('Index site API error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Get all indexed sites endpoint handler
  async getAllIndexedSitesHandler(request, reply) {
    try {
      // Call service to get all indexed sites
      const sites = await this.service.getAllIndexedSites();
      
      // Return successful response
      return reply.status(200).send(sites);
    } catch (error) {
      console.error('Get all indexed sites API error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Index all sites endpoint handler
  async indexAllSitesHandler(request, reply) {
    try {
      // Call service to index all sites
      const result = await this.service.indexAllSites();
      
      // Return successful response
      return reply.status(200).send(result);
    } catch (error) {
      console.error('Index all sites API error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Health check endpoint handler
  async healthHandler(request, reply) {
    try {
      // Call service to perform health check
      const health = await this.service.health();
      
      // Return successful response
      return reply.status(200).send(health);
    } catch (error) {
      console.error('Health check API error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Get search stats endpoint handler
  async getSearchStatsHandler(request, reply) {
    try {
      // Call service to get search stats
      const stats = await this.service.getSearchStats();
      
      // Return successful response
      return reply.status(200).send(stats);
    } catch (error) {
      console.error('Get search stats API error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Clear site index endpoint handler
  async clearSiteIndexHandler(request, reply) {
    try {
      // Extract site URL from request
      const siteUrl = request.params.site;
      
      // Validate inputs
      const urlValidation = this.validateSiteUrl(siteUrl);
      if (!urlValidation.isValid) {
        return reply.status(400).send({
          error: urlValidation.error,
          code: 'INVALID_SITE_URL'
        });
      }
      
      // Call service to clear site index
      const result = await this.service.clearSiteIndex(siteUrl);
      
      // Return successful response
      return reply.status(200).send(result);
    } catch (error) {
      console.error('Clear site index API error:', error);
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // Get controller instance (for external usage)
  getInstance() {
    return this;
  }

  // Validate all parameters at once (mock implementation)
  validateAllParameters(params) {
    return {
      isValid: true,
      error: null
    };
  }
}