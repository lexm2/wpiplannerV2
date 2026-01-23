import './style.css'
import { MainController } from './ui/controllers/MainController'

const mainController = new MainController();

// Expose main controller globally for development/testing
(window as any).mainController = mainController;