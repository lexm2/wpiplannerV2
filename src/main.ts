import './style.css'
import { MainController } from './ui/controllers/MainController'
import { syncEventBus } from './services/sync/SyncEventBus'

// TODO: Remove this debug logging before production
syncEventBus.setDebugEnabled(true);

const mainController = new MainController();

// Expose main controller globally for development/testing
(window as any).mainController = mainController;