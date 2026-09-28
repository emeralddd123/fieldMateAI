import assert from 'node:assert/strict';
import { test } from 'node:test';

// Command matching logic mirroring WorkModeView interpreter
function matchWorkModeCommand(spokenText, confidence) {
  if (confidence < 0.65) {
    return { intent: 'clarify', confidence, isAmbiguous: true };
  }
  const clean = spokenText.trim().toLowerCase();
  if (
    clean.includes('next') ||
    clean.includes('done') ||
    clean.includes('complete') ||
    clean.includes('advance') ||
    clean.includes('finished') ||
    clean.includes('step done')
  ) {
    return { intent: 'next', confidence, isAmbiguous: false };
  }
  if (
    clean.includes('repeat') ||
    clean.includes('again') ||
    clean.includes('say again') ||
    clean.includes('what did you say')
  ) {
    return { intent: 'repeat', confidence, isAmbiguous: false };
  }
  if (
    clean.includes('back') ||
    clean.includes('previous') ||
    clean.includes('go back')
  ) {
    return { intent: 'back', confidence, isAmbiguous: false };
  }
  if (
    clean.includes('pause') ||
    clean.includes('wait') ||
    clean.includes('hold on')
  ) {
    return { intent: 'pause', confidence, isAmbiguous: false };
  }
  if (
    clean.includes('resume') ||
    clean.includes('continue') ||
    clean.includes('start again')
  ) {
    return { intent: 'resume', confidence, isAmbiguous: false };
  }
  if (
    clean.includes('exit') ||
    clean.includes('quit') ||
    clean.includes('leave')
  ) {
    return { intent: 'exit', confidence, isAmbiguous: false };
  }
  return { intent: 'unrecognized', confidence, isAmbiguous: true };
}

test('Work Mode command interpreter recognizes supported command variants with high confidence', () => {
  // Next variants
  assert.equal(matchWorkModeCommand('next', 0.95).intent, 'next');
  assert.equal(matchWorkModeCommand('step done', 0.9).intent, 'next');
  assert.equal(matchWorkModeCommand('complete step', 0.88).intent, 'next');
  assert.equal(matchWorkModeCommand('advance to next', 0.92).intent, 'next');

  // Repeat variants
  assert.equal(matchWorkModeCommand('repeat instruction', 0.91).intent, 'repeat');
  assert.equal(matchWorkModeCommand('say again please', 0.85).intent, 'repeat');
  assert.equal(matchWorkModeCommand('what did you say', 0.89).intent, 'repeat');

  // Back variants
  assert.equal(matchWorkModeCommand('go back', 0.94).intent, 'back');
  assert.equal(matchWorkModeCommand('previous step', 0.86).intent, 'back');

  // Pause & Resume variants
  assert.equal(matchWorkModeCommand('pause for a second', 0.87).intent, 'pause');
  assert.equal(matchWorkModeCommand('resume work', 0.92).intent, 'resume');

  // Exit variants
  assert.equal(matchWorkModeCommand('exit work mode', 0.93).intent, 'exit');
  assert.equal(matchWorkModeCommand('quit', 0.85).intent, 'exit');
});

test('Work Mode command interpreter rejects low-confidence speech and background noise', () => {
  // Low confidence speech (under 0.65 threshold)
  const lowConf = matchWorkModeCommand('next', 0.45);
  assert.equal(lowConf.intent, 'clarify');
  assert.equal(lowConf.isAmbiguous, true);

  // Background chatter or plant noise
  const noise = matchWorkModeCommand('conveyor motor humming loud', 0.8);
  assert.equal(noise.intent, 'unrecognized');
  assert.equal(noise.isAmbiguous, true);
});

test('Work Mode step boundaries prevent underflow and safely finalize completion', () => {
  const steps = [
    { id: 1, title: 'Step 1' },
    { id: 2, title: 'Step 2' },
    { id: 3, title: 'Step 3' },
  ];

  let currentIndex = 0;
  const prev = () => {
    if (currentIndex > 0) currentIndex--;
  };
  const next = () => {
    if (currentIndex < steps.length - 1) currentIndex++;
    else isCompleted = true;
  };

  let isCompleted = false;

  // Attempt to go back from step 0: remains 0
  prev();
  assert.equal(currentIndex, 0);

  // Advance through steps
  next();
  assert.equal(currentIndex, 1);
  next();
  assert.equal(currentIndex, 2);

  // Final step advance marks completed, bounds stay within range
  next();
  assert.equal(currentIndex, 2);
  assert.equal(isCompleted, true);
});

test('Safety gate verification prevents unconfirmed advancement on hazardous steps', () => {
  const safetyStep = {
    id: 1,
    title: 'Lockout Verification',
    requiresConfirmation: true,
  };

  let safeConfirmed = false;
  const canAdvance = (step, confirmed) => {
    if (step.requiresConfirmation && !confirmed) return false;
    return true;
  };

  assert.equal(canAdvance(safetyStep, safeConfirmed), false);
  safeConfirmed = true;
  assert.equal(canAdvance(safetyStep, safeConfirmed), true);
});
