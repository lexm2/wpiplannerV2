export class ModalQueue {
    private items: Array<(queue: ModalQueue) => void> = [];
    private index: number = -1;

    add(fn: (queue: ModalQueue) => void): this {
        this.items.push(fn);
        return this;
    }

    start(): void {
        this.index = -1;
        this.next();
    }

    next(): void {
        this.index++;
        this.items[this.index]?.(this);
    }
}
