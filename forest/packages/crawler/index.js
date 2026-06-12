import { createHash } from 'crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import { fetchWithTimeout } from './utils.js';

const CRAWL_TIMEOUT = 30000;
const USER_AGENT = 'PostSnail-Forest-Crawler/0.1';

export class ForestCrawler {
  constructor(options = {}) {
    this.forestHandle = options.forestHandle || 'forest.postsnail.org';
    this.knownSites = new Map();
    this.onSiteDiscovered = options.onSiteDiscovered || (() => {});
  }

  async crawlSite(siteUrl) {
    const url = new URL(siteUrl);
    const manifestUrl = new URL('/postsnail.manifest.json', siteUrl).href;
    
    try {
      const response = await fetchWithTimeout(manifestUrl, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: CRAWL_TIMEOUT
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const manifest = await response.json();
      const verified = await this.verifyManifest(manifest, siteUrl);
      
      if (!verified) {
        throw new Error('Manifest signature verification failed');
      }

      const siteData = this.extractSiteData(manifest, siteUrl);
      await this.onSiteDiscovered(siteData);
      
      return siteData;
    } catch (error) {
      console.error(`Failed to crawl ${siteUrl}:`, error.message);
      return { siteUrl, error: error.message, status: 'failed' };
    }
  }

  async verifyManifest(manifest, siteUrl) {
    if (!manifest.publicKey || !manifest.manifestSignature) {
      return false;
    }

    try {
      const publicKeyBytes = this.decodeBase64Key(manifest.publicKey);
      const signatureBytes = this.decodeBase64Key(manifest.manifestSignature);
      
      const { manifestSignature, ...payload } = manifest;
      const canonical = JSON.stringify(payload, Object.keys(payload).sort());
      const payloadBytes = new TextEncoder().encode(canonical);
      
      return ml_dsa65.verify(signatureBytes, payloadBytes, publicKeyBytes);
    } catch {
      return false;
    }
  }

  decodeBase64Key(key) {
    const prefix = 'base64:';
    if (!key.startsWith(prefix)) {
      throw new Error('Invalid key format');
    }
    const b64 = key.slice(prefix.length);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  extractSiteData(manifest, siteUrl) {
    const posts = (manifest.posts || []).map(p => ({
      slug: p.slug,
      digest: p.digest,
      signature: p.signature,
      record: p.record
    }));

    return {
      handle: manifest.site?.handle || new URL(siteUrl).hostname,
      siteUrl: manifest.site?.siteUrl || siteUrl,
      title: manifest.site?.siteTitle || 'Untitled',
      description: manifest.site?.description || '',
      avatarUrl: manifest.site?.avatarUrl || null,
      publicKey: manifest.publicKey,
      posts,
      postCount: posts.length,
      lastIndexedAt: new Date().toISOString(),
      verificationStatus: 'verified',
      manifestVersion: manifest.manifestVersion || 1,
      protocol: manifest.protocol,
      algorithm: manifest.algorithm,
      bundleFingerprint: manifest.bundleFingerprint
    };
  }

  async crawlKnownSites(siteUrls) {
    const results = [];
    for (const url of siteUrls) {
      const result = await this.crawlSite(url);
      results.push(result);
      await this.sleep(1000); // Be polite
    }
    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export async function fetchWithTimeout(url, options = {}) {
  const { timeout = 30000, ...fetchOptions } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}