import './style.css'
import { MainController } from './ui/controllers/MainController'
import { DeviceDetection } from './utils/deviceDetection'
import { MobileNoticeModal } from './ui/components/MobileNoticeModal'
import { AppBootstrap } from './bootstrap/AppBootstrap'

DeviceDetection.initialize();

const services = AppBootstrap.createServices();
const mainController = new MainController(services);

if (DeviceDetection.isMobilePhone()) {
    new MobileNoticeModal(services.modalService).show();
}

// Expose main controller globally for development/testing
(window as any).mainController = mainController;
