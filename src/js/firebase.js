// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getAuth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  limit,
  arrayUnion,
  arrayRemove,
  deleteField,
  FieldPath,
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getBlob, deleteObject } from "firebase/storage";
import utils from "../utils";
import { notify } from "../components/notification";
import file from "./file";
import { getProcessResponseObject } from "./processResponse";
import solverCredentials from "./solverCredentials";

// Web app configuration of the paramele-prod project (Project settings > General > Your apps). These values are not secret
const firebaseConfig = {
  apiKey: "AIzaSyAans5oDsiAqcKtEqrn8f2_c3fyoJIQuHM",
  authDomain: "paramele-prod.firebaseapp.com",
  projectId: "paramele-prod",
  storageBucket: "paramele-prod.firebasestorage.app",
  messagingSenderId: "909019029498",
  appId: "1:909019029498:web:7ebf72d586e94dffc34e43",
  measurementId: "G-E68WHXM11K",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Analytics only runs when Google Analytics is enabled for the project
if (firebaseConfig.measurementId) getAnalytics(app);
const db = getFirestore(app);

// Folder that lists the files other users shared with the current user. It is built from a query, not stored
const SHARED_WITH_ME_FOLDER = "_default_shared_with_me_";

// Authentication
const auth = getAuth();

/**
 *
 * @param {{name:{value:string, valid: boolean, error_msg:string}, industry:{value:string, valid: boolean, error_msg:string}, company:{value:string, valid: boolean, error_msg:string}, email:{value:string, valid: boolean, error_msg:string}, password:{value:string, valid: boolean, error_msg:string}}} validated_user_data
 */
function createUserWithEmail(validated_user_data) {
  createUserWithEmailAndPassword(auth, validated_user_data.email.value, validated_user_data.password.value)
    .then((userCredential) => {
      // Signed in
      const user = userCredential.user;
      console.log("User created successfully");
      updateUserProfile(validated_user_data);
      // The email index (needed to receive shared files) is written once the email is verified, see ensureEmailIndex
      return sendEmailVerification(user).then(() => notify("info", "verify_email_sent", undefined, true));
    })
    .catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log("There was a problem: ", errorMessage);
      // ..
    });
}

function signOutUser() {
  utils.showLoadingDimmer("logging_out");
  signOut(auth)
    .then(() => {
      utils.setUser(null);
      utils.hideLoadingDimmer();
      file.reloadToBlank();
    })
    .catch((error) => {
      console.log("There was a problem: ", error);
    });
}

/**
 * Logs a user in user email and password
 * @param {*} validated_user_data
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function logInUserWithEmail(validated_user_data, callback) {
  signInWithEmailAndPassword(auth, validated_user_data.email.value, validated_user_data.password.value)
    .then((userCredential) => {
      // Signed in
      const user = userCredential.user;
      // ...
      callback(getProcessResponseObject("success"));
    })
    .catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(`There was a problem: ${errorMessage} (${errorCode})`);
      callback(getProcessResponseObject("error", error.code));
    });
}

/**
 * Sends an email to reset the password to a user
 * @param {import("./types").ParamEleFormStateObject} validated_user_data
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function sendEmailToResetPassword(validated_user_data, callback) {
  const local_auth = getAuth();
  const email = validated_user_data["email"].value;
  sendPasswordResetEmail(local_auth, email)
    .then(() => {
      callback(getProcessResponseObject("success"));
    })
    .catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(`There was a problem: ${errorMessage} (${errorCode})`);
      callback(getProcessResponseObject("error", error.code));
    });
}

/**
 * Logs a database error and passes it to the callback (if any) as an error process response
 * @param {*} error
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} [callback]
 */
function handleDatabaseError(error, callback) {
  console.log(`There was a problem: ${error.message} (${error.code})`);
  if (callback) callback(getProcessResponseObject("error", error.code));
}

/**
 * Key used to look a user up by email when sharing files
 * @param {string} email
 * @returns {string}
 */
function getEmailIndexKey(email) {
  return email.trim().toLowerCase();
}

/**
 *
 * @param {{name:{value:string, valid: boolean, error_msg:string}, industry:{value:string, valid: boolean, error_msg:string}, company:{value:string, valid: boolean, error_msg:string}, email:{value:string, valid: boolean, error_msg:string}, password:{value:string, valid: boolean, error_msg:string}}} validated_user_data
 */
function updateUserProfile(validated_user_data) {
  let user = auth.currentUser;
  let username = validated_user_data.name.value.split(" ")[0];
  updateProfile(user, {
    displayName: username,
  })
    .then(() => {
      const batch = writeBatch(db);
      batch.set(doc(db, "users", user.uid), {
        name: validated_user_data.name.value,
        username,
        email: user.email,
        company: validated_user_data.company.value,
        industry: validated_user_data.industry.value,
      });
      batch.set(doc(db, "profiles", user.uid), { username, email: user.email });
      return batch.commit();
    })
    .then(() => {
      console.log("User profile updated successfully");
    })
    .catch((error) => handleDatabaseError(error));
}

/**
 * Sends the verification email again to the signed-in user
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function resendVerificationEmail(callback) {
  sendEmailVerification(auth.currentUser)
    .then(() => callback(getProcessResponseObject("success")))
    .catch((error) => handleDatabaseError(error, callback));
}

/**
 * Adds the user to the email index (so files can be shared with them by email) once their email is verified.
 * The rules require email_verified in the ID token, so the token is refreshed first
 * @param {import("firebase/auth").User} user
 */
function ensureEmailIndex(user) {
  if (!user.emailVerified || !user.email) return;
  const index_ref = doc(db, "email_index", getEmailIndexKey(user.email));
  getDoc(index_ref)
    .then((snapshot) => {
      if (snapshot.exists() && snapshot.data().uid === user.uid) return;
      return user.getIdToken(true).then(() => setDoc(index_ref, { uid: user.uid }));
    })
    .catch((error) => handleDatabaseError(error));
}

/**
 * Loads the SkyCiv credentials of the user (users/{uid}.solver) into solverCredentials
 * @param {import("firebase/auth").User} user
 */
function loadSolverCredentials(user) {
  getDoc(doc(db, "users", user.uid))
    .then((snapshot) => solverCredentials.setCredentials(snapshot.exists() ? snapshot.data().solver : undefined))
    .catch((error) => handleDatabaseError(error));
}

/**
 * Saves the SkyCiv credentials of the signed-in user in their private document
 * @param {import("./types").ParamEleSolverCredentials} credentials
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function saveSolverCredentials(credentials, callback) {
  let user = auth.currentUser;
  if (!user) {
    callback(getProcessResponseObject("error", "log_in_to_save_credentials"));
    return;
  }
  let { solver_username, solver_key } = credentials;
  // email is required by the rules when the document does not exist yet
  setDoc(doc(db, "users", user.uid), { solver: { solver_username, solver_key }, email: user.email }, { merge: true })
    .then(() => {
      solverCredentials.setCredentials({ solver_username, solver_key });
      callback(getProcessResponseObject("success"));
    })
    .catch((error) => handleDatabaseError(error, callback));
}

/**
 * Builds the empty folder entry that the file manager expects
 * @param {string} id
 * @param {number} created
 * @param {number} last_modified
 */
function getFolderEntry(id, created, last_modified) {
  return { id, created, last_modified, role: "owner", shared: false };
}

/**
 * Converts a project document into the file entry the file manager expects
 * @param {import("./types").ParamEleFireBaseProjectDoc} project_doc
 * @returns {import("./types").ParamEleFireBaseProjectData}
 */
function getOwnedProjectData(project_doc) {
  let { id, created, current_version, history, shared } = project_doc;
  return { id, created, current_version, history, shared, role: "owner" };
}

/**
 * Converts a project document shared with the current user into the file entry the file manager expects
 * @param {import("./types").ParamEleFireBaseProjectDoc} project_doc
 * @returns {import("./types").ParamEleFireBaseCompleteSharedProjectData}
 */
function getSharedProjectData(project_doc) {
  let { id, created, current_version, history, shared, owner } = project_doc;
  return {
    id,
    created,
    current_version,
    history,
    shared,
    owner,
    // The project ID identifies the file when it is shared (stored as the file_owner_path in the app state)
    path: id,
    role: shared[auth.currentUser.uid].role,
    is_shared_with_me: true,
  };
}

/**
 * Name of a shared file inside the shared with me folder. It must be unique and decodable with utils.decodeUniqueIDToName
 * @param {import("./types").ParamEleFireBaseProjectDoc} project_doc
 */
function getSharedFileKey(project_doc) {
  return `${project_doc.name}__${project_doc.id}`;
}

/**
 * Gets the content object of a folder in the file tree, or null if any folder in the path is missing
 * @param {object} tree
 * @param {string[]} path Path including "home" in the first position
 */
function getFolderContentInTree(tree, path) {
  let content = tree;
  for (let i = 1; i < path.length; i++) {
    let folder = content[path[i]];
    if (!folder) return null;
    if (!folder.content) folder.content = {};
    content = folder.content;
  }
  return content;
}

/**
 * Gets all the folders and files of the current user (owned and shared with them) as a nested tree
 * @param {function(object)} callback
 */
function getUserProjects(callback) {
  let user = auth.currentUser;
  if (!user) {
    callback({});
    return;
  }
  const projects_ref = collection(db, "projects");
  Promise.all([
    getDocs(collection(db, "users", user.uid, "folders")),
    getDocs(query(projects_ref, where("owner", "==", user.uid))),
    getDocs(query(projects_ref, where("shared_with", "array-contains", user.uid))),
  ])
    .then(([folders_snapshot, owned_snapshot, shared_snapshot]) => {
      let tree = { [SHARED_WITH_ME_FOLDER]: getFolderEntry(`fo${SHARED_WITH_ME_FOLDER}`, 0, 0) };
      // Parents first so every folder finds its parent in the tree
      let folders = folders_snapshot.docs.map((folder_doc) => folder_doc.data()).sort((a, b) => a.path.length - b.path.length);
      folders.forEach(({ id, name, path, created, last_modified }) => {
        let parent_content = getFolderContentInTree(tree, path);
        if (parent_content) parent_content[name] = getFolderEntry(id, created, last_modified);
      });
      owned_snapshot.docs.forEach((project_snapshot) => {
        let project_doc = project_snapshot.data();
        let parent_content = getFolderContentInTree(tree, project_doc.path);
        if (parent_content) parent_content[project_doc.name] = getOwnedProjectData(project_doc);
      });
      let shared_folder = tree[SHARED_WITH_ME_FOLDER];
      let shared_content = getFolderContentInTree(tree, ["home", SHARED_WITH_ME_FOLDER]);
      shared_snapshot.docs.forEach((project_snapshot) => {
        let project_doc = project_snapshot.data();
        shared_content[getSharedFileKey(project_doc)] = getSharedProjectData(project_doc);
        // The folder shows the date of its most recently modified file
        shared_folder.last_modified = Math.max(shared_folder.last_modified, project_doc.last_modified);
      });
      callback(tree);
    })
    .catch((error) => {
      console.error(error);
      callback({});
    });
}

/**
 * Retrieves a specific project data from the database
 * @param {string[]} file_path
 * @param {string} file_name
 * @param {import("./types").ParamEleFireBaseProjectDataCallback} callback
 */
function getProjectData(file_path, file_name, callback) {
  let user = auth.currentUser;
  if (!user) {
    callback({});
    return;
  }
  let is_shared_with_me = file_path.length === 2 && file_path[1] === SHARED_WITH_ME_FOLDER;
  let project_doc_promise;
  if (is_shared_with_me) {
    let model_id = file_name.substring(file_name.lastIndexOf("__") + 2);
    project_doc_promise = getDoc(doc(db, "projects", model_id)).then((snapshot) => (snapshot.exists() ? snapshot.data() : null));
  } else {
    let owned_project_query = query(
      collection(db, "projects"),
      where("owner", "==", user.uid),
      where("path", "==", file_path),
      where("name", "==", file_name),
      limit(1)
    );
    project_doc_promise = getDocs(owned_project_query).then((snapshot) => (snapshot.empty ? null : snapshot.docs[0].data()));
  }
  project_doc_promise
    .then((project_doc) => {
      if (!project_doc) {
        console.log("That project does not exist for this user");
        callback({});
      } else if (is_shared_with_me) {
        callback(project_doc.shared[user.uid] ? getSharedProjectData(project_doc) : {});
      } else {
        callback(getOwnedProjectData(project_doc));
      }
    })
    .catch((error) => {
      // Permission denied also lands here, e.g. when the access to a shared file was removed
      console.error(error);
      callback({});
    });
}

/**
 * Reference to the project document of a file
 * @param {import("./types").ParamEleFileData} local_file_data
 */
function getProjectRef(local_file_data) {
  return doc(db, "projects", local_file_data.model_id);
}

function createNewFolderForUser(folder_name, location, callback) {
  const current_time = Date.now();
  const folder_id = utils.generateUniqueID("folder");
  let folder_doc = {
    id: folder_id,
    name: folder_name,
    path: location,
    created: current_time,
    last_modified: current_time,
  };
  setDoc(doc(db, "users", auth.currentUser.uid, "folders", folder_id), folder_doc)
    .then(() => {
      // Do not read again from the data base but only get the new data to the file manager
      if (typeof callback == "undefined") return;
      callback({ [folder_name]: getFolderEntry(folder_id, current_time, current_time) }, true);
    })
    .catch((error) => handleDatabaseError(error));
}

/**
 * Uploads a JSON file of a version to the storage
 * @param {Blob} blob
 * @param {string} model_id
 * @param {number} version
 * @param {"model"|"results"} file_type
 * @returns {Promise}
 */
function uploadVersionFile(blob, model_id, version, file_type) {
  const file_ref = storageRef(getStorage(), `projects/${model_id}/${version}/${file_type}.json`);
  // The storage rules only accept JSON files
  return uploadBytes(file_ref, blob, { contentType: "application/json" });
}

/**
 * Saves the model (and its results, if any) as a new version of a file.
 * New files: the project document goes first, since the storage rules check it before accepting the upload.
 * New versions of existing files: the files go first and the history entry is added at the end, already pointing to the results,
 * because the rules do not let editors change existing history entries
 * @param {Blob} model_blob
 * @param {Blob|false} results_blob
 * @param {import("./types").ParamEleFileData} local_file_data
 * @param {boolean} is_new_version False when the file is created
 * @param {string} commit_msg
 * @param {function(object|false)} callback Gets the new file entry for the file manager, false if the save failed
 */
function saveFileToCloud(model_blob, results_blob, local_file_data, is_new_version, commit_msg, callback) {
  let { model_id, current_version, file_name, file_path } = local_file_data;
  let author = auth.currentUser.uid;
  let has_results = results_blob !== false;
  const project_ref = getProjectRef(local_file_data);
  const uploadFiles = () =>
    uploadVersionFile(model_blob, model_id, current_version, "model").then(() => {
      if (has_results) {
        utils.setLoadingDimmerMsg("saving_results");
        return uploadVersionFile(results_blob, model_id, current_version, "results");
      }
    });
  let save_promise;
  /** @type {import("./types").ParamEleFireBaseProjectData} */
  let new_file = null;
  if (!is_new_version) {
    /** @type {import("./types").ParamEleFireBaseProjectDoc} */
    let project_doc = {
      id: model_id,
      owner: author,
      name: file_name,
      path: file_path,
      current_version,
      created: current_version,
      last_modified: current_version,
      history: {
        [current_version]: { num_nodes: 12, results_available: false, author },
      },
      shared: {},
      shared_with: [],
    };
    new_file = getOwnedProjectData(project_doc);
    save_promise = setDoc(project_ref, project_doc)
      .then(uploadFiles)
      .then(() => {
        if (!has_results) return;
        new_file.history[current_version].results_available = true;
        return updateDoc(project_ref, new FieldPath("history", String(current_version), "results_available"), true);
      });
  } else {
    // Keep new_file equal to null not to return useless data
    save_promise = uploadFiles().then(() =>
      updateDoc(
        project_ref,
        "current_version",
        current_version,
        "last_modified",
        current_version,
        new FieldPath("history", String(current_version)),
        { num_nodes: 13, commit_msg, results_available: has_results, author }
      )
    );
  }
  save_promise
    .then(() => {
      console.log("File saved successfully!");
      // Do not read again from the data base but only get the new data to the file manager
      callback({ [file_name]: new_file });
    })
    .catch((error) => {
      handleDatabaseError(error);
      notify("error", "generic_unhandled_issue", error.code, true);
      callback(false);
    });
}

/**
 *
 * @param {import("./types").ParamEleFileData} local_file_data
 * @param {number} version_key_to_update
 * @param {*} commit_msg
 * @param {*} callback
 */
function updateCommitMsgForUser(local_file_data, version_key_to_update, commit_msg, callback) {
  updateDoc(getProjectRef(local_file_data), new FieldPath("history", String(version_key_to_update), "commit_msg"), commit_msg)
    .then(() => {
      callback(true);
    })
    .catch((error) => handleDatabaseError(error));
}

/**
 *
 * @param {string} file_id
 * @param {number} version_id
 * @param {'model'|'results'} file_type
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function openFileFromCloud(file_id, version_id, file_type = "model", callback) {
  const storage = getStorage();
  const file_ref = storageRef(storage, `projects/${file_id}/${version_id}/${file_type}.json`);
  // To get this working had to set up the CORS in GCloud
  getBlob(file_ref)
    .then((blob) => {
      blob
        .text()
        .then((data) => {
          callback(getProcessResponseObject("success", "", JSON.parse(data)));
        })
        .catch((error) => {
          console.log(`Error parsing the blob: ${error}`);
        });
    })
    .catch((error) => {
      console.error("Error getting the download URL:", error);
      callback(getProcessResponseObject("error", error.code));
    });
}

/**
 * Deletes the files and the reference in the database
 * @param {import("./types").ParamEleFileData} local_file_data
 * @param {boolean} results_available
 * @param {number} version_to_delete
 * @param {function()} callback
 * @returns
 */
function deleteFileVersionFromCloud(local_file_data, results_available, version_to_delete, callback) {
  let { model_id, current_version } = local_file_data;
  // Delete the file (both model and results)
  const storage = getStorage();
  if (String(current_version) === String(version_to_delete)) {
    notify("warning", "cannot_delete_version", "", true);
    callback();
    return;
  }
  deleteFile("model", function () {
    if (results_available) {
      deleteFile("results", () => {
        deleteVersionReference(callback);
      });
    } else {
      deleteVersionReference(callback);
    }
  });

  function deleteVersionReference(callback) {
    updateDoc(getProjectRef(local_file_data), new FieldPath("history", String(version_to_delete)), deleteField())
      .then(() => {
        console.log("Deleted the reference");
        callback();
      })
      .catch((error) => {
        console.error("Error deleting the version reference: ", error);
      });
  }
  /**
   * Deletes a file from the storage
   * @param {"model"|"results"} type
   * @param {Function} success_callback
   */
  function deleteFile(type, success_callback) {
    const file_ref = storageRef(storage, `projects/${model_id}/${version_to_delete}/${type}.json`);
    deleteObject(file_ref)
      .then(() => {
        console.log(`Deleted the ${type}!`);
        success_callback();
      })
      .catch((error) => {
        console.error("Error deleting the version folder: ", error);
      });
  }
}
/**
 * Shares a file with a user given their email
 * @param {import("./types").ParamEleFormStateObject} validated_user_data
 * @param {import("./types").ParamEleFileData} file_data
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function shareFileWithUser(validated_user_data, file_data, callback) {
  let user_email = validated_user_data.user_email.value;
  let role = validated_user_data?.user_role?.value;
  getDoc(doc(db, "email_index", getEmailIndexKey(user_email)))
    .then((snapshot) => {
      if (!snapshot.exists()) {
        callback(getProcessResponseObject("error", "user_does_not_exist"));
        return;
      }
      let shared_user_id = snapshot.data().uid;
      if (auth.currentUser.uid == shared_user_id) {
        callback(getProcessResponseObject("error", "cannot_share_with_yourself"));
        return;
      }
      // TODO - Handle the case when the admin shares
      /** @type {import("./types").ParamEleFileSharedSubData} */
      let updated_file_shared_data = { role, date: Date.now() };
      return updateDoc(
        getProjectRef(file_data),
        new FieldPath("shared", shared_user_id),
        updated_file_shared_data,
        "shared_with",
        arrayUnion(shared_user_id)
      ).then(() => {
        callback(getProcessResponseObject("success", null, { [shared_user_id]: updated_file_shared_data }));
      });
    })
    .catch((error) => handleDatabaseError(error, callback));
}

/**
 *
 * @param {string} shared_user_id
 * @param {import("./types").ParamEleFileSharedSubData} new_file_shared_data
 * @param {boolean} is_remove_access
 * @param {import("./types").ParamEleFileData} file_data
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function updateSharedFileData(shared_user_id, new_file_shared_data, is_remove_access, file_data, callback) {
  let shared_field = new FieldPath("shared", shared_user_id);
  let update_promise = is_remove_access
    ? updateDoc(getProjectRef(file_data), shared_field, deleteField(), "shared_with", arrayRemove(shared_user_id))
    : updateDoc(getProjectRef(file_data), shared_field, new_file_shared_data);
  update_promise
    .then(() => {
      callback(getProcessResponseObject("success", null));
    })
    .catch((error) => handleDatabaseError(error, callback));
}

/**
 * Removes the signed-in user from a file shared with them
 * @param {import("./types").ParamEleFileData} file_data
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function leaveSharedFile(file_data, callback) {
  let uid = auth.currentUser.uid;
  updateDoc(getProjectRef(file_data), new FieldPath("shared", uid), deleteField(), "shared_with", arrayRemove(uid))
    .then(() => callback(getProcessResponseObject("success")))
    .catch((error) => handleDatabaseError(error, callback));
}

function attachToAuthChangeFirebaseEvent(function_to_attach) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      solverCredentials.setCredentials();
      function_to_attach(user);
      return;
    }
    loadSolverCredentials(user);
    // The cached user does not know the email was verified in another tab, reload it before reading emailVerified
    let reload_promise = user.emailVerified ? Promise.resolve() : user.reload().catch(() => {});
    reload_promise.then(() => {
      let current_user = auth.currentUser ?? user;
      ensureEmailIndex(current_user);
      function_to_attach(current_user);
    });
  });
}

/**
 * Retrieves contact information from the database
 * @param {string} contact_query
 * @param {"uid"|"email"} mode
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 */
function getContactInformationFromDataBase(contact_query, mode, callback) {
  if (mode == "uid") {
    getDoc(doc(db, "profiles", contact_query))
      .then((snapshot) => {
        if (!snapshot.exists()) {
          callback(getProcessResponseObject("error", "user_by_uid_does_not_exist"));
          return;
        }
        let { email, username } = snapshot.data();
        /** @type {import("./types").ParamEleContact} */
        let contact_data = { email, username };
        callback(getProcessResponseObject("success", "", contact_data));
      })
      .catch((error) => handleDatabaseError(error, callback));
  }
}

const Firebase = {
  createUserWithEmail,
  signOutUser,
  logInUserWithEmail,
  getUserProjects,
  createNewFolderForUser,
  saveFileToCloud,
  openFileFromCloud,
  getProjectData,
  updateCommitMsgForUser,
  deleteFileVersionFromCloud,
  attachToAuthChangeFirebaseEvent,
  sendEmailToResetPassword,
  shareFileWithUser,
  updateSharedFileData,
  getContactInformationFromDataBase,
  resendVerificationEmail,
  saveSolverCredentials,
  leaveSharedFile,
};

export default Firebase;
