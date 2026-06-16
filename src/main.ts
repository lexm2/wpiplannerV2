import './style.css'
import { MainController } from './ui/controllers/MainController'
import { DeviceDetection } from './utils/deviceDetection'
import { AppBootstrap } from './bootstrap/AppBootstrap'
import { setupTutorial } from './services/tutorial/setupTutorial'

DeviceDetection.initialize();

const services = AppBootstrap.createServices();

// Non-UI bootstrap (sync): inject the standalone scheduling services, register
// the course-data subscription + default filters — all before the component
// shell mounts and before the async data load below catches the subscription.
AppBootstrap.initStandaloneServices(services);
AppBootstrap.setupCourseDataSubscriptions(services);
AppBootstrap.initializeFilters(services);

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

// Async startup (data load, theme, auto-scheduler wiring, welcome tutorial).
// Runs after the shell is mounted + the tutorial is wired, so the welcome
// auto-start sees services.tutorial set. Fire-and-forget (errors handled inside).
AppBootstrap.startApp(services);
