import { describe, it, expect } from 'bun:test'
import { AutoScheduler } from '../../src/services/scheduling/AutoScheduler'
import { createMockCourse, createMockSection, createMockPeriod, createMockTime, createMockSelectedCourse, createMockScheduleFilterService } from '../helpers/mockData'
import type { AutoScheduleConfig } from '../../src/types/schedule'
import { DayOfWeek } from '../../src/types/types'

describe('Auto-Schedule Wake Up Time Integration', () => {
  it('should apply wake up time preference during generation', async () => {
    const course1 = createMockCourse({
      id: 'CS-1101',
      lectures: [
        {
          section: createMockSection({
            crn: 10001,
            number: 'A01',
            computedTerm: 'A',
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
            computedTerm: 'A',
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
            computedTerm: 'A',
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
    const autoScheduler = new AutoScheduler(filterService)

    const config: AutoScheduleConfig = {
      blockedTimes: [],
      wakeUpTime: { hours: 9, minutes: 0 }
    }

    const schedules = autoScheduler.generateSchedules(selectedCourses, config, 100)

    expect(schedules.length).toBe(2)

    const firstSchedule = schedules[0]
    const secondSchedule = schedules[1]

    const firstCSSection = firstSchedule.find((r: any) => r.course.id === 'CS-1101')
    const secondCSSection = secondSchedule.find((r: any) => r.course.id === 'CS-1101')

    expect(firstCSSection?.combination.lecture.crn).toBe(10002)
    expect(secondCSSection?.combination.lecture.crn).toBe(10001)
  })
})
