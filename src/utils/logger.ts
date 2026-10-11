class Logger {
  private isDev: boolean;

  constructor() {
    this.isDev = import.meta.env.DEV;
  }

  log(...args: unknown[]): void {
    if (this.isDev) {
      console.log(...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.isDev) {
      console.warn(...args);
    }
  }

  error(...args: unknown[]): void {
    console.error(...args);
  }
}

export const logger = new Logger();
