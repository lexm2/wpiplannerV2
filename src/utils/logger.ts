class Logger {
    private isDev: boolean;

    constructor() {
        this.isDev = import.meta.env.DEV;
    }

    log(...args: any[]): void {
        if (this.isDev) {
            console.log(...args);
        }
    }

    warn(...args: any[]): void {
        if (this.isDev) {
            console.warn(...args);
        }
    }

    error(...args: any[]): void {
        console.error(...args);
    }

    debug(...args: any[]): void {
        if (this.isDev) {
            console.debug(...args);
        }
    }

    info(...args: any[]): void {
        if (this.isDev) {
            console.info(...args);
        }
    }
}

export const logger = new Logger();
