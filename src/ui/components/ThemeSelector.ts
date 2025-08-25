import { ThemeManager } from '../../themes/ThemeManager'
import { StorageService } from '../../services/StorageService'

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ThemeSelector - Theme Switching UI Component with Persistent Storage
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - UI component bridging user theme selection with theme management system
 * - Dropdown interface controller with event-driven state management
 * - Integration point between theme system and unified storage architecture
 * - Persistent storage coordinator for theme preferences
 * 
 * DEPENDENCIES:
 * - ThemeManager → Theme application, available theme registry, current theme state
 * - StorageService → Unified storage interface for theme preference persistence
 * - DOM Elements → #theme-dropdown, #theme-options, #current-theme-name
 * 
 * USED BY:
 * - MainController → Instantiated and integrated into main application
 * - End Users → Direct interaction through dropdown UI element
 * - Theme system → Responds to theme changes via ThemeManager events
 * 
 * DATA FLOW:
 * 1. User clicks theme dropdown → toggleDropdown()
 * 2. User selects theme option → selectTheme(themeId)
 * 3. ThemeManager.setTheme() applies theme to DOM
 * 4. StorageService.saveThemePreference() persists selection
 * 5. UI updates: current theme display, dropdown state, active option
 * 6. Dropdown closes and state resets
 * 
 * Initialization Flow:
 * 1. Constructor gets ThemeManager + StorageService singletons
 * 2. setupElements() binds DOM references
 * 3. loadSavedTheme() restores persisted preference
 * 4. setupEventListeners() binds UI interactions
 * 5. renderThemeOptions() populates dropdown content
 * 
 * KEY FEATURES:
 * - Dropdown UI management (open/close state, outside click handling)
 * - Theme option rendering with active state indication
 * - Persistent theme preference loading/saving via unified storage
 * - Real-time UI updates reflecting theme changes
 * - Event delegation for dynamically generated theme options
 * - Public API for programmatic theme changes
 * 
 * INTEGRATION POINTS:
 * - Connected to unified storage system via StorageService
 * - Integrates with ThemeManager singleton for theme operations
 * - Coordinated by MainController during application initialization
 * - DOM-dependent component requiring specific HTML structure
 * 
 * ARCHITECTURAL PATTERNS:
 * - MVC: Model (ThemeManager), View (DOM), Controller (ThemeSelector)
 * - Observer: Responds to theme system changes and user interactions
 * - Singleton Integration: Uses ThemeManager and StorageService singletons
 * - Event Delegation: Dynamic theme option handling
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export class ThemeSelector {
    private themeManager: ThemeManager;
    private storageService: StorageService;
    private dropdownElement: HTMLElement | null = null;
    private optionsElement: HTMLElement | null = null;
    private currentThemeNameElement: HTMLElement | null = null;
    private isOpen: boolean = false;

    constructor() {
        this.themeManager = ThemeManager.getInstance();
        this.storageService = StorageService.getInstance();
        this.init();
    }

    private init(): void {
        this.setupElements();
        this.loadSavedTheme();
        this.setupEventListeners();
        this.renderThemeOptions();
    }

    private setupElements(): void {
        this.dropdownElement = document.getElementById('theme-dropdown');
        this.optionsElement = document.getElementById('theme-options');
        this.currentThemeNameElement = document.getElementById('current-theme-name');
    }

    private loadSavedTheme(): void {
        const savedTheme = this.storageService.loadThemePreference();
        this.themeManager.setTheme(savedTheme);
        this.updateCurrentThemeDisplay();
    }

    private setupEventListeners(): void {
        if (!this.dropdownElement || !this.optionsElement) return;

        // Toggle dropdown
        this.dropdownElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            this.closeDropdown();
        });

        // Prevent closing when clicking inside options
        this.optionsElement.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    private toggleDropdown(): void {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    private openDropdown(): void {
        if (!this.dropdownElement || !this.optionsElement) return;
        
        this.isOpen = true;
        this.dropdownElement.classList.add('open');
        this.optionsElement.classList.add('show');
    }

    private closeDropdown(): void {
        if (!this.dropdownElement || !this.optionsElement) return;
        
        this.isOpen = false;
        this.dropdownElement.classList.remove('open');
        this.optionsElement.classList.remove('show');
    }

    private renderThemeOptions(): void {
        if (!this.optionsElement) return;

        const availableThemes = this.themeManager.getAvailableThemes();
        const currentThemeId = this.themeManager.getCurrentThemeId();

        let html = '';
        availableThemes.forEach(theme => {
            const isActive = theme.id === currentThemeId;
            html += `
                <div class="theme-option ${isActive ? 'active' : ''}" data-theme-id="${theme.id}">
                    <div class="theme-option-name">${theme.name}</div>
                    <div class="theme-option-description">${theme.description}</div>
                </div>
            `;
        });

        this.optionsElement.innerHTML = html;

        // Add click listeners to theme options
        this.optionsElement.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => {
                const themeId = (option as HTMLElement).dataset.themeId;
                if (themeId) {
                    this.selectTheme(themeId);
                }
            });
        });
    }

    private selectTheme(themeId: string): void {
        // Apply theme
        const success = this.themeManager.setTheme(themeId);
        if (!success) return;

        // Save to storage
        this.storageService.saveThemePreference(themeId);

        // Update UI
        this.updateCurrentThemeDisplay();
        this.updateActiveOption(themeId);
        this.closeDropdown();
    }

    private updateCurrentThemeDisplay(): void {
        if (!this.currentThemeNameElement) return;

        const currentTheme = this.themeManager.getCurrentTheme();
        if (currentTheme) {
            this.currentThemeNameElement.textContent = currentTheme.name;
        }
    }

    private updateActiveOption(selectedThemeId: string): void {
        if (!this.optionsElement) return;

        // Remove active class from all options
        this.optionsElement.querySelectorAll('.theme-option').forEach(option => {
            option.classList.remove('active');
        });

        // Add active class to selected option
        const selectedOption = this.optionsElement.querySelector(`[data-theme-id="${selectedThemeId}"]`);
        if (selectedOption) {
            selectedOption.classList.add('active');
        }
    }

    // Public method to refresh theme options (useful if themes are added dynamically)
    public refresh(): void {
        this.renderThemeOptions();
        this.updateCurrentThemeDisplay();
    }

    // Public method to programmatically select a theme
    public setTheme(themeId: string): void {
        this.selectTheme(themeId);
    }
}