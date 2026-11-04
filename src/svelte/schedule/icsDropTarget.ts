import type { Action } from 'svelte/action';

interface IcsDropOptions {
  /** True while a drag carrying files is over the node. */
  onActiveChange: (active: boolean) => void;
  /** The calendar file dropped on the node (see pickCalendarFile). */
  onFile: (file: File) => void;
}

function carriesFiles(e: DragEvent): boolean {
  return !!e.dataTransfer?.types.includes('Files');
}

/**
 * The file to import from a drop: the first .ics (or text/calendar) one, else
 * the first file, which the import then explains is not a calendar.
 */
function pickCalendarFile(
  files: FileList | readonly File[] | null | undefined,
): File | undefined {
  const list = Array.from(files ?? []);
  return (
    list.find(f => /\.ics$/i.test(f.name) || /^text\/calendar/i.test(f.type)) ??
    list[0]
  );
}

// Every node currently accepting drops. The window guard below leaves these
// alone and tells the browser a drop anywhere else does nothing.
const targets = new Set<HTMLElement>();
let guardsInstalled = 0;

function overATarget(e: DragEvent): boolean {
  const el = e.target;
  return el instanceof Node && [...targets].some(n => n.contains(el));
}

function guardDragOver(e: DragEvent): void {
  if (!carriesFiles(e)) return;
  const target = e.target;
  if (target instanceof HTMLInputElement && target.type === 'file') return;
  // Without this the browser navigates to (or downloads) a file dropped
  // outside a target; the cursor must not promise a drop that does nothing.
  e.preventDefault();
  if (!overATarget(e) && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
}

function guardDrop(e: DragEvent): void {
  if (!carriesFiles(e)) return;
  const target = e.target;
  if (target instanceof HTMLInputElement && target.type === 'file') return;
  e.preventDefault();
}

function installGuards(): void {
  if (guardsInstalled++ > 0) return;
  window.addEventListener('dragover', guardDragOver);
  window.addEventListener('drop', guardDrop);
}

function removeGuards(): void {
  if (--guardsInstalled > 0) return;
  window.removeEventListener('dragover', guardDragOver);
  window.removeEventListener('drop', guardDrop);
}

/**
 * Lets a calendar file be dropped on the node (pass no options to leave it
 * inert). Also stops the browser from opening a file dropped anywhere else in
 * the window (Firefox would navigate to it and unload the app), except onto a
 * file input, which takes it itself, and shows a "not allowed" cursor there.
 */
export const icsDropTarget: Action<HTMLElement, IcsDropOptions | undefined> = (
  node,
  options,
) => {
  let opts = options;
  // dragenter/dragleave fire for every child crossed, so count them.
  let depth = 0;

  const setActive = (active: boolean): void => opts?.onActiveChange(active);

  const onEnter = (e: DragEvent): void => {
    if (!opts || !carriesFiles(e)) return;
    e.preventDefault();
    depth++;
    setActive(true);
  };
  const onOver = (e: DragEvent): void => {
    if (!opts || !carriesFiles(e)) return;
    // Without this the drop event never fires.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onLeave = (e: DragEvent): void => {
    if (!opts || !carriesFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) setActive(false);
  };
  const onDrop = (e: DragEvent): void => {
    if (!opts || !carriesFiles(e)) return;
    e.preventDefault();
    // A modal over the grids is a target of its own: one drop, one import.
    e.stopPropagation();
    depth = 0;
    setActive(false);
    const file = pickCalendarFile(e.dataTransfer?.files);
    if (file) opts.onFile(file);
  };

  const register = (): void => {
    if (opts) targets.add(node);
    else targets.delete(node);
  };
  register();
  installGuards();

  node.addEventListener('dragenter', onEnter);
  node.addEventListener('dragover', onOver);
  node.addEventListener('dragleave', onLeave);
  node.addEventListener('drop', onDrop);

  return {
    update(next) {
      if (opts && !next) {
        depth = 0;
        setActive(false);
      }
      opts = next;
      register();
    },
    destroy() {
      node.removeEventListener('dragenter', onEnter);
      node.removeEventListener('dragover', onOver);
      node.removeEventListener('dragleave', onLeave);
      node.removeEventListener('drop', onDrop);
      targets.delete(node);
      removeGuards();
    },
  };
};
