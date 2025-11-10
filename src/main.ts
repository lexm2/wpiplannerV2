import './style.css'
import { MainController } from './ui/controllers/MainController'

const mainController = new MainController();

// Expose test function globally for development/testing
(window as any).triggerRefresh = () => mainController.triggerTestRefresh();