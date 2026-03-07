import './style.css'
import { MainController } from './ui/controllers/MainController'
import { DeviceDetection } from './utils/deviceDetection'
import { MobileNoticeModal } from './ui/components/MobileNoticeModal'

DeviceDetection.initialize();

const mainController = new MainController();

if (DeviceDetection.isMobilePhone()) {
    new MobileNoticeModal(mainController.getModalService()).show();
}

// Expose main controller globally for development/testing
(window as any).mainController = mainController;