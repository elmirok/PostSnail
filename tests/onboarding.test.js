import assert from "node:assert/strict";
import test from "node:test";

import {
  getLaunchReadiness,
  markShellBackupNeeded,
  markShellExported,
  markWebsiteZipExported,
  shouldShowLaunchGuide,
} from "../src/onboarding.js";

const completeShell = {
  profile: {
    siteTitle: "Elmirok's Den",
    handle: "elmirok",
    description: "Notes from the edge.",
  },
  identity: { publicKey: "base64:public" },
  secretKey: new Uint8Array([1, 2, 3]),
  posts: [{ id: "p1", status: "published", title: "Hello" }],
  settings: {
    launchGuideCompleted: true,
    lastShellExportedAt: "2026-06-15T10:00:00.000Z",
    firstZipExportedAt: "2026-06-15T10:10:00.000Z",
  },
};

test("new or incomplete Shells show the writer-first launch guide", () => {
  const emptyShell = {
    profile: { siteTitle: "My Microblog", handle: "creator", description: "" },
    identity: null,
    secretKey: null,
    posts: [],
    settings: { launchGuideCompleted: false, lastShellExportedAt: "", firstZipExportedAt: "" },
  };

  const readiness = getLaunchReadiness(emptyShell);

  assert.equal(readiness.hasIdentity, false);
  assert.equal(readiness.hasBlogProfile, false);
  assert.equal(readiness.hasPrivateShellBackup, false);
  assert.equal(readiness.hasPublishedContent, false);
  assert.equal(shouldShowLaunchGuide(emptyShell), true);
});

test("older complete Shells without onboarding fields are not trapped in the guide", () => {
  const oldCompleteShell = {
    ...completeShell,
    settings: {},
  };

  const readiness = getLaunchReadiness(oldCompleteShell);

  assert.equal(readiness.hasLegacyOnboardingState, true);
  assert.equal(readiness.isReady, true);
  assert.equal(shouldShowLaunchGuide(oldCompleteShell), false);
});

test("known Shells require a private Shell backup before completing launch", () => {
  const needsBackup = {
    ...completeShell,
    settings: { launchGuideCompleted: false, lastShellExportedAt: "", firstZipExportedAt: "" },
  };

  const readiness = getLaunchReadiness(needsBackup);

  assert.equal(readiness.hasIdentity, true);
  assert.equal(readiness.hasBlogProfile, true);
  assert.equal(readiness.hasPublishedContent, true);
  assert.equal(readiness.hasPrivateShellBackup, false);
  assert.equal(readiness.isReady, false);
  assert.equal(shouldShowLaunchGuide(needsBackup), true);
});

test("backup and ZIP timestamp helpers preserve settings while tracking onboarding", () => {
  const settings = { language: "en", launchGuideCompleted: true, lastShellExportedAt: "old" };

  assert.deepEqual(markShellBackupNeeded(settings), {
    language: "en",
    launchGuideCompleted: false,
    lastShellExportedAt: "",
  });
  assert.deepEqual(markShellExported(settings, "2026-06-15T11:00:00.000Z"), {
    language: "en",
    launchGuideCompleted: true,
    lastShellExportedAt: "2026-06-15T11:00:00.000Z",
  });
  assert.deepEqual(markWebsiteZipExported(settings, "2026-06-15T11:05:00.000Z", true), {
    language: "en",
    launchGuideCompleted: true,
    lastShellExportedAt: "old",
    firstZipExportedAt: "2026-06-15T11:05:00.000Z",
  });
});
