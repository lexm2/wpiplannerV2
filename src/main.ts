import './style.css'
import { MainController } from './ui/controllers/MainController'
import { DeviceDetection } from './utils/deviceDetection'
import { MobileNoticeModal } from './ui/components/MobileNoticeModal'
import { AppBootstrap } from './bootstrap/AppBootstrap'
import { setupTutorial } from './services/tutorial/setupTutorial'

DeviceDetection.initialize();

const services = AppBootstrap.createServices();
const mainController = new MainController(services);

if (DeviceDetection.isMobilePhone()) {
    new MobileNoticeModal(services.modalService).show();
}

services.tutorial = setupTutorial(services, mainController);

// Expose main controller globally for development/testing
declare global {
    interface Window {
        mainController: MainController;
    }
}
window.mainController = mainController;
