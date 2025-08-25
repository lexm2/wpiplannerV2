import { Course } from '../../types/types';
import { CancellationToken, CancellationError } from '../../utils/RequestCancellation';
import { PerformanceMetrics } from '../../utils/PerformanceMetrics';

export interface RenderBatchCallback {
    (batchIndex: number, batchCount: number, totalCount: number): void;
}

export interface RenderCompleteCallback {
    (totalRendered: number, totalTime: number): void;
}

export interface ProgressiveRenderOptions {
    batchSize?: number;
    batchDelay?: number;
    onBatch?: RenderBatchCallback;
    onComplete?: RenderCompleteCallback;
    enableVirtualization?: boolean;
    performanceMetrics?: PerformanceMetrics;
}

export class ProgressiveRenderer {
    private batchSize: number = 10;
    private batchDelay: number = 16; // 60 FPS
    private currentRenderToken: number | null = null;
    private isRendering: boolean = false;
    private renderStartTime: number = 0;
    private performanceMetrics?: PerformanceMetrics;

    constructor(private options: ProgressiveRenderOptions = {}) {
        this.batchSize = options.batchSize || 10;
        this.batchDelay = options.batchDelay || 16;
        this.performanceMetrics = options.performanceMetrics;
    }

    async renderCoursesBatched(
        courses: Course[], 
        renderFunction: (courses: Course[], isFirstBatch: boolean, isComplete: boolean) => void,
        container: HTMLElement,
        cancellationToken?: CancellationToken
    ): Promise<void> {
        // Cancel any existing render operation
        this.cancelCurrentRender();
        
        if (courses.length === 0) {
            renderFunction([], true, true);
            return;
        }

        this.isRendering = true;
        this.renderStartTime = performance.now();
        const renderToken = Date.now() + Math.random(); // Unique token for this render
        this.currentRenderToken = renderToken;

        const totalBatches = Math.ceil(courses.length / this.batchSize);
        
        // Start performance tracking
        const operationId = this.performanceMetrics?.startOperation('batch-render', {
            itemCount: courses.length,
            batchSize: this.batchSize,
            batchCount: totalBatches
        });

        try {
            // Check for cancellation before starting
            cancellationToken?.throwIfCancelled();
            
            // Render first batch immediately for instant feedback
            const firstBatch = courses.slice(0, this.batchSize);
            renderFunction(firstBatch, true, courses.length <= this.batchSize);
            
            // Call batch callback
            this.options.onBatch?.(1, totalBatches, courses.length);

            if (courses.length <= this.batchSize) {
                // Single batch, we're done
                this.completeRender(courses.length);
                return;
            }

            // Render remaining batches progressively
            for (let i = 1; i < totalBatches; i++) {
                // Check if this render was cancelled (internal token)
                if (this.currentRenderToken !== renderToken) {
                    return; // Render was cancelled
                }
                
                // Check external cancellation token
                cancellationToken?.throwIfCancelled();

                await this.wait(this.batchDelay, cancellationToken);

                // Check again after delay
                if (this.currentRenderToken !== renderToken) {
                    return; // Render was cancelled
                }
                
                cancellationToken?.throwIfCancelled();

                const start = i * this.batchSize;
                const end = Math.min((i + 1) * this.batchSize, courses.length);
                const batch = courses.slice(start, end);
                
                renderFunction(batch, false, i === totalBatches - 1);
                
                // Call batch callback
                this.options.onBatch?.(i + 1, totalBatches, courses.length);
            }

            this.completeRender(courses.length);
            
            // End performance tracking
            if (operationId) {
                this.performanceMetrics?.endOperation(operationId, {
                    completed: true,
                    cancelled: false
                });
            }
            
        } catch (error) {
            if (error instanceof CancellationError) {
                // Clean cancellation, not an error
                this.isRendering = false;
                this.currentRenderToken = null;
                
                // Track cancellation
                if (operationId) {
                    this.performanceMetrics?.endOperation(operationId, {
                        completed: false,
                        cancelled: true
                    });
                }
                return;
            }
            console.error('Progressive rendering error:', error);
            this.isRendering = false;
            this.currentRenderToken = null;
            
            // Track error
            if (operationId) {
                this.performanceMetrics?.endOperation(operationId, {
                    completed: false,
                    cancelled: false,
                    error: error.message
                });
            }
        }
    }

    // Specialized method for course list rendering
    async renderCourseList(
        courses: Course[], 
        courseSelectionService: any, 
        container: HTMLElement,
        elementToCourseMap: WeakMap<HTMLElement, Course>,
        cancellationToken?: CancellationToken,
        isLoadMore: boolean = false
    ): Promise<void> {
        let allHtml = '';
        let renderedCourses: Course[] = [];

        const renderFunction = (batchCourses: Course[], isFirstBatch: boolean, isComplete: boolean) => {
            if (isFirstBatch && !isLoadMore) {
                // Clear container and start fresh (only for initial load)
                container.innerHTML = '<div class="course-list"></div>';
                allHtml = '';
                renderedCourses = [];
            } else if (isFirstBatch && isLoadMore) {
                // Find existing course list for append
                allHtml = '';
                renderedCourses = [];
            }

            // Build HTML for this batch
            const batchHtml = batchCourses.map(course => {
                const isSelected = courseSelectionService.isCourseSelected(course);
                const hasWarning = this.courseHasWarning(course);
                
                return `
                    <div class="course-item ${isSelected ? 'selected' : ''}" data-course-id="${course.id}">
                        <div class="course-header">
                            <button class="course-select-btn ${isSelected ? 'selected' : ''}" title="${isSelected ? 'Remove from selection' : 'Add to selection'}">
                                ${isSelected ? '✓' : '+'}
                            </button>
                            <div class="course-code">${course.department.abbreviation}${course.number}</div>
                            <div class="course-details">
                                <div class="course-name">
                                    ${course.name}
                                    ${hasWarning ? '<span class="warning-icon">⚠</span>' : ''}
                                </div>
                                <div class="course-sections">
                                    ${course.sections.map(section => {
                                        const isFull = section.seatsAvailable <= 0;
                                        return `<span class="section-badge ${isFull ? 'full' : ''}" data-section="${section.number}">${section.number}</span>`;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            allHtml += batchHtml;
            renderedCourses.push(...batchCourses);

            // Update DOM
            const courseListContainer = container.querySelector('.course-list');
            if (courseListContainer) {
                if (isLoadMore) {
                    // Remove load more button before appending
                    const loadMoreContainer = container.querySelector('.load-more-container');
                    if (loadMoreContainer) {
                        loadMoreContainer.remove();
                    }
                    courseListContainer.insertAdjacentHTML('beforeend', batchHtml);
                    
                    // Map only the newly added elements
                    const allElements = courseListContainer.querySelectorAll('.course-item');
                    const startIndex = allElements.length - batchCourses.length;
                    for (let i = 0; i < batchCourses.length; i++) {
                        const element = allElements[startIndex + i];
                        if (element) {
                            elementToCourseMap.set(element as HTMLElement, batchCourses[i]);
                        }
                    }
                } else {
                    // Replace content completely
                    courseListContainer.innerHTML = allHtml;
                    
                    // Update course mapping for all rendered elements
                    const courseElements = courseListContainer.querySelectorAll('.course-item');
                    courseElements.forEach((element, index) => {
                        if (index < renderedCourses.length) {
                            elementToCourseMap.set(element as HTMLElement, renderedCourses[index]);
                        }
                    });
                }
            }

            // Add loading indicator if not complete
            if (!isComplete && courseListContainer) {
                const loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'loading-indicator';
                loadingIndicator.innerHTML = `
                    <div class="loading-spinner"></div>
                    <span>Loading more courses... (${renderedCourses.length} of ${courses.length})</span>
                `;
                courseListContainer.appendChild(loadingIndicator);
            }
        };

        await this.renderCoursesBatched(courses, renderFunction, container, cancellationToken);
    }

    // Specialized method for course grid rendering
    async renderCourseGrid(
        courses: Course[], 
        courseSelectionService: any, 
        container: HTMLElement,
        elementToCourseMap: WeakMap<HTMLElement, Course>,
        cancellationToken?: CancellationToken,
        isLoadMore: boolean = false
    ): Promise<void> {
        let allHtml = '';
        let renderedCourses: Course[] = [];

        const renderFunction = (batchCourses: Course[], isFirstBatch: boolean, isComplete: boolean) => {
            if (isFirstBatch && !isLoadMore) {
                // Clear container and start fresh (only for initial load)
                container.innerHTML = '<div class="course-grid"></div>';
                allHtml = '';
                renderedCourses = [];
            } else if (isFirstBatch && isLoadMore) {
                // Find existing course grid for append
                allHtml = '';
                renderedCourses = [];
            }

            const batchHtml = batchCourses.map(course => {
                const isSelected = courseSelectionService.isCourseSelected(course);
                const hasWarning = this.courseHasWarning(course);
                const credits = course.minCredits === course.maxCredits ? course.minCredits : `${course.minCredits}-${course.maxCredits}`;
                
                return `
                    <div class="course-card ${isSelected ? 'selected' : ''}" data-course-id="${course.id}">
                        <div class="course-card-header">
                            <div class="course-code">${course.department.abbreviation}${course.number}</div>
                            <button class="course-select-btn ${isSelected ? 'selected' : ''}" title="${isSelected ? 'Remove from selection' : 'Add to selection'}">
                                ${isSelected ? '✓' : '+'}
                            </button>
                        </div>
                        <div class="course-title">
                            ${course.name}
                            ${hasWarning ? '<span class="warning-icon">⚠</span>' : ''}
                        </div>
                        <div class="course-info">
                            <span class="course-credits">${credits} credits</span>
                            <span class="course-sections-count">${course.sections.length} section${course.sections.length !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                `;
            }).join('');

            allHtml += batchHtml;
            renderedCourses.push(...batchCourses);

            const courseGridContainer = container.querySelector('.course-grid');
            if (courseGridContainer) {
                if (isLoadMore) {
                    // Remove load more button before appending
                    const loadMoreContainer = container.querySelector('.load-more-container');
                    if (loadMoreContainer) {
                        loadMoreContainer.remove();
                    }
                    courseGridContainer.insertAdjacentHTML('beforeend', batchHtml);
                    
                    // Map only the newly added elements
                    const allElements = courseGridContainer.querySelectorAll('.course-card');
                    const startIndex = allElements.length - batchCourses.length;
                    for (let i = 0; i < batchCourses.length; i++) {
                        const element = allElements[startIndex + i];
                        if (element) {
                            elementToCourseMap.set(element as HTMLElement, batchCourses[i]);
                        }
                    }
                } else {
                    // Replace content completely
                    courseGridContainer.innerHTML = allHtml;
                    
                    // Update course mapping for all elements
                    const courseElements = courseGridContainer.querySelectorAll('.course-card');
                    courseElements.forEach((element, index) => {
                        if (index < renderedCourses.length) {
                            elementToCourseMap.set(element as HTMLElement, renderedCourses[index]);
                        }
                    });
                }
            }

            // Add loading indicator if not complete
            if (!isComplete && courseGridContainer) {
                const loadingIndicator = document.createElement('div');
                loadingIndicator.className = 'loading-indicator grid-loading';
                loadingIndicator.innerHTML = `
                    <div class="loading-spinner"></div>
                    <span>Loading more courses... (${renderedCourses.length} of ${courses.length})</span>
                `;
                courseGridContainer.appendChild(loadingIndicator);
            }
        };

        await this.renderCoursesBatched(courses, renderFunction, container, cancellationToken);
    }

    cancelCurrentRender(): void {
        if (this.currentRenderToken !== null) {
            this.currentRenderToken = null;
            this.isRendering = false;
        }
    }

    isCurrentlyRendering(): boolean {
        return this.isRendering;
    }

    setBatchSize(size: number): void {
        this.batchSize = Math.max(1, Math.min(100, size)); // Clamp between 1-100
    }
    
    getBatchSize(): number {
        return this.batchSize;
    }

    setBatchDelay(delay: number): void {
        this.batchDelay = Math.max(0, Math.min(100, delay)); // Clamp between 0-100ms
    }

    private wait(ms: number, cancellationToken?: CancellationToken): Promise<void> {
        return new Promise((resolve, reject) => {
            if (cancellationToken?.isCancelled) {
                reject(new CancellationError(cancellationToken.reason));
                return;
            }
            
            const timeoutId = setTimeout(() => {
                if (cancellationToken?.isCancelled) {
                    reject(new CancellationError(cancellationToken.reason));
                } else {
                    resolve();
                }
            }, ms);
            
            // Clean up timeout if cancelled
            if (cancellationToken?.isCancelled) {
                clearTimeout(timeoutId);
                reject(new CancellationError(cancellationToken.reason));
            }
        });
    }

    private courseHasWarning(course: Course): boolean {
        return course.sections.every(section => section.seatsAvailable <= 0);
    }

    private completeRender(totalRendered: number): void {
        const totalTime = performance.now() - this.renderStartTime;
        this.isRendering = false;
        this.currentRenderToken = null;
        this.options.onComplete?.(totalRendered, totalTime);
    }
}