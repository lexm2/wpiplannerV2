export interface ThemeColors {
    primary: string;
    primaryHover: string;
    primaryLight: string;
    secondary: string;
    secondaryHover: string;
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceHover: string;
    surfaceElevated: string;
    text: string;
    textSecondary: string;
    textInverse: string;
    border: string;
    borderHover: string;
    success: string;
    warning: string;
    error: string;
    info: string;
}

/**
 * Fonts are deliberately NOT here, for the same reason panel widths aren't.
 */

/**
 * Panel widths are deliberately NOT here. They belong to the resizable-panel
 * system (svelte/panelWidths.ts + the --spacing-*-width defaults in
 * themes/styles/base.css) and never varied per theme. Declaring them here meant
 * applyTheme() wrote them as inline custom properties on documentElement,
 * silently overriding base.css.
 */
export interface ThemeSpacing {
    baseUnit: string;
    headerHeight: string;
}

export interface ThemeEffects {
    borderRadius: string;
    borderRadiusLarge: string;
    shadow: string;
    shadowHover: string;
    transition: string;
}

export interface ThemeDefinition {
    name: string;
    id: string;
    description: string;
    colors: ThemeColors;
    spacing: ThemeSpacing;
    effects: ThemeEffects;
}

export interface ThemeManagerConfig {
    defaultThemeId: string;
    storageKey: string;
    themes: ThemeDefinition[];
}

export type ThemeId = string;