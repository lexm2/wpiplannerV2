import { describe, it, expect } from 'bun:test'
import { AutoScheduler } from '../../src/services/scheduling/AutoScheduler'
import { ScheduleFilterService } from '../../src/services/filtering/ScheduleFilterService'
import { createMockCourse, createMockSection, createMockPeriod, createMockTime, createMockSelectedCourse, createMockScheduleFilterService } from '../helpers/mockData'
import { AcademicTerm } from '../../src/types/schedule'
import { DayOfWeek } from '../../src/types/types'

describe('Auto-Schedule Wake Up Time Integration', () => {
  it('should exclude sections before wake-up time', async () => {
    const course1 = createMockCourse({
      id: 'CS-1101',
      lectures: [
        {
          section: createMockSection({
            crn: 10001,
            number: 'A01',
            computedTerm: AcademicTerm.A,
            periods: [createMockPeriod({
              startTime: createMockTime(8, 0),
              endTime: createMockTime(9, 50)
            })]
          }),
          compatibleDiscussions: [],
          compatibleLabs: []
        },
        {
          section: createMockSection({
            crn: 10002,
            number: 'A02',
            computedTerm: AcademicTerm.A,
            periods: [createMockPeriod({
              startTime: createMockTime(10, 0),
              endTime: createMockTime(11, 50)
            })]
          }),
          compatibleDiscussions: [],
          compatibleLabs: []
        }
      ]
    })

    const course2 = createMockCourse({
      id: 'MA-1021',
      lectures: [
        {
          section: createMockSection({
            crn: 20001,
            number: 'B01',
            computedTerm: AcademicTerm.A,
            periods: [createMockPeriod({
              startTime: createMockTime(12, 0),
              endTime: createMockTime(13, 50),
              days: new Set([DayOfWeek.TUESDAY, DayOfWeek.THURSDAY] as DayOfWeek[])
            })]
          }),
          compatibleDiscussions: [],
          compatibleLabs: []
        }
      ]
    })

    const selectedCourses = [
      createMockSelectedCourse({ course: course1 }),
      createMockSelectedCourse({ course: course2 })
    ]

    const filterService = createMockScheduleFilterService()
    const autoScheduler = new AutoScheduler(filterService as unknown as ScheduleFilterService)

    filterService.addFilter('wakeUpTime', { wakeUpTime: { hours: 9, minutes: 0 } })

    const schedules = autoScheduler.generateSchedules(selectedCourses, 100)

    expect(schedules.length).toBe(1)

    const schedule = schedules[0]
    const csSection = schedule.find((r: any) => r.course.id === 'CS-1101')

    if (!csSection?.combination.lecture) throw new Error('Missing lecture in schedule')

    expect(csSection.combination.lecture.crn).toBe(10002)
  })
})
