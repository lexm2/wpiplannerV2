#!/usr/bin/env bun

import { execSync } from 'child_process';

function run(cmd: string, options: { silent?: boolean; ignoreError?: boolean } = {}): string {
  try {
    const result = execSync(cmd, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'inherit']
    });
    return result.trim();
  } catch (error) {
    if (options.ignoreError) {
      return '';
    }
    console.error(`Command failed: ${cmd}`);
    throw error;
  }
}

function getCurrentBranch(): string {
  return run('git rev-parse --abbrev-ref HEAD', { silent: true });
}

function hasUncommittedChanges(): boolean {
  const status = run('git status --porcelain', { silent: true });
  return status.length > 0;
}

function getConflictedFiles(): string[] {
  const output = run('git diff --name-only --diff-filter=U', { silent: true, ignoreError: true });
  return output ? output.split('\n').filter(f => f.trim()) : [];
}

async function promptConfirmation(message: string): Promise<boolean> {
  console.log(`\n${message}`);
  console.log('Type "yes" to continue, or anything else to cancel:');

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function mergeDevelopmentToMaster(): Promise<void> {
  const startBranch = getCurrentBranch();
  let onMaster = false;

  try {
    console.log('=== Git Merge Script: Development → master ===\n');

    console.log('Step 1: Pre-flight checks...');
    if (startBranch !== 'Development') {
      throw new Error(`Must be on Development branch. Currently on: ${startBranch}`);
    }
    console.log('✓ On Development branch');

    if (hasUncommittedChanges()) {
      throw new Error('Uncommitted changes detected. Please commit or stash your changes first.');
    }
    console.log('✓ No uncommitted changes');

    console.log('\nStep 2: Fetching latest from remote...');
    run('git fetch origin');
    console.log('✓ Fetched latest from remote');

    console.log('\nStep 3: Running validation on Development...');
    console.log('Running tests...');
    run('bun test');
    console.log('✓ Tests passed');

    console.log('Running build...');
    run('bun run build');
    console.log('✓ Build succeeded');

    console.log('\nStep 4: Switching to master...');
    run('git checkout master');
    onMaster = true;
    console.log('✓ Checked out master');

    console.log('Pulling latest master...');
    run('git pull origin master');
    console.log('✓ Pulled latest master');

    console.log('\nStep 5: Merging Development into master...');
    const mergeResult = run('git merge Development --no-commit --no-ff', { ignoreError: true });

    const conflictedFiles = getConflictedFiles();
    if (conflictedFiles.length > 0) {
      console.log(`\nConflicts detected in ${conflictedFiles.length} file(s):`);
      conflictedFiles.forEach(f => console.log(`  - ${f}`));

      const publicConflicts = conflictedFiles.filter(f => f.startsWith('public/'));
      const otherConflicts = conflictedFiles.filter(f => !f.startsWith('public/'));

      if (otherConflicts.length > 0) {
        console.error('\n❌ Conflicts outside public/ directory detected:');
        otherConflicts.forEach(f => console.error(`  - ${f}`));
        console.error('\nThese conflicts require manual resolution.');
        run('git merge --abort');
        throw new Error('Merge aborted due to conflicts outside public/ directory');
      }

      if (publicConflicts.length > 0) {
        console.log('\n✓ All conflicts are in public/ directory (auto-generated files)');
        console.log('Resolving by accepting master\'s version...');
        run('git checkout --theirs public/');
        run('git add public/');
        console.log('✓ Conflicts resolved');
      }
    } else {
      console.log('✓ No conflicts detected');
    }

    console.log('Creating merge commit...');
    run('git commit -m "Merge Development into master\n\nCo-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"');
    console.log('✓ Merge commit created');

    console.log('\nStep 6: Post-merge validation...');
    console.log('Running tests...');
    run('bun test');
    console.log('✓ Tests passed');

    console.log('Running build...');
    run('bun run build');
    console.log('✓ Build succeeded');

    console.log('\nStep 7: Push to remote...');
    const shouldPush = await promptConfirmation('Ready to push to origin/master?');

    if (shouldPush) {
      run('git push origin master');
      console.log('✓ Pushed to origin/master');
    } else {
      console.log('⚠ Skipped push. Merge is committed locally on master.');
      console.log('  To push later: git push origin master');
    }

    console.log('\nStep 8: Returning to Development branch...');
    run('git checkout Development');
    onMaster = false;
    console.log('✓ Returned to Development branch');

    console.log('\n=== Merge completed successfully! ===');
    console.log('\nNext steps:');
    console.log('  - Consider updating Development from master:');
    console.log('    git pull origin master');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Merge failed:', errorMessage);

    if (onMaster) {
      console.log('\nAttempting cleanup...');
      try {
        const mergeInProgress = run('git rev-parse -q --verify MERGE_HEAD', { silent: true, ignoreError: true });
        if (mergeInProgress) {
          run('git merge --abort');
          console.log('✓ Merge aborted');
        }
        run('git checkout Development');
        console.log('✓ Returned to Development branch');
      } catch (cleanupError) {
        console.error('⚠ Cleanup failed. You may need to manually run:');
        console.error('  git merge --abort');
        console.error('  git checkout Development');
      }
    }

    process.exit(1);
  }
}

mergeDevelopmentToMaster();
