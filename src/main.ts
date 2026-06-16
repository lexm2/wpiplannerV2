import './style.css'
import { MainController } from './ui/controllers/MainController'
import { DeviceDetection } from './utils/deviceDetection'
import { AppBootstrap } from './bootstrap/AppBootstrap'
import { setupTutorial } from './services/tutorial/setupTutorial'

DeviceDetection.initialize();

const services = AppBootstrap.createServices();
const mainController = new MainController(services);

if (DeviceDetection.isMobilePhone()) {
    // Open the (now Svelte) mobile-notice modal declaratively: push its id into
    // uiState.openModals via the manager. ModalLayer (mounted by MainController's
    // constructor above) reactively renders it. modalOpened keeps openModals as
    // the single source of truth — same as BaseModal's showModal path did.
    services.uiStateManager.modalOpened('mobile-notice');
}

services.tutorial = setupTutorial(services);

// Expose main controller globally for development/testing
declare global {
    interface Window {
        mainController: MainController;
    }
}
window.mainController = mainController;
