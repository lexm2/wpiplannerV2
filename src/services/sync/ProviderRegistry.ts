import type { CloudProvider, ProviderInfo } from './types';

/**
 * Registry for cloud sync providers.
 * Manages provider registration and retrieval.
 */
export class ProviderRegistry {
    private static instance: ProviderRegistry;
    private providers = new Map<string, CloudProvider>();

    private constructor() {}

    static getInstance(): ProviderRegistry {
        if (!ProviderRegistry.instance) {
            ProviderRegistry.instance = new ProviderRegistry();
        }
        return ProviderRegistry.instance;
    }

    /**
     * Register a cloud provider
     */
    register(provider: CloudProvider): void {
        if (this.providers.has(provider.id)) {
            console.warn(`[ProviderRegistry] Provider '${provider.id}' already registered, replacing`);
        }
        this.providers.set(provider.id, provider);
        console.log(`[ProviderRegistry] Registered provider: ${provider.displayName}`);
    }

    /**
     * Get a provider by ID
     */
    get(id: string): CloudProvider | undefined {
        return this.providers.get(id);
    }

    /**
     * Get all registered provider IDs
     */
    getProviderIds(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Get info about all registered providers
     */
    listProviders(): ProviderInfo[] {
        return Array.from(this.providers.values()).map(provider => ({
            id: provider.id,
            displayName: provider.displayName,
            icon: provider.icon,
            isAuthenticated: provider.isAuthenticated(),
        }));
    }

    /**
     * Check if a provider is registered
     */
    has(id: string): boolean {
        return this.providers.has(id);
    }

    /**
     * Unregister a provider
     */
    unregister(id: string): boolean {
        const provider = this.providers.get(id);
        if (provider) {
            provider.dispose();
            this.providers.delete(id);
            console.log(`[ProviderRegistry] Unregistered provider: ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Dispose all providers and clear registry
     */
    clear(): void {
        this.providers.forEach(provider => provider.dispose());
        this.providers.clear();
    }
}

// Export singleton instance
export const providerRegistry = ProviderRegistry.getInstance();
