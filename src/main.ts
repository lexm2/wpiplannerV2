import './style.css'
import { MainController } from './ui/controllers/MainController'
import { getInlineSVG } from './utils/iconPaths'

function initializeIcons(): void {
  const filterBtn = document.getElementById('filter-btn');
  const filterBtnIcon = filterBtn?.querySelector('img');
  if (filterBtnIcon) {
    filterBtnIcon.outerHTML = getInlineSVG('FILTER_FILLED', 'filter-icon');
  }

  const scheduleFilterBtn = document.getElementById('schedule-filter-btn');
  const scheduleFilterBtnIcon = scheduleFilterBtn?.querySelector('img');
  if (scheduleFilterBtnIcon) {
    scheduleFilterBtnIcon.outerHTML = getInlineSVG('FILTER_FILLED', 'filter-icon');
  }

  const autoScheduleBtn = document.getElementById('auto-schedule-btn');
  const autoScheduleBtnIcon = autoScheduleBtn?.querySelector('img');
  if (autoScheduleBtnIcon) {
    autoScheduleBtnIcon.outerHTML = getInlineSVG('WAND', 'auto-schedule-icon');
  }

  const clearAllSectionsBtn = document.getElementById('clear-all-sections-btn');
  const clearAllSectionsBtnIcon = clearAllSectionsBtn?.querySelector('img');
  if (clearAllSectionsBtnIcon) {
    clearAllSectionsBtnIcon.outerHTML = getInlineSVG('ERASER', 'clear-all-eraser-icon');
  }
}

initializeIcons();

new MainController()