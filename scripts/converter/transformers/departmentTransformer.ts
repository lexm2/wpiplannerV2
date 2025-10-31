/**
 * Builds department structure from course data
 */

import { PlannerDepartment } from '../types/outputTypes.js';

// WPI Department list (copied from Schedb.java)
export const WPI_DEPARTMENTS = [
    { abbreviation: 'AB', name: 'Arabic' },
    { abbreviation: 'ACC', name: 'Accounting' },
    { abbreviation: 'AE', name: 'Aerospace Engineering' },
    { abbreviation: 'AR', name: 'Art' },
    { abbreviation: 'ARCH', name: 'Architecture' },
    { abbreviation: 'AREN', name: 'Architectural Engineering' },
    { abbreviation: 'AS', name: 'Air Science' },
    { abbreviation: 'BB', name: 'Biology' },
    { abbreviation: 'BCB', name: 'Bioinformatics & Computational Biology' },
    { abbreviation: 'BME', name: 'Biomedical Engineering' },
    { abbreviation: 'BUS', name: 'Business' },
    { abbreviation: 'CE', name: 'Civil Engineering' },
    { abbreviation: 'CH', name: 'Chemistry' },
    { abbreviation: 'CHE', name: 'Chemical Engineering' },
    { abbreviation: 'CN', name: 'Chinese' },
    { abbreviation: 'CS', name: 'Computer Science' },
    { abbreviation: 'CP', name: 'Co-op' },
    { abbreviation: 'DEV', name: 'Development' },
    { abbreviation: 'DS', name: 'Data Science' },
    { abbreviation: 'ECE', name: 'Electrical & Computer Engineering' },
    { abbreviation: 'ECON', name: 'Economics' },
    { abbreviation: 'EDU', name: 'Teacher Education' },
    { abbreviation: 'EN', name: 'English' },
    { abbreviation: 'ENV', name: 'Environmental Studies' },
    { abbreviation: 'ES', name: 'Engineering Science' },
    { abbreviation: 'ESL', name: 'English as a Second Language' },
    { abbreviation: 'ETR', name: 'Entrepreneurship' },
    { abbreviation: 'FIN', name: 'Finance' },
    { abbreviation: 'FP', name: 'Fire Protection' },
    { abbreviation: 'FY', name: 'First Year' },
    { abbreviation: 'GE', name: 'Geology' },
    { abbreviation: 'GN', name: 'German' },
    { abbreviation: 'GOV', name: 'Government, Political Science, and Law' },
    { abbreviation: 'HI', name: 'History' },
    { abbreviation: 'HU', name: 'Humanities' },
    { abbreviation: 'ID', name: 'Interdisciplinary' },
    { abbreviation: 'IDG', name: 'Interdisciplinary-Graduate' },
    { abbreviation: 'IGS', name: 'Integrative & Global Studies' },
    { abbreviation: 'IMGD', name: 'Interactive Media & Game Development' },
    { abbreviation: 'INTL', name: 'International & Global Studies' },
    { abbreviation: 'ISE', name: 'Integrated Skills in English' },
    { abbreviation: 'JP', name: 'Japanese' },
    { abbreviation: 'MA', name: 'Mathematical Sciences' },
    { abbreviation: 'ME', name: 'Mechanical Engineering' },
    { abbreviation: 'MFE', name: 'Manufacturing Engineering' },
    { abbreviation: 'MIS', name: 'Management Information Systems' },
    { abbreviation: 'MKT', name: 'Marketing' },
    { abbreviation: 'ML', name: 'Military Leadership' },
    { abbreviation: 'MME', name: 'Mathematics for Educators' },
    { abbreviation: 'MPE', name: 'Physics for Educators' },
    { abbreviation: 'MTE', name: 'Materials Science & Engineering' },
    { abbreviation: 'MU', name: 'Music' },
    { abbreviation: 'NEU', name: 'Neuroscience' },
    { abbreviation: 'NSE', name: 'Nuclear Science & Engineering' },
    { abbreviation: 'OBC', name: 'Organizational Behavior & Change' },
    { abbreviation: 'OIE', name: 'Operations & Industrial Engineering' },
    { abbreviation: 'OT', name: 'Other' },
    { abbreviation: 'PC', name: 'Project Center' },
    { abbreviation: 'PH', name: 'Physics' },
    { abbreviation: 'PSY', name: 'Psychology' },
    { abbreviation: 'PY', name: 'Philosophy' },
    { abbreviation: 'RBE', name: 'Robotics Engineering' },
    { abbreviation: 'RE', name: 'Religion' },
    { abbreviation: 'SD', name: 'System Dynamics' },
    { abbreviation: 'SEME', name: 'Science, Engineering, Math Education' },
    { abbreviation: 'SOC', name: 'Sociology' },
    { abbreviation: 'SP', name: 'Spanish' },
    { abbreviation: 'SS', name: 'Social Science' },
    { abbreviation: 'STS', name: 'Society-Technology Studies' },
    { abbreviation: 'SYS', name: 'Systems Engineering' },
    { abbreviation: 'TH', name: 'Theatre' },
    { abbreviation: 'WR', name: 'Writing' },
    { abbreviation: 'WPE', name: 'Wellness & Physical Education' }
];

/**
 * Initializes all WPI departments with empty course arrays
 */
export function initializeDepartments(): Map<string, PlannerDepartment> {
    const departments = new Map<string, PlannerDepartment>();

    for (const dept of WPI_DEPARTMENTS) {
        departments.set(dept.abbreviation, {
            abbreviation: dept.abbreviation,
            name: dept.name,
            courses: []
        });
    }

    return departments;
}

/**
 * Gets department by abbreviation, defaults to "OT" (Other) if not found
 */
export function getDepartment(
    departments: Map<string, PlannerDepartment>,
    abbreviation: string
): PlannerDepartment {
    const dept = departments.get(abbreviation);
    if (dept) {
        return dept;
    }

    // Default to "Other" department for unknown abbreviations
    const otherDept = departments.get('OT');
    if (!otherDept) {
        throw new Error('Other department not found');
    }

    return otherDept;
}
