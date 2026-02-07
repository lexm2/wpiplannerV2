import { Course, Department, Section, Period, Time, DayOfWeek, ScheduleDB, PeriodType } from '../../src/types/types'
import { SelectedCourse, Schedule, AcademicTerm } from '../../src/types/schedule'

export const createMockTime = (hours: number, minutes: number): Time => ({
  hours,
  minutes,
  displayTime: `${hours}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
})

export const createMockPeriod = (overrides: Partial<Period> = {}): Period => ({
  type: PeriodType.LECTURE,
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
  computedTerm: AcademicTerm.A,
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

  const defaultCourse: Course = {
    id: 'CS-1101',
    number: '1101',
    name: 'Introduction to Programming Design',
    description: 'An introduction to the design and analysis of algorithms and data structures.',
    department,
    minCredits: 3,
    maxCredits: 3,
  }

  return { ...defaultCourse, ...overrides }
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

interface WPIEntryData {
  Academic_Level?: string
  Academic_Units?: string
  Academic_Year?: string
  Course_Description?: string
  Course_Section?: string
  Course_Section_Description?: string
  Course_Title?: string
  Credits?: string
  Enrolled_Capacity?: string
  Instructional_Format?: string
  Instructors?: string
  Locations?: string
  Meeting_Day_Patterns?: string
  Meeting_Patterns?: string
  Offering_Period?: string
  Section_Status?: string
  Waitlist_Waitlist_Capacity?: string
}

export const createMockWPIEntry = (overrides: Partial<WPIEntryData> = {}): WPIEntryData => ({
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

export const createMockSelectedCourse = (overrides: Partial<SelectedCourse> = {}): SelectedCourse => {
  const course = createMockCourse()
  return {
    course,
    selectedLecture: null,
    selectedDiscussion: null,
    selectedLab: null,
    isRequired: false,
    lockedSections: new Set<string>(),
    ...overrides
  }
}

export const createMockSelectedCourseWithLocks = (
  course: Course,
  lockedCrns: string[]
): SelectedCourse => {
  return {
    course,
    selectedLecture: null,
    selectedDiscussion: null,
    selectedLab: null,
    isRequired: false,
    lockedSections: new Set(lockedCrns)
  }
}

export const createMockSchedule = (overrides: Partial<Schedule> = {}): Schedule => {
  return {
    id: 'schedule-1',
    name: 'Test Schedule',
    selectedCourses: [],
    generatedSchedules: [],
    timestamp: Date.now(),
    ...overrides
  }
}

export const createMockFilterableSection = (overrides: {
  course?: Partial<Course>;
  section?: Partial<Section>;
  sectionType?: 'lecture' | 'standaloneLab' | 'discussion' | 'lab';
} = {}): import('../../src/types/filterableUnit').FilterableSection => {
  const course = createMockCourse(overrides.course || {});
  const section = createMockSection(overrides.section || {});

  return {
    course,
    section,
    sectionType: overrides.sectionType || 'lecture'
  };
}

export const createCoursesWithConflicts = (): {
  course1: Course;
  course2: Course;
  conflictingSection1: Section;
  conflictingSection2: Section;
} => {
  const conflictingPeriod1 = createMockPeriod({
    startTime: createMockTime(10, 0),
    endTime: createMockTime(11, 50),
    days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
  })

  const conflictingPeriod2 = createMockPeriod({
    startTime: createMockTime(10, 30),
    endTime: createMockTime(12, 20),
    days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY])
  })

  const conflictingSection1 = createMockSection({
    crn: 10001,
    number: 'A01',
    periods: [conflictingPeriod1]
  })

  const conflictingSection2 = createMockSection({
    crn: 10002,
    number: 'B01',
    periods: [conflictingPeriod2]
  })

  const course1 = createMockCourse({
    id: 'CS-1101',
    number: '1101',
    name: 'Intro to Programming',
    lectures: [{
      section: conflictingSection1,
      compatibleDiscussions: [],
      compatibleLabs: []
    }]
  })

  const course2 = createMockCourse({
    id: 'MA-1021',
    number: '1021',
    name: 'Calculus I',
    lectures: [{
      section: conflictingSection2,
      compatibleDiscussions: [],
      compatibleLabs: []
    }]
  })

  return { course1, course2, conflictingSection1, conflictingSection2 }
}

export const createLargeCombinationSpace = (
  numCourses: number = 5,
  sectionsPerCourse: number = 10
): Course[] => {
  const courses: Course[] = []

  for (let i = 0; i < numCourses; i++) {
    const lectures: Array<{ section: Section; compatibleDiscussions: Section[]; compatibleLabs: Section[] }> = []

    for (let j = 0; j < sectionsPerCourse; j++) {
      const section = createMockSection({
        crn: 20000 + i * 100 + j,
        number: `A${j.toString().padStart(2, '0')}`,
        periods: [createMockPeriod({
          startTime: createMockTime(8 + j, 0),
          endTime: createMockTime(9 + j, 50),
          days: new Set([DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY])
        })]
      })

      lectures.push({
        section,
        compatibleDiscussions: [],
        compatibleLabs: []
      })
    }

    courses.push(createMockCourse({
      id: `TEST-${i + 1}000`,
      number: `${i + 1}000`,
      name: `Test Course ${i + 1}`,
      lectures
    }))
  }

  return courses
}

interface MockScheduleFilterService {
  filterSections: (selectedCourses: SelectedCourse[]) => Array<{ section: Section }>
}

export const createMockScheduleFilterService = (): MockScheduleFilterService => {
  return {
    filterSections: (selectedCourses: SelectedCourse[]): Array<{ section: Section }> => {
      const allSections: Array<{ section: Section }> = []
      for (const sc of selectedCourses) {
        if (sc.course.lectures) {
          for (const lg of sc.course.lectures) {
            allSections.push({ section: lg.section })
            for (const disc of lg.compatibleDiscussions) {
              allSections.push({ section: disc })
            }
            for (const lab of lg.compatibleLabs) {
              allSections.push({ section: lab })
            }
          }
        }
        if (sc.course.standaloneLabs) {
          for (const lab of sc.course.standaloneLabs) {
            allSections.push({ section: lab })
          }
        }
      }
      return allSections
    }
  }
}

export const createMockScheduleResult = (overrides: {
  course?: Partial<Course>;
  lecture?: Partial<Section>;
  discussion?: Partial<Section> | null;
  lab?: Partial<Section> | null;
} = {}): any => {
  const course = createMockCourse(overrides.course)

  return {
    course,
    combination: {
      lecture: overrides.lecture ? createMockSection(overrides.lecture) : createMockSection({
        periods: [createMockPeriod({ startTime: createMockTime(9, 0) })]
      }),
      discussion: overrides.discussion ? createMockSection(overrides.discussion) : null,
      lab: overrides.lab ? createMockSection(overrides.lab) : null
    },
    isLocked: false
  }
}

export const createScheduleWithEarlyClass = (hours: number, minutes: number): any[] => {
  return [
    createMockScheduleResult({
      lecture: {
        periods: [createMockPeriod({
          startTime: createMockTime(hours, minutes),
          endTime: createMockTime(hours + 1, minutes + 50)
        })]
      }
    })
  ]
}