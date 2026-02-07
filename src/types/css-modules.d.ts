/**
 * TypeScript declarations for CSS Modules
 *
 * This enables type safety and autocomplete for CSS Module imports.
 * All .module.css files will be typed with this declaration.
 *
 * Usage:
 * import styles from './Component.module.css';
 * Autocompete for statments like:
 * element.className = styles.myClass;
 * 
 */

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
