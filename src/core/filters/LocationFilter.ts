import { Course } from '../../types/types';
import { CourseFilter, LocationFilterCriteria } from '../../types/filters';

export class LocationFilter implements CourseFilter {
    readonly id = 'location';
    readonly name = 'Location';
    readonly description = 'Filter courses by building or room';
    
    apply(courses: Course[], criteria: LocationFilterCriteria): Course[] {
        const hasBuildings = criteria.buildings && criteria.buildings.length > 0;
        const hasRooms = criteria.rooms && criteria.rooms.length > 0;
        
        if (!hasBuildings && !hasRooms) {
            return courses;
        }
        
        const buildingSet = hasBuildings ? new Set(
            criteria.buildings.map(building => building.toLowerCase())
        ) : null;
        
        const roomSet = hasRooms ? new Set(
            criteria.rooms.map(room => room.toLowerCase())
        ) : null;
        
        return courses.filter(course =>
            course.sections.some(section =>
                section.periods.some(period => {
                    if (buildingSet && !buildingSet.has(period.building.toLowerCase())) {
                        return false;
                    }
                    if (roomSet && !roomSet.has(period.room.toLowerCase())) {
                        return false;
                    }
                    return true;
                })
            )
        );
    }
    
    isValidCriteria(criteria: any): criteria is LocationFilterCriteria {
        return criteria && 
               (Array.isArray(criteria.buildings) || Array.isArray(criteria.rooms)) &&
               (!criteria.buildings || criteria.buildings.every((building: any) => typeof building === 'string')) &&
               (!criteria.rooms || criteria.rooms.every((room: any) => typeof room === 'string'));
    }
    
    getDisplayValue(criteria: LocationFilterCriteria): string {
        const parts = [];
        
        if (criteria.buildings && criteria.buildings.length > 0) {
            if (criteria.buildings.length === 1) {
                parts.push(`Building: ${criteria.buildings[0]}`);
            } else {
                parts.push(`Buildings: ${criteria.buildings.join(', ')}`);
            }
        }
        
        if (criteria.rooms && criteria.rooms.length > 0) {
            if (criteria.rooms.length === 1) {
                parts.push(`Room: ${criteria.rooms[0]}`);
            } else {
                parts.push(`Rooms: ${criteria.rooms.join(', ')}`);
            }
        }
        
        return parts.join('; ');
    }
}