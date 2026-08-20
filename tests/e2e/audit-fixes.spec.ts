import { test, expect } from '@playwright/test';

/**
 * Regression guards for the defects fixed from audits/2026-08-20-code-surface-audit.md.
 * Each of these bugs was invisible to tsc/svelte-check/unit tests, which is how
 * they survived; these assertions are the thing that keeps them fixed.
 */

test('right panel default width is 700px, not the old 320px', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        const panel = document.querySelector('.right-panel') as HTMLElement | null;
        return {
            spacingVar: cs.getPropertyValue('--spacing-right-panel-width').trim(),
            inlineOverride: document.documentElement.style.getPropertyValue('--spacing-right-panel-width'),
            panelWidth: panel ? Math.round(panel.getBoundingClientRect().width) : null,
        };
    });
    console.log('right-panel:', JSON.stringify(result));

    // ThemeManager must no longer write this as an inline custom property.
    expect(result.inlineOverride).toBe('');
    expect(result.spacingVar).toBe('700px');
    expect(result.panelWidth).toBe(700);
});

test('a stored drag width still wins over the default', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('wpi-planner-width-right-panel', '500');
    });
    await page.goto('/');
    await page.waitForTimeout(500);

    const w = await page.evaluate(() => {
        const panel = document.querySelector('.right-panel') as HTMLElement | null;
        return panel ? Math.round(panel.getBoundingClientRect().width) : null;
    });
    expect(w).toBe(500);
});

test('saved theme is applied at first paint, with no dark flash', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem(
            'wpi-planner-preferences',
            JSON.stringify({ theme: 'wpi-light', bookmarkedCourseIds: [] })
        );
    });

    // Sample the background colour as early as the document allows, then again
    // once settled: both must already be the light theme.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const early = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim()
    );
    await page.waitForTimeout(800);
    const settled = await page.evaluate(() => ({
        bg: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(),
        bodyClass: document.body.className,
    }));

    console.log('theme early:', early, '| settled:', JSON.stringify(settled));
    expect(early).toBe(settled.bg);          // never changed => no flash
    expect(settled.bodyClass).toContain('theme-wpi-light');
});

test('professor links carry an underline affordance on every background', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
    await page.waitForTimeout(2000);
    // Section badges (and their professor links) only render once a department
    // is selected and a course expanded.
    await page.locator('.department-item').first().click();
    await page.waitForTimeout(800);
    await page.locator('.course-item').first().click();
    await page.waitForTimeout(800);

    const info = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a.professor-link')) as HTMLElement[];
        return links.slice(0, 5).map((el) => {
            const cs = getComputedStyle(el);
            const badge = el.closest('.section-badge') as HTMLElement | null;
            return {
                decoration: cs.textDecorationLine,
                color: cs.color,
                inBadge: !!badge,
                badgeColor: badge ? getComputedStyle(badge).color : null,
            };
        });
    });
    console.log('professor links:', JSON.stringify(info, null, 2));

    expect(info.length).toBeGreaterThan(0);
    for (const l of info) {
        expect(l.decoration).toContain('underline');
        // color: inherit => identical to the badge's own colour, so a full
        // badge (primary background) can never render primary-on-primary.
        if (l.inBadge) expect(l.color).toBe(l.badgeColor);
    }
});

test('closing the wizard keeps selections intact for the fade-out', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(800);

    const result = await page.evaluate(async () => {
        // @ts-expect-error runtime dev-server URL, not a tsc-resolvable module path
        const mod: any = await import('/wpiplannerV2/src/svelte/wizardState.svelte.ts');
        const ws = mod.wizardState;
        ws.selections = { lecture: { crn: 'TEST123' }, discussion: null, lab: null };
        ws.close();
        return {
            isOpen: ws.isOpen,
            lectureAfterClose: ws.selections.lecture ? ws.selections.lecture.crn : null,
        };
    });
    console.log('wizard close:', JSON.stringify(result));

    expect(result.isOpen).toBe(false);              // config cleared => panel closes
    expect(result.lectureAfterClose).toBe('TEST123'); // selections survive the outro
});

test('tutorial box header is set up for pointer dragging', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    const info = await page.evaluate(async () => {
        const svc: any = (window as any).services;
        await svc.tutorial.start('welcome');
        await new Promise((r) => setTimeout(r, 400));
        const findBtn = document.querySelector('[data-tutorial-find]') as HTMLElement | null;
        const header = findBtn ? (findBtn.parentElement as HTMLElement) : null;
        if (!header) return { found: false };
        return {
            found: true,
            touchAction: getComputedStyle(header).touchAction,
            cursor: getComputedStyle(header).cursor,
        };
    });
    console.log('tutorial header:', JSON.stringify(info));

    expect(info.found).toBe(true);
    expect(info.touchAction).toBe('none'); // required or touch pans instead of dragging
});

test('tutorial box still drags (pointer events, mouse input)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.evaluate(async () => {
        await (window as any).services.tutorial.start('welcome');
    });
    await page.waitForTimeout(500);

    const before = await page.evaluate(() => {
        const btn = document.querySelector('[data-tutorial-find]') as HTMLElement;
        const box = btn.closest('div')!.parentElement as HTMLElement;
        const r = box.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top), hx: r.left + 30, hy: r.top + 10 };
    });

    await page.mouse.move(before.hx, before.hy);
    await page.mouse.down();
    await page.mouse.move(before.hx + 120, before.hy - 80, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => {
        const btn = document.querySelector('[data-tutorial-find]') as HTMLElement;
        const box = btn.closest('div')!.parentElement as HTMLElement;
        const r = box.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top) };
    });

    console.log('drag before:', JSON.stringify(before), 'after:', JSON.stringify(after));
    expect(after.left).toBeGreaterThan(before.left + 80);
    expect(after.top).toBeLessThan(before.top - 50);
});

test('theme persists across reload with no flash (ProfileStateManager-backed adapter)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1800);
    await page.evaluate(() => (window as any).services.themeManager.setTheme('wpi-light'));
    await page.waitForTimeout(600);

    const persisted = await page.evaluate(() => localStorage.getItem('wpi-planner-preferences'));
    expect(persisted).toContain('wpi-light');

    // Reload WITHOUT clearing storage; the saved theme must be live immediately.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const early = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim());
    await page.waitForTimeout(1800);
    const settled = await page.evaluate(() => ({
        bg: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(),
        id: (window as any).services.themeManager.getCurrentThemeId(),
    }));
    console.log('theme reload:', early, JSON.stringify(settled));

    expect(settled.id).toBe('wpi-light');
    expect(early).toBe(settled.bg);
});

test('schedule export/import round-trips after the ScheduleState trim', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
        const svc: any = (window as any).services;
        const sms = svc.scheduleManagementService;
        const id = sms.getActiveScheduleId();

        const exported = await sms.exportSchedule(id);
        if (!exported.success || !exported.data) return { stage: 'export', ok: false };

        const parsed = JSON.parse(exported.data);
        const back = await sms.importScheduleInto(id, exported.data);
        return {
            stage: 'done',
            ok: back.success === true,
            // ApplicationState.toMinimalFormat(): v=version, a=activeScheduleId,
            // s=schedules, p=preferences. Those four methods are exactly what the
            // trim kept, so this asserts the surviving surface still works.
            minimalFormat: Array.isArray(parsed.s) && typeof parsed.v !== 'undefined',
            keys: Object.keys(parsed).slice(0, 6),
        };
    });
    console.log('round-trip:', JSON.stringify(result));

    expect(result.stage).toBe('done');
    expect(result.ok).toBe(true);
    expect(result.minimalFormat).toBe(true);
});

test('a profile written before the key registry still reads back', async ({ page }) => {
    // Seed storage exactly as the OLD hand-typed literals would have written it.
    await page.addInitScript(() => {
        localStorage.setItem('wpi-planner-preferences', JSON.stringify({ theme: 'wpi-classic', bookmarkedCourseIds: [] }));
        localStorage.setItem('wpi_visited', 'true');
        localStorage.setItem('selectedCoursesExpanded', 'false');
    });
    await page.goto('/');
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => ({
        theme: (window as any).services.themeManager.getCurrentThemeId(),
        visited: localStorage.getItem('wpi_visited'),
        expanded: localStorage.getItem('selectedCoursesExpanded'),
        prefs: localStorage.getItem('wpi-planner-preferences'),
    }));
    console.log('CONTINUITY=' + JSON.stringify(state));

    expect(state.theme).toBe('wpi-classic');   // preferences key still resolves
    expect(state.visited).toBe('true');        // tutorial flag not reset
    expect(state.expanded).toBe('false');      // panel state preserved
    expect(state.prefs).toContain('wpi-classic');
});

test('themed confirm dialog replaces native confirm', async ({ page }) => {
    let nativeDialog = false;
    page.on('dialog', async d => { nativeDialog = true; await d.dismiss(); });
    await page.goto('/');
    await page.waitForTimeout(2000);

    await page.evaluate(async () => {
        // @ts-expect-error runtime dev-server URL, not a tsc-resolvable module path
        const m: any = await import('/wpiplannerV2/src/svelte/modals/modalState.svelte.ts');
        (window as any).__confirmed = null;
        m.showConfirm({
            title: 'Delete schedule', message: 'Are you sure?',
            confirmLabel: 'Delete', variant: 'danger',
            onConfirm: () => { (window as any).__confirmed = true; },
        });
    });
    await page.waitForTimeout(500);

    const dialog = page.locator('.modal-dialog:has-text("Delete schedule")');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.btn-danger')).toHaveText('Delete');

    await dialog.locator('.btn-danger').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as any).__confirmed)).toBe(true);
    expect(nativeDialog).toBe(false);
});

test('confirm dialog supports a text input (prompt replacement)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    await page.evaluate(async () => {
        // @ts-expect-error runtime dev-server URL, not a tsc-resolvable module path
        const m: any = await import('/wpiplannerV2/src/svelte/modals/modalState.svelte.ts');
        (window as any).__value = null;
        m.showConfirm({
            title: 'New schedule', message: 'Enter a name:', input: true,
            confirmLabel: 'Create',
            onConfirm: (v: string) => { (window as any).__value = v; },
        });
    });
    await page.waitForTimeout(500);

    const dialog = page.locator('.modal-dialog:has-text("New schedule")');
    await expect(dialog.locator('#modal-primary-btn')).toBeDisabled();
    await dialog.locator('input[type="text"]').fill('Fall Plan');
    await dialog.locator('#modal-primary-btn').click();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as any).__value)).toBe('Fall Plan');
});
