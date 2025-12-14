import { ModalService } from '../../services/ui/ModalService';
import { rateMyProfessorService } from '../../services/external/RateMyProfessorService';
import { PeriodType } from '../../types/types';
import { BaseModal } from '../components/BaseModal';
import { getInlineSVG } from '../../utils/iconPaths';

export interface SectionData {
    courseCode: string;
    courseName: string;
    section: {
        number: string;
        crn: number;
        term: string;
        seatsAvailable: number;
        actualWaitlist: number;
        maxWaitlist: number;
        note?: string;
        periods: Array<{
            type: string;
            professor: string;
            startTime: { displayTime: string };
            endTime: { displayTime: string };
            days: Set<string>;
            building: string;
            room: string;
            location: string;
            isAsync?: boolean;
        }>;
    };
    course: {
        minCredits: number;
        maxCredits: number;
    };
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

        return backdrop;
    }

    private generateModalBody(data: SectionData): string {
        const enrollmentStatus = data.section.seatsAvailable > 0
            ? `${data.section.seatsAvailable} seats available`
            : 'Full';

        const waitlistInfo = data.section.maxWaitlist > 0
            ? `Waitlist: ${data.section.actualWaitlist}/${data.section.maxWaitlist}`
            : '';

        const professors = [...new Set(data.section.periods.map(p => p.professor).filter(p => p && p.trim()))];
        const professorDisplay = professors.length > 0
            ? professors.map(prof => {
                const rmpUrl = rateMyProfessorService.getProfessorRMPUrl(prof);
                return rmpUrl
                    ? `<a href="${rmpUrl}" target="_blank" rel="noopener noreferrer" class="professor-link">${prof}</a>`
                    : prof;
            }).join(', ')
            : 'TBA';

        const meetingTimes = data.section.periods.map(period => {
            // Check if async: either via isAsync flag or by detecting 12:00-12:00 times
            const isAsync = period.isAsync || (
                period.startTime.displayTime === '12:00 PM' &&
                period.endTime.displayTime === '12:00 PM');

            if (isAsync) {
                return `
                    <div class="period-info">
                        <div class="period-type">${this.getPeriodTypeLabel(period.type)}</div>
                        <div class="period-schedule">
                            <div class="section-card-async-badge">
                                ${getInlineSVG('CLOCK', 'async-icon')}
                                Asynchronous
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
                <div class="period-info">
                    <div class="period-type">${this.getPeriodTypeLabel(period.type)}</div>
                    <div class="period-schedule">
                        <div>${daysStr} ${timeStr}</div>
                        <div class="period-location">${location}</div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="section-modal-content">
                <div class="section-basic-info">
                    <div class="section-detail"><strong>Professor:</strong> ${professorDisplay}</div>
                    <div class="section-detail"><strong>Section:</strong> ${data.section.number}</div>
                    <div class="section-detail"><strong>CRN:</strong> ${data.section.crn}</div>
                    <div class="section-detail"><strong>Term:</strong> ${data.section.term}</div>
                    <div class="section-detail"><strong>Credits:</strong> ${data.course.minCredits === data.course.maxCredits ? data.course.minCredits : `${data.course.minCredits}-${data.course.maxCredits}`}</div>
                </div>
                
                <div class="section-enrollment ${data.section.seatsAvailable > 0 ? '' : 'full'}">
                    <div class="enrollment-status ${data.section.seatsAvailable > 0 ? 'available' : 'full'}">
                        ${enrollmentStatus}
                    </div>
                    ${waitlistInfo ? `<div class="waitlist-info">${waitlistInfo}</div>` : ''}
                </div>
                
                <div class="section-meetings">
                    <h4>Meeting Times</h4>
                    ${meetingTimes}
                </div>
                
                ${data.section.note ? `
                    <div class="section-notes">
                        <h4>Notes</h4>
                        <p>${data.section.note}</p>
                    </div>
                ` : ''}
            </div>
        `;
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