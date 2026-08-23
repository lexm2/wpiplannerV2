type PriorityQueueItem<T> = {
  item: T;
  priority: number;
};

export class FilterPriorityQueue<T> {
  private heap: PriorityQueueItem<T>[] = [];

  insert(item: T, priority: number): void {
    this.heap.push({ item, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  extractMin(): T | null {
    if (this.heap.length === 0) return null;

    const lastItem = this.heap.pop();
    if (!lastItem) return null;
    if (this.heap.length === 0) return lastItem.item;

    const min = this.heap[0].item;
    this.heap[0] = lastItem;
    this.bubbleDown(0);
    return min;
  }

  peek(): T | null {
    return this.heap.length > 0 ? this.heap[0].item : null;
  }

  size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  clear(): void {
    this.heap = [];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].priority >= this.heap[parentIndex].priority) break;

      [this.heap[index], this.heap[parentIndex]] = [
        this.heap[parentIndex],
        this.heap[index],
      ];
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this.heap[leftChild].priority < this.heap[smallest].priority
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.heap[rightChild].priority < this.heap[smallest].priority
      ) {
        smallest = rightChild;
      }

      if (smallest === index) break;

      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index],
      ];
      index = smallest;
    }
  }
}
