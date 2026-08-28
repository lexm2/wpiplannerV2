import './style.css';
import { mount } from 'svelte';
import App from './svelte/App.svelte';
import ModalLayer from './svelte/modals/ModalLayer.svelte';
import { DeviceDetection } from './utils/deviceDetection';
import { AppBootstrap } from './bootstrap/AppBootstrap';
import { setupTutorial } from './services/tutorial/setupTutorial';
import { appState } from './core/state/appState.svelte';
import { openModal } from './services/ui/uiState.svelte';
import type { ServiceContainer } from './bootstrap/ServiceContainer';

DeviceDetection.initialize();

const services = AppBootstrap.createServices();

// Non-UI bootstrap (sync): inject the standalone scheduling services and
// register the default filters before the component shell mounts. The
// course-data sync is an App.svelte $effect on appState.loadedDepartments,
// established at mount - before the async data load in startApp() fires it.
AppBootstrap.initStandaloneServices(services);
AppBootstrap.initializeFilters(services);

// Mount the declarative root shell (App.svelte) into #app. The modal layer is
// mounted separately into #modal-root (outside #app) to keep modal
// stacking/z-index independent of the app layout's containing block. getTutorial is a thunk:
// services.tutorial is assigned below, after this mount.
const appEl = document.getElementById('app');
if (appEl) {
  mount(App, { target: appEl, props: { services } });
}

const modalRootEl = document.getElementById('modal-root');
if (modalRootEl) {
  mount(ModalLayer, {
    target: modalRootEl,
    props: {
      getTutorial: () => services.tutorial,
      scheduleManagementService: services.scheduleManagementService,
      filterService: services.filterService,
      courseSelectionService: services.courseSelectionService,
      autoScheduleOrchestrator: services.autoScheduleOrchestrator,
      profileStateManager: services.profileStateManager,
      getDepartments: () => appState.loadedDepartments,
    },
  });
}

if (DeviceDetection.isMobilePhone()) {
  openModal('mobile-notice');
}

services.tutorial = setupTutorial(services);

// Expose the service container globally for development/testing.
declare global {
  interface Window {
    services: ServiceContainer;
  }
}
window.services = services;

// Async startup (data load, theme, auto-scheduler wiring, welcome tutorial).
// Runs after the shell is mounted + the tutorial is wired, so the welcome
// auto-start sees services.tutorial set. Fire-and-forget (errors handled inside).
void AppBootstrap.startApp(services);
