import { ThemeManager } from '../../themes/ThemeManager'
import { ProfileStateManager } from '../../core/state/ProfileStateManager'
import { getInlineSVG } from '../../utils/iconPaths'
import styles from '../../styles/components/theme-selector.module.css';

// UI component for theme switching with dropdown interface and persistent storage
// Coordinates theme selection through ThemeManager and ProfileStateManager
export class ThemeSelector {
    private themeManager: ThemeManager;
    private profileStateManager: ProfileStateManager;
    private dropdownElement: HTMLElement | null = null;
    private optionsElement: HTMLElement | null = null;
    private currentThemeNameElement: HTMLElement | null = null;
    private isOpen: boolean = false;
    private boundDocumentClick: () => void;
    private boundOptionsClick: (e: Event) => void;
    private boundDropdownClick: (e: Event) => void;

    constructor(profileStateManager?: ProfileStateManager) {
        this.themeManager = ThemeManager.getInstance();
        this.profileStateManager = profileStateManager || ProfileStateManager.getInstance();

        this.boundDocumentClick = this.closeDropdown.bind(this);
        this.boundOptionsClick = (e: Event) => e.stopPropagation();
        this.boundDropdownClick = (e: Event) => {
            e.stopPropagation();
            this.toggleDropdown();
        };

        this.init();
    }

    private init(): void {
        this.setupElements();
        this.setupEventListeners();
        this.renderThemeOptions();
        // Note: loadSavedTheme() is deferred until initializeTheme() is called
    }

    /**
     * Initialize theme after ProfileStateManager has loaded data from storage
     * This should be called by MainController after storage initialization is complete
     */
    public initializeTheme(): void {
        this.loadSavedTheme();
        // Re-render theme options to reflect the correct active theme
        this.renderThemeOptions();
    }

    private setupElements(): void {
        this.dropdownElement = document.getElementById('theme-dropdown');
        this.optionsElement = document.getElementById('theme-options');
        this.currentThemeNameElement = document.getElementById('current-theme-name');

        // Inject chevron icon into dropdown arrow
        const dropdownArrow = document.getElementById('theme-dropdown-arrow');
        if (dropdownArrow) {
            dropdownArrow.innerHTML = getInlineSVG('CHEVRON_DOWN', 'dropdown-arrow-icon');
        }
    }

    private loadSavedTheme(): void {
        const savedTheme = this.profileStateManager.getPreferences().theme ?? 'wpi-dark';
        this.themeManager.setTheme(savedTheme);
        this.updateCurrentThemeDisplay();
    }

    private setupEventListeners(): void {
        if (!this.dropdownElement || !this.optionsElement) return;

        this.dropdownElement.addEventListener('click', this.boundDropdownClick);
        document.addEventListener('click', this.boundDocumentClick);
        this.optionsElement.addEventListener('click', this.boundOptionsClick);

        this.optionsElement.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const themeOption = target.closest(`.${styles['theme-option']}`) as HTMLElement;
            if (themeOption) {
                const themeId = themeOption.dataset.themeId;
                if (themeId) {
                    this.selectTheme(themeId);
                }
            }
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
        this.dropdownElement.classList.add(styles.open);
        this.optionsElement.classList.add(styles.show);
    }

    private closeDropdown(): void {
        if (!this.dropdownElement || !this.optionsElement) return;

        this.isOpen = false;
        this.dropdownElement.classList.remove(styles.open);
        this.optionsElement.classList.remove(styles.show);
    }

    private renderThemeOptions(): void {
        if (!this.optionsElement) return;

        const availableThemes = this.themeManager.getAvailableThemes();
        const currentThemeId = this.themeManager.getCurrentThemeId();

        let html = '';
        availableThemes.forEach(theme => {
            const isActive = theme.id === currentThemeId;
            html += `
                <div class="${styles['theme-option']} ${isActive ? styles.active : ''}" data-theme-id="${theme.id}">
                    <div class="${styles['theme-option-name']}">${theme.name}</div>
                    <div class="${styles['theme-option-description']}">${theme.description}</div>
                </div>
            `;
        });

        this.optionsElement.innerHTML = html;
    }

    private selectTheme(themeId: string): void {
        // Apply theme (ThemeManager handles storage automatically via StorageService)
        const success = this.themeManager.setTheme(themeId);
        if (!success) return;

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
        this.optionsElement.querySelectorAll(`.${styles['theme-option']}`).forEach(option => {
            option.classList.remove(styles.active);
        });

        // Add active class to selected option
        const selectedOption = this.optionsElement.querySelector(`[data-theme-id="${selectedThemeId}"]`);
        if (selectedOption) {
            selectedOption.classList.add(styles.active);
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

    public destroy(): void {
        if (this.dropdownElement) {
            this.dropdownElement.removeEventListener('click', this.boundDropdownClick);
        }
        if (this.optionsElement) {
            this.optionsElement.removeEventListener('click', this.boundOptionsClick);
        }
        document.removeEventListener('click', this.boundDocumentClick);
    }
}