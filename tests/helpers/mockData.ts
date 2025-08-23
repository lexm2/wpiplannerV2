import { Course, Department, Section, Period, Time, DayOfWeek, ScheduleDB } from '../../src/types/types'

export const createMockTime = (hours: number, minutes: number): Time => ({
  hours,
  minutes,
  displayTime: `${hours}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
})

export const createMockPeriod = (overrides: Partial<Period> = {}): Period => ({
  type: 'Lecture',
  professor: 'Dr. Test Professor',
  professorEmail: 'test@wpi.edu',
  startTime: createMockTime(9, 0),
  endTime: createMockTime(10, 50),
  building: 'Fuller Labs',
  room: '320',
  location: 'Fuller Labs 320',
  seats: 30,
  seatsAvailable: 15,
  actualWaitlist: 2,
  maxWaitlist: 10,
  days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY]),
  specificSection: 'A01',
  ...overrides
})

export const createMockSection = (overrides: Partial<Section> = {}): Section => ({
  crn: 12345,
  number: 'A01',
  seats: 30,
  seatsAvailable: 15,
  actualWaitlist: 2,
  maxWaitlist: 10,
  note: undefined,
  description: 'Test section description',
  term: 'Fall 2024',
  periods: [createMockPeriod()],
  ...overrides
})

export const createMockDepartment = (overrides: Partial<Department> = {}): Department => ({
  abbreviation: 'CS',
  name: 'Computer Science',
  courses: [],
  ...overrides
})

export const createMockCourse = (overrides: Partial<Course> = {}): Course => {
  const department = createMockDepartment()
  return {
    id: 'CS-1101',
    number: '1101',
    name: 'Introduction to Programming Design',
    description: 'An introduction to the design and analysis of algorithms and data structures.',
    department,
    sections: [createMockSection()],
    minCredits: 3,
    maxCredits: 3,
    ...overrides
  }
}

export const createMockScheduleDB = (overrides: Partial<ScheduleDB> = {}): ScheduleDB => {
  const csDept = createMockDepartment({ abbreviation: 'CS', name: 'Computer Science' })
  const maDept = createMockDepartment({ abbreviation: 'MA', name: 'Mathematical Sciences' })
  
  const csCourse = createMockCourse({ 
    id: 'CS-1101', 
    number: '1101',
    name: 'Introduction to Programming Design',
    department: csDept
  })
  
  const maCourse = createMockCourse({ 
    id: 'MA-1021', 
    number: '1021',
    name: 'Calculus I',
    department: maDept
  })
  
  csDept.courses = [csCourse]
  maDept.courses = [maCourse]
  
  return {
    departments: [csDept, maDept],
    generated: new Date().toISOString(),
    ...overrides
  }
}

// Sample WPI JSON entry for testing parsing
export const createMockWPIEntry = (overrides: any = {}) => ({
  "Academic_Level": "Undergraduate",
  "Academic_Units": "Computer Science Department",
  "Academic_Year": "2024 - 2025 Academic Year",
  "Course_Description": "<p>An introduction to the design and analysis of algorithms and data structures.</p>",
  "Course_Section": "CS 1101-A01 - Introduction to Programming Design",
  "Course_Section_Description": "<p>Lecture section for CS 1101</p>",
  "Course_Title": "CS 1101 - Introduction to Programming Design",
  "Credits": "3",
  "Enrolled_Capacity": "25/30",
  "Instructional_Format": "Lecture",
  "Instructors": "Dr. Test Professor",
  "Locations": "Fuller Labs 320",
  "Meeting_Day_Patterns": "MWF",
  "Meeting_Patterns": "9:00AM - 10:50AM",
  "Offering_Period": "Fall 2024",
  "Section_Status": "Open",
  "Waitlist_Waitlist_Capacity": "2/10",
  ...overrides
})

export const createMockWPIData = () => ({
  Report_Entry: [
    createMockWPIEntry(),
    createMockWPIEntry({
      "Course_Title": "MA 1021 - Calculus I",
      "Course_Section": "MA 1021-A01 - Calculus I",
      "Academic_Units": "Mathematical Sciences Department",
      "Meeting_Day_Patterns": "TR",
      "Meeting_Patterns": "10:00AM - 11:50AM",
      "Locations": "Olin Hall 107"
    })
  ]
})