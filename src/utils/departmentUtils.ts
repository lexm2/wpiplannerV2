import { Department } from '../types/types';

export const DEPARTMENT_CATEGORIES: { [key: string]: string } = {
    // Science
    'BB': 'Science',
    'BCB': 'Science', 
    'CH': 'Science',
    'CS': 'Science',
    'DS': 'Science',
    'GE': 'Science',
    'IMGD': 'Science',
    'MA': 'Science',
    'MTE': 'Science',
    'PTE': 'Science',
    'NE': 'Science',
    'PH': 'Science',
    
    // Engineering
    'AE': 'Engineering',
    'AR': 'Engineering',
    'ARE': 'Engineering',
    'BME': 'Engineering',
    'CE': 'Engineering',
    'CHE': 'Engineering',
    'ECE': 'Engineering',
    'ES': 'Engineering',
    'FP': 'Engineering',
    'ME': 'Engineering',
    'MFE': 'Engineering',
    'MSE': 'Engineering',
    'NUE': 'Engineering',
    'RBE': 'Engineering',
    'SYE': 'Engineering',
    
    // Business & Management
    'BUS': 'Business & Management',
    'ECON': 'Business & Management',
    'MIS': 'Business & Management',
    'OIE': 'Business & Management',
    
    // Humanities & Arts
    'EN': 'Humanities & Arts',
    'HI': 'Humanities & Arts',
    'HU': 'Humanities & Arts',
    'MU': 'Humanities & Arts',
    'RE': 'Humanities & Arts',
    'SP': 'Humanities & Arts',
    'TH': 'Humanities & Arts',
    'WR': 'Humanities & Arts',
    
    // Social Sciences
    'GOV': 'Social Sciences',
    'PSY': 'Social Sciences',
    'SOC': 'Social Sciences',
    'SS': 'Social Sciences'
};

export const CATEGORY_ORDER = [
    'Science',
    'Engineering',
    'Business & Management',
    'Humanities & Arts',
    'Social Sciences',
    'Other'
];

export function getDepartmentCategory(departmentAbbreviation: string): string {
    return DEPARTMENT_CATEGORIES[departmentAbbreviation] || 'Other';
}

export function groupDepartmentsByCategory(departments: Department[]): { [key: string]: Department[] } {
    const categories: { [key: string]: Department[] } = {};
    
    // Initialize all categories
    CATEGORY_ORDER.forEach(category => {
        categories[category] = [];
    });

    departments.forEach(dept => {
        const category = getDepartmentCategory(dept.abbreviation);
        categories[category].push(dept);
    });

    // Sort departments within each category
    Object.keys(categories).forEach(category => {
        categories[category].sort((a, b) => a.name.localeCompare(b.name));
    });

    return categories;
}

export function getAllDepartmentAbbreviations(): string[] {
    return Object.keys(DEPARTMENT_CATEGORIES);
}

export function getCategoryList(): string[] {
    return [...CATEGORY_ORDER];
}