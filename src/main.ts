import './style.css'
import { MainController } from './ui/controllers/MainController'
import { syncEventBus } from './services/sync/SyncEventBus'

// TODO: Remove this debug logging before production
syncEventBus.setDebugEnabled(true);

const mainController = new MainController();

// Expose main controller globally for development/testing
(window as any).mainController = mainController;

if (import.meta.env.DEV) {
    const urlParams = new URLSearchParams(window.location.search);
    const useMockProvider = urlParams.has('mock') || localStorage.getItem('use-mock-provider') === 'true';

    if (useMockProvider) {
        import('./dev/enableMockProvider').then(async ({ enableMockProvider }) => {
            await enableMockProvider();
        });
    }
}