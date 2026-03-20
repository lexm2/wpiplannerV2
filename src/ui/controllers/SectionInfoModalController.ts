import { ModalService } from '../../services/ui/ModalService';
import { rateMyProfessorService } from '../../services/external/RateMyProfessorService';
import { PeriodType, Section, Course } from '../../types/types';
import { BaseModal } from '../components/BaseModal';
import { getInlineSVG } from '../../utils/iconPaths';

export interface SectionData {
    courseCode: string;
    courseName: string;
    section: Section;
    course: Course;
    courseId: string;
    currentColor: string;
    onColorChange?: (color: string) => void;
}

export class SectionInfoModalController extends BaseModal {
    constructor(modalService: ModalService) {
        super(modalService);
    }

    show(data: SectionData): string {
        const modalElement = this.createModalElement(data);
        return this.showModal(modalElement);
    }

    private createModalElement(data: SectionData): HTMLElement {
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop section-info-modal';

        backdrop.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${this.escapeHtml(data.courseCode)} - ${this.escapeHtml(data.courseName)}</h3>
                        <button class="modal-close" data-modal-close>×</button>
                    </div>
                    <div class="modal-body">
                        ${this.generateModalBody(data)}
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-primary" data-modal-close>Close</button>
                    </div>
                </div>
            </div>
        `;

        const dialog = backdrop.querySelector('.modal-dialog');
        if (dialog instanceof HTMLElement) {
            dialog.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        backdrop.querySelectorAll('[data-modal-close]').forEach(btn => {
            btn.addEventListener('click', () => this.hide());
        });

        // Add color picker event listener
        const colorInput = backdrop.querySelector('.course-color-input');
        if (colorInput && data.onColorChange) {
            colorInput.addEventListener('change', (e) => {
                data.onColorChange!((e.target as HTMLInputElement).value);
            });
        }

        return backdrop;
    }

    private generateModalBody(data: SectionData): string {
        // Build professor display with RMP links
        const professors = [...new Set(data.section.periods.map(p => p.professor).filter(p => p && p.trim()))];
        const professorDisplay = professors.length > 0
            ? professors.map(prof => {
                const rmpUrl = rateMyProfessorService.getProfessorRMPUrl(prof);
                return rmpUrl
                    ? `<a href="${rmpUrl}" target="_blank" rel="noopener noreferrer" class="professor-link">${this.escapeHtml(prof)}</a>`
                    : this.escapeHtml(prof);
            }).join(', ')
            : 'TBA';

        // Credits display
        const creditsDisplay = data.course.minCredits === data.course.maxCredits
            ? `${data.course.minCredits}`
            : `${data.course.minCredits}-${data.course.maxCredits}`;

        // Enrollment status
        const isAvailable = data.section.seatsAvailable > 0;
        const enrollmentClass = isAvailable ? 'section-enrollment-indicator--available' : 'section-enrollment-indicator--full';
        const enrollmentText = isAvailable ? `${data.section.seatsAvailable} seats available` : 'Full';

        // Waitlist display
        const waitlistHtml = data.section.maxWaitlist > 0
            ? `<span class="section-enrollment-waitlist">Waitlist: ${data.section.actualWaitlist}/${data.section.maxWaitlist}</span>`
            : '';

        // Build meeting times
        const meetingTimesHtml = this.generateMeetingTimes(data);

        // Build notes card (conditional)
        const notesHtml = data.section.note ? `
            <div class="section-card section-card--note">
                <div class="section-card-header">
                    <span class="section-card-header-label">Section Note</span>
                </div>
                <div class="section-card-content">
                    <p class="section-note-text">${this.escapeHtml(data.section.note)}</p>
                </div>
            </div>
        ` : '';

        return `
            <div class="section-modal-content">
                <!-- Primary Card: Section Overview -->
                <div class="section-card section-card--primary">
                    <div class="section-card-header">
                        ${getInlineSVG('BOOKMARK', 'section-card-header-icon')}
                        <span class="section-card-header-label">Section Overview</span>
                    </div>
                    <div class="section-card-content">
                        <div class="section-info-grid">
                            <div class="section-info-item">
                                <span class="section-info-label">Professor</span>
                                <span class="section-info-value">${professorDisplay}</span>
                            </div>
                            <div class="section-info-item">
                                <span class="section-info-label">Section</span>
                                <span class="section-info-value">${this.escapeHtml(data.section.number)}</span>
                            </div>
                            <div class="section-info-item">
                                <span class="section-info-label">CRN</span>
                                <span class="section-info-value">${data.section.crn}</span>
                            </div>
                            <div class="section-info-item">
                                <span class="section-info-label">Credits</span>
                                <span class="section-info-value">${creditsDisplay}</span>
                            </div>
                            <div class="section-info-item">
                                <span class="section-info-label">Color</span>
                                <div class="section-color-inline">
                                    <input type="color" class="section-color-input course-color-input" value="${data.currentColor}" />
                                </div>
                            </div>
                        </div>
                        <div class="section-enrollment-badge">
                            <span class="section-enrollment-indicator ${enrollmentClass}">
                                <span class="section-enrollment-dot"></span>
                                ${enrollmentText}
                            </span>
                            ${waitlistHtml}
                        </div>
                    </div>
                </div>

                <!-- Schedule Card: Meeting Times -->
                <div class="section-card section-card--schedule">
                    <div class="section-card-header">
                        ${getInlineSVG('CLOCK', 'section-card-header-icon')}
                        <span class="section-card-header-label">Meeting Times</span>
                    </div>
                    <div class="section-card-content">
                        <div class="section-periods-list">
                            ${meetingTimesHtml}
                        </div>
                    </div>
                </div>

                ${notesHtml}
            </div>
        `;
    }

    private generateMeetingTimes(data: SectionData): string {
        return data.section.periods.map(period => {
            // Check if async: either via isAsync flag or by detecting 12:00-12:00 times
            const isAsync = period.isAsync || (
                period.startTime.displayTime === '12:00 PM' &&
                period.endTime.displayTime === '12:00 PM');

            const typeLabel = this.getPeriodTypeLabel(period.type);
            const typeClass = this.getPeriodTypeClass(period.type);

            if (isAsync) {
                return `
                    <div class="section-period section-period--async">
                        <div class="section-period-type ${typeClass}">${typeLabel}</div>
                        <div class="section-period-details">
                            <div class="section-card-async-badge">
                                ${getInlineSVG('CLOCK', 'async-icon')}
                                <span>Asynchronous</span>
                            </div>
                        </div>
                    </div>
                `;
            }

            const daysArray = Array.from(period.days).sort();
            const daysStr = daysArray.join(', ').toUpperCase();
            const timeStr = `${period.startTime.displayTime} - ${period.endTime.displayTime}`;
            const location = period.building && period.room
                ? `${period.building} ${period.room}`
                : period.location || 'TBA';

            return `
                <div class="section-period">
                    <div class="section-period-type ${typeClass}">${typeLabel}</div>
                    <div class="section-period-details">
                        <div class="section-period-schedule">${daysStr}  ${timeStr}</div>
                        <div class="section-period-location">${this.escapeHtml(location)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    private getPeriodTypeClass(type: string | PeriodType): string {
        const typeStr = String(type).toLowerCase();

        if (typeStr.includes('lab')) return 'section-period-type--lab';
        if (typeStr.includes('dis') || typeStr.includes('discussion')) return 'section-period-type--dis';
        if (typeStr.includes('rec') || typeStr.includes('recitation')) return 'section-period-type--rec';
        if (typeStr.includes('sem') || typeStr.includes('seminar')) return 'section-period-type--sem';
        if (typeStr.includes('studio')) return 'section-period-type--stu';
        if (typeStr.includes('workshop')) return 'section-period-type--wks';
        if (typeStr.includes('experiential')) return 'section-period-type--exp';
        if (typeStr.includes('internship')) return 'section-period-type--int';
        if (typeStr.includes('independent')) return 'section-period-type--ind';
        if (typeStr.includes('research')) return 'section-period-type--res';
        if (typeStr.includes('thesis')) return 'section-period-type--ths';
        if (typeStr.includes('conference') || typeStr.includes('conf')) return 'section-period-type--conf';

        return ''; // Default to primary color (no modifier class)
    }

    private getPeriodTypeLabel(type: string | PeriodType): string {
        const typeStr = String(type);
        const lower = typeStr.toLowerCase();

        if (lower.includes('lec') || lower.includes('lecture')) return 'LEC';
        if (lower.includes('lab')) return 'LAB';
        if (lower.includes('dis') || lower.includes('discussion')) return 'DIS';
        if (lower.includes('rec') || lower.includes('recitation')) return 'REC';
        if (lower.includes('sem') || lower.includes('seminar')) return 'SEM';
        if (lower.includes('studio')) return 'STU';
        if (lower.includes('conference') || lower.includes('conf')) return 'CONF';
        if (lower.includes('workshop')) return 'WKS';
        if (lower.includes('experiential')) return 'EXP';
        if (lower.includes('independent')) return 'IND';
        if (lower.includes('internship')) return 'INT';
        if (lower.includes('research')) return 'RES';
        if (lower.includes('thesis')) return 'THS';

        return typeStr.substring(0, Math.min(4, typeStr.length)).toUpperCase();
    }
}