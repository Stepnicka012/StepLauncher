export interface GrabScrollOptions {
    axis?: 'both' | 'x' | 'y';
    threshold?: number;
    invert?: boolean;
    speed?: number;
    dragClass?: string;
    autoCursor?: boolean;
    onGrabStart?: (element: HTMLElement, event: MouseEvent | TouchEvent) => void;
    onGrabMove?: (element: HTMLElement, deltaX: number, deltaY: number, event: MouseEvent | TouchEvent) => void;
    onGrabEnd?: (element: HTMLElement, event: MouseEvent | TouchEvent) => void;
}

interface ScrollGrabState {
    element: HTMLElement;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    threshold: number;
    axis: 'both' | 'x' | 'y';
    invert: boolean;
    speed: number;
    dragClass?: string;
    autoCursor: boolean;
    originalCursor?: string;
    isGrabbing: boolean;
    hasMovedBeyondThreshold: boolean;
    startPointerId?: number;
    onGrabStart?: GrabScrollOptions['onGrabStart'];
    onGrabMove?: GrabScrollOptions['onGrabMove'];
    onGrabEnd?: GrabScrollOptions['onGrabEnd'];
}

function isInteractiveElement(target: HTMLElement, scrollableElement: HTMLElement): boolean {
    let el: HTMLElement | null = target;
    while (el && el !== scrollableElement) {
        const tagName = el.tagName.toLowerCase();
        if (tagName === 'select' || tagName === 'input' || tagName === 'textarea' ||
            tagName === 'button' || tagName === 'a' || tagName === 'label' || tagName === 'canvas' ) {
            return true;
        }
        if (el.getAttribute('contenteditable') === 'true' ||
            el.getAttribute('role') === 'textbox' ||
            el.getAttribute('role') === 'button') {
            return true;
        }
        el = el.parentElement;
    }
    return false;
}

function enableGrabScrollOnElement(element: HTMLElement, options: GrabScrollOptions = {}): () => void {
    const {
        axis = 'both',
        threshold = 5,
        invert = false,
        speed = 1,
        dragClass = '',
        autoCursor = true,
        onGrabStart,
        onGrabMove,
        onGrabEnd,
    } = options;
    
    let state: ScrollGrabState | null = null;
    
    if (autoCursor) {
        const originalCursor = window.getComputedStyle(element).cursor;
        element.style.cursor = 'grab';
        element.dataset.originalCursor = originalCursor;
    }
    
    function onPointerDown(e: MouseEvent | TouchEvent) {
        if (state) return;
    
        let targetEl: HTMLElement | null = null;
        if (e instanceof MouseEvent) {
            targetEl = e.target as HTMLElement;
        } else {
            const touch = e.touches[0];
            if (!touch) return;
            targetEl = touch.target as HTMLElement;
        }
        
        if (targetEl && isInteractiveElement(targetEl, element)) {
            return;
        }
        
        if (e instanceof MouseEvent && e.button !== 0) return;
        
        let clientX: number, clientY: number, pointerId: number | undefined;
        if (e instanceof MouseEvent) {
            clientX = e.clientX;
            clientY = e.clientY;
            pointerId = undefined;
        } else {
            const touch = e.touches[0];
            if (!touch) return;
            clientX = touch.clientX;
            clientY = touch.clientY;
            pointerId = touch.identifier;
        }
        
        state = {
            element,
            startX: clientX,
            startY: clientY,
            startScrollLeft: element.scrollLeft,
            startScrollTop: element.scrollTop,
            threshold,
            axis,
            invert,
            speed,
            dragClass,
            autoCursor,
            isGrabbing: false,
            hasMovedBeyondThreshold: false,
            startPointerId: pointerId,
            onGrabStart,
            onGrabMove,
            onGrabEnd,
        };
        
        if (autoCursor) element.style.cursor = 'grabbing';
        if (dragClass) element.classList.add(dragClass);
        
        window.addEventListener('mousemove', onGlobalMove);
        window.addEventListener('mouseup', onGlobalUp);
        window.addEventListener('touchmove', onGlobalMove, { passive: false });
        window.addEventListener('touchend', onGlobalUp);
        window.addEventListener('touchcancel', onGlobalUp);
    }
    
    function onGlobalMove(e: MouseEvent | TouchEvent) {
        if (!state) return;
        
        let currentX: number, currentY: number, pointerMatch: boolean;
        if (e instanceof MouseEvent) {
            currentX = e.clientX;
            currentY = e.clientY;
            pointerMatch = state.startPointerId === undefined;
        } else {
            const touch = Array.from(e.changedTouches).find(t => t.identifier === state!.startPointerId);
            if (!touch) return;
            currentX = touch.clientX;
            currentY = touch.clientY;
            pointerMatch = true;
        }
        if (!pointerMatch) return;
        
        const deltaX = (currentX - state.startX) * state.speed;
        const deltaY = (currentY - state.startY) * state.speed;
        const distance = Math.hypot(deltaX, deltaY);
        
        if (!state.hasMovedBeyondThreshold && distance >= state.threshold) {
            state.hasMovedBeyondThreshold = true;
            state.isGrabbing = true;
            if (state.onGrabStart) state.onGrabStart(state.element, e);
        }
        
        if (state.isGrabbing) {
            e.preventDefault();
            let scrollDeltaX = state.invert ? deltaX : -deltaX;
            let scrollDeltaY = state.invert ? deltaY : -deltaY;
            if (state.axis === 'x') scrollDeltaY = 0;
            if (state.axis === 'y') scrollDeltaX = 0;
            
            let newScrollLeft = state.startScrollLeft + scrollDeltaX;
            let newScrollTop = state.startScrollTop + scrollDeltaY;
            newScrollLeft = Math.max(0, Math.min(state.element.scrollWidth - state.element.clientWidth, newScrollLeft));
            newScrollTop = Math.max(0, Math.min(state.element.scrollHeight - state.element.clientHeight, newScrollTop));
            
            state.element.scrollLeft = newScrollLeft;
            state.element.scrollTop = newScrollTop;
            
            if (state.onGrabMove) state.onGrabMove(state.element, deltaX, deltaY, e);
        }
    }
    
    function onGlobalUp(e: MouseEvent | TouchEvent) {
        if (!state) return;
        let isValidEnd = false;
        if (e instanceof MouseEvent) {
            isValidEnd = state.startPointerId === undefined;
        } else {
            const changed = Array.from(e.changedTouches);
            isValidEnd = changed.some(t => t.identifier === state!.startPointerId);
        }
        if (!isValidEnd) return;
        
        if (state.isGrabbing && state.onGrabEnd) state.onGrabEnd(state.element, e);
        if (autoCursor) element.style.cursor = 'grab';
        if (state.dragClass) element.classList.remove(state.dragClass);
        
        window.removeEventListener('mousemove', onGlobalMove);
        window.removeEventListener('mouseup', onGlobalUp);
        window.removeEventListener('touchmove', onGlobalMove);
        window.removeEventListener('touchend', onGlobalUp);
        window.removeEventListener('touchcancel', onGlobalUp);
        state = null;
    }
    
    element.addEventListener('mousedown', onPointerDown);
    element.addEventListener('touchstart', onPointerDown, { passive: false });
    
    return () => {
        element.removeEventListener('mousedown', onPointerDown);
        element.removeEventListener('touchstart', onPointerDown);
        if (state) {
            window.removeEventListener('mousemove', onGlobalMove);
            window.removeEventListener('mouseup', onGlobalUp);
            window.removeEventListener('touchmove', onGlobalMove);
            window.removeEventListener('touchend', onGlobalUp);
            window.removeEventListener('touchcancel', onGlobalUp);
            if (autoCursor) {
                const orig = element.dataset.originalCursor || '';
                element.style.cursor = orig;
            }
            if (state.dragClass) element.classList.remove(state.dragClass);
            state = null;
        }
    };
}

export function addGrabScroll(target: string | HTMLElement | NodeListOf<Element>, options?: GrabScrollOptions): (() => void) | (() => void)[] {
    let elements: HTMLElement[] = [];
    
    if (typeof target === 'string') {
        const nodeList = document.querySelectorAll<HTMLElement>(target);
        if (nodeList.length === 0) throw new Error(`No se encontraron elementos: ${target}`);
        elements = Array.from(nodeList);
    } else if (target instanceof HTMLElement) {
        elements = [target];
    } else if (target instanceof NodeList) {
        elements = Array.from(target) as HTMLElement[];
    } else {
        throw new Error('Target debe ser selector string, HTMLElement o NodeList');
    }
    
    const cleanups = elements.map(el => enableGrabScrollOnElement(el, options));
    return cleanups.length === 1 ? cleanups[0]! : cleanups;
}