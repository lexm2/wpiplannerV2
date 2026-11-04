import type { Action } from 'svelte/action';

interface IcsDropOptions {
  /** True while a drag carrying files is over the node. */
  onActiveChange: (active: boolean) => void;
  /** The first file dropped on the node. */
  onFile: (file: File) => void;
}

function carriesFiles(e: DragEvent): boolean {
  return !!e.dataTransfer?.types.includes('Files');
}

/**
 * Lets a calendar file be dropped on the node. Also stops the browser from
 * opening a file dropped anywhere else in the window (Firefox would navigate
 * to it and unload the app), except onto a file input, which takes it itself.
 */
export const icsDropTarget: Action<HTMLElement, IcsDropOptions> = (
  node,
  options,
) => {
  let opts = options;
  // dragenter/dragleave fire for every child crossed, so count them.
  let depth = 0;

  const setActive = (active: boolean): void => opts?.onActiveChange(active);

  const onEnter = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    depth++;
    setActive(true);
  };
  const onOver = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    // Without this the drop event never fires.
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onLeave = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) setActive(false);
  };
  const onDrop = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    depth = 0;
    setActive(false);
    const file = e.dataTransfer?.files[0];
    if (file) opts?.onFile(file);
  };

  const guard = (e: DragEvent): void => {
    if (!carriesFiles(e)) return;
    const target = e.target;
    if (target instanceof HTMLInputElement && target.type === 'file') return;
    e.preventDefault();
  };

  node.addEventListener('dragenter', onEnter);
  node.addEventListener('dragover', onOver);
  node.addEventListener('dragleave', onLeave);
  node.addEventListener('drop', onDrop);
  window.addEventListener('dragover', guard);
  window.addEventListener('drop', guard);

  return {
    update(next) {
      opts = next;
    },
    destroy() {
      node.removeEventListener('dragenter', onEnter);
      node.removeEventListener('dragover', onOver);
      node.removeEventListener('dragleave', onLeave);
      node.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    },
  };
};
