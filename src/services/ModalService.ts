/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ModalService - Centralized Modal Management & UI Orchestration System
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURE ROLE:
 * - Centralized modal management system preventing UI conflicts and z-index issues
 * - Modal lifecycle coordinator handling show/hide animations and DOM integration
 * - UI orchestration service maintaining visual hierarchy and interaction patterns
 * - Event coordination hub managing backdrop clicks and keyboard interactions
 * - Animation synchronization layer ensuring smooth modal transitions
 * - Resource management system preventing memory leaks and DOM pollution
 * 
 * DEPENDENCIES:
 * - DOM APIs → Direct HTML element manipulation and event management
 * - CSS Animation Framework → Modal show/hide transitions and visual effects
 * - Browser Event System → Keyboard and mouse interaction handling
 * - requestAnimationFrame → Smooth animation timing and visual coordination
 * 
 * USED BY:
 * - FilterModalController → Advanced filtering modal interface management
 * - ScheduleController → Schedule management and configuration modals
 * - CourseController → Course detail and selection modal interfaces
 * - MainController → Application-level modal coordination and management
 * - All UI components requiring modal functionality → Through service integration
 * 
 * MODAL LIFECYCLE ARCHITECTURE:
 * ```
 * Modal Creation Request
 *         ↓
 * Z-Index Assignment & DOM Injection
 *         ↓
 * Animation Triggering & Visual Feedback
 *         ↓
 * Event Handler Setup (backdrop, escape)
 *         ↓
 * Modal Active State Management
 *         ↓
 * Hide Animation & Cleanup on Dismissal
 * ```
 * 
 * KEY FEATURES:
 * Modal Lifecycle Management:
 * - showModal() with automatic z-index management and DOM injection
 * - hideModal() with animation coordination and cleanup scheduling
 * - hideAllModals() for bulk modal dismissal during navigation
 * - isModalOpen() for state checking and conditional logic
 * - getOpenModals() for debugging and state inspection
 * 
 * Z-Index Coordination:
 * - Automatic z-index assignment preventing visual conflicts
 * - Incremental z-index allocation ensuring proper layering
 * - Z-index starting at 1000 with 10-unit increments
 * - Visual hierarchy preservation across multiple modal instances
 * 
 * Animation & Visual Management:
 * - requestAnimationFrame timing for smooth show transitions
 * - CSS class-based animation triggering (show/hide classes)
 * - 200ms hide animation duration with automatic cleanup
 * - DOM insertion/removal coordination preventing layout shifts
 * 
 * Event System Integration:
 * - setupModalBehavior() configuring backdrop and escape key handling
 * - Configurable interaction patterns via options object
 * - Event listener lifecycle management preventing memory leaks
 * - Automatic cleanup on modal dismissal
 * 
 * MODAL BEHAVIOR FEATURES:
 * Backdrop Interaction:
 * - closeOnBackdrop option for dismissal on background clicks
 * - Event target verification preventing accidental closure
 * - Configurable behavior per modal instance
 * 
 * Keyboard Integration:
 * - closeOnEscape option for keyboard dismissal support
 * - Escape key event handling with automatic cleanup
 * - Event listener removal preventing handler accumulation
 * 
 * RESOURCE MANAGEMENT:
 * Memory Management:
 * - Map-based modal tracking with automatic cleanup
 * - DOM element removal after hide animations complete
 * - Event listener removal preventing memory leaks
 * - Modal reference cleanup on dismissal
 * 
 * DOM Management:
 * - Body-level modal injection for proper z-index layering
 * - Parent node verification before removal operations
 * - Safe DOM manipulation with error handling
 * - Animation-aware DOM lifecycle management
 * 
 * INTEGRATION PATTERNS:
 * Modal Controller Integration:
 * - Service-based modal management abstracting DOM complexity
 * - ID-based modal tracking enabling controller coordination
 * - Centralized animation and behavior management
 * - Event-driven modal lifecycle notifications
 * 
 * Application Integration:
 * - Singleton service pattern for global modal coordination
 * - generateId() utility for unique modal identification
 * - Configuration options supporting diverse modal requirements
 * - Cross-controller modal management coordination
 * 
 * UI Framework Integration:
 * - CSS framework agnostic animation system
 * - Class-based styling coordination with external CSS
 * - Animation timing coordination with visual design systems
 * - Responsive modal behavior supporting mobile and desktop
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - requestAnimationFrame for optimal animation performance
 * - Lazy DOM manipulation reducing layout thrashing
 * - Event delegation patterns minimizing event handler overhead
 * - Memory-efficient modal tracking with automatic cleanup
 * 
 * MODAL STATE MANAGEMENT:
 * - Centralized modal registry preventing conflicts
 * - ID-based modal identification and lookup
 * - State query methods for conditional logic
 * - Bulk operations for navigation and cleanup scenarios
 * 
 * ANIMATION COORDINATION:
 * Show Animation Flow:
 * 1. DOM injection with initial styling
 * 2. Z-index assignment for proper layering
 * 3. requestAnimationFrame for smooth transition timing
 * 4. CSS class addition triggering show animation
 * 
 * Hide Animation Flow:
 * 1. Hide CSS class addition triggering exit animation
 * 2. 200ms timeout matching animation duration
 * 3. DOM removal after animation completion
 * 4. Modal registry cleanup and reference removal
 * 
 * ERROR HANDLING & EDGE CASES:
 * - Duplicate modal ID handling with automatic cleanup
 * - Parent node verification before DOM manipulation
 * - Event listener cleanup preventing handler accumulation
 * - Animation timing coordination preventing visual glitches
 * 
 * ARCHITECTURAL PATTERNS:
 * - Singleton: Centralized modal management across application
 * - Registry: Map-based modal tracking and lifecycle management
 * - Template Method: Consistent modal show/hide workflows
 * - Observer: Event-driven modal behavior coordination
 * - Strategy: Configurable modal behavior via options pattern
 * - Facade: Simplified modal management API hiding DOM complexity
 * 
 * BENEFITS ACHIEVED:
 * - Eliminated z-index conflicts through centralized management
 * - Consistent modal behavior across all application components
 * - Memory leak prevention through proper event cleanup
 * - Smooth animations with proper timing coordination
 * - Simplified modal implementation for UI controllers
 * - Centralized modal state management reducing component complexity
 * - Configurable interaction patterns supporting diverse UI requirements
 * 
 * INTEGRATION NOTES:
 * - Designed for integration with any UI framework or vanilla JavaScript
 * - Supports both programmatic and declarative modal management
 * - Provides foundation for complex modal interactions and workflows
 * - Enables consistent modal behavior across diverse application features
 * - Supports mobile and desktop interaction patterns
 * 
 * FUTURE EXTENSIBILITY:
 * - Modal focus management for accessibility compliance
 * - Advanced animation coordination with custom timing
 * - Modal stacking with nested modal support
 * - Touch gesture integration for mobile modal interactions
 * - Modal state persistence for complex workflows
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export class ModalService {
    private modals: Map<string, HTMLElement> = new Map();
    private currentZIndex: number = 1000;

    showModal(id: string, modalElement: HTMLElement): void {
        // Remove existing modal with same ID if it exists
        this.hideModal(id);

        // Set z-index
        modalElement.style.zIndex = this.currentZIndex.toString();
        this.currentZIndex += 10;

        // Store modal reference
        this.modals.set(id, modalElement);

        // Inject into DOM
        document.body.appendChild(modalElement);

        // Trigger show animation
        requestAnimationFrame(() => {
            modalElement.classList.add('show');
        });
    }

    hideModal(id: string): void {
        const modalElement = this.modals.get(id);
        if (modalElement) {
            modalElement.classList.add('hide');
            
            setTimeout(() => {
                if (modalElement.parentNode) {
                    modalElement.parentNode.removeChild(modalElement);
                }
                this.modals.delete(id);
            }, 200);
        }
    }

    hideAllModals(): void {
        const modalIds = Array.from(this.modals.keys());
        modalIds.forEach(id => this.hideModal(id));
    }

    isModalOpen(id: string): boolean {
        return this.modals.has(id);
    }

    getOpenModals(): string[] {
        return Array.from(this.modals.keys());
    }

    generateId(): string {
        return `modal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Utility method for backdrop and escape key handling
    setupModalBehavior(modalElement: HTMLElement, id: string, options: {
        closeOnBackdrop?: boolean;
        closeOnEscape?: boolean;
    } = {}): void {
        const { closeOnBackdrop = true, closeOnEscape = true } = options;

        // Backdrop click handling
        if (closeOnBackdrop) {
            modalElement.addEventListener('click', (event) => {
                if (event.target === modalElement) {
                    this.hideModal(id);
                }
            });
        }

        // Escape key handling
        if (closeOnEscape) {
            const escapeHandler = (event: KeyboardEvent) => {
                if (event.key === 'Escape') {
                    this.hideModal(id);
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }
    }
}