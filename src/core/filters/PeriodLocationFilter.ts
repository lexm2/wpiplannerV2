import { Course, Period } from '../../types/types';
import { CourseFilter, PeriodLocationFilterCriteria } from '../../types/filters';

export class PeriodLocationFilter implements CourseFilter {
    readonly id = 'periodLocation';
    readonly name = 'Period Location';
    readonly description = 'Filter periods by building and room';
    
    apply(courses: Course[], criteria: PeriodLocationFilterCriteria): Course[] {
        // This filter works on periods, so it's handled by the service layer
        return courses;
    }
    
    applyToPeriods(periods: Period[], criteria: PeriodLocationFilterCriteria): Period[] {
        let filteredPeriods = periods;
        
        // Filter by buildings
        if (criteria.buildings && criteria.buildings.length > 0) {
            const selectedBuildings = new Set(
                criteria.buildings.map(building => building.toLowerCase().trim())
            );
            
            filteredPeriods = filteredPeriods.filter(period => {
                if (!period.building) return false;
                const buildingName = period.building.toLowerCase().trim();
                return selectedBuildings.has(buildingName) ||
                       // Check for partial matches
                       Array.from(selectedBuildings).some(selected => 
                           buildingName.includes(selected) || selected.includes(buildingName)
                       );
            });
        }
        
        // Filter by rooms
        if (criteria.rooms && criteria.rooms.length > 0) {
            const selectedRooms = new Set(
                criteria.rooms.map(room => room.toLowerCase().trim())
            );
            
            filteredPeriods = filteredPeriods.filter(period => {
                if (!period.room) return false;
                const roomName = period.room.toLowerCase().trim();
                return selectedRooms.has(roomName) ||
                       // Check for partial matches
                       Array.from(selectedRooms).some(selected => 
                           roomName.includes(selected) || selected.includes(roomName)
                       );
            });
        }
        
        return filteredPeriods;
    }
    
    isValidCriteria(criteria: any): criteria is PeriodLocationFilterCriteria {
        if (!criteria || typeof criteria !== 'object') return false;
        
        if (criteria.buildings && 
            (!Array.isArray(criteria.buildings) || 
             !criteria.buildings.every((b: any) => typeof b === 'string'))) {
            return false;
        }
        
        if (criteria.rooms && 
            (!Array.isArray(criteria.rooms) || 
             !criteria.rooms.every((r: any) => typeof r === 'string'))) {
            return false;
        }
        
        return true;
    }
    
    getDisplayValue(criteria: PeriodLocationFilterCriteria): string {
        const parts: string[] = [];
        
        if (criteria.buildings && criteria.buildings.length > 0) {
            if (criteria.buildings.length === 1) {
                parts.push(`Building: ${criteria.buildings[0]}`);
            } else {
                parts.push(`${criteria.buildings.length} Buildings`);
            }
        }
        
        if (criteria.rooms && criteria.rooms.length > 0) {
            if (criteria.rooms.length === 1) {
                parts.push(`Room: ${criteria.rooms[0]}`);
            } else {
                parts.push(`${criteria.rooms.length} Rooms`);
            }
        }
        
        return parts.length > 0 ? parts.join(', ') : 'Any Location';
    }
}