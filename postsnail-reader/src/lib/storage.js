// Local storage management for PostSnail Reader
class StorageManager {
    constructor() {
        this.SUBSCRIPTIONS_KEY = 'postsnail_subscriptions';
        this.READ_STATE_KEY = 'postsnail_read_state';
        this.REFRESH_META_KEY = 'postsnail_refresh_meta';
    }

    // Get all subscriptions
    getSubscriptions() {
        try {
            const subscriptions = localStorage.getItem(this.SUBSCRIPTIONS_KEY);
            return subscriptions ? JSON.parse(subscriptions) : [];
        } catch (error) {
            console.error('Error reading subscriptions from localStorage:', error);
            return [];
        }
    }

    // Save subscriptions
    saveSubscriptions(subscriptions) {
        try {
            localStorage.setItem(this.SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions));
            return true;
        } catch (error) {
            console.error('Error saving subscriptions to localStorage:', error);
            return false;
        }
    }

    // Add a new subscription
    addSubscription(subscription) {
        const subscriptions = this.getSubscriptions();
        subscriptions.push(subscription);
        return this.saveSubscriptions(subscriptions);
    }

    // Remove a subscription
    removeSubscription(siteUrl) {
        const subscriptions = this.getSubscriptions();
        const updatedSubscriptions = subscriptions.filter(sub => sub.siteUrl !== siteUrl);
        return this.saveSubscriptions(updatedSubscriptions);
    }

    // Get read state
    getReadState() {
        try {
            const readState = localStorage.getItem(this.READ_STATE_KEY);
            return readState ? JSON.parse(readState) : {};
        } catch (error) {
            console.error('Error reading read state from localStorage:', error);
            return {};
        }
    }

    // Save read state
    saveReadState(readState) {
        try {
            localStorage.setItem(this.READ_STATE_KEY, JSON.stringify(readState));
            return true;
        } catch (error) {
            console.error('Error saving read state to localStorage:', error);
            return false;
        }
    }

    // Mark post as read
    markPostAsRead(siteUrl, postId) {
        const readState = this.getReadState();
        if (!readState[siteUrl]) {
            readState[siteUrl] = [];
        }
        if (!readState[siteUrl].includes(postId)) {
            readState[siteUrl].push(postId);
            return this.saveReadState(readState);
        }
        return true;
    }

    // Get last refresh metadata
    getRefreshMetadata() {
        try {
            const metadata = localStorage.getItem(this.REFRESH_META_KEY);
            return metadata ? JSON.parse(metadata) : {};
        } catch (error) {
            console.error('Error reading refresh metadata from localStorage:', error);
            return {};
        }
    }

    // Save refresh metadata
    saveRefreshMetadata(metadata) {
        try {
            localStorage.setItem(this.REFRESH_META_KEY, JSON.stringify(metadata));
            return true;
        } catch (error) {
            console.error('Error saving refresh metadata to localStorage:', error);
            return false;
        }
    }

    // Get verification status for a site
    getVerificationStatus(siteUrl) {
        const subscriptions = this.getSubscriptions();
        const subscription = subscriptions.find(sub => sub.siteUrl === siteUrl);
        return subscription ? subscription.verificationStatus : null;
    }

    // Update verification status for a site
    updateVerificationStatus(siteUrl, status) {
        const subscriptions = this.getSubscriptions();
        const index = subscriptions.findIndex(sub => sub.siteUrl === siteUrl);
        if (index !== -1) {
            subscriptions[index].verificationStatus = status;
            return this.saveSubscriptions(subscriptions);
        }
        return false;
    }
}

// Export singleton instance
export const storageManager = new StorageManager();