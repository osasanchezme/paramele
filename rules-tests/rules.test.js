// Tests for firestore.rules and storage.rules. They run against the emulators with a demo project (nothing reaches production):
//   npm run test:rules
const { test, describe, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { FieldValue } = require("firebase/compat/app").default.firestore;

const OWNER = "owner_uid";
const ADMIN = "admin_uid";
const EDITOR = "editor_uid";
const GUEST = "guest_uid";
const STRANGER = "stranger_uid";
const MODEL_ID = "file_1";
const V1 = 1000;
const V2 = 2000;

/** @type {import("@firebase/rules-unit-testing").RulesTestEnvironment} */
let env;

function user(uid, email_verified = true) {
  return env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified });
}

function db(uid, email_verified) {
  return user(uid, email_verified).firestore();
}

function storage(uid) {
  return user(uid).storage();
}

function getProjectDoc() {
  return {
    id: MODEL_ID,
    owner: OWNER,
    name: "Frame",
    path: ["home"],
    created: V1,
    current_version: V2,
    last_modified: V2,
    history: {
      [V1]: { num_nodes: 12, results_available: false, author: OWNER },
      [V2]: { num_nodes: 13, commit_msg: "second", results_available: true, author: EDITOR },
    },
    shared: {
      [ADMIN]: { role: "admin", date: 1 },
      [EDITOR]: { role: "editor", date: 1 },
      [GUEST]: { role: "guest", date: 1 },
    },
    shared_with: [ADMIN, EDITOR, GUEST],
  };
}

function project(uid, email_verified) {
  return db(uid, email_verified).collection("projects").doc(MODEL_ID);
}

function newVersion(uid, version, entry = {}) {
  return {
    current_version: version,
    last_modified: version,
    [`history.${version}`]: { num_nodes: 1, commit_msg: "new", results_available: true, author: uid, ...entry },
  };
}

function jsonBytes() {
  return new TextEncoder().encode("{}");
}

function upload(uid, file_path, content_type = "application/json") {
  return storage(uid).ref(file_path).put(jsonBytes(), { contentType: content_type });
}

before(async () => {
  const root = path.join(__dirname, "..");
  env = await initializeTestEnvironment({
    projectId: "demo-paramele",
    firestore: { rules: fs.readFileSync(path.join(root, "firestore.rules"), "utf8") },
    storage: { rules: fs.readFileSync(path.join(root, "storage.rules"), "utf8") },
  });
});

after(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    const admin_db = context.firestore();
    await admin_db.collection("projects").doc(MODEL_ID).set(getProjectDoc());
    await admin_db
      .collection("profiles")
      .doc(OWNER)
      .set({ username: "owner", email: `${OWNER}@example.com` });
    await context.storage().ref(`projects/${MODEL_ID}/${V1}/model.json`).put(jsonBytes(), { contentType: "application/json" });
    await context.storage().ref(`projects/${MODEL_ID}/${V2}/results.json`).put(jsonBytes(), { contentType: "application/json" });
  });
});

describe("profiles (finding 2)", () => {
  test("a signed-in user can get one profile", async () => {
    await assertSucceeds(db(STRANGER).collection("profiles").doc(OWNER).get());
  });
  test("profiles cannot be listed", async () => {
    await assertFails(db(STRANGER).collection("profiles").get());
  });
});

describe("email_index (finding 4)", () => {
  const entry = (uid) => db(uid, true).collection("email_index").doc(`${uid}@example.com`);
  test("a verified user can add their own email", async () => {
    await assertSucceeds(entry(STRANGER).set({ uid: STRANGER }));
  });
  test("an unverified user cannot add their email", async () => {
    await assertFails(db(STRANGER, false).collection("email_index").doc(`${STRANGER}@example.com`).set({ uid: STRANGER }));
  });
  test("nobody can add someone else's email", async () => {
    await assertFails(db(STRANGER).collection("email_index").doc(`${OWNER}@example.com`).set({ uid: STRANGER }));
  });
});

describe("users solver credentials (finding 3)", () => {
  const user_doc = (uid) => db(uid).collection("users").doc(uid);
  test("a user can store their SkyCiv credentials", async () => {
    await assertSucceeds(
      user_doc(STRANGER).set({ email: `${STRANGER}@example.com`, solver: { solver_username: "a", solver_key: "b" } }, { merge: true })
    );
  });
  test("other fields in solver are rejected", async () => {
    await assertFails(user_doc(STRANGER).set({ email: `${STRANGER}@example.com`, solver: { solver_username: "a", other: "b" } }, { merge: true }));
  });
  test("nobody else can read them", async () => {
    await env.withSecurityRulesDisabled((context) => context.firestore().collection("users").doc(OWNER).set({ email: "x", solver: {} }));
    await assertFails(db(STRANGER).collection("users").doc(OWNER).get());
  });
});

describe("history edits (finding 7)", () => {
  test("an editor can add one version authored by them", async () => {
    await assertSucceeds(project(EDITOR).update(newVersion(EDITOR, 3000)));
  });
  test("an editor cannot fake the author", async () => {
    await assertFails(project(EDITOR).update(newVersion(OWNER, 3000)));
  });
  test("an editor cannot add a version that is not the current one", async () => {
    await assertFails(project(EDITOR).update({ ...newVersion(EDITOR, 3000), current_version: 4000, last_modified: 4000 }));
  });
  test("an editor cannot delete a version", async () => {
    await assertFails(project(EDITOR).update({ [`history.${V1}`]: FieldValue.delete() }));
  });
  test("an editor cannot change an existing version", async () => {
    await assertFails(project(EDITOR).update({ [`history.${V1}.results_available`]: true }));
  });
  test("an editor cannot add a version and change another one", async () => {
    await assertFails(project(EDITOR).update({ ...newVersion(EDITOR, 3000), [`history.${V1}.commit_msg`]: "x" }));
  });
  test("a guest cannot add versions", async () => {
    await assertFails(project(GUEST).update(newVersion(GUEST, 3000)));
  });
  test("an admin can delete a version that is not the current one", async () => {
    await assertSucceeds(project(ADMIN).update({ [`history.${V1}`]: FieldValue.delete() }));
  });
  test("an admin cannot delete the current version", async () => {
    await assertFails(project(ADMIN).update({ [`history.${V2}`]: FieldValue.delete() }));
  });
  test("an admin can edit a commit message", async () => {
    await assertSucceeds(project(ADMIN).update({ [`history.${V2}.commit_msg`]: "edited" }));
  });
  test("an admin cannot change the author of a version", async () => {
    await assertFails(project(ADMIN).update({ [`history.${V2}.author`]: ADMIN }));
  });
  test("the owner can mark results as available", async () => {
    await assertSucceeds(project(OWNER).update({ [`history.${V1}.results_available`]: true }));
  });
});

describe("sharing (findings 12 and 13)", () => {
  test("the owner can share with a public role", async () => {
    await assertSucceeds(
      project(OWNER).update({ [`shared.${STRANGER}`]: { role: "editor", date: 2 }, shared_with: [ADMIN, EDITOR, GUEST, STRANGER] })
    );
  });
  test("the owner cannot give the owner role", async () => {
    await assertFails(project(OWNER).update({ [`shared.${STRANGER}`]: { role: "owner", date: 2 }, shared_with: [ADMIN, EDITOR, GUEST, STRANGER] }));
  });
  test("the owner cannot add extra fields to a shared entry", async () => {
    await assertFails(
      project(OWNER).update({ [`shared.${STRANGER}`]: { role: "guest", date: 2, x: 1 }, shared_with: [ADMIN, EDITOR, GUEST, STRANGER] })
    );
  });
  test("an unverified owner cannot share", async () => {
    await assertFails(
      project(OWNER, false).update({ [`shared.${STRANGER}`]: { role: "guest", date: 2 }, shared_with: [ADMIN, EDITOR, GUEST, STRANGER] })
    );
  });
  test("the owner can change a role", async () => {
    await assertSucceeds(project(OWNER).update({ [`shared.${GUEST}`]: { role: "editor", date: 1 } }));
  });
  test("a recipient can leave the file", async () => {
    await assertSucceeds(project(GUEST).update({ [`shared.${GUEST}`]: FieldValue.delete(), shared_with: FieldValue.arrayRemove(GUEST) }));
  });
  test("a recipient cannot remove someone else", async () => {
    await assertFails(project(GUEST).update({ [`shared.${EDITOR}`]: FieldValue.delete(), shared_with: FieldValue.arrayRemove(EDITOR) }));
  });
  test("a recipient cannot change their own role", async () => {
    await assertFails(project(GUEST).update({ [`shared.${GUEST}`]: { role: "admin", date: 1 } }));
  });
});

describe("storage writes (findings 5 and 6)", () => {
  test("nobody can upload to a project that does not exist", async () => {
    await assertFails(upload(STRANGER, `projects/made_up/${V1}/model.json`));
  });
  test("the owner can upload a new version", async () => {
    await assertSucceeds(upload(OWNER, `projects/${MODEL_ID}/3000/model.json`));
  });
  test("an editor can upload a new version", async () => {
    await assertSucceeds(upload(EDITOR, `projects/${MODEL_ID}/3001/model.json`));
  });
  test("a guest cannot upload", async () => {
    await assertFails(upload(GUEST, `projects/${MODEL_ID}/3002/model.json`));
  });
  test("a stranger cannot upload", async () => {
    await assertFails(upload(STRANGER, `projects/${MODEL_ID}/3003/model.json`));
  });
  test("only JSON files are accepted", async () => {
    await assertFails(upload(OWNER, `projects/${MODEL_ID}/3004/model.json`, "text/html"));
  });
  test("version folders must be numeric", async () => {
    await assertFails(upload(OWNER, `projects/${MODEL_ID}/abc/model.json`));
  });
  test("an existing model cannot be overwritten by the owner", async () => {
    await assertFails(upload(OWNER, `projects/${MODEL_ID}/${V1}/model.json`));
  });
  test("an existing model cannot be overwritten by an editor", async () => {
    await assertFails(upload(EDITOR, `projects/${MODEL_ID}/${V1}/model.json`));
  });
  test("results can be replaced by an editor", async () => {
    await assertSucceeds(upload(EDITOR, `projects/${MODEL_ID}/${V2}/results.json`));
  });
  test("a guest can read but not delete", async () => {
    await assertSucceeds(storage(GUEST).ref(`projects/${MODEL_ID}/${V1}/model.json`).getMetadata());
    await assertFails(storage(GUEST).ref(`projects/${MODEL_ID}/${V1}/model.json`).delete());
  });
  test("an admin can delete a version file", async () => {
    await assertSucceeds(storage(ADMIN).ref(`projects/${MODEL_ID}/${V1}/model.json`).delete());
  });
});
