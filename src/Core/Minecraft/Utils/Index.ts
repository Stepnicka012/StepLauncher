export interface TaskItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}
export function createTaskLimiter<T = unknown>(limit: number = 5) {
  let running = 0;
  const queue: TaskItem<T>[] = [];

  const runNext = () => {
    if (running >= limit || queue.length === 0) return;

    const { fn, resolve, reject } = queue.shift()!;
    running++;
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        running--;
        runNext();
      });
  };

  return function limitTask(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      process.nextTick(runNext);
    });
  };
}

export class TaskLimiter {
  private concurrency: number;
  private running: number = 0;
  private queue: Array<() => void> = [];
  constructor(concurrency: number) {
    if (concurrency < 1) {
      throw new Error('La concurrencia debe ser al menos 1');
    }
    this.concurrency = concurrency;
  }

  public limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = () => {
        this.running++;
        Promise.resolve(fn())
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.running--;
            this.dequeue();
          });
      };
      if (this.running < this.concurrency) {
        task();
      } else {
        this.queue.push(task);
      }
    });
  }

  private dequeue(): void {
    if (this.queue.length > 0 && this.running < this.concurrency) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
