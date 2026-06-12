// Main application logic for PostSnail Reader
import { storageManager } from './storage.js';
import { feedVerifier } from './verifier.js';

class PostSnailReader {
    constructor() {
        this.currentView = 'subscriptions';
        this.init();
    }

    init() {
        // Check if we're being opened from Forest
        this.checkForestContext();
        
        this.setupEventListeners();
        this.loadSubscriptions();
        this.render();
    }

    checkForestContext() {
        const urlParams = new URLSearchParams(window.location.search);
        const forestParam = urlParams.get('forest');
        const siteParam = urlParams.get('site');
        
        if (forestParam === 'true' && siteParam) {
            console.log('Forest context detected with site:', siteParam);
            this.autoAddSiteFromForest(siteParam);
        } else if (forestParam === 'true') {
            console.log('Forest context detected (no site parameter)');
        }
    }

    setupEventListeners() {
        // Set up view switching
        document.getElementById('subscriptions-btn').addEventListener('click', () => {
            this.currentView = 'subscriptions';
            this.render();
        });

        document.getElementById('timeline-btn').addEventListener('click', () => {
            this.currentView = 'timeline';
            this.render();
        });
    }

    loadSubscriptions() {
        // This would load subscriptions from localStorage
        // For now, we'll just initialize with some example data
        const subscriptions = storageManager.getSubscriptions();
        if (subscriptions.length === 0) {
            // Add some example subscriptions if none exist
            const defaultSubscriptions = [
                {
                    siteUrl: 'https://example.com',
                    title: 'Example Site',
                    verificationStatus: 'verified'
                },
                {
                    siteUrl: 'https://blog.example.com',
                    title: 'Blog Example',
                    verificationStatus: 'verified'
                }
            ];
            storageManager.saveSubscriptions(defaultSubscriptions);
        }
    }

    render() {
        const mainContent = document.getElementById('main-content');
        
        if (this.currentView === 'subscriptions') {
            this.renderSubscriptionsView(mainContent);
        } else {
            this.renderTimelineView(mainContent);
        }
    }

    renderSubscriptionsView(container) {
        container.innerHTML = `
            <div class="subscription-list">
                <h2>Subscriptions</h2>
                <div id="subscription-items">
                    <!-- Subscription items will be added here -->
                </div>
                <div class="add-subscription-form">
                    <h3>Add New Subscription</h3>
                    <form id="add-subscription-form">
                        <input type="url" id="site-url" placeholder="Enter site URL" required>
                        <button type="submit">Add Site</button>
                    </form>
                </div>
            </div>
        `;
        
        this.renderSubscriptionItems();
        this.setupSubscriptionForm();
    }

    renderSubscriptionItems() {
        const subscriptions = storageManager.getSubscriptions();
        const container = document.getElementById('subscription-items');
        
        if (subscriptions.length === 0) {
            container.innerHTML = '<p>No subscriptions added yet.</p>';
            return;
        }
        
        container.innerHTML = subscriptions.map(sub => {
            const statusClass = this.getTrustStatusClass(sub.verificationStatus);
            return `
                <div class="subscription-item">
                    <div class="site-info">
                        <h3>${sub.title || sub.siteUrl}</h3>
                        <p>${sub.siteUrl}</p>
                    </div>
                    <div class="trust-status ${statusClass}">
                        ${this.getTrustStatusText(sub.verificationStatus)}
                    </div>
                </div>
            `;
        }).join('');
    }

    setupSubscriptionForm() {
        document.getElementById('add-subscription-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const siteUrl = document.getElementById('site-url').value;
            
            if (siteUrl) {
                // Verify the site before adding
                const verification = await feedVerifier.verifySite(siteUrl);
                
                if (verification.success) {
                    // Add to subscriptions
                    const newSubscription = {
                        siteUrl: siteUrl,
                        title: siteUrl.replace(/^https?:\/\//, ''),
                        verificationStatus: verification.status
                    };
                    
                    storageManager.addSubscription(newSubscription);
                    this.renderSubscriptionItems();
                    document.getElementById('site-url').value = '';
                    
                    alert('Site added successfully!');
                } else {
                    alert('Failed to verify site. Please make sure it is a valid PostSnail site.');
                }
            }
        });
    }

    async renderTimelineView(container) {
        container.innerHTML = `
            <div class="timeline">
                <header class="timeline-header">
                    <h2>Timeline</h2>
                    <div class="timeline-controls">
                        <button id="refresh-btn" class="secondary-btn">Refresh</button>
                        <select id="filter-select">
                            <option value="all">All Posts</option>
                            <option value="unread">Unread Only</option>
                        </select>
                    </div>
                </header>
                <div id="timeline-items" class="timeline-items">
                    <div class="loading">Loading posts...</div>
                </div>
            </div>
        `;
        
        this.setupTimelineControls();
        await this.loadAndRenderPosts();
    }

    setupTimelineControls() {
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadAndRenderPosts();
        });
        
        document.getElementById('filter-select').addEventListener('change', () => {
            this.renderPosts();
        });
    }

    async loadAndRenderPosts() {
        const container = document.getElementById('timeline-items');
        container.innerHTML = '<div class="loading">Loading posts...</div>';
        
        try {
            const posts = await this.fetchAllPosts();
            this.allPosts = posts;
            this.renderPosts();
        } catch (error) {
            console.error('Error loading posts:', error);
            container.innerHTML = `<div class="error">Failed to load posts: ${error.message}</div>`;
        }
    }

    async fetchAllPosts() {
        const subscriptions = storageManager.getSubscriptions();
        const allPosts = [];
        
        for (const sub of subscriptions) {
            if (sub.verificationStatus !== 'verified') continue;
            
            try {
                const verification = await feedVerifier.verifySite(sub.siteUrl);
                if (verification.posts && verification.posts.length > 0) {
                    for (const post of verification.posts) {
                        allPosts.push({
                            ...post,
                            siteUrl: sub.siteUrl,
                            siteTitle: sub.title || sub.siteUrl
                        });
                    }
                }
            } catch (error) {
                console.error(`Error fetching posts from ${sub.siteUrl}:`, error);
            }
        }
        
        allPosts.sort((a, b) => {
            const dateA = a.record?.date_published || a.record?.date || 0;
            const dateB = b.record?.date_published || b.record?.date || 0;
            return new Date(dateB) - new Date(dateA);
        });
        
        return allPosts;
    }

    renderPosts() {
        const container = document.getElementById('timeline-items');
        const filter = document.getElementById('filter-select').value;
        const readState = storageManager.getReadState();
        
        let posts = this.allPosts || [];
        
        if (filter === 'unread') {
            posts = posts.filter(post => {
                const siteRead = readState[post.siteUrl] || [];
                return !siteRead.includes(post.slug);
            });
        }
        
        if (posts.length === 0) {
            container.innerHTML = '<p class="no-posts">No posts found.</p>';
            return;
        }
        
        container.innerHTML = posts.map(post => {
            const siteRead = readState[post.siteUrl] || [];
            const isRead = siteRead.includes(post.slug);
            const readClass = isRead ? 'read' : 'unread';
            const title = post.record?.title || post.slug;
            const excerpt = post.record?.body ? post.record.body.substring(0, 200) + '...' : '';
            const date = post.record?.date_published || post.record?.date || '';
            const formattedDate = date ? new Date(date).toLocaleDateString() : 'Unknown date';
            
            return `
                <article class="feed-item ${readClass}" data-site="${post.siteUrl}" data-slug="${post.slug}">
                    <header class="feed-header">
                        <h3>${title}</h3>
                        <div class="feed-meta">
                            <span class="site-name">${post.siteTitle}</span>
                            <span class="post-date">${formattedDate}</span>
                            <span class="trust-cue verified">Verified</span>
                        </div>
                    </header>
                    <div class="feed-content">
                        <p>${excerpt}</p>
                    </div>
                    <footer class="feed-footer">
                        <a href="${post.siteUrl}/posts/${post.slug}/" target="_blank" class="read-link">Read more →</a>
                        <button class="mark-read-btn" data-site="${post.siteUrl}" data-slug="${post.slug}">
                            ${isRead ? 'Mark Unread' : 'Mark Read'}
                        </button>
                    </footer>
                </article>
            `;
        }).join('');
        
        container.querySelectorAll('.mark-read-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const siteUrl = e.target.dataset.site;
                const slug = e.target.dataset.slug;
                this.toggleReadStatus(siteUrl, slug);
            });
        });
    }

    toggleReadStatus(siteUrl, slug) {
        const readState = storageManager.getReadState();
        if (!readState[siteUrl]) {
            readState[siteUrl] = [];
        }
        
        const index = readState[siteUrl].indexOf(slug);
        if (index === -1) {
            readState[siteUrl].push(slug);
        } else {
            readState[siteUrl].splice(index, 1);
        }
        
        storageManager.saveReadState(readState);
        this.renderPosts();
    }

    getTrustStatusClass(status) {
        switch(status) {
            case 'verified': return 'verified';
            case 'stale': return 'stale';
            case 'offline': return 'offline';
            case 'cors-blocked': return 'cors-blocked';
            case 'network-error': return 'offline';
            case 'not-found': return 'offline';
            case 'http-error': return 'offline';
            case 'failed': return 'failed';
            case 'error': return 'error';
            default: return '';
        }
    }

    getTrustStatusText(status) {
        switch(status) {
            case 'verified': return 'Verified';
            case 'stale': return 'Stale';
            case 'offline': return 'Offline';
            case 'cors-blocked': return 'CORS Blocked';
            case 'network-error': return 'Network Error';
            case 'not-found': return 'Not Found';
            case 'http-error': return 'HTTP Error';
            case 'failed': return 'Failed';
            case 'error': return 'Error';
            default: return 'Unknown';
        }
    }
    
    autoAddSiteFromForest(siteUrl) {
        // Verify and add the site automatically from Forest
        const subscriptions = storageManager.getSubscriptions();
        const existing = subscriptions.find(sub => sub.siteUrl === siteUrl);
        
        if (!existing) {
            // Verify the site before adding
            feedVerifier.verifySite(siteUrl).then(verification => {
                const newSubscription = {
                    siteUrl: siteUrl,
                    title: siteUrl.replace(/^https?:\/\//, ''),
                    verificationStatus: verification.status
                };
                
                storageManager.addSubscription(newSubscription);
                this.loadSubscriptions();
                this.render();
                
                // Optionally navigate to timeline view after adding
                // this.currentView = 'timeline';
                // this.render();
            }).catch(error => {
                console.error('Error auto-adding site from Forest:', error);
            });
        }
    }
}

// Initialize the app when DOM is loaded
export function initApp() {
    window.postSnailReader = new PostSnailReader();
}