import MiniSearch from 'minisearch';
import { SEARCH_CONFIG } from '../config/index.js';

/**
 * Search service for browser-side search functionality
 */
export class SearchService {
  constructor(options = {}) {
    // Merge options with defaults from config
    const defaultOptions = {
      fields: SEARCH_CONFIG.indexingOptions.fields,
      storeFields: SEARCH_CONFIG.indexingOptions.storeFields,
      searchOptions: SEARCH_CONFIG.searchOptions
    };
    
    this.options = { ...defaultOptions, ...options };
    this.miniSearch = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the search index
   * @param {Array} documents - Array of documents to index
   */
  async initialize(documents = []) {
    // Create MiniSearch instance with configuration
    this.miniSearch = new MiniSearch({
      fields: this.options.fields,
      storeFields: this.options.storeFields,
      searchOptions: this.options.searchOptions
    });

    // Load existing documents or initialize with empty index
    if (documents && documents.length > 0) {
      this.miniSearch.addAll(documents);
    }

    this.isInitialized = true;
    return true;
  }

  /**
   * Add a document to the search index
   * @param {Object} document - Document to add
   */
  addDocument(document) {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    this.miniSearch.add(document);
  }

  /**
   * Add multiple documents to the search index
   * @param {Array} documents - Array of documents to add
   */
  addDocuments(documents) {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    this.miniSearch.addAll(documents);
  }

  /**
   * Remove a document from the search index
   * @param {string} id - ID of document to remove
   */
  removeDocument(id) {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    this.miniSearch.remove(id);
  }

  /**
   * Get all indexed documents
   * @returns {Array} - All indexed documents
   */
  getAllDocuments() {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    return this.miniSearch.getAllDocuments();
  }

  /**
   * Get the total number of indexed documents
   * @returns {number} - Number of indexed documents
   */
  getDocumentCount() {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    return this.miniSearch.documentCount;
  }

  /**
   * Check if the search index is empty
   * @returns {boolean} - Whether index is empty
   */
  isEmpty() {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    return this.miniSearch.documentCount === 0;
  }

  /**
   * Clear the search index
   */
  clear() {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    this.miniSearch.removeAll();
  }

  /**
   * Export the search index
   * @returns {Object} - Exported index
   */
  exportIndex() {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    return this.miniSearch.export();
  }

  /**
   * Import a search index
   * @param {Object} index - Index to import
   */
  importIndex(index) {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    this.miniSearch.import(index);
  }

  /**
   * Check if a term exists in the search index
   * @param {string} term - Term to check
   * @returns {boolean} - Whether term exists
   */
  hasTerm(term) {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    return this.miniSearch.has(term);
  }

  /**
   * Get suggestions for a partial query
   * @param {string} query - Partial query
   * @returns {Array} - Suggested terms
   */
  suggest(query) {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    return this.miniSearch.suggest(query);
  }

  /**
   * Search for documents
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object[]>} - Search results
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    try {
      const searchOptions = { ...this.options.searchOptions, ...options };
      const results = this.miniSearch.search(query, searchOptions);
      return results;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  /**
   * Get search statistics
   * @returns {Object} - Search statistics
   */
  getStats() {
    if (!this.isInitialized) {
      throw new Error('Search service not initialized');
    }
    
    return {
      documentCount: this.miniSearch.documentCount,
      fields: this.options.fields,
      storeFields: this.options.storeFields
    };
  }
}