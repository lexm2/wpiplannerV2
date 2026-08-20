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
