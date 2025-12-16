export class VisibilityObserver {
    private observer: IntersectionObserver;
    private hiddenClass: string = 'unvisible';

    constructor() {
        this.observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
            this.handleIntersection(entry);
            });
        },
        {
            root: null,
            rootMargin: '0px',
            threshold: 0.001
        }
        );
    }

    private handleIntersection(entry: IntersectionObserverEntry): void {
        const element = entry.target;
        
        if (entry.isIntersecting) {
            element.classList.remove(this.hiddenClass);
        } else {
            element.classList.add(this.hiddenClass);
        }
    }

    observeElement(element: Element): void {
        this.observer.observe(element);
    }

    observeElements(elements: Element[]): void {
        elements.forEach(element => {
            this.observeElement(element);
        });
    }

    unobserveElement(element: Element): void {
        this.observer.unobserve(element);
    }

    disconnect(): void {
        this.observer.disconnect();
    }

    setHiddenClass(className: string): void {
        this.hiddenClass = className;
    }
}