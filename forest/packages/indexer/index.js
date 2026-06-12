import sqlite3 from 'better-sqlite3';
import fs from 'fs';
import zlib from 'zlib';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ForestIndexer {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(__dirname, '../data/forest.db');
    this.outputDir = options.outputDir || path.join(__dirname, '../public');
    this.indexPath = path.join(this.outputDir, 'search-index.json');
    this.db = null;
  }

  async initialize() {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Initialize SQLite database
    this.db = sqlite3(this.dbPath);
    this.createTables();
  }

  createTables() {
    // Sites table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sites (
        handle TEXT PRIMARY KEY,
        site_url TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        avatar_url TEXT,
        post_count INTEGER DEFAULT 0,
        last_indexed_at TEXT,
        verification_status TEXT,
        manifest_version INTEGER,
        protocol TEXT,
        algorithm_digest TEXT,
        algorithm_signature TEXT,
        algorithm_fingerprint TEXT,
        bundle_fingerprint TEXT
      )
    `);

    // Posts table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_handle TEXT NOT NULL,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        tags TEXT,
        published_at TEXT,
        digest TEXT,
        FOREIGN KEY (site_handle) REFERENCES sites(handle)
      )
    `);

    // FTS5 virtual table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
        site_handle, title, body, tags,
        content='posts', content_rowid='id'
      )
    `);

    // Terms table for autocomplete
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS terms (
        term TEXT PRIMARY KEY,
        doc_freq INTEGER,
        posting_list BLOB
      )
    `);
  }

  async indexSite(siteData) {
    const { handle, siteUrl, title, description, avatarUrl, posts } = siteData;

    // Insert site
    this.db.exec(`
      INSERT OR REPLACE INTO sites 
      (handle, site_url, title, description, avatar_url, post_count, last_indexed_at, verification_status, manifest_version, protocol, algorithm_digest, algorithm_signature, algorithm_fingerprint, bundle_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      handle, siteUrl, title, description, avatarUrl, posts.length,
      siteData.lastIndexedAt, siteData.verificationStatus,
      siteData.manifestVersion, siteData.protocol,
      siteData.algorithm?.digest, siteData.algorithm?.signature, siteData.algorithm?.fingerprint,
      siteData.bundleFingerprint
    ]);

    // Insert posts
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      this.db.exec(`
        INSERT INTO posts (site_handle, slug, title, body, tags, published_at, digest)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        handle, post.slug, post.record?.title || post.slug,
        post.record?.body || '',
        JSON.stringify(post.record?.tags || []),
        post.record?.date_published || post.record?.date || '',
        post.digest
      ]);

      // Add to FTS5
      this.db.exec(`
        INSERT INTO posts_fts (site_handle, title, body, tags)
        VALUES (?, ?, ?, ?)
      `, [
        handle, post.record?.title || post.slug,
        post.record?.body || '',
        JSON.stringify(post.record?.tags || []).replace(/[{}]/g, '').replace(/"/g, ' ')
      ]);
    }

    // Build terms index
    await this.buildTermsIndex(handle, posts);
  }

  async buildTermsIndex(siteHandle, posts) {
    const terms = {};

    for (const post of posts) {
      const text = `${post.record?.title || ''} ${post.record?.body || ''} ${(post.record?.tags || []).join(' ')}`;
      const words = text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2);

      for (const word of words) {
        if (!terms[word]) {
          terms[word] = new Set();
        }
        terms[word].add(post.slug);
      }
    }

    // Store terms
    for (const [term, slugs] of Object.entries(terms)) {
      const docFreq = slugs.size;
      const postingList = Array.from(slugs);

      this.db.exec(`
        INSERT OR REPLACE INTO terms (term, doc_freq, posting_list)
        VALUES (?, ?, ?)
      `, [term, docFreq, JSON.stringify(postingList)]);
    }
  }

  async buildGlobalIndex() {
    // Get all sites
    const sites = this.db.prepare('SELECT * FROM sites').all();
    const posts = this.db.prepare('SELECT * FROM posts').all();

    // Build search index JSON
    const searchIndex = {
      version: 1,
      createdAt: new Date().toISOString(),
      sites: sites.map(site => ({
        handle: site.handle,
        siteUrl: site.site_url,
        title: site.title,
        description: site.description,
        avatarUrl: site.avatar_url,
        postCount: site.post_count,
        lastIndexedAt: site.last_indexed_at,
        verificationStatus: site.verification_status,
        protocol: site.protocol,
        algorithm: {
          digest: site.algorithm_digest,
          signature: site.algorithm_signature,
          fingerprint: site.algorithm_fingerprint
        },
        bundleFingerprint: site.bundle_fingerprint
      })),
      posts: posts.map(post => ({
        id: post.id,
        site: post.site_handle,
        slug: post.slug,
        title: post.title,
        body: post.body,
        tags: JSON.parse(post.tags || '[]'),
        publishedAt: post.published_at,
        digest: post.digest
      })),
      terms: {}
    };

    // Add terms index
    const terms = this.db.prepare('SELECT * FROM terms').all();
    for (const term of terms) {
      searchIndex.terms[term.term] = {
        docFreq: term.doc_freq,
        postingList: JSON.parse(term.posting_list)
      };
    }

    // Write compressed JSON
    const jsonStr = JSON.stringify(searchIndex);
    const compressed = zlib.deflateSync(jsonStr);
    const outputPath = path.join(this.outputDir, 'search-index.json.gz');
    fs.writeFileSync(outputPath, compressed);

    // Also write uncompressed for debugging
    const uncompressedPath = path.join(this.outputDir, 'search-index.json');
    fs.writeFileSync(uncompressedPath, jsonStr);

    return { compressed: outputPath, uncompressed: uncompressedPath };
  }

  async indexSites(sites) {
    await this.initialize();
    
    for (const site of sites) {
      await this.indexSite(site);
    }
    
    return this.buildGlobalIndex();
  }

  async clear() {
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }
    if (fs.existsSync(this.outputDir)) {
      fs.rmSync(this.outputDir, { recursive: true, force: true });
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
}

export async function indexSites(sites, options = {}) {
  const indexer = new ForestIndexer(options);
  return await indexer.indexSites(sites);
}