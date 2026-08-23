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

  debug(...args: unknown[]): void {
    if (this.isDev) {
      console.debug(...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.isDev) {
      console.info(...args);
    }
  }
}

export const logger = new Logger();
