// Feed verification logic for PostSnail Reader
import { storageManager } from './storage.js';
import { verifyBytes, textToBytes, sha3Hex } from './crypto.js';

const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?url=',
];

class FeedVerifier {
    constructor() {
        this.REQUIRED_FEATURES = ['signed-manifest', 'file-hashes'];
        this.PROTOCOL_NAME = 'postsnail';
        this.PROTOCOL_VERSION = 1;
    }

    async fetchWithCorsFallback(url) {
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (response.ok) {
                return response;
            }
        } catch (error) {
            if (!(error.name === 'TypeError' && error.message.includes('CORS'))) {
                throw error;
            }
        }

        for (const proxy of CORS_PROXIES) {
            try {
                const proxyUrl = proxy + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    return response;
                }
            } catch (proxyError) {
                console.warn(`CORS proxy ${proxy} failed:`, proxyError);
            }
        }

        throw new Error('CORS blocked and all proxies failed');
    }

    async verifySite(siteUrl) {
        let feedData = null;
        let verificationStatus = 'unknown';
        let publicKey = null;
        let posts = [];
        let errorMessage = null;

        try {
            const manifestUrl = new URL('/postsnail.manifest.json', siteUrl).href;
            const manifestResponse = await this.fetchWithCorsFallback(manifestUrl);
            
            if (manifestResponse.ok) {
                const manifest = await manifestResponse.json();
                if (manifest.publicKey) {
                    publicKey = manifest.publicKey;
                }
                if (manifest.posts && Array.isArray(manifest.posts)) {
                    posts = manifest.posts;
                }
            } else if (manifestResponse.status === 404) {
                verificationStatus = 'not-found';
            } else {
                verificationStatus = 'http-error';
            }
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('CORS')) {
                verificationStatus = 'cors-blocked';
                errorMessage = 'CORS blocked - site needs Access-Control-Allow-Origin header';
            } else if (error.name === 'TypeError') {
                verificationStatus = 'network-error';
                errorMessage = 'Network error - site may be offline';
            } else {
                verificationStatus = 'error';
                errorMessage = error.message;
            }
            console.error('Error fetching manifest:', error);
        }

        if (verificationStatus === 'unknown') {
            const feedJsonUrl = new URL('/feed.json', siteUrl).href;
            feedData = await this.fetchAndVerifyFeed(feedJsonUrl, publicKey);

            if (feedData) {
                verificationStatus = 'verified';
            } else if (posts.length > 0 && publicKey) {
                verificationStatus = 'verified';
                feedData = { posts };
            } else {
                const rssUrl = new URL('/rss.xml', siteUrl).href;
                feedData = await this.fetchAndVerifyFeed(rssUrl, publicKey);
                
                if (feedData) {
                    verificationStatus = 'verified';
                } else if (verificationStatus === 'unknown') {
                    verificationStatus = 'failed';
                }
            }
        }

        storageManager.updateVerificationStatus(siteUrl, verificationStatus);
        
        return {
            success: verificationStatus === 'verified',
            status: verificationStatus,
            data: feedData,
            posts: posts,
            publicKey: publicKey,
            error: errorMessage
        };
    }

    constructDiscoveryUrls(siteUrl) {
        const urls = [];
        urls.push(new URL('/.well-known/postsnail.json', siteUrl).href);
        urls.push(new URL('/postsnail.manifest.json', siteUrl).href);
        urls.push(new URL('/feed.json', siteUrl).href);
        urls.push(new URL('/rss.xml', siteUrl).href);
        return urls;
    }

    async fetchAndVerifyFeed(feedUrl, publicKey) {
        try {
            const response = await this.fetchWithCorsFallback(feedUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const feedData = await response.json();
            const isValid = await this.verifyFeedData(feedData, publicKey);
            
            return isValid ? feedData : null;
        } catch (error) {
            console.error(`Error fetching/verifying feed from ${feedUrl}:`, error);
            return null;
        }
    }

    async verifyFeedData(feedData, publicKey) {
        if (!feedData || typeof feedData !== 'object') {
            return false;
        }
        
        if (feedData.protocol !== this.PROTOCOL_NAME) {
            return false;
        }
        
        if (feedData.version !== this.PROTOCOL_VERSION) {
            if (feedData.version !== '1' && feedData.protocol === 'postsnail-v1') {
            } else {
                return false;
            }
        }
        
        if (!feedData.features || !Array.isArray(feedData.features)) {
            return false;
        }
        
        const missingFeatures = this.REQUIRED_FEATURES.filter(feature => 
            !feedData.features.includes(feature)
        );
        
        if (missingFeatures.length > 0) {
            return false;
        }
        
        if (!feedData.signature) {
            return false;
        }
        
        if (publicKey) {
            const payload = { ...feedData };
            delete payload.signature;
            
            const canonicalPayload = JSON.stringify(payload, Object.keys(payload).sort());
            const payloadBytes = new TextEncoder().encode(canonicalPayload);
            
            const signatureValid = verifyBytes(payloadBytes, feedData.signature, publicKey);
            if (!signatureValid) {
                console.error('Feed signature verification failed');
                return false;
            }
        }
        
        return true;
    }

    getVerificationStatus(siteUrl) {
        return storageManager.getVerificationStatus(siteUrl);
    }

    clearVerificationStatus() {
    }
}

export const feedVerifier = new FeedVerifier();