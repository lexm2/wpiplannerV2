import { ModalService } from '../../services/ModalService';

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
        }>;
    };
    course: {
        minCredits: number;
        maxCredits: number;
    };
}

export class SectionInfoModalController {
    private modalService: ModalService;

    constructor(modalService: ModalService) {
        this.modalService = modalService;
    }

    show(data: SectionData): string {
        const id = this.modalService.generateId();
        const modalElement = this.createModalElement(id, data);
        
        this.modalService.showModal(id, modalElement);
        this.modalService.setupModalBehavior(modalElement, id);

        return id;
    }

    private createModalElement(id: string, data: SectionData): HTMLElement {
        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.id = id;

        // Add embedded CSS
        const style = document.createElement('style');
        style.textContent = this.getModalCSS();
        backdrop.appendChild(style);

        // Create modal content
        backdrop.innerHTML += `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${data.courseCode} - ${data.courseName}</h3>
                        <button class="modal-close" onclick="document.getElementById('${id}').click()">×</button>
                    </div>
                    <div class="modal-body">
                        ${this.generateModalBody(data)}
                    </div>
                    <div class="modal-footer">
                        <button class="modal-btn btn-primary" onclick="document.getElementById('${id}').click()">Close</button>
                    </div>
                </div>
            </div>
        `;

        // Prevent clicks on modal dialog from closing modal
        const dialog = backdrop.querySelector('.modal-dialog') as HTMLElement;
        if (dialog) {
            dialog.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        return backdrop;
    }

    private generateModalBody(data: SectionData): string {
        const enrollmentStatus = data.section.seatsAvailable > 0 
            ? `${data.section.seatsAvailable} seats available` 
            : 'Full';
        
        const waitlistInfo = data.section.maxWaitlist > 0 
            ? `Waitlist: ${data.section.actualWaitlist}/${data.section.maxWaitlist}` 
            : '';

        const meetingTimes = data.section.periods.map(period => {
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

    private getPeriodTypeLabel(type: string): string {
        const lower = type.toLowerCase();
        
        if (lower.includes('lec') || lower.includes('lecture')) return 'LEC';
        if (lower.includes('lab')) return 'LAB';
        if (lower.includes('dis') || lower.includes('discussion')) return 'DIS';
        if (lower.includes('rec') || lower.includes('recitation')) return 'REC';
        if (lower.includes('sem') || lower.includes('seminar')) return 'SEM';
        if (lower.includes('studio')) return 'STU';
        if (lower.includes('conference') || lower.includes('conf')) return 'CONF';
        
        return type.substring(0, Math.min(4, type.length)).toUpperCase();
    }

    private getModalCSS(): string {
        return `
            .modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 1rem;
                opacity: 0;
                transition: var(--effect-transition);
                cursor: pointer;
            }

            .modal-backdrop.show {
                opacity: 1;
            }

            .modal-backdrop.hide {
                opacity: 0;
            }

            .modal-dialog {
                background: var(--color-surface);
                border-radius: var(--effect-border-radius-large);
                box-shadow: var(--effect-shadow-hover);
                max-width: 600px;
                width: 100%;
                max-height: 90vh;
                overflow: hidden;
                transform: scale(0.9);
                transition: var(--effect-transition);
                cursor: default;
            }

            .modal-backdrop.show .modal-dialog {
                transform: scale(1);
            }

            .modal-backdrop.hide .modal-dialog {
                transform: scale(0.9);
            }

            .modal-content {
                display: flex;
                flex-direction: column;
                max-height: 90vh;
            }

            .modal-header {
                padding: 1.5rem 1.5rem 1rem 1.5rem;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid var(--color-border);
                background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
                color: var(--color-text-inverse);
            }

            .modal-title {
                margin: 0;
                font-size: 1.4rem;
                font-weight: 600;
                color: var(--color-text-inverse);
                font-family: var(--font-family);
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                color: rgba(255, 255, 255, 0.8);
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: var(--effect-border-radius);
                transition: var(--effect-transition);
            }

            .modal-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--color-text-inverse);
            }

            .modal-body {
                padding: 1.5rem;
                flex: 1;
                overflow-y: auto;
                background: var(--color-surface);
            }

            .section-modal-content {
                display: flex;
                flex-direction: column;
                gap: 1.25rem;
                max-width: 100%;
                margin: 0 auto;
                align-items: center;
            }

            .section-basic-info {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 0.75rem;
                padding: 1rem;
                background: rgba(172, 43, 55, 0.08);
                border: 1px solid var(--color-border);
                border-radius: var(--effect-border-radius);
                border-left: 4px solid var(--color-primary);
                box-shadow: var(--effect-shadow);
                width: 100%;
            }

            .section-detail {
                font-size: 0.9rem;
                color: var(--color-text);
                font-family: var(--font-family);
            }

            .section-detail strong {
                color: var(--color-primary);
                font-weight: 600;
            }

            .section-enrollment {
                padding: 1rem;
                background: rgba(172, 43, 55, 0.08);
                border: 1px solid var(--color-border);
                border-radius: var(--effect-border-radius);
                border-left: 4px solid var(--color-success);
                box-shadow: var(--effect-shadow);
                width: 100%;
            }

            .section-enrollment.full {
                background: rgba(172, 43, 55, 0.08);
                border-left-color: var(--color-error);
            }

            .enrollment-status {
                font-weight: 600;
                margin-bottom: 0.5rem;
                font-size: 1rem;
                font-family: var(--font-family);
            }

            .enrollment-status.available {
                color: var(--color-success);
            }

            .enrollment-status.full {
                color: var(--color-error);
            }

            .waitlist-info {
                font-size: 0.875rem;
                color: var(--color-text-secondary);
                margin-top: 0.25rem;
                font-family: var(--font-family);
            }

            .section-meetings {
                width: 100%;
            }

            .section-meetings h4 {
                margin: 0 0 1rem 0;
                font-size: 1.1rem;
                color: var(--color-text);
                padding-bottom: 0.5rem;
                border-bottom: 2px solid var(--color-border);
                font-family: var(--font-family);
            }

            .period-info {
                display: flex;
                gap: 1rem;
                padding: 1rem;
                background: var(--color-surface);
                border: 1px solid var(--color-border);
                border-radius: var(--effect-border-radius);
                margin-bottom: 0.75rem;
                box-shadow: var(--effect-shadow);
            }

            .period-type {
                background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
                color: var(--color-text-inverse);
                padding: 0.4rem 0.8rem;
                border-radius: var(--effect-border-radius);
                font-size: 0.8rem;
                font-weight: 700;
                height: fit-content;
                min-width: 50px;
                text-align: center;
                box-shadow: var(--effect-shadow);
                font-family: var(--font-family);
            }

            .period-schedule {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 0.3rem;
                font-size: 0.875rem;
                font-family: var(--font-family);
                align-items: flex-start;
            }

            .period-schedule div {
                color: var(--color-text);
                font-weight: 500;
            }

            .period-location {
                color: var(--color-text-secondary);
                font-size: 0.8rem;
                font-weight: normal;
            }

            .section-notes {
                background: var(--color-background-alt);
                border: 1px solid var(--color-warning);
                border-radius: var(--effect-border-radius);
                padding: 1rem;
                width: 100%;
            }

            .section-notes h4 {
                margin: 0 0 0.5rem 0;
                font-size: 1rem;
                color: var(--color-warning);
                border: none;
                padding: 0;
                font-family: var(--font-family);
            }

            .section-notes p {
                margin: 0;
                font-size: 0.875rem;
                color: var(--color-text-secondary);
                line-height: 1.5;
                font-family: var(--font-family);
            }

            .modal-footer {
                padding: 1rem 1.5rem 1.5rem 1.5rem;
                display: flex;
                gap: 0.75rem;
                justify-content: flex-end;
                border-top: 1px solid var(--color-border);
                background: var(--color-background);
            }

            .modal-btn {
                padding: 0.6rem 1.25rem;
                border-radius: var(--effect-border-radius);
                font-weight: 600;
                font-size: 0.875rem;
                cursor: pointer;
                transition: var(--effect-transition);
                border: 1px solid;
                min-width: 100px;
                font-family: var(--font-family);
            }

            .btn-primary {
                background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
                color: var(--color-text-inverse);
                border-color: var(--color-primary);
            }

            .btn-primary:hover {
                background: linear-gradient(135deg, var(--color-primary-hover), var(--color-primary));
                border-color: var(--color-primary-hover);
                transform: translateY(-1px);
                box-shadow: var(--effect-shadow-hover);
            }

            @media (max-width: 768px) {
                .modal-backdrop {
                    padding: 0.5rem;
                }
                
                .modal-dialog {
                    max-width: 100%;
                    margin: 0;
                }
                
                .modal-body {
                    padding: 1rem;
                }
                
                .section-basic-info {
                    grid-template-columns: 1fr;
                    padding: 0.75rem;
                }
                
                .period-info {
                    flex-direction: column;
                    gap: 0.75rem;
                }
                
                .period-type {
                    align-self: flex-start;
                    width: fit-content;
                }
                

                .modal-footer {
                    padding: 0.75rem 1rem 1rem 1rem;
                }
                
                .modal-btn {
                    width: 100%;
                }
            }
        `;
    }
}