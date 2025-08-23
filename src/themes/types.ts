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

export interface ThemeTypography {
    fontFamily: string;
    fontFamilyMono: string;
}

export interface ThemeSpacing {
    baseUnit: string;
    headerHeight: string;
    sidebarWidth: string;
    rightPanelWidth: string;
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
    typography: ThemeTypography;
    spacing: ThemeSpacing;
    effects: ThemeEffects;
}

export interface ThemeManagerConfig {
    defaultThemeId: string;
    storageKey: string;
    themes: ThemeDefinition[];
}

export type ThemeId = string;

export interface ThemeChangeEvent {
    oldTheme: ThemeId;
    newTheme: ThemeId;
    themeDefinition: ThemeDefinition;
}

export type ThemeChangeListener = (event: ThemeChangeEvent) => void;