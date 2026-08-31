export function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("code");
}

export function hasRedirectedFromAuth() {
  return !!getCodeFromUrl();
}

export async function doAuth(dbxAuth, REDIRECT_URI) {
  if (dbxAuth.getAccessToken()) return true;
  const authUrl = await dbxAuth.getAuthenticationUrl(REDIRECT_URI, undefined, "code", "offline", undefined, undefined, true);
  const codeVerifier = dbxAuth.getCodeVerifier();
  sessionStorage.setItem("codeVerifier", codeVerifier);
  window.location.href = authUrl;
  return false;
}

export async function fetchFile(dbx, file) {
  const pathToFetch = `/${file}`; // All files are at app folder root
  // console.log("Fetching file:", file, "-> path:", pathToFetch);

  try {
    // List all files in the app folder for debugging
    // const filesList = await dbx.filesListFolder({ path: "" });
    // console.log(
    //   "Files in app folder:",
    //   filesList.result.entries.map((f) => f.name),
    // );

    const response = await dbx.filesGetTemporaryLink({ path: pathToFetch });
    // console.log("Temporary link response:", response);

    const text = await (await fetch(response.result.link)).text();
    // console.log(`Loaded ${file}, length:`, text.length);
    // console.log("Content preview:", text.substring(0, 100));

    return text;
  } catch (err) {
    console.error("Error fetching file:", file, err);
    return "";
  }
}

export async function saveFileToDropbox(dbx, filePath, content) {
  try {
    const uploadPath = filePath.startsWith("/") ? filePath : "/" + filePath;

    await dbx.filesUpload({
      path: uploadPath,
      mode: "overwrite",
      contents: content,
    });
    console.log("✅ Saved " + uploadPath + " to Dropbox!");
  } catch (err) {
    console.error("❌ Dropbox save failed for " + filePath, err);
  }
}
