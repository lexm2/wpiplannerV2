import './style.css'
import { MainController } from './ui/controllers/MainController'
import { DeviceDetection } from './utils/deviceDetection'

DeviceDetection.initialize();

if (DeviceDetection.isMobilePhone()) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
        <div class="modal-dialog mobile-notice-dialog">
            <h2>Mobile Not Supported</h2>
            <p>Mobile support was temporarily removed to make it easier to ship new features. Please use a desktop browser for the best experience.</p>
            <button class="btn btn-primary" id="mobile-notice-dismiss">Got it</button>
        </div>
    `;
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => requestAnimationFrame(() => backdrop.classList.add('show')));
    document.getElementById('mobile-notice-dismiss')?.addEventListener('click', () => {
        backdrop.classList.remove('show');
        setTimeout(() => backdrop.remove(), 200);
    });
}

const mainController = new MainController();

// Expose main controller globally for development/testing
(window as any).mainController = mainController;