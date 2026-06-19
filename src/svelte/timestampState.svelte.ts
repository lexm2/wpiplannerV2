/**
 * Reactive home for the header's "client loaded" / "server updated" labels.
 *
 * Replaces TimestampManager's imperative `getElementById(...).textContent = ...`
 * writes into the Svelte-owned header: the manager now sets these runes and
 * App.svelte renders them, so no vanilla code reaches into the component tree.
 */
class TimestampState {
    clientLabel = $state('Loading client data...');
    serverLabel = $state('Loading server data...');
}

export const timestampState = new TimestampState();
