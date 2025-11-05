import './style.css'
import { MainController } from './ui/controllers/MainController'
import { ICONS } from './utils/iconPaths'

function initializeIcons(): void {
  const filterBtnIcon = document.querySelector('#filter-btn img') as HTMLImageElement;
  if (filterBtnIcon) {
    filterBtnIcon.src = ICONS.FILTER_FILLED;
  }

  const scheduleFilterBtnIcon = document.querySelector('#schedule-filter-btn img') as HTMLImageElement;
  if (scheduleFilterBtnIcon) {
    scheduleFilterBtnIcon.src = ICONS.FILTER_FILLED;
  }

  const autoScheduleBtnIcon = document.querySelector('#auto-schedule-btn img') as HTMLImageElement;
  if (autoScheduleBtnIcon) {
    autoScheduleBtnIcon.src = ICONS.WAND;
  }
}

initializeIcons();

new MainController()