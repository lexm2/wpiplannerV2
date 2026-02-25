import './style.css'
import { MainController } from './ui/controllers/MainController'
import { DeviceDetection } from './utils/deviceDetection'

DeviceDetection.initialize();
const mainController = new MainController();

// Expose main controller globally for development/testing
(window as any).mainController = mainController;