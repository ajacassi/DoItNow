// The GitHub token lives in the OS credential vault (Windows Credential
// Manager / macOS Keychain), encrypted with the user's login, instead of the
// plain-text settings.json the store plugin writes.
const SECRET_SERVICE: &str = "com.doitnow.app";
const SECRET_ACCOUNT: &str = "github_token";

fn secret_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SECRET_SERVICE, SECRET_ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get_token() -> Result<Option<String>, String> {
    match secret_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_set_token(token: String) -> Result<(), String> {
    secret_entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_delete_token() -> Result<(), String> {
    match secret_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            secret_get_token,
            secret_set_token,
            secret_delete_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
